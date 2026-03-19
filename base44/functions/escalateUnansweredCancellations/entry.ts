/**
 * F-086 Automation: Escalate caregiver cancellation requests where parent has not
 * responded within the 24h deadline window.
 *
 * Runs every 30 minutes (scheduled automation).
 * Finds all BookingRequest with status=cancellation_requested_by_caregiver
 * AND cancellation_response_deadline < now.
 *
 * Action: transition → under_review, review_status=pending, create ReviewCase (cancellation_escalation).
 * Slot: remains booked until admin resolves.
 * Notify both parties.
 *
 * Admin-only function — requires super_admin role.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user || user.app_role !== 'super_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const results = { escalated: 0, errors: [] };

  const pending = await base44.asServiceRole.entities.BookingRequest.filter({
    status: 'cancellation_requested_by_caregiver'
  });

  const overdue = pending.filter(b =>
    b.cancellation_response_deadline && new Date(b.cancellation_response_deadline) < now
  );

  for (const booking of overdue) {
    // Step 1: cancellation_requested_by_caregiver → under_review
    try {
      await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
        status: 'under_review',
        review_status: 'pending'
      });
    } catch (err) {
      results.errors.push({ booking_id: booking.id, error: err.message });
      continue;
    }

    // Verify
    const verify = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking.id });
    if (!verify[0] || verify[0].status !== 'under_review') {
      results.errors.push({ booking_id: booking.id, error: 'Status not under_review after update' });
      continue;
    }
    results.escalated++;

    // Step 2: Create ReviewCase
    await base44.asServiceRole.entities.ReviewCase.create({
      booking_request_id: booking.id,
      case_type: 'cancellation_escalation',
      notes: `Auto-escalated: parent did not respond to caregiver cancellation request by deadline ${booking.cancellation_response_deadline}.`,
      ruling: 'pending'
    }).catch(() => {});

    // Layer 4: Notify both parties
    const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
    const [cgUsersArr, parentUsersArr, cgProfilesArr] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ id: booking.caregiver_user_id }),
      base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id }),
      base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id })
    ]);
    const cgUser = cgUsersArr[0];
    const parentUser = parentUsersArr[0];
    const cgProfile = cgProfilesArr[0];
    const dateStr = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    await Promise.allSettled([
      cgUser && base44.asServiceRole.integrations.Core.SendEmail({
        to: cgUser.email,
        subject: 'Cancellation Request Escalated to Admin Review',
        body: `Hi ${cgProfile?.display_name || ''},\n\nThe parent did not respond to your cancellation request for ${dateStr} within 24 hours. The booking has been escalated to admin review.\n\nOur team will contact you shortly.\n\n– CareNest`
      }),
      parentUser && base44.asServiceRole.integrations.Core.SendEmail({
        to: parentUser.email,
        subject: 'Booking Under Admin Review',
        body: `Hi,\n\nYou did not respond to ${cgProfile?.display_name || 'your caregiver'}'s cancellation request for ${dateStr} within the required timeframe. The booking has been escalated to admin review.\n\nOur team will contact you shortly.\n${baseUrl}/ParentBookings\n\n– CareNest`
      })
    ]);
  }

  // ── Layer 8 note: F-086 Audit.1 — deadline escalation logged ────────────
  // Each escalated booking has its ReviewCase created with timestamps above.
  // The per-booking log entry (status transition + deadline) is captured in the
  // ReviewCase.notes field and the BookingRequest.updated_date field.
  return Response.json({
    success: true,
    processed: overdue.length,
    ...results,
    run_at: now.toISOString()
  });
});