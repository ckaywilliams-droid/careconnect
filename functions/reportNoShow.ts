/**
 * F-082R: No-Show Reporting (Manual) — Layers 2 + 3
 * F-076: State Machine — accepted → no_show_reported
 *
 * Slot effect: booked — flagged (status unchanged, remains booked until admin resolves)
 * Creates a ReviewCase record for admin to action.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver' && user.app_role !== 'parent') {
    return Response.json({ error: 'Only caregivers and parents may report a no-show.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id, description } = body;
  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });
  if (!description || description.trim().length < 10) {
    return Response.json({ error: 'A description is required (minimum 10 characters).' }, { status: 400 });
  }

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });

  const isCaregiver = user.app_role === 'caregiver' && booking.caregiver_user_id === user.id;
  const isParent = user.app_role === 'parent' && booking.parent_user_id === user.id;
  if (!isCaregiver && !isParent) return Response.json({ error: 'Not found.' }, { status: 404 });

  if (booking.status === 'in_progress') {
    return Response.json({ error: 'Your session is in progress. If there is an issue, use the check-out dispute flow.', current_status: booking.status }, { status: 409 });
  }
  if (booking.status !== 'accepted') {
    return Response.json({ error: `No-show reporting is only available for accepted bookings. Current status: ${booking.status}.`, current_status: booking.status }, { status: 409 });
  }

  // Gate: current time must be after start_time
  if (new Date() <= new Date(booking.start_time)) {
    return Response.json({ error: 'No-show can only be reported after the booking start time.' }, { status: 409 });
  }

  // Gate: Rate limit — max 3 per user per month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const allNoShows = await base44.asServiceRole.entities.BookingRequest.filter({ status: 'no_show_reported' });
  const actorField = isParent ? 'parent_user_id' : 'caregiver_user_id';
  const thisMonthCount = allNoShows.filter(b =>
    b[actorField] === user.id && new Date(b.updated_date) >= startOfMonth
  ).length;
  if (thisMonthCount >= 3) {
    return Response.json({ error: 'You have reached the maximum no-show reports allowed this month.' }, { status: 429 });
  }

  // ── Layer 3: State machine — accepted → no_show_reported ─────────────────
  try {
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'no_show_reported',
      review_status: 'pending'
    });
  } catch (err) {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  const verify = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  if (!verify[0] || verify[0].status !== 'no_show_reported') {
    return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
  }

  // Create ReviewCase for admin (F-082R Logic.2)
  await base44.asServiceRole.entities.ReviewCase.create({
    booking_request_id,
    case_type: 'no_show',
    notes: `Manual no-show report by ${user.app_role} (${user.id}): ${description.trim()}`,
    ruling: 'pending'
  });

  // ── Layer 4: Email both parties + admin notification ──────────────────────
  const baseUrlNS = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
  const [cgUsersNS, parentUsersNS, cgProfilesNS] = await Promise.all([
    base44.asServiceRole.entities.User.filter({ id: booking.caregiver_user_id }),
    base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id }),
    base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id })
  ]);
  const cgUserNS = cgUsersNS[0];
  const parentUserNS = parentUsersNS[0];
  const cgProfNS = cgProfilesNS[0];
  const dateStrNS = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const reporterLabel = isParent ? 'the parent' : 'the caregiver';
  const otherUser = isParent ? cgUserNS : parentUserNS;
  const otherLabel = isParent ? cgProfNS?.display_name || 'Caregiver' : 'Parent';

  await Promise.allSettled([
    // Confirm receipt to the reporter
    base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: 'No-Show Report Received',
      body: `Hi,\n\nWe've received your no-show report for the booking on ${dateStrNS}. Our team will review and follow up within 24-48 hours.\n\n– CareNest`
    }),
    // Notify the other party
    otherUser && base44.asServiceRole.integrations.Core.SendEmail({
      to: otherUser.email,
      subject: 'No-Show Report Filed — Admin Review',
      body: `Hi ${otherLabel},\n\nA no-show report has been filed by ${reporterLabel} for the booking on ${dateStrNS}. Our team will review and may reach out to both parties.\n\n${baseUrlNS}\n\n– CareNest`
    })
  ]);

  return Response.json({
    success: true,
    booking_request_id,
    status: 'no_show_reported',
    message: 'Your no-show report has been submitted. Our team will review and contact you shortly.'
  }, { status: 200 });
});