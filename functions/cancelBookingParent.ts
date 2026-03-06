/**
 * F-078: Parent Cancellation (Pending & Accepted) — Layer 2 (Access Control)
 *
 * Access gates enforced:
 * - Session valid and role=parent
 * - BookingRequest exists and parent_user_id matches session user
 * - BookingRequest.status must be pending OR accepted
 *   (NOT cancellable when: in_progress, no_show_reported, under_review, or any terminal state)
 * - If status=cancellation_requested_by_caregiver: parent must respond to that first (not cancel)
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
    return Response.json({ error: 'Only parents may cancel booking requests.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id, cancellation_reason } = body;

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

  // Gate: Parent must own this booking
  if (booking.parent_user_id !== user.id) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  // Gate: Status-specific rules per F-078 Access.1 and Access.2
  if (booking.status === 'cancellation_requested_by_caregiver') {
    return Response.json({
      error: 'You have a pending cancellation request from the caregiver. Please respond to it first.',
      current_status: booking.status
    }, { status: 409 });
  }

  if (booking.status === 'in_progress') {
    return Response.json({
      error: 'Your booking session is in progress and cannot be cancelled. Please contact support if there is an issue.',
      current_status: booking.status
    }, { status: 409 });
  }

  const terminalStates = ['declined', 'cancelled_by_parent', 'cancelled_by_caregiver', 'expired', 'completed', 'resolved', 'no_show_reported', 'under_review'];
  if (terminalStates.includes(booking.status)) {
    if (booking.status === 'accepted') {
      // This shouldn't happen — accepted is handled below — but guard anyway
    } else {
      return Response.json({
        error: `This booking has already been ${booking.status} and cannot be cancelled. To cancel an accepted booking, please contact support.`,
        current_status: booking.status
      }, { status: 409 });
    }
  }

  // Permitted statuses: pending, accepted
  if (booking.status !== 'pending' && booking.status !== 'accepted') {
    return Response.json({
      error: `This booking cannot be cancelled in its current state (${booking.status}).`,
      current_status: booking.status
    }, { status: 409 });
  }

  // All gates passed
  return Response.json({
    gates_passed: true,
    booking,
    cancellation_reason: cancellation_reason || null,
    path: booking.status === 'pending' ? 'pending_cancel' : 'accepted_cancel'
  }, { status: 200 });
});