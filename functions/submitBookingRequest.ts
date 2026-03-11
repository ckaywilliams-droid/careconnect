/**
 * F-074: Booking Request — Access Control + State Machine
 * F-075: Duplicate/Overlap Prevention
 * F-056.1: Minimum hours validation + half-open interval overlap check
 *
 * No slot soft-locking. Uses half-open interval predicate for conflict detection:
 *   new_start < existing_end AND new_end > existing_start
 *
 * Availability windows remain 'open' to support multiple non-overlapping bookings.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const timeToMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── GATE 1: Session valid and role=parent ─────────────────────────────────
  console.log('=== SUBMIT BOOKING REQUEST START ===');
  const user = await base44.auth.me();
  console.log('Auth user:', JSON.stringify(user));
  console.log('User.app_role:', user?.app_role);
  if (!user) {
    return Response.json({ error: 'Unauthorized', gate_failed: 'gate_1_session' }, { status: 401 });
  }
  if (user.app_role !== 'parent') {
    return Response.json({ error: 'Only parents may submit booking requests.', gate_failed: 'gate_1_role' }, { status: 403 });
  }

  // ── GATE 2: onboarding complete ───────────────────────────────────────────
  if (!user.onboarding_complete) {
    return Response.json({
      error: 'Please complete onboarding before requesting a booking.',
      gate_failed: 'gate_2_onboarding_incomplete',
      action: 'complete_onboarding'
    }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json();
  console.log('Request body:', body);
  const { availability_slot_id, num_children, special_requests, requested_start_time, requested_end_time } = body;
  console.log('Availability slot ID:', availability_slot_id);
  console.log('Requested times:', { start: requested_start_time, end: requested_end_time });

  if (!availability_slot_id) {
    return Response.json({ error: 'availability_slot_id is required.' }, { status: 400 });
  }
  if (!requested_start_time || !requested_end_time) {
    return Response.json({ error: 'requested_start_time and requested_end_time are required.' }, { status: 400 });
  }

  const numChildrenInt = parseInt(num_children) || 1;
  if (numChildrenInt < 1 || numChildrenInt > 10) {
    return Response.json({ error: 'Number of children must be between 1 and 10.' }, { status: 400 });
  }

  if (special_requests && special_requests.length > 500) {
    return Response.json({ error: 'Special requests must be 500 characters or less.' }, { status: 400 });
  }


  // ── Fetch slot ────────────────────────────────────────────────────────────
  const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: availability_slot_id });
  const slot = slots[0];
  if (!slot) {
    return Response.json({ error: 'This availability window no longer exists.', gate_failed: 'gate_6_slot_not_found' }, { status: 409 });
  }

  // ── Fetch CaregiverProfile ────────────────────────────────────────────────
  const caregiverProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ id: slot.caregiver_profile_id });
  const caregiverProfile = caregiverProfiles[0];
  if (!caregiverProfile) {
    return Response.json({ error: 'This caregiver is no longer available.', gate_failed: 'gate_4_profile_not_found' }, { status: 409 });
  }

  // ── GATE 4: is_published AND profile_status='active' ─────────────────────
  if (!caregiverProfile.is_published || caregiverProfile.profile_status !== 'active') {
    return Response.json({ error: 'This caregiver is no longer available.', gate_failed: 'gate_4_caregiver_unavailable' }, { status: 409 });
  }

  // ── GATE 5: caregiver User not suspended ──────────────────────────────────
  const caregiverUsers = await base44.asServiceRole.entities.User.filter({ id: caregiverProfile.user_id });
  const caregiverUser = caregiverUsers[0];
  if (caregiverUser?.is_suspended) {
    return Response.json({ error: 'This caregiver is no longer available.', gate_failed: 'gate_5_caregiver_suspended' }, { status: 409 });
  }

  // ── GATE 6: Slot not blocked ──────────────────────────────────────────────
  if (slot.is_blocked) {
    return Response.json({ error: 'This availability window is blocked.', gate_failed: 'gate_6_slot_blocked' }, { status: 409 });
  }

  // ── Validate and parse requested times ───────────────────────────────────
  const reqStartMins = timeToMins(requested_start_time);
  const reqEndMins = timeToMins(requested_end_time);
  const durationHours = (reqEndMins - reqStartMins) / 60;

  if (durationHours <= 0) {
    return Response.json({ error: 'End time must be after start time.' }, { status: 400 });
  }

  // ── F-056.1: Minimum hours validation ────────────────────────────────────
  const minimumHours = caregiverProfile.minimum_hours || 2;
  console.log('Duration check:', { durationHours, minHours: minimumHours, meetsMinimum: durationHours >= minimumHours });
  if (durationHours < minimumHours) {
    return Response.json({
      error: `Minimum booking duration is ${minimumHours} hour${minimumHours === 1 ? '' : 's'}. You requested ${durationHours} hour${durationHours === 1 ? '' : 's'}.`,
      gate_failed: 'gate_min_hours'
    }, { status: 400 });
  }

  // ── Window bounds validation ──────────────────────────────────────────────
  const slotStartMins = timeToMins(slot.start_time);
  const slotEndMins = timeToMins(slot.end_time);
  if (reqStartMins < slotStartMins || reqEndMins > slotEndMins) {
    return Response.json({
      error: "Requested time is outside the caregiver's availability window.",
      gate_failed: 'gate_window_bounds'
    }, { status: 400 });
  }

  // ── Build ISO datetimes ───────────────────────────────────────────────────
  const startTimeISO = new Date(`${slot.slot_date}T${requested_start_time}:00`).toISOString();
  const endTimeISO = new Date(`${slot.slot_date}T${requested_end_time}:00`).toISOString();

  // ── GATE 7: Rate limit — max 5 per parent per hour ────────────────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentRequests = await base44.asServiceRole.entities.BookingRequest.filter({ parent_user_id: user.id });
  const recentCount = recentRequests.filter(b => b.created_date > oneHourAgo).length;
  if (recentCount >= 5) {
    return Response.json({
      error: 'You have submitted too many booking requests in the last hour. Please try again later.',
      gate_failed: 'gate_rate_limit'
    }, { status: 429 });
  }

  // ── Overlap check — half-open interval predicate ──────────────────────────
  // Correct minimal overlap check: new_start < existing_end AND new_end > existing_start
  const allCaregiverBookings = await base44.asServiceRole.entities.BookingRequest.filter({
    caregiver_user_id: caregiverProfile.user_id
  });
  const activeBookings = allCaregiverBookings.filter(b =>
    ['pending', 'accepted', 'in_progress'].includes(b.status)
  );

  const hasConflict = activeBookings.some(b =>
    startTimeISO < b.end_time && endTimeISO > b.start_time
  );

  if (hasConflict) {
    // Provide alternative windows on the same or other days
    const altSlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
      caregiver_profile_id: caregiverProfile.id,
      is_blocked: false
    });
    const alternatives = altSlots
      .filter(s => s.id !== availability_slot_id && new Date(`${s.slot_date}T${s.start_time}`) > new Date())
      .slice(0, 3)
      .map(s => ({ id: s.id, slot_date: s.slot_date, start_time: s.start_time, end_time: s.end_time }));

    return Response.json({
      error: 'slot_conflict',
      message: 'This time overlaps with an existing booking. Please choose a different time.',
      conflicting_slot_id: availability_slot_id,
      alternative_slots: alternatives
    }, { status: 409 });
  }

  // ── Fetch parent profile ──────────────────────────────────────────────────
  const parentProfiles = await base44.asServiceRole.entities.ParentProfile.filter({ user_id: user.id });
  let parentProfile = parentProfiles[0];

  if (!parentProfile) {
    console.log('ParentProfile not found, auto-creating for user:', user.id);
    parentProfile = await base44.asServiceRole.entities.ParentProfile.create({
      user_id: user.id
    });
    console.log('Created ParentProfile:', parentProfile.id);
  }

  // ── Create BookingRequest (no slot soft-locking) ──────────────────────────
  // We use 'user.id' from auth.me() as the single source of truth for identity
  let newBooking;
  console.log('=== DEEP INSPECTION: PRE-CREATE ===');
  console.log('Creating booking with:', { caregiver_id: caregiverProfile.id, parent_id: user.id, start_time: startTimeISO, end_time: endTimeISO });
  
  const bookingPayload = {
    parent_profile_id: parentProfile.id,
    parent_user_id: user.id, // ALIGNMENT: Matches Dashboard & RLS
    caregiver_profile_id: caregiverProfile.id,
    caregiver_user_id: caregiverProfile.user_id,
    availability_slot_id: slot.id,
    status: 'pending',
    start_time: startTimeISO,
    end_time: endTimeISO,
    num_children: numChildrenInt,
    special_requests: special_requests ? special_requests.replace(/<[^>]*>/g, '').slice(0, 500) : null,
    hourly_rate_snapshot: caregiverProfile.hourly_rate_cents || 0,
    platform_fee_pct_snapshot: 0,
    is_duplicate_checked: true
  };
  console.log('Full payload:', JSON.stringify(bookingPayload, null, 2));
  
  try {
    console.log('Calling base44.asServiceRole.entities.BookingRequest.create()...');
    newBooking = await base44.asServiceRole.entities.BookingRequest.create(bookingPayload);
    console.log('=== DEEP INSPECTION: POST-CREATE ===');
    console.log('Create call returned successfully');
    console.log('newBooking type:', typeof newBooking);
    console.log('newBooking is null?', newBooking === null);
    console.log('newBooking is undefined?', newBooking === undefined);
    console.log('newBooking value:', JSON.stringify(newBooking, null, 2));
  } catch (createErr) {
    console.log('=== DEEP INSPECTION: CREATE ERROR ===');
    console.log('Error type:', createErr.constructor.name);
    console.log('Error message:', createErr.message);
    console.log('Error stack:', createErr.stack);
    console.log('Full error object:', JSON.stringify(createErr, Object.getOwnPropertyNames(createErr), 2));
    return Response.json({ error: 'Failed to create booking request. Please try again.', details: createErr.message }, { status: 500 });
  }
  
  if (!newBooking || !newBooking.id) {
    console.log('=== DEEP INSPECTION: EMPTY RESPONSE ===');
    console.log('Create returned but booking is empty or missing ID');
    return Response.json({ error: 'Booking creation returned empty response' }, { status: 500 });
  }
  
  console.log('Booking created with ID:', newBooking.id);
  console.log('Saved booking parent_user_id:', newBooking.parent_user_id);
  console.log('Expected (Auth ID):', user.id);

  // ── In-app notification → caregiver ──────────────────────────────────────
  const durationHoursDisplay = (reqEndMins - reqStartMins) / 60;
  await base44.functions.invoke('createNotification', {
    user_id: caregiverProfile.user_id,
    type: 'booking_request_received',
    title: 'New Booking Request',
    message: `You have a new booking request for ${slot.slot_date}, ${requested_start_time}–${requested_end_time} (${durationHoursDisplay}h). Please accept or decline within 24 hours.`,
    booking_request_id: newBooking.id,
    action_url: '/CaregiverProfile'
  }).catch(() => {});

  // ── Create MessageThread ──────────────────────────────────────────────────
  try {
    await base44.functions.invoke('createMessageThread', {
      booking_request_id: newBooking.id,
      parent_user_id: user.id,
      caregiver_user_id: caregiverProfile.user_id
    });
  } catch (threadErr) {
    console.error('Thread creation failed (non-fatal):', threadErr.message);
  }

  // ── Transactional emails ──────────────────────────────────────────────────
  const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';

  const caregiverEmailBody = `
Hi ${caregiverProfile.display_name},

You have a new booking request!

Date: ${slot.slot_date}
Time: ${requested_start_time} – ${requested_end_time} (${durationHours} hour${durationHours === 1 ? '' : 's'})
Children: ${numChildrenInt}
${special_requests ? `Special requests: ${special_requests.replace(/<[^>]*>/g, '').slice(0, 500)}` : ''}

Please log in to accept or decline within 24 hours.

${baseUrl}/CaregiverProfile

– CareNest
  `.trim();

  const parentEmailBody = `
Hi,

Your booking request has been submitted to ${caregiverProfile.display_name}!

Date: ${slot.slot_date}
Time: ${requested_start_time} – ${requested_end_time} (${durationHours} hour${durationHours === 1 ? '' : 's'})

You'll be notified once the caregiver responds (within 24 hours).

${baseUrl}/ParentBookings

– CareNest
  `.trim();

  await Promise.allSettled([
    base44.asServiceRole.integrations.Core.SendEmail({
      to: caregiverUser?.email || '',
      subject: 'New Booking Request — Action Required',
      body: caregiverEmailBody
    }),
    base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: 'Booking Request Submitted',
      body: parentEmailBody
    })
  ]);

  // ── Audit log ─────────────────────────────────────────────────────────────
  await base44.functions.invoke('logBookingEvent', {
    event_type: 'booking_status_transition',
    booking_id: newBooking.id,
    actor_user_id: user.id,
    actor_role: 'parent',
    old_status: null,
    new_status: 'pending',
    slot_id: slot.id,
    caregiver_profile_id: caregiverProfile.id,
    parent_user_id: user.id,
    caregiver_user_id: caregiverProfile.user_id,
    meta: {
      action: 'booking_created',
      num_children: numChildrenInt,
      hourly_rate_snapshot: caregiverProfile.hourly_rate_cents || 0,
      duration_hours: durationHours
    }
  }).catch(() => {});

  return Response.json({
    success: true,
    booking_request_id: newBooking.id,
    status: 'pending',
    caregiver_name: caregiverProfile.display_name,
    slot_date: slot.slot_date,
    start_time: requested_start_time,
    end_time: requested_end_time,
    duration_hours: durationHours,
    hourly_rate_snapshot: caregiverProfile.hourly_rate_cents || 0,
    parent_user_id: user.id // Return Auth ID for consistency
  }, { status: 201 });
});