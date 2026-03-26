/**
 * F-081R: Check-Out System — Layers 2 + 3
 * F-076: State Machine: in_progress → completed (terminal, both parties confirm)
 *
 * Two-step mutual confirmation (F-081R Logic.1, Logic.2):
 * - Caregiver marks complete first → transient flag
 * - Parent confirms → transition to completed, check_out_time set
 * - If parent does not confirm within 4h → admin alert (no auto-complete)
 *
 * Slot effect: booked — archived (no status change on the slot itself at completed)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Layer 2: Access gates ─────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver' && user.app_role !== 'parent') {
    return Response.json({ error: 'Only caregivers and parents may perform check-out.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id } = body;
  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });

  const _bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = _bookings[0];
  if (!booking) return Response.json({ error: 'Not found.' }, { status: 404 });

  const isCaregiver = user.app_role === 'caregiver' && booking.caregiver_user_id === user.id;
  const isParent = user.app_role === 'parent' && booking.parent_user_id === user.id;
  if (!isCaregiver && !isParent) return Response.json({ error: 'Not found.' }, { status: 404 });

  // ── Layer 2: Status gate — must be in_progress ────────────────────────────
  if (booking.status !== 'in_progress') {
    return Response.json({ error: `Check-out is only available for in-progress bookings. Current status: ${booking.status}.`, current_status: booking.status }, { status: 409 });
  }

  const now = new Date();

  // ── Layer 3: Two-step checkout state machine ──────────────────────────────
  // We track caregiver checkout confirmation via check_out_time nullable field.
  // caregiver marks: set check_out_time (transient — parent hasn't confirmed yet)
  // parent confirms: if check_out_time already set → transition to completed

  if (isCaregiver) {
    // Caregiver step: mark session complete
    if (!booking.check_out_time) {
      await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
        check_out_time: now.toISOString()
      });
    }
    return Response.json({
      success: true,
      step: 'caregiver_marked_complete',
      message: 'Session marked complete. Waiting for parent to confirm.',
      booking_request_id
    }, { status: 200 });
  }

  if (isParent) {
    // Parent step: confirm checkout
    if (!booking.check_out_time) {
      return Response.json({
        error: 'The caregiver has not yet marked the session complete. Please wait for them to do so first.',
        step: 'awaiting_caregiver'
      }, { status: 409 });
    }

    // Both confirmed — compare-and-swap: in_progress → completed
    try {
      await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
        status: 'completed',
        check_out_time: now.toISOString() // update to parent confirmation time as final
      });
    } catch (err) {
      return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
    }

    const _verifyRecords = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
    const verifyRecord = _verifyRecords[0];
    if (!verifyRecord || verifyRecord.status !== 'completed') {
      return Response.json({ error: 'This booking has already been modified. Please refresh and try again.' }, { status: 409 });
    }

    // ── Layer 4: Completion emails ────────────────────────────────────────
    const baseUrlCO = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
    const [cgUsersCO, parentUsersCO, cgProfilesCO] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ id: booking.caregiver_user_id }),
      base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id }),
      base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id })
    ]);
    const cgUserCO = cgUsersCO[0];
    const parentUserCO = parentUsersCO[0];
    const cgProfCO = cgProfilesCO[0];

    const durationMs = new Date(booking.check_in_time) ? (now - new Date(booking.check_in_time)) : 0;
    const durationHrs = durationMs > 0 ? (durationMs / 3600000).toFixed(1) : 'N/A';
    const totalCents = durationMs > 0 ? Math.round((durationMs / 3600000) * (booking.hourly_rate_snapshot || 0)) : 0;
    const totalDisplay = totalCents > 0 ? `$${(totalCents / 100).toFixed(2)}` : 'N/A';

    await Promise.allSettled([
      cgUserCO && base44.asServiceRole.integrations.Core.SendEmail({
        to: cgUserCO.email,
        subject: 'Session Complete — Thank You!',
        body: `Hi ${cgProfCO?.display_name || ''},\n\nYour session has been completed and confirmed by the parent.\n\nDuration: ${durationHrs} hours\nTotal: ${totalDisplay}\n\nThank you for using CareNest!\n${baseUrlCO}/CaregiverProfile\n\n– CareNest`
      }),
      parentUserCO && base44.asServiceRole.integrations.Core.SendEmail({
        to: parentUserCO.email,
        subject: 'Session Complete — Thank You!',
        body: `Hi,\n\nYour session with ${cgProfCO?.display_name || 'your caregiver'} is complete.\n\nDuration: ${durationHrs} hours\nTotal: ${totalDisplay}\n\nWe'd love your feedback! Visit your bookings to leave a review.\n${baseUrlCO}/ParentBookings\n\n– CareNest`
      })
    ]);

    // ── Layer 8: Audit log — F-081R Audit.1 ────────────────────────────────
    await base44.functions.invoke('logBookingEvent', {
      event_type: 'checkout',
      booking_id: booking_request_id,
      actor_user_id: user.id,
      actor_role: 'parent',
      old_status: 'in_progress',
      new_status: 'completed',
      caregiver_profile_id: booking.caregiver_profile_id,
      parent_user_id: booking.parent_user_id,
      caregiver_user_id: booking.caregiver_user_id,
      meta: {
        check_in_time: booking.check_in_time,
        check_out_time: now.toISOString(),
        duration_hrs: durationHrs,
        total_display: totalDisplay
      }
    }).catch(() => {});

    return Response.json({
      success: true,
      step: 'both_confirmed',
      booking_request_id,
      status: 'completed',
      check_out_time: now.toISOString()
    }, { status: 200 });
  }
});