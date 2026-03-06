/**
 * F-085: Caregiver Cancellation Request — Layer 2 (Access Control)
 * F-087: Cancellation Window Enforcement — Layer 2 (gate enforced here)
 *
 * Access gates enforced:
 * - Session valid and role=caregiver
 * - BookingRequest exists and caregiver_user_id matches session user
 * - BookingRequest.status=accepted (only accepted bookings can be cancellation-requested)
 * - F-087 window gate: booking start_time must be >= 24h from now (server wall-clock)
 * - Rate limit check: max 3 caregiver cancellation requests per month (Layer 6 — checked here at gate layer)
 * - cancellation_reason required: min 10 chars, max 500 chars, not whitespace-only
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
    return Response.json({ error: 'Only caregivers may submit cancellation requests.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id, cancellation_reason } = body;

  if (!booking_request_id) {
    return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });
  }

  // Gate: cancellation_reason required, min 10 chars, max 500, not whitespace-only (F-085 Abuse.2)
  if (!cancellation_reason || cancellation_reason.trim().length < 10) {
    return Response.json({
      error: 'A cancellation reason is required (minimum 10 characters).'
    }, { status: 400 });
  }
  if (cancellation_reason.trim().length > 500) {
    return Response.json({
      error: 'Cancellation reason must be 500 characters or less.'
    }, { status: 400 });
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

  // Gate: Booking must be accepted (F-085 Access.1)
  if (booking.status !== 'accepted') {
    return Response.json({
      error: `Cancellation requests can only be submitted for accepted bookings. Current status: ${booking.status}.`,
      current_status: booking.status
    }, { status: 409 });
  }

  // Gate: F-087 Cancellation Window — booking start must be >= 24h from now (server-side wall-clock)
  // Combine booking start_time datetime and check hours remaining
  const bookingStart = new Date(booking.start_time);
  const now = new Date();
  const hoursRemaining = (bookingStart - now) / (1000 * 60 * 60);

  if (hoursRemaining < 24) {
    return Response.json({
      error: 'Cancellation requests must be submitted at least 24 hours before the booking start time. Please contact support if this is an emergency.',
      gate_failed: 'gate_window_too_late',
      hours_remaining: hoursRemaining
    }, { status: 409 });
  }

  // Gate: Rate limit — max 3 caregiver cancellation requests per month (F-085 Abuse.1)
  // Count cancellation requests submitted this calendar month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyRequests = await base44.asServiceRole.entities.BookingRequest.filter({
    caregiver_user_id: user.id,
    status: 'cancellation_requested_by_caregiver'
  });

  // Count requests that have cancellation_requested_at within the current month
  const thisMonthCount = monthlyRequests.filter(b => {
    if (!b.cancellation_requested_at) return false;
    return new Date(b.cancellation_requested_at) >= startOfMonth;
  }).length;

  if (thisMonthCount >= 3) {
    return Response.json({
      error: 'You have reached your cancellation request limit for this period. Please contact support.',
      gate_failed: 'gate_rate_limit_monthly'
    }, { status: 429 });
  }

  // All gates passed
  return Response.json({
    gates_passed: true,
    booking,
    cancellation_reason: cancellation_reason.trim(),
    hours_remaining: hoursRemaining
  }, { status: 200 });
});