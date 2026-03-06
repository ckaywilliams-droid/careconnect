/**
 * F-081R: Check-Out System — Layer 2 (Access Control)
 *
 * Access gates enforced:
 * - Session valid and role=caregiver OR parent
 * - BookingRequest exists and actor owns it
 * - BookingRequest.status=in_progress (F-081R Access.2)
 *
 * Layer 3+ to be implemented in subsequent layers.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Gate 1: Session valid and role is caregiver or parent
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.app_role !== 'caregiver' && user.app_role !== 'parent') {
    return Response.json({ error: 'Only caregivers and parents may perform check-out.' }, { status: 403 });
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

  if (!booking) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  // Gate: Actor must own this booking
  const isCaregiver = user.app_role === 'caregiver' && booking.caregiver_user_id === user.id;
  const isParent = user.app_role === 'parent' && booking.parent_user_id === user.id;
  if (!isCaregiver && !isParent) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  // Gate: Booking must be in_progress (F-081R Access.2)
  if (booking.status !== 'in_progress') {
    return Response.json({
      error: `Check-out is only available for in-progress bookings. Current status: ${booking.status}.`,
      current_status: booking.status
    }, { status: 409 });
  }

  // All gates passed
  return Response.json({
    gates_passed: true,
    booking,
    actor_role: user.app_role,
    actor_user_id: user.id
  }, { status: 200 });
});