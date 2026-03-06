/**
 * F-084R: Admin Review & Resolution — Layer 2 (Access Control)
 *
 * Access gates enforced:
 * - Session valid and role=super_admin (only super_admin can issue rulings, strikes, profile holds — F-084R Access.1)
 * - ReviewCase exists
 * - Linked BookingRequest must be in under_review or no_show_reported state
 * - ruling must be a valid enum value
 * - slot_action must be 'release' or 'archive'
 *
 * support_admin and trust_admin can READ cases (enforced via RLS on ReviewCase entity).
 * Only super_admin can resolve via this function.
 *
 * Layer 3+ to be implemented in subsequent layers.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Gate 1: Session valid and role=super_admin
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.app_role !== 'super_admin') {
    return Response.json({ error: 'Only super admins may resolve review cases.' }, { status: 403 });
  }

  const body = await req.json();
  const {
    review_case_id,
    ruling,
    slot_action,
    issue_strike,
    increment_no_show,
    notes
  } = body;

  if (!review_case_id || !ruling || !slot_action) {
    return Response.json({
      error: 'review_case_id, ruling, and slot_action are required.'
    }, { status: 400 });
  }

  // Gate: ruling must be valid
  const validRulings = ['caregiver_at_fault', 'parent_at_fault', 'mutual', 'dismissed'];
  if (!validRulings.includes(ruling)) {
    return Response.json({
      error: `ruling must be one of: ${validRulings.join(', ')}.`
    }, { status: 400 });
  }

  // Gate: slot_action must be valid
  if (slot_action !== 'release' && slot_action !== 'archive') {
    return Response.json({
      error: "slot_action must be 'release' or 'archive'."
    }, { status: 400 });
  }

  // Fetch the ReviewCase
  const cases = await base44.asServiceRole.entities.ReviewCase.filter({
    id: review_case_id
  });
  const reviewCase = cases[0];

  if (!reviewCase) {
    return Response.json({ error: 'Review case not found.' }, { status: 404 });
  }

  // Gate: Case must not already be resolved
  if (reviewCase.ruling !== 'pending') {
    return Response.json({
      error: `This case has already been resolved with ruling: ${reviewCase.ruling}.`,
      current_ruling: reviewCase.ruling
    }, { status: 409 });
  }

  // Fetch the linked BookingRequest
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({
    id: reviewCase.booking_request_id
  });
  const booking = bookings[0];

  if (!booking) {
    return Response.json({ error: 'Linked booking not found.' }, { status: 404 });
  }

  // Gate: BookingRequest must be in under_review or no_show_reported (F-084R Data.1)
  const reviewableStatuses = ['under_review', 'no_show_reported'];
  if (!reviewableStatuses.includes(booking.status)) {
    return Response.json({
      error: `Booking status has changed — please refresh the case. Current status: ${booking.status}.`,
      current_status: booking.status
    }, { status: 409 });
  }

  // All gates passed
  return Response.json({
    gates_passed: true,
    review_case: reviewCase,
    booking,
    ruling,
    slot_action,
    issue_strike: !!issue_strike,
    increment_no_show: !!increment_no_show,
    notes: notes || null,
    admin_user_id: user.id
  }, { status: 200 });
});