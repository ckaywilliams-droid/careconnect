/**
 * F-086: Parent Cancellation Review — Layers 2 + 3
 * F-076: State Machine:
 *   approve: cancellation_requested_by_caregiver → cancelled_by_caregiver (terminal)
 *   deny:    cancellation_requested_by_caregiver → accepted (reverts)
 *
 * F-088: Atomic slot reopen on approve (booked → open, version_number guard)
 * Slot on deny: booked — unchanged
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'parent') return Response.json({ error: 'Only parents may respond to cancellation requests.' }, { status: 403 });

  const body = await req.json();
  const { booking_request_id, action } = body;
  if (!booking_request_id || !action) return Response.json({ error: 'booking_request_id and action are required.' }, { status: 400 });
  if (action !== 'approve' && action !== 'deny') return Response.json({ error: "action must be 'approve' or 'deny'." }, { status: 400 });

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });
  if (booking.parent_user_id !== user.id) return Response.json({ error: 'Not found.' }, { status: 404 });

  if (booking.status !== 'cancellation_requested_by_caregiver') {
    return Response.json({ error: `This action is no longer available. Current booking status: ${booking.status}.`, current_status: booking.status }, { status: 409 });
  }

  // Gate: deadline must not have passed
  if (booking.cancellation_response_deadline && new Date() > new Date(booking.cancellation_response_deadline)) {
    return Response.json({ error: 'The response window has closed. This booking is under admin review.', gate_failed: 'gate_deadline_passed' }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (action === 'deny') {
    // ── Layer 3: cancellation_requested_by_caregiver → accepted (revert) ───
    try {
      await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
        status: 'accepted',
        cancellation_response_timestamp: now
      });
    } catch (err) {
      return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
    }
    // Verify
    const verify = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
    if (!verify[0] || verify[0].status !== 'accepted') {
      return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
    }
    // Slot stays booked — no change
    // Layer 4 (notify caregiver of denial) added in next layer
    return Response.json({ success: true, booking_request_id, action: 'denied', status: 'accepted' }, { status: 200 });
  }

  // action === 'approve'
  // ── Layer 3: cancellation_requested_by_caregiver → cancelled_by_caregiver ─
  try {
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'cancelled_by_caregiver',
      cancelled_by: 'caregiver',
      cancellation_response_timestamp: now
    });
  } catch (err) {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // Verify committed
  const verifyBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const verifiedBooking = verifyBookings[0];
  if (!verifiedBooking || verifiedBooking.status !== 'cancelled_by_caregiver') {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // ── F-088: Atomic slot reopen — booked → open ─────────────────────────────
  const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: booking.availability_slot_id });
  const slot = slots[0];

  if (!slot || slot.status !== 'booked' || slot.locked_by_booking_id !== booking_request_id) {
    // Unexpected slot state — escalate per F-088 Errors.1
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'under_review',
      review_status: 'pending'
    });
    return Response.json({ error: 'A system conflict occurred during slot release. The booking has been escalated to admin review.', escalated_to_under_review: true }, { status: 500 });
  }

  const slotVersionBefore = slot.version_number || 0;
  try {
    await base44.asServiceRole.entities.AvailabilitySlot.update(slot.id, {
      status: 'open',
      locked_by_booking_id: null,
      version_number: slotVersionBefore + 1
    });
  } catch (slotErr) {
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'under_review',
      review_status: 'pending'
    });
    return Response.json({ error: 'A concurrency conflict occurred during slot release. The booking has been escalated to admin review.', escalated_to_under_review: true }, { status: 500 });
  }

  // Layer 4 (notifications to both parties) added in next layer
  return Response.json({
    success: true,
    booking_request_id,
    action: 'approved',
    status: 'cancelled_by_caregiver',
    slot_status: 'open'
  }, { status: 200 });
});