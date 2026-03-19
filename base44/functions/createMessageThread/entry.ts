/**
 * F-088 Logic.1: Create MessageThread synchronously with BookingRequest creation.
 * Called by submitBookingRequest after BookingRequest is written.
 * If thread creation fails, the caller must rollback the BookingRequest.
 *
 * F-088 Audit.1: Thread creation logged.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const body = await req.json();
  const { booking_request_id, parent_user_id, caregiver_user_id } = body;

  if (!booking_request_id || !parent_user_id || !caregiver_user_id) {
    return Response.json({ error: 'booking_request_id, parent_user_id, caregiver_user_id are required.' }, { status: 400 });
  }

  // Check for existing thread (idempotency guard)
  const existing = await base44.asServiceRole.entities.MessageThread.filter({ booking_id: booking_request_id });
  if (existing.length > 0) {
    return Response.json({ success: true, thread_id: existing[0].id, already_existed: true }, { status: 200 });
  }

  try {
    const thread = await base44.asServiceRole.entities.MessageThread.create({
      booking_id: booking_request_id,
      parent_user_id,
      caregiver_user_id,
      is_active: true,
      is_flagged: false,
      is_deleted: false
    });

    return Response.json({ success: true, thread_id: thread.id }, { status: 201 });
  } catch (err) {
    console.error('MessageThread create failed:', err.message, JSON.stringify(err));
    return Response.json({ error: 'Thread creation failed', detail: err.message }, { status: 500 });
  }
});