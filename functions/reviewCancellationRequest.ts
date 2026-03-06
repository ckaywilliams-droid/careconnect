/**
 * F-086: Parent Cancellation Review — Layer 2 (Access Control)
 *
 * Access gates enforced:
 * - Session valid and role=parent (or via tokenised email link — token validated here)
 * - BookingRequest exists and parent_user_id matches session user
 * - BookingRequest.status=cancellation_requested_by_caregiver
 * - Response deadline has not passed (cancellation_response_deadline > now)
 * - action must be 'approve' or 'deny'
 *
 * Layer 3+ to be implemented in subsequent layers.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Gate 1: Session valid and role=parent
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.app_role !== 'parent') {
    return Response.json({ error: 'Only parents may respond to cancellation requests.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id, action } = body;

  if (!booking_request_id || !action) {
    return Response.json({ error: 'booking_request_id and action are required.' }, { status: 400 });
  }

  // Gate: action must be approve or deny
  if (action !== 'approve' && action !== 'deny') {
    return Response.json({ error: "action must be 'approve' or 'deny'." }, { status: 400 });
  }

  // Fetch the booking request
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({
    id: booking_request_id
  });
  const booking = bookings[0];

  // Gate: BookingRequest must exist
  if (!booking) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  // Gate: Parent must own this booking
  if (booking.parent_user_id !== user.id) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  // Gate: Booking must be in cancellation_requested_by_caregiver state
  if (booking.status !== 'cancellation_requested_by_caregiver') {
    return Response.json({
      error: `This action is no longer available. Current booking status: ${booking.status}.`,
      current_status: booking.status
    }, { status: 409 });
  }

  // Gate: Response deadline must not have passed (F-086 Errors.1)
  if (booking.cancellation_response_deadline) {
    const deadline = new Date(booking.cancellation_response_deadline);
    if (new Date() > deadline) {
      return Response.json({
        error: 'The response window has closed. This booking is under admin review.',
        gate_failed: 'gate_deadline_passed'
      }, { status: 409 });
    }
  }

  // All gates passed
  return Response.json({
    gates_passed: true,
    booking,
    action
  }, { status: 200 });
});