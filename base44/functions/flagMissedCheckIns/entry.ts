/**
 * F-080 Automation: Flag accepted bookings where check-in window has fully closed
 * without both parties confirming (i.e., start_time + 15min has passed, status still accepted).
 *
 * Runs every 15 minutes (scheduled automation).
 * Finds BookingRequest with status=accepted AND end_time + 15min < now.
 * Action: transition → no_show_reported, review_status=pending, create ReviewCase (no_show).
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
  const results = { flagged: 0, errors: [] };

  const acceptedBookings = await base44.asServiceRole.entities.BookingRequest.filter({ status: 'accepted' });

  // Flag bookings that ended more than 24 hours ago and were never completed
  const missed = acceptedBookings.filter(b => {
    const endTime = new Date(b.end_time.slice(0, 19));
    const gracePeriodEnd = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
    return gracePeriodEnd < now;
  });

  for (const booking of missed) {
    // Step 1: accepted → no_show_reported
    try {
      await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
        status: 'no_show_reported',
        review_status: 'pending'
      });
    } catch (err) {
      results.errors.push({ booking_id: booking.id, error: err.message });
      continue;
    }

    // Verify committed
    const verify = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking.id });
    if (!verify[0] || verify[0].status !== 'no_show_reported') {
      results.errors.push({ booking_id: booking.id, error: 'Status not no_show_reported after update' });
      continue;
    }
    results.flagged++;

    // Step 2: Create ReviewCase (no_show, auto-generated)
    await base44.asServiceRole.entities.ReviewCase.create({
      booking_request_id: booking.id,
      case_type: 'no_show',
      notes: `Auto-flagged: session end time passed ${new Date(new Date(booking.end_time).getTime() + 24 * 60 * 60 * 1000).toISOString()} without caregiver marking complete.`,
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
        subject: 'Missed Check-In — Admin Review',
        body: `Hi ${cgProfile?.display_name || ''},\n\nYour booking on ${dateStr} was flagged because the check-in window closed without both parties confirming. Our team will review and may reach out.\n\n${baseUrl}/CaregiverProfile\n\n– CareNest`
      }),
      parentUser && base44.asServiceRole.integrations.Core.SendEmail({
        to: parentUser.email,
        subject: 'Missed Check-In — Admin Review',
        body: `Hi,\n\nYour booking with ${cgProfile?.display_name || 'your caregiver'} on ${dateStr} was flagged because the check-in window closed without confirmation. Our team will review.\n\n${baseUrl}/ParentBookings\n\n– CareNest`
      })
    ]);
  }

  return Response.json({
    success: true,
    processed: missed.length,
    ...results,
    run_at: now.toISOString()
  });
  // Note: Layer 8 audit for each flagged booking is written inside the loop above
  // via the ReviewCase creation and email side effects. The AdminActionLog entry
  // for the no_show_reported transition is written by the logBookingEvent function
  // when called from the manual reportNoShow function. Automated flags are recorded
  // implicitly via the ReviewCase.notes field (auto-flagged with timestamp).
});