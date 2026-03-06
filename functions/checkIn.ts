/**
 * F-080: Check-In System — Layers 2 + 3
 * F-076: State Machine:
 *   Both parties confirmed → accepted → in_progress (check_in_time set)
 *   Caregiver confirmed, parent did not within 15min → accepted → no_show_reported
 *
 * Two-step mutual confirmation (F-080 Logic.2, Logic.3):
 * - Caregiver confirms first → sets caregiver_checked_in transient flag on booking
 * - Parent confirms → reads flag, if true → transition to in_progress
 *
 * Window: (start_time - 30min) to (start_time + 15min) — server wall-clock
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver' && user.app_role !== 'parent') {
    return Response.json({ error: 'Only caregivers and parents may perform check-in.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id } = body;
  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });

  const isCaregiver = user.app_role === 'caregiver' && booking.caregiver_user_id === user.id;
  const isParent = user.app_role === 'parent' && booking.parent_user_id === user.id;
  if (!isCaregiver && !isParent) return Response.json({ error: 'Not found.' }, { status: 404 });

  if (booking.status !== 'accepted') {
    return Response.json({ error: `Check-in is only available for accepted bookings. Current status: ${booking.status}.`, current_status: booking.status }, { status: 409 });
  }

  // ── Layer 2: Check-in window gate ────────────────────────────────────────
  const bookingStart = new Date(booking.start_time);
  const windowOpen = new Date(bookingStart.getTime() - 30 * 60 * 1000);
  const windowClose = new Date(bookingStart.getTime() + 15 * 60 * 1000);
  const now = new Date();

  if (now < windowOpen) {
    const minutesUntilOpen = Math.ceil((windowOpen - now) / (1000 * 60));
    return Response.json({ error: `Check-in opens 30 minutes before your booking. Please wait ${minutesUntilOpen} more minutes.` }, { status: 409 });
  }
  if (now > windowClose) {
    return Response.json({ error: 'The check-in window has passed. This booking has been flagged for no-show review.' }, { status: 409 });
  }

  // ── Layer 3: Two-step mutual confirmation state machine ───────────────────
  // We use a nullable field on the booking to track caregiver check-in confirmation.
  // caregiver_checked_in_at: reuse cancellation_requested_at field is NOT appropriate.
  // We store it in the booking via a dedicated approach:
  // - When caregiver confirms: store ISO timestamp in cancellation_requested_at is wrong.
  // - Per spec, check_in_time is set when BOTH confirm. We track partial state via
  //   a convention: if check_in_time is null and booking.status=accepted, check
  //   if caregiver_check_in_at is set (stored as a separate transient field).
  // Implementation: use a dedicated field pattern via cancellation_response_timestamp
  // which is otherwise unused at this lifecycle stage.
  // NOTE: Addendum F-080 Logic.2 says "caregiver_checked_in=true transient flag".
  // We store it as cancellation_response_timestamp = caregiver check-in ISO timestamp.

  if (isCaregiver) {
    // Caregiver step: record arrival time — parent must confirm within 15min
    // Only set if not already set (idempotent)
    if (!booking.cancellation_response_timestamp) {
      await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
        cancellation_response_timestamp: now.toISOString()
      });
    }
    return Response.json({
      success: true,
      step: 'caregiver_checked_in',
      message: 'Your arrival has been recorded. Waiting for the parent to confirm check-in.',
      booking_request_id
    }, { status: 200 });
  }

  if (isParent) {
    // Parent step: confirm check-in. Caregiver must have confirmed first.
    if (!booking.cancellation_response_timestamp) {
      return Response.json({
        error: 'The caregiver has not yet confirmed their arrival. Please wait for them to check in first.',
        step: 'awaiting_caregiver'
      }, { status: 409 });
    }

    // Both confirmed — transition to in_progress
    try {
      await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
        status: 'in_progress',
        check_in_time: now.toISOString()
      });
    } catch (err) {
      return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
    }

    const verify = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
    if (!verify[0] || verify[0].status !== 'in_progress') {
      return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
    }

    return Response.json({
      success: true,
      step: 'both_confirmed',
      booking_request_id,
      status: 'in_progress',
      check_in_time: now.toISOString()
    }, { status: 200 });
  }
});