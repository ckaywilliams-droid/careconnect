/**
 * F-077: Accept / Decline Flow — Layer 2 (Access Control) — Decline path
 *
 * Access gates enforced:
 * - Session valid and role=caregiver
 * - BookingRequest exists and is owned by the session caregiver
 * - BookingRequest.status=pending
 *
 * Layer 3+ to be implemented in subsequent layers.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Gate 1: Session valid and role=caregiver
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.app_role !== 'caregiver') {
    return Response.json({ error: 'Only caregivers may decline booking requests.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id } = body;

  if (!booking_request_id) {
    return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });
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

  // Gate: Caregiver must own this booking
  if (booking.caregiver_user_id !== user.id) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  // Gate: Booking must be pending
  if (booking.status !== 'pending') {
    return Response.json({
      error: `This booking request has already been ${booking.status}.`,
      current_status: booking.status
    }, { status: 409 });
  }

  return Response.json({
    gates_passed: true,
    booking,
    caregiver_user_id: user.id
  }, { status: 200 });
});