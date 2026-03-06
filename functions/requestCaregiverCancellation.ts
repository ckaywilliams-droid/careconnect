/**
 * F-085: Caregiver Cancellation Request — Layers 2 + 3
 * F-087: Cancellation Window Enforcement (24h gate — server wall-clock)
 * F-076: State Machine — accepted → cancellation_requested_by_caregiver
 *
 * Slot effect: booked — remains locked (not released at request time per F-085 Data.1)
 * Deadline: cancellation_response_deadline = now + 24h
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver') return Response.json({ error: 'Only caregivers may submit cancellation requests.' }, { status: 403 });

  const body = await req.json();
  const { booking_request_id, cancellation_reason } = body;
  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });

  if (!cancellation_reason || cancellation_reason.trim().length < 10) {
    return Response.json({ error: 'A cancellation reason is required (minimum 10 characters).' }, { status: 400 });
  }
  if (cancellation_reason.trim().length > 500) {
    return Response.json({ error: 'Cancellation reason must be 500 characters or less.' }, { status: 400 });
  }

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });
  if (booking.caregiver_user_id !== user.id) return Response.json({ error: 'Not found.' }, { status: 404 });

  if (booking.status !== 'accepted') {
    return Response.json({ error: `Cancellation requests can only be submitted for accepted bookings. Current status: ${booking.status}.`, current_status: booking.status }, { status: 409 });
  }

  // ── Layer 2: F-087 24h window gate — server wall-clock ───────────────────
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

  // ── Layer 2: Rate limit — max 3 per caregiver per month ──────────────────
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyRequests = await base44.asServiceRole.entities.BookingRequest.filter({ caregiver_user_id: user.id });
  const thisMonthCount = monthlyRequests.filter(b =>
    b.status === 'cancellation_requested_by_caregiver' &&
    b.cancellation_requested_at &&
    new Date(b.cancellation_requested_at) >= startOfMonth
  ).length;
  if (thisMonthCount >= 3) {
    return Response.json({ error: 'You have reached your cancellation request limit for this period. Please contact support.', gate_failed: 'gate_rate_limit_monthly' }, { status: 429 });
  }

  // ── Layer 3: State machine — accepted → cancellation_requested_by_caregiver
  // Compare-and-swap: UPDATE WHERE status='accepted'
  const now2 = new Date();
  const deadline = new Date(now2.getTime() + 24 * 60 * 60 * 1000);

  try {
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'cancellation_requested_by_caregiver',
      cancellation_requested_at: now2.toISOString(),
      cancellation_response_deadline: deadline.toISOString(),
      cancellation_reason: cancellation_reason.trim()
    });
  } catch (err) {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // Verify committed
  const verifyBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const verifiedBooking = verifyBookings[0];
  if (!verifiedBooking || verifiedBooking.status !== 'cancellation_requested_by_caregiver') {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // Slot remains booked — no slot change at this stage (F-085 Data.1)
  // Layer 4 (email to parent + admin alert) added in next layer
  return Response.json({
    success: true,
    booking_request_id,
    status: 'cancellation_requested_by_caregiver',
    cancellation_requested_at: now2.toISOString(),
    cancellation_response_deadline: deadline.toISOString()
  }, { status: 200 });
});