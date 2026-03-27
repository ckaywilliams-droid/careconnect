import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    console.log('User:', user?.id, 'role:', user?.app_role);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.app_role !== 'caregiver') {
      return Response.json({ error: 'Only caregivers may mark sessions as complete.' }, { status: 403 });
    }

    const body = await req.json();
    const { booking_request_id } = body;
    console.log('booking_request_id received:', booking_request_id);
    if (!booking_request_id) {
      return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });
    }

    // Parallel fetch: booking by ID + caregiver profile
    let booking, profileRes;
    try {
      [booking, profileRes] = await Promise.all([
        base44.asServiceRole.entities.BookingRequest.get(booking_request_id),
        base44.asServiceRole.entities.CaregiverProfile.filter({ user_id: user.id })
      ]);
    } catch (fetchErr) {
      console.error('Fetch error:', fetchErr?.message, fetchErr?.status);
      throw fetchErr;
    }
    const myProfile = profileRes[0];
    console.log('booking:', JSON.stringify(booking));
    console.log('myProfile:', JSON.stringify(myProfile));

    // Idempotency: already completed → quiet success
    if (booking?.status === 'completed') {
      return Response.json({ success: true, booking_request_id, status: 'completed' });
    }

    // Combined ownership + status + time gate
    const isOwner = booking?.caregiver_user_id === user.id
                 || (myProfile && booking?.caregiver_profile_id === myProfile.id);
    const isReady = booking?.end_time && new Date(booking.end_time) <= new Date();
    console.log('isOwner:', isOwner, 'isReady:', isReady, 'booking.status:', booking?.status);
    console.log('booking.caregiver_user_id:', booking?.caregiver_user_id, 'user.id:', user.id);
    console.log('booking.caregiver_profile_id:', booking?.caregiver_profile_id, 'myProfile.id:', myProfile?.id);

    if (!booking || !isOwner) {
      return Response.json({ error: 'Booking not found or access denied.' }, { status: 404 });
    }
    if (booking.status !== 'accepted') {
      return Response.json({
        error: `Mark as Complete is only available for accepted bookings. Current status: ${booking.status}.`,
        current_status: booking.status
      }, { status: 409 });
    }
    if (!isReady) {
      return Response.json({
        error: 'The session has not ended yet. You may mark it complete once the scheduled end time has passed.',
        end_time: booking.end_time
      }, { status: 409 });
    }

    // Transition: accepted → completed
    const now = new Date();
    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      status: 'completed',
      check_out_time: now.toISOString()
    });

    // Fire-and-forget emails & audit
    const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
    const caregiverUserId = myProfile?.user_id || booking.caregiver_user_id;
    const startTime = new Date(booking.start_time);
    const endTime   = new Date(booking.end_time);
    const durationMs  = endTime - startTime;
    const durationHrs = durationMs > 0 ? (durationMs / 3600000).toFixed(1) : 'N/A';
    const totalCents  = durationMs > 0 ? Math.round((durationMs / 3600000) * (booking.hourly_rate_snapshot || 0)) : 0;
    const totalDisplay = totalCents > 0 ? `$${(totalCents / 100).toFixed(2)}` : 'N/A';

    const [cgUsers, parentUsers] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ id: caregiverUserId }),
      base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id })
    ]);
    const cgUser     = cgUsers[0];
    const parentUser = parentUsers[0];

    await Promise.allSettled([
      cgUser && base44.asServiceRole.integrations.Core.SendEmail({
        to: cgUser.email,
        subject: 'Session Complete — Thank You!',
        body: `Hi ${myProfile?.display_name || ''},\n\nYou have marked the session as complete.\n\nDuration: ${durationHrs} hours\nTotal: ${totalDisplay}\n\nThank you for using CareNest!\n${baseUrl}/CaregiverProfile\n\n– CareNest`
      }),
      parentUser && base44.asServiceRole.integrations.Core.SendEmail({
        to: parentUser.email,
        subject: 'Session Complete — Your Caregiver Has Marked It Done',
        body: `Hi,\n\nYour session with ${myProfile?.display_name || 'your caregiver'} has been marked as complete by the caregiver.\n\nDuration: ${durationHrs} hours\nTotal: ${totalDisplay}\n\nWe'd love your feedback! Visit your bookings to leave a review.\n${baseUrl}/ParentBookings\n\n– CareNest`
      }),
      base44.functions.invoke('logBookingEvent', {
        event_type: 'session_marked_complete',
        booking_id: booking_request_id,
        actor_user_id: user.id,
        actor_role: 'caregiver',
        old_status: 'accepted',
        new_status: 'completed',
        caregiver_profile_id: booking.caregiver_profile_id,
        parent_user_id: booking.parent_user_id,
        caregiver_user_id: booking.caregiver_user_id,
        meta: { completed_at: now.toISOString(), duration_hrs: durationHrs, total_display: totalDisplay }
      })
    ]);

    return Response.json({
      success: true,
      booking_request_id,
      status: 'completed',
      completed_at: now.toISOString()
    }, { status: 200 });

  } catch (err) {
    console.error('markSessionComplete error:', err?.message, err?.status);
    return Response.json({ error: err?.message || 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
});