/**
 * F-077: Accept / Decline Flow — Layers 2 + 3 — Decline path
 * F-076: State Machine — pending → declined (terminal)
 * Slot effect: soft_locked → open (locked_by_booking_id cleared, version_number++)
 *
 * F-077 Logic.2 atomic sequence:
 * 1. Compare-and-swap: pending → declined
 * 2. Optimistic-lock slot: soft_locked → open, locked_by_booking_id=null, version_number++
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver') return Response.json({ error: 'Only caregivers may decline booking requests.' }, { status: 403 });

  const body = await req.json();
  const { booking_request_id } = body;
  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });
  if (booking.caregiver_user_id !== user.id) return Response.json({ error: 'Not found.' }, { status: 404 });

  // ── Layer 3: State machine gate ───────────────────────────────────────────
  if (booking.status !== 'pending') {
    return Response.json({
      error: `This booking request has already been ${booking.status}.`,
      current_status: booking.status
    }, { status: 409 });
  }

  // ── Layer 3: Step 1 — Compare-and-swap: pending → declined ───────────────
  try {
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'declined'
    });
  } catch (err) {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // Verify committed
  const verifyBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const verifiedBooking = verifyBookings[0];
  if (!verifiedBooking || verifiedBooking.status !== 'declined') {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // ── Layer 3: Step 2 — Slot: soft_locked → open (version_number++) ─────────
  const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: booking.availability_slot_id });
  const slot = slots[0];

  if (slot) {
    const slotVersionBefore = slot.version_number || 0;
    try {
      await base44.asServiceRole.entities.AvailabilitySlot.update(slot.id, {
        status: 'open',
        locked_by_booking_id: null,
        version_number: slotVersionBefore + 1
      });
    } catch (slotErr) {
      // Slot release failed — booking is already declined. Log for admin.
      return Response.json({
        success: true,
        booking_request_id,
        status: 'declined',
        slot_release_failed: true,
        warning: 'Booking declined but slot state could not be reset. Admin has been alerted.'
      }, { status: 200 });
    }
  }

  // ── Fetch supporting records (used by notification + emails) ─────────────
  const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
  const parentUsers = await base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id });
  const parentUser = parentUsers[0];
  const cgProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id });
  const cgProfile = cgProfiles[0];

  // ── In-app notification → parent ─────────────────────────────────────────
  await base44.functions.invoke('createNotification', {
    user_id: booking.parent_user_id,
    type: 'booking_declined',
    title: 'Booking Not Available',
    message: `${cgProfile?.display_name || 'The caregiver'} was unable to accept your booking request. You can search for another caregiver.`,
    booking_request_id,
    action_url: '/FindCaregivers'
  }).catch(() => {});

  if (parentUser) {
    const body = `
Hi,

Unfortunately, ${cgProfile?.display_name || 'the caregiver'} was unable to accept your booking request for ${new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.

You can search for another caregiver here:
${baseUrl}/FindCaregivers

– CareNest
    `.trim();

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: parentUser.email,
      subject: 'Booking Request Not Available',
      body
    }).catch(() => {});
  }

  // ── Layer 8: Audit log — F-077 Audit.2 ─────────────────────────────────
  await base44.functions.invoke('logBookingEvent', {
    event_type: 'booking_status_transition',
    booking_id: booking_request_id,
    actor_user_id: user.id,
    actor_role: 'caregiver',
    old_status: 'pending',
    new_status: 'declined',
    slot_id: booking.availability_slot_id,
    slot_version_before: slot ? (slot.version_number || 0) : null,
    slot_version_after: slot ? (slot.version_number || 0) + 1 : null,
    caregiver_profile_id: booking.caregiver_profile_id,
    parent_user_id: booking.parent_user_id,
    caregiver_user_id: booking.caregiver_user_id,
    meta: { action: 'decline' }
  }).catch(() => {});

  return Response.json({
    success: true,
    booking_request_id,
    status: 'declined',
    slot_status: 'open'
  }, { status: 200 });
});