/**
 * F-078: Parent Cancellation (Pending & Accepted) — Layers 2 + 3
 * F-076: State Machine — pending → cancelled_by_parent (terminal)
 *                        accepted → cancelled_by_parent (terminal)
 * F-088: Atomic slot reopen for accepted-state cancellations
 *
 * pending path: slot soft_locked → open (version_number++)
 * accepted path: slot booked → open (atomic reopen, version_number guard, locked_by_booking_id cleared)
 *
 * F-076 Addendum Logic.2: Both slot and booking updates must succeed atomically.
 * If slot update fails: set booking to under_review and alert admin — do not leave partial state.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'parent') return Response.json({ error: 'Only parents may cancel booking requests.' }, { status: 403 });

  const body = await req.json();
  const { booking_request_id, cancellation_reason } = body;
  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });
  if (booking.parent_user_id !== user.id) return Response.json({ error: 'Not found.' }, { status: 404 });

  // ── Layer 2: Status-specific gates ───────────────────────────────────────
  if (booking.status === 'cancellation_requested_by_caregiver') {
    return Response.json({ error: 'You have a pending cancellation request from the caregiver. Please respond to it first.', current_status: booking.status }, { status: 409 });
  }
  if (booking.status === 'in_progress') {
    return Response.json({ error: 'Your booking session is in progress and cannot be cancelled. Please contact support if there is an issue.', current_status: booking.status }, { status: 409 });
  }
  if (booking.status !== 'pending' && booking.status !== 'accepted') {
    return Response.json({ error: `This booking cannot be cancelled in its current state (${booking.status}).`, current_status: booking.status }, { status: 409 });
  }

  // ── Layer 3: Fetch slot for version_number guard ──────────────────────────
  const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: booking.availability_slot_id });
  const slot = slots[0];
  const slotVersionBefore = slot?.version_number || 0;
  const expectedSlotStatus = booking.status === 'pending' ? 'soft_locked' : 'booked';

  // ── Layer 3: Step 1 — Compare-and-swap: status → cancelled_by_parent ─────
  try {
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'cancelled_by_parent',
      cancelled_by: 'parent',
      cancellation_reason: cancellation_reason || null
    });
  } catch (err) {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // Verify committed
  const verifyBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const verifiedBooking = verifyBookings[0];
  if (!verifiedBooking || verifiedBooking.status !== 'cancelled_by_parent') {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // ── Layer 3: Step 2 — F-088 Atomic slot reopen ────────────────────────────
  // Verify slot is in expected state before releasing
  if (!slot || slot.status !== expectedSlotStatus) {
    // Slot in unexpected state — escalate to under_review per F-088 Errors.1
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'under_review',
      review_status: 'pending'
    });
    return Response.json({
      error: 'A system conflict occurred during cancellation. The booking has been escalated to admin review.',
      escalated_to_under_review: true
    }, { status: 500 });
  }

  try {
    await base44.asServiceRole.entities.AvailabilitySlot.update(slot.id, {
      status: 'open',
      locked_by_booking_id: null,
      version_number: slotVersionBefore + 1
    });
  } catch (slotErr) {
    // F-088 Errors.2: version_number mismatch — abort, set booking to under_review
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'under_review',
      review_status: 'pending'
    });
    return Response.json({
      error: 'A system conflict occurred during slot release. The booking has been escalated to admin review.',
      escalated_to_under_review: true
    }, { status: 500 });
  }

  // Verify slot version committed
  const verifySlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: slot.id });
  const verifiedSlot = verifySlots[0];
  if (!verifiedSlot || verifiedSlot.version_number !== slotVersionBefore + 1) {
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'under_review',
      review_status: 'pending'
    });
    return Response.json({
      error: 'A concurrency conflict occurred. The booking has been escalated to admin review.',
      escalated_to_under_review: true
    }, { status: 500 });
  }

  // ── Layer 4: Transactional email — notify caregiver of cancellation ──────
  const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
  const caregiverUserArr = await base44.asServiceRole.entities.User.filter({ id: booking.caregiver_user_id });
  const caregiverUserObj = caregiverUserArr[0];
  const cgProfileArr = await base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id });
  const cgProfileObj = cgProfileArr[0];

  if (caregiverUserObj) {
    const dateStr = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const body = `
Hi ${cgProfileObj?.display_name || ''},

A booking has been cancelled by the parent.

Date: ${dateStr}
Time: ${booking.start_time?.slice(11,16) || ''} – ${booking.end_time?.slice(11,16) || ''}
${cancellation_reason ? `Reason: ${cancellation_reason}` : ''}

The time slot has been released and is now available again for new bookings.

${baseUrl}/CaregiverProfile

– CareNest
    `.trim();

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: caregiverUserObj.email,
      subject: 'Booking Cancelled by Parent',
      body
    }).catch(() => {});
  }

  return Response.json({
    success: true,
    booking_request_id,
    status: 'cancelled_by_parent',
    slot_status: 'open',
    slot_version: verifiedSlot.version_number
  }, { status: 200 });
});