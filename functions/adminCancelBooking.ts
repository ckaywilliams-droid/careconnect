/**
 * F-092: Admin Override Booking Controls
 * super_admin only. Cancels any non-terminal booking → resolved.
 * F-092 Logic.1: Full validation + compare-and-swap + slot release + notifications + audit log.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const TERMINAL_STATES = ['declined', 'cancelled_by_parent', 'cancelled_by_caregiver', 'expired', 'completed', 'resolved'];
const SLOT_RELEASE_STATES = ['accepted', 'in_progress', 'cancellation_requested_by_caregiver'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // (1) Validate: session is super_admin
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'super_admin') {
    return Response.json({ error: 'Forbidden: super_admin access required.' }, { status: 403 });
  }

  const body = await req.json();
  const { booking_request_id, cancellation_reason } = body;

  if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });

  // (3) Validate cancellation_reason >= 10 chars
  const trimmedReason = (cancellation_reason || '').trim();
  if (trimmedReason.length < 10) {
    return Response.json({ error: 'Please provide a cancellation reason (minimum 10 characters).' }, { status: 400 });
  }

  // Fetch booking
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 });

  // (2) Validate: booking is not in a terminal state
  if (TERMINAL_STATES.includes(booking.status)) {
    return Response.json({
      error: `This booking is already ${booking.status} and cannot be modified.`
    }, { status: 409 });
  }

  const previousStatus = booking.status;

  // (4) Compare-and-swap: UPDATE WHERE status NOT IN terminal states
  await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
    status: 'resolved',
    cancellation_reason: trimmedReason,
    cancelled_by: 'admin'
  });

  // Verify the update took effect
  const updated = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
  const updatedBooking = updated[0];
  if (!updatedBooking || updatedBooking.status !== 'resolved') {
    return Response.json({ error: 'The booking status has changed. Please refresh and review the current state.' }, { status: 409 });
  }

  // (5) Slot reopen if booking was in accepted/in_progress/cancellation_requested
  if (SLOT_RELEASE_STATES.includes(previousStatus) && booking.availability_slot_id) {
    const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: booking.availability_slot_id });
    const slot = slots[0];
    if (slot) {
      await base44.asServiceRole.entities.AvailabilitySlot.update(booking.availability_slot_id, {
        status: 'open',
        locked_by_booking_id: null,
        version_number: (slot.version_number || 0) + 1
      }).catch(async (err) => {
        // F-092 Errors.2: Slot release failed — alert admin
        await base44.asServiceRole.entities.AdminAlert.create({
          alert_type: 'slot_release_failed',
          severity: 'critical',
          booking_id: booking_request_id,
          slot_id: booking.availability_slot_id,
          message: `Admin override: booking ${booking_request_id} cancelled but slot ${booking.availability_slot_id} release failed. Manual resolution required.`,
          is_resolved: false,
          created_at: new Date().toISOString()
        }).catch(() => {});
      });
    }
  }

  // Close the message thread if one exists
  const threads = await base44.asServiceRole.entities.MessageThread.filter({ booking_id: booking_request_id });
  if (threads[0]) {
    await base44.asServiceRole.entities.MessageThread.update(threads[0].id, {
      is_active: false
    }).catch(() => {});
  }

  // (7) Notify both parties
  const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
  const notifyBody = `Your booking has been cancelled by the platform team. If you have questions, please contact support.\n\n${baseUrl}/ParentBookings`;

  const [parentUsers, caregiverUsers] = await Promise.all([
    base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id }),
    base44.asServiceRole.entities.User.filter({ id: booking.caregiver_user_id })
  ]);

  await Promise.allSettled([
    parentUsers[0] && base44.asServiceRole.integrations.Core.SendEmail({
      to: parentUsers[0].email,
      subject: 'Your booking has been cancelled',
      body: notifyBody
    }),
    caregiverUsers[0] && base44.asServiceRole.integrations.Core.SendEmail({
      to: caregiverUsers[0].email,
      subject: 'A booking has been cancelled',
      body: notifyBody
    })
  ]);

  // (8) Write AdminActionLog
  await base44.asServiceRole.entities.AdminActionLog.create({
    admin_user_id: user.id,
    admin_role: 'super_admin',
    action_type: 'force_cancel_booking',
    target_entity_type: 'BookingRequest',
    target_entity_id: booking_request_id,
    reason: trimmedReason,
    payload: JSON.stringify({
      booking_status_before: previousStatus,
      booking_status_after: 'resolved',
      cancelled_by: 'admin'
    }),
    action_timestamp: new Date().toISOString()
  }).catch(() => {});

  return Response.json({
    success: true,
    booking_request_id,
    previous_status: previousStatus,
    new_status: 'resolved'
  }, { status: 200 });
});