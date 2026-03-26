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

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver' && user.app_role !== 'parent') {
    return Response.json({ error: 'Only caregivers and parents may perform check-in.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id, utc_offset_minutes = 0 } = body;
  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });

  const booking = await base44.asServiceRole.entities.BookingRequest.get(booking_request_id);
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });

  let isCaregiverOwner = booking.caregiver_user_id === user.id;
  if (!isCaregiverOwner && booking.caregiver_profile_id) {
    const cgProfile = await base44.asServiceRole.entities.CaregiverProfile.get(booking.caregiver_profile_id);
    isCaregiverOwner = cgProfile?.user_id === user.id;
  }
  const isCaregiver = user.app_role === 'caregiver' && isCaregiverOwner;
  const isParent = user.app_role === 'parent' && booking.parent_user_id === user.id;
  if (!isCaregiver && !isParent) return Response.json({ error: 'Not found.' }, { status: 404 });

  if (booking.status !== 'accepted') {
    return Response.json({ error: `Check-in is only available for accepted bookings. Current status: ${booking.status}.`, current_status: booking.status }, { status: 409 });
  }

  // ── Layer 2: Check-in window gate ────────────────────────────────────────
  // Use naïve-UTC frame: strip Z so stored "15:00Z" is treated as local 15:00.
  // Adjust real-UTC 'now' by client's utc_offset_minutes to match the same frame.
  const bookingStart = new Date(booking.start_time.slice(0, 19));
  const windowOpen  = new Date(bookingStart.getTime() - 30 * 60 * 1000);
  const windowClose = new Date(bookingStart.getTime() + 15 * 60 * 1000);
  const now = new Date(Date.now() - utc_offset_minutes * 60000);

  if (now < windowOpen) {
    return Response.json({ error: 'Check-in opens 30 minutes before your booking.' }, { status: 409 });
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

    // ── Layer 4: Email both parties — session started ─────────────────────
    const baseUrlCI = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
    const [cgUsersCI, parentUsersCI, cgProfilesCI] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ id: booking.caregiver_user_id }),
      base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id }),
      base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id })
    ]);
    const cgUserCI = cgUsersCI[0];
    const parentUserCI = parentUsersCI[0];
    const cgProfCI = cgProfilesCI[0];
    const checkInMsg = `Your session has started (checked in at ${now.toLocaleTimeString('en-US')}). When complete, please confirm check-out in the app:\n${baseUrlCI}/ParentBookings`;

    await Promise.allSettled([
      cgUserCI && base44.asServiceRole.integrations.Core.SendEmail({
        to: cgUserCI.email,
        subject: 'Session Started — Check-In Confirmed',
        body: `Hi ${cgProfCI?.display_name || ''},\n\nBoth parties have confirmed check-in. Your session is now in progress.\n\n${checkInMsg}\n\n– CareNest`
      }),
      parentUserCI && base44.asServiceRole.integrations.Core.SendEmail({
        to: parentUserCI.email,
        subject: 'Session Started — Check-In Confirmed',
        body: `Hi,\n\n${cgProfCI?.display_name || 'Your caregiver'} has checked in and your session is now in progress.\n\n${checkInMsg}\n\n– CareNest`
      })
    ]);

    // ── Layer 8: Audit log — F-080 Audit.1 ────────────────────────────────
    await base44.functions.invoke('logBookingEvent', {
      event_type: 'checkin',
      booking_id: booking_request_id,
      actor_user_id: user.id,
      actor_role: 'parent',
      old_status: 'accepted',
      new_status: 'in_progress',
      caregiver_profile_id: booking.caregiver_profile_id,
      parent_user_id: booking.parent_user_id,
      caregiver_user_id: booking.caregiver_user_id,
      meta: {
        check_in_time: now.toISOString(),
        caregiver_confirmed_at: booking.cancellation_response_timestamp
      }
    }).catch(() => {});

    return Response.json({
      success: true,
      step: 'both_confirmed',
      booking_request_id,
      status: 'in_progress',
      check_in_time: now.toISOString()
    }, { status: 200 });
  }

  } catch (err) {
    console.error('checkIn unhandled error:', err?.message);
    return Response.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
});