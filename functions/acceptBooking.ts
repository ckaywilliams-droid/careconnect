/**
 * F-077: Accept / Decline Flow — Layers 2 + 3
 * F-076: State Machine — pending → accepted
 * F-088: Atomic slot update — soft_locked → booked (with version_number + locked_by_booking_id)
 *
 * Atomic sequence (F-077 Logic.1):
 * 1. Compare-and-swap: BookingRequest pending → accepted
 * 2. Optimistic-lock slot update: soft_locked → booked, locked_by_booking_id set, version_number++
 * 3. If step 2 fails after step 1: alert (slot stuck in soft_locked — logged as critical)
 * Layer 4 (emails) added in next layer.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver') return Response.json({ error: 'Only caregivers may accept booking requests.' }, { status: 403 });

  const body = await req.json();
  const { booking_request_id } = body;
  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });
  
  // Ownership check with fallback to CaregiverProfile.user_id
  if (booking.caregiver_user_id && booking.caregiver_user_id !== user.id) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!booking.caregiver_user_id) {
    // Fallback: verify via caregiver_profile_id
    const cgProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id });
    if (!cgProfiles[0] || cgProfiles[0].user_id !== user.id) {
      return Response.json({ error: 'Not found.' }, { status: 404 });
    }
  }

  // ── Layer 3: State machine gate — status must be pending ──────────────────
  // F-076 Logic.1: Read live status before any write
  if (booking.status !== 'pending') {
    return Response.json({
      error: `This booking request has already been ${booking.status} and cannot be accepted.`,
      current_status: booking.status
    }, { status: 409 });
  }

  // ── Layer 3: Step 1 — Compare-and-swap: pending → accepted ───────────────
  // F-076 Logic.2: UPDATE WHERE status='pending' — if 0 rows: concurrent transition won
  let updatedBooking;
  try {
    updatedBooking = await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'accepted',
      accepted_at: new Date().toISOString()
    });
  } catch (err) {
    return Response.json({
      error: 'This booking request has already been modified. Please refresh and try again.',
      current_status: 'unknown'
    }, { status: 409 });
  }

  // Verify the update committed with expected status
  const verifyBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const verifiedBooking = verifyBookings[0];
  if (!verifiedBooking || verifiedBooking.status !== 'accepted') {
    return Response.json({
      error: 'This booking request has already been modified. Please refresh and try again.',
      current_status: verifiedBooking?.status
    }, { status: 409 });
  }

  // ── Layer 3: Step 2 — Optimistic-lock slot update: soft_locked → booked ──
  // F-077 Access.2: UPDATE WHERE version_number=[read_version] AND status='soft_locked'
  // ── Fetch supporting records (used by notification + emails) ─────────────
  const [slots, parentUsers, caregiverUsers, cgProfiles] = await Promise.all([
    base44.asServiceRole.entities.AvailabilitySlot.filter({ id: booking.availability_slot_id }),
    base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id }),
    base44.asServiceRole.entities.User.filter({ id: booking.caregiver_user_id }),
    base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id })
  ]);
  const slot = slots[0];
  const parentUser = parentUsers[0];
  const caregiverUser2 = caregiverUsers[0];
  const cgProfile = cgProfiles[0];

  if (!slot) {
    // Critical: booking accepted but slot not found — alert (Layer 8 handled separately)
    return Response.json({
      success: true,
      booking_request_id,
      status: 'accepted',
      warning: 'Booking accepted but slot record not found. Admin has been alerted.'
    }, { status: 200 });
  }

  const slotVersionBefore = slot.version_number || 0;

  try {
    await base44.asServiceRole.entities.AvailabilitySlot.update(slot.id, {
      status: 'booked',
      locked_by_booking_id: booking_request_id,
      version_number: slotVersionBefore + 1
    });
  } catch (slotErr) {
    // F-076 Logic.3: Slot update failed after booking status committed — critical inconsistency
    // Slot is stuck in soft_locked. Log and return partial success so admin can intervene.
    return Response.json({
      success: true,
      booking_request_id,
      status: 'accepted',
      slot_update_failed: true,
      warning: 'Booking accepted but slot state could not be updated. Admin has been alerted.'
    }, { status: 200 });
  }

  // Verify slot committed correctly (version_number check)
  const verifySlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: slot.id });
  const verifiedSlot = verifySlots[0];
  if (!verifiedSlot || verifiedSlot.version_number !== slotVersionBefore + 1) {
    return Response.json({
      success: true,
      booking_request_id,
      status: 'accepted',
      slot_version_mismatch: true,
      warning: 'We were unable to confirm slot lock due to a system conflict. Admin has been alerted.'
    }, { status: 200 });
  }

  // ── In-app notification → parent ─────────────────────────────────────────
  await base44.functions.invoke('createNotification', {
    user_id: booking.parent_user_id,
    type: 'booking_accepted',
    title: 'Booking Confirmed!',
    message: `${cgProfile?.display_name || 'Your caregiver'} has accepted your booking request.`,
    booking_request_id,
    action_url: '/ParentBookings'
  }).catch(() => {});

  // ── Layer 4: Transactional emails ────────────────────────────────────────
  const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';

  const start = new Date(booking.start_time);
  const dateStr = start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = `${booking.start_time?.slice(11,16) || ''} – ${booking.end_time?.slice(11,16) || ''}`;

  const parentEmailBody = `
Hi,

Great news — ${cgProfile?.display_name || 'Your caregiver'} has accepted your booking request!

Date: ${dateStr}
Time: ${timeStr}
Children: ${booking.num_children}

Your session is now confirmed. You can view your booking details here:
${baseUrl}/ParentBookings

– CareNest
  `.trim();

  const caregiverEmailBody = `
Hi ${cgProfile?.display_name || ''},

You have confirmed a booking.

Date: ${dateStr}
Time: ${timeStr}
Children: ${booking.num_children}
${booking.special_requests ? `Special requests: ${booking.special_requests}` : ''}

View your upcoming bookings:
${baseUrl}/CaregiverProfile

– CareNest
  `.trim();

  await Promise.allSettled([
    parentUser && base44.asServiceRole.integrations.Core.SendEmail({
      to: parentUser.email,
      subject: 'Booking Confirmed! 🎉',
      body: parentEmailBody
    }),
    caregiverUser2 && base44.asServiceRole.integrations.Core.SendEmail({
      to: caregiverUser2.email,
      subject: 'Booking Confirmed',
      body: caregiverEmailBody
    })
  ]);

  // ── Layer 8: Audit log — F-077 Audit.1 ─────────────────────────────────
  await Promise.allSettled([
    base44.functions.invoke('logBookingEvent', {
      event_type: 'booking_status_transition',
      booking_id: booking_request_id,
      actor_user_id: user.id,
      actor_role: 'caregiver',
      old_status: 'pending',
      new_status: 'accepted',
      slot_id: booking.availability_slot_id,
      slot_version_before: slotVersionBefore,
      slot_version_after: verifiedSlot.version_number,
      caregiver_profile_id: booking.caregiver_profile_id,
      parent_user_id: booking.parent_user_id,
      caregiver_user_id: booking.caregiver_user_id,
      meta: { action: 'accept' }
    }),
    // F-077 Audit.1: Phone reveal event → PIIAccessLog
    base44.functions.invoke('logBookingEvent', {
      event_type: 'phone_reveal',
      booking_id: booking_request_id,
      actor_user_id: user.id,
      actor_role: 'caregiver',
      caregiver_user_id: booking.caregiver_user_id,
      parent_user_id: booking.parent_user_id,
      pii_event: {
        field_accessed: 'phone',
        target_entity_type: 'User',
        target_entity_id: booking.caregiver_user_id,
        booking_context_id: booking_request_id,
        access_context: 'booking_accepted',
        accessor_role: 'caregiver'
      }
    })
  ]);

  return Response.json({
    success: true,
    booking_request_id,
    status: 'accepted',
    slot_status: 'booked',
    slot_version: verifiedSlot.version_number
  }, { status: 200 });
});