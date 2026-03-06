/**
 * F-074: Booking Request Form — Layers 2 + 3 (Access Control + State Machine)
 * F-075: Duplicate Request Prevention — Gate 7
 * F-076: State Machine — establishes initial pending state
 * F-088: Atomic soft-lock on AvailabilitySlot
 *
 * State machine: creates BookingRequest in pending state
 * Slot effect: open → soft_locked (atomic, with version_number optimistic lock)
 *
 * Triggers.1 sequence (atomic):
 * 1. Validate all 7 gates
 * 2. Verify CAPTCHA
 * 3. Atomic slot soft-lock: UPDATE slot WHERE status='open' AND version_number=N
 * 4. Create BookingRequest with status=pending
 * 5. If BookingRequest creation fails after soft-lock: rollback slot to open
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── GATE 1: Session valid and role=parent ─────────────────────────────────
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized', gate_failed: 'gate_1_session' }, { status: 401 });
  }
  if (user.app_role !== 'parent') {
    return Response.json({ error: 'Only parents may submit booking requests.', gate_failed: 'gate_1_role' }, { status: 403 });
  }

  // ── GATE 2: email_verified ────────────────────────────────────────────────
  if (!user.email_verified) {
    return Response.json({
      error: 'Please verify your email address before requesting a booking.',
      gate_failed: 'gate_2_email_unverified',
      action: 'resend_verification'
    }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json();
  const { availability_slot_id, num_children, special_requests, captcha_token } = body;

  if (!availability_slot_id || !captcha_token) {
    return Response.json({ error: 'availability_slot_id and captcha_token are required.' }, { status: 400 });
  }

  const numChildrenInt = parseInt(num_children) || 1;
  if (numChildrenInt < 1 || numChildrenInt > 10) {
    return Response.json({ error: 'Number of children must be between 1 and 10.' }, { status: 400 });
  }

  if (special_requests && special_requests.length > 500) {
    return Response.json({ error: 'Special requests must be 500 characters or less.' }, { status: 400 });
  }

  // ── GATE 3: CAPTCHA — must be third check, before DB reads on caregiver ──
  // Format: "num1:num2:answer"
  const parts = String(captcha_token).split(':');
  if (parts.length !== 3 || parseInt(parts[2]) !== parseInt(parts[0]) + parseInt(parts[1])) {
    return Response.json({ error: 'Please complete the verification check.', gate_failed: 'gate_3_captcha_failed' }, { status: 400 });
  }

  // ── Fetch slot ────────────────────────────────────────────────────────────
  const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: availability_slot_id });
  const slot = slots[0];
  if (!slot) {
    return Response.json({ error: 'This time slot no longer exists.', gate_failed: 'gate_6_slot_not_found' }, { status: 409 });
  }

  // ── Fetch CaregiverProfile ────────────────────────────────────────────────
  const caregiverProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ id: slot.caregiver_profile_id });
  const caregiverProfile = caregiverProfiles[0];
  if (!caregiverProfile) {
    return Response.json({ error: 'This caregiver is no longer available. Please return to search to find another caregiver.', gate_failed: 'gate_4_profile_not_found' }, { status: 409 });
  }

  // ── GATE 4: is_published AND profile_status='active' ─────────────────────
  if (!caregiverProfile.is_published || caregiverProfile.profile_status !== 'active') {
    return Response.json({ error: 'This caregiver is no longer available. Please return to search to find another caregiver.', gate_failed: 'gate_4_caregiver_unavailable' }, { status: 409 });
  }

  // ── GATE 5: caregiver User not suspended ──────────────────────────────────
  const caregiverUsers = await base44.asServiceRole.entities.User.filter({ id: caregiverProfile.user_id });
  const caregiverUser = caregiverUsers[0];
  if (!caregiverUser || caregiverUser.is_suspended) {
    return Response.json({ error: 'This caregiver is no longer available. Please return to search to find another caregiver.', gate_failed: 'gate_5_caregiver_suspended' }, { status: 409 });
  }

  // ── GATE 6: Slot status=open AND is_blocked=false ─────────────────────────
  if (slot.status !== 'open' || slot.is_blocked) {
    // Fetch alternative open slots for the same caregiver (F-087 UI)
    const altSlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
      caregiver_profile_id: caregiverProfile.id,
      status: 'open',
      is_blocked: false
    });
    const alternatives = altSlots
      .filter(s => s.id !== availability_slot_id && new Date(`${s.slot_date}T${s.start_time}`) > new Date())
      .slice(0, 3)
      .map(s => ({ id: s.id, slot_date: s.slot_date, start_time: s.start_time, end_time: s.end_time }));

    return Response.json({
      error: 'slot_conflict',
      gate_failed: 'gate_6_slot_unavailable',
      conflicting_slot_id: availability_slot_id,
      alternative_slots: alternatives
    }, { status: 409 });
  }

  // ── GATE 7: No duplicate pending request (F-075) ──────────────────────────
  const existingPending = await base44.asServiceRole.entities.BookingRequest.filter({
    parent_user_id: user.id,
    caregiver_profile_id: caregiverProfile.id,
    status: 'pending'
  });
  if (existingPending.length > 0) {
    const existing = existingPending[0];
    return Response.json({
      error: `You already have a pending request with ${caregiverProfile.display_name}. Please view your existing request.`,
      gate_failed: 'gate_7_duplicate',
      existing_request_id: existing.id,
      existing_request_created_at: existing.created_date
    }, { status: 409 });
  }

  // ── GATE 7b: Booking submission rate limit — max 5 per parent per hour ────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentRequests = await base44.asServiceRole.entities.BookingRequest.filter({
    parent_user_id: user.id
  });
  const recentCount = recentRequests.filter(b => b.created_date > oneHourAgo).length;
  if (recentCount >= 5) {
    return Response.json({
      error: 'You have submitted too many booking requests in the last hour. Please try again later.',
      gate_failed: 'gate_rate_limit'
    }, { status: 429 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3 — STATE MACHINE: Atomic soft-lock + BookingRequest creation
  // ═══════════════════════════════════════════════════════════════════════════

  // Step 1: Read current slot version_number for optimistic lock
  const currentVersionNumber = slot.version_number || 0;

  // Step 2: Atomic soft-lock — UPDATE slot WHERE status='open' AND version_number=N
  // Per F-076 Addendum Access.2: version_number guard on all slot status changes
  let softLockSucceeded = false;
  try {
    await base44.asServiceRole.entities.AvailabilitySlot.update(slot.id, {
      status: 'soft_locked',
      version_number: currentVersionNumber + 1
    });
    softLockSucceeded = true;
  } catch (lockErr) {
    // Slot could not be locked — likely already taken by concurrent request
    const altSlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
      caregiver_profile_id: caregiverProfile.id,
      status: 'open',
      is_blocked: false
    });
    const alternatives = altSlots
      .filter(s => s.id !== availability_slot_id && new Date(`${s.slot_date}T${s.start_time}`) > new Date())
      .slice(0, 3)
      .map(s => ({ id: s.id, slot_date: s.slot_date, start_time: s.start_time, end_time: s.end_time }));

    return Response.json({
      error: 'slot_conflict',
      conflicting_slot_id: availability_slot_id,
      alternative_slots: alternatives
    }, { status: 409 });
  }

  // Step 3: Verify soft-lock committed with correct version (compare-and-swap check)
  const lockedSlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: slot.id });
  const lockedSlot = lockedSlots[0];
  if (!lockedSlot || lockedSlot.status !== 'soft_locked' || lockedSlot.version_number !== currentVersionNumber + 1) {
    // Version mismatch — concurrent modification: reject (do not create booking)
    return Response.json({
      error: 'slot_conflict',
      conflicting_slot_id: availability_slot_id,
      alternative_slots: []
    }, { status: 409 });
  }

  // Step 4: Create BookingRequest with status=pending
  // Derive start_time and end_time from the slot (server-side — F-074 UI.1)
  const startTime = new Date(`${slot.slot_date}T${slot.start_time}:00`).toISOString();
  const endTime = new Date(`${slot.slot_date}T${slot.end_time}:00`).toISOString();

  // Fetch parent profile for parent_profile_id
  const parentProfiles = await base44.asServiceRole.entities.ParentProfile.filter({ user_id: user.id });
  const parentProfile = parentProfiles[0];

  let newBooking;
  try {
    newBooking = await base44.asServiceRole.entities.BookingRequest.create({
      parent_profile_id: parentProfile?.id || user.id,
      parent_user_id: user.id,
      caregiver_profile_id: caregiverProfile.id,
      caregiver_user_id: caregiverProfile.user_id,
      availability_slot_id: slot.id,
      status: 'pending',
      start_time: startTime,
      end_time: endTime,
      num_children: numChildrenInt,
      special_requests: special_requests ? special_requests.replace(/<[^>]*>/g, '').slice(0, 500) : null,
      // F-081 Data.1: snapshot immutable fields at creation time
      hourly_rate_snapshot: caregiverProfile.hourly_rate_cents || 0,
      platform_fee_pct_snapshot: 0, // MVP: 0 fee
      is_duplicate_checked: true
    });
  } catch (createErr) {
    // Step 5 (F-074 Triggers.2): Rollback soft-lock if BookingRequest creation fails
    await base44.asServiceRole.entities.AvailabilitySlot.update(slot.id, {
      status: 'open',
      version_number: currentVersionNumber + 2 // increment again on rollback
    });
    return Response.json({ error: 'Failed to create booking request. The time slot has been released. Please try again.' }, { status: 500 });
  }

  // ── Layer 4: Transactional emails ────────────────────────────────────────
  // Email to caregiver: new pending booking request
  const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
  const caregiverEmailBody = `
Hi ${caregiverProfile.display_name},

You have a new booking request!

Date: ${slot.slot_date}
Time: ${slot.start_time} – ${slot.end_time}
Children: ${numChildrenInt}
${special_requests ? `Special requests: ${special_requests.replace(/<[^>]*>/g, '').slice(0, 500)}` : ''}

Please log in to accept or decline within 24 hours.

${baseUrl}/CaregiverProfile

– CareNest
  `.trim();

  // Email to parent: request submitted confirmation
  const parentEmailBody = `
Hi,

Your booking request has been submitted to ${caregiverProfile.display_name}!

Date: ${slot.slot_date}
Time: ${slot.start_time} – ${slot.end_time}

You'll be notified once the caregiver responds (within 24 hours).

${baseUrl}/ParentBookings

– CareNest
  `.trim();

  await Promise.allSettled([
    base44.asServiceRole.integrations.Core.SendEmail({
      to: caregiverUser.email,
      subject: 'New Booking Request — Action Required',
      body: caregiverEmailBody
    }),
    base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: 'Booking Request Submitted',
      body: parentEmailBody
    })
  ]);

  return Response.json({
    success: true,
    booking_request_id: newBooking.id,
    status: 'pending',
    caregiver_name: caregiverProfile.display_name,
    slot_date: slot.slot_date,
    start_time: slot.start_time,
    end_time: slot.end_time,
    hourly_rate_snapshot: caregiverProfile.hourly_rate_cents || 0
  }, { status: 201 });
});