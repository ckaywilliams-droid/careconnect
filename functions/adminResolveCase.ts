/**
 * F-084R: Admin Review & Resolution — Layers 2 + 3
 * F-076: State Machine — under_review | no_show_reported → resolved (terminal)
 * F-083R: Profile Hold Trigger — strike threshold check on resolution
 * F-088: Slot release if ruling = 'release'
 *
 * Admin actions per F-084R Data.3:
 * 1. Rule in favour of caregiver or parent
 * 2. Dismiss (inconclusive)
 * 3. Issue strike to caregiver (increment strike_count)
 * 4. Increment no_show_count on caregiver
 * 5. Release slot (F-088 reopen)
 * 6. Archive slot (no reopen)
 * 7. Set caregiver profile on_hold (F-083R)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: super_admin only ─────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'super_admin') return Response.json({ error: 'Only super admins may resolve review cases.' }, { status: 403 });

  const body = await req.json();
  const { review_case_id, ruling, slot_action, issue_strike, increment_no_show, notes } = body;

  if (!review_case_id || !ruling || !slot_action) {
    return Response.json({ error: 'review_case_id, ruling, and slot_action are required.' }, { status: 400 });
  }

  const validRulings = ['caregiver_at_fault', 'parent_at_fault', 'mutual', 'dismissed'];
  if (!validRulings.includes(ruling)) return Response.json({ error: `ruling must be one of: ${validRulings.join(', ')}.` }, { status: 400 });
  if (slot_action !== 'release' && slot_action !== 'archive') return Response.json({ error: "slot_action must be 'release' or 'archive'." }, { status: 400 });

  const cases = await base44.asServiceRole.entities.ReviewCase.filter({ id: review_case_id });
  const reviewCase = cases[0];
  if (!reviewCase) return Response.json({ error: 'Review case not found.' }, { status: 404 });
  if (reviewCase.ruling !== 'pending') return Response.json({ error: `This case has already been resolved with ruling: ${reviewCase.ruling}.`, current_ruling: reviewCase.ruling }, { status: 409 });

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: reviewCase.booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Linked booking not found.' }, { status: 404 });

  const reviewableStatuses = ['under_review', 'no_show_reported'];
  if (!reviewableStatuses.includes(booking.status)) {
    return Response.json({ error: `Booking status has changed — please refresh the case. Current status: ${booking.status}.`, current_status: booking.status }, { status: 409 });
  }

  const now = new Date().toISOString();

  // ── Layer 3: Step 1 — Resolve ReviewCase ─────────────────────────────────
  await base44.asServiceRole.entities.ReviewCase.update(review_case_id, {
    ruling,
    resolved_at: now,
    slot_action,
    strike_issued: !!issue_strike,
    no_show_count_incremented: !!increment_no_show,
    notes: notes || reviewCase.notes,
    assigned_admin_id: user.id
  });

  // ── Layer 3: Step 2 — Transition BookingRequest → resolved (terminal) ─────
  await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
    status: 'resolved',
    review_status: 'resolved'
  });

  // ── Layer 3: Step 3 — Slot action ────────────────────────────────────────
  if (slot_action === 'release') {
    // F-088 atomic reopen
    const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: booking.availability_slot_id });
    const slot = slots[0];
    if (slot && (slot.status === 'booked' || slot.status === 'soft_locked')) {
      const versionBefore = slot.version_number || 0;
      await base44.asServiceRole.entities.AvailabilitySlot.update(slot.id, {
        status: 'open',
        locked_by_booking_id: null,
        version_number: versionBefore + 1
      });
    }
  }
  // 'archive' = slot stays as-is (consumed, do not reopen)

  // ── Layer 3: Step 4 — Caregiver penalties (F-083R + F-084R Logic.3) ───────
  let profileHoldTriggered = false;
  if (issue_strike || increment_no_show) {
    const caregiverProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({
      id: booking.caregiver_profile_id
    });
    const caregiverProfile = caregiverProfiles[0];

    if (caregiverProfile) {
      const updates = {};
      const newStrikeCount = (caregiverProfile.strike_count || 0) + (issue_strike ? 1 : 0);
      const newNoShowCount = (caregiverProfile.no_show_count || 0) + (increment_no_show ? 1 : 0);

      if (issue_strike) updates.strike_count = newStrikeCount;
      if (increment_no_show) updates.no_show_count = newNoShowCount;

      // F-083R Logic.1: Check thresholds for automatic on_hold
      // Threshold A: strike_count >= 3
      // Threshold B: 3 confirmed no-shows within 60 days — simplified here as no_show_count >= 3
      const STRIKE_THRESHOLD = 3;
      if (newStrikeCount >= STRIKE_THRESHOLD || newNoShowCount >= 3) {
        if (caregiverProfile.profile_status !== 'on_hold') {
          updates.profile_status = 'on_hold';
          profileHoldTriggered = true;
        }
      }

      await base44.asServiceRole.entities.CaregiverProfile.update(caregiverProfile.id, updates);
    }
  }

  // Log to AdminActionLog (F-084R Audit.1)
  await base44.asServiceRole.entities.AdminActionLog.create({
    admin_user_id: user.id,
    admin_role: 'super_admin',
    action_type: 'force_cancel_booking',
    target_entity_type: 'BookingRequest',
    target_entity_id: booking.id,
    reason: notes || `Admin resolution: ${ruling}`,
    payload: JSON.stringify({
      ruling,
      slot_action,
      issue_strike: !!issue_strike,
      increment_no_show: !!increment_no_show,
      profile_hold_triggered: profileHoldTriggered
    }),
    action_timestamp: now
  });

  // Layer 4 (resolution emails to both parties) added in next layer
  return Response.json({
    success: true,
    review_case_id,
    booking_request_id: booking.id,
    status: 'resolved',
    ruling,
    slot_action,
    strike_issued: !!issue_strike,
    no_show_count_incremented: !!increment_no_show,
    profile_hold_triggered: profileHoldTriggered
  }, { status: 200 });
});