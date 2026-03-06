/**
 * F-082R: No-Show Reporting (Manual) — Layer 2 (Access Control)
 *
 * Access gates enforced:
 * - Session valid and role=caregiver OR parent
 * - BookingRequest exists and actor owns it
 * - BookingRequest.status=accepted (manual no-show only available on accepted bookings)
 * - Current time must be after booking start_time (F-082R Access.1)
 * - description required: min 10 chars
 * - Rate limit: max 3 manual no-show reports per user per month (F-082R Abuse.1)
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
    return Response.json({ error: 'Only caregivers and parents may report a no-show.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id, description } = body;

  if (!booking_request_id) {
    return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });
  }

  // Gate: description required, min 10 chars (F-082R Access.1)
  if (!description || description.trim().length < 10) {
    return Response.json({
      error: 'A description is required (minimum 10 characters).'
    }, { status: 400 });
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

  // Gate: Booking must be accepted (F-082R States.1)
  if (booking.status === 'in_progress') {
    return Response.json({
      error: 'Your session is in progress. If there is an issue, use the check-out dispute flow.',
      current_status: booking.status
    }, { status: 409 });
  }
  if (booking.status !== 'accepted') {
    return Response.json({
      error: `No-show reporting is only available for accepted bookings. Current status: ${booking.status}.`,
      current_status: booking.status
    }, { status: 409 });
  }

  // Gate: Current time must be after start_time (F-082R Access.1)
  const bookingStart = new Date(booking.start_time);
  if (new Date() <= bookingStart) {
    return Response.json({
      error: 'No-show can only be reported after the booking start time.',
      gate_failed: 'gate_too_early'
    }, { status: 409 });
  }

  // Gate: Rate limit — max 3 manual no-show reports per user per month (F-082R Abuse.1)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const recentNoShows = await base44.asServiceRole.entities.BookingRequest.filter({
    status: 'no_show_reported'
  });

  const actorField = user.app_role === 'parent' ? 'parent_user_id' : 'caregiver_user_id';
  const thisMonthCount = recentNoShows.filter(b => {
    if (b[actorField] !== user.id) return false;
    return new Date(b.updated_date) >= startOfMonth;
  }).length;

  if (thisMonthCount >= 3) {
    return Response.json({
      error: 'You have reached the maximum no-show reports allowed this month.',
      gate_failed: 'gate_rate_limit_monthly'
    }, { status: 429 });
  }

  // All gates passed
  return Response.json({
    gates_passed: true,
    booking,
    actor_role: user.app_role,
    actor_user_id: user.id,
    description: description.trim()
  }, { status: 200 });
});