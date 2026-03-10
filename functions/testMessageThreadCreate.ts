import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const thread = await base44.asServiceRole.entities.MessageThread.create({
      booking_id: 'test-booking-id-123',
      parent_user_id: 'test-parent-id',
      caregiver_user_id: 'test-caregiver-id',
      is_active: true,
      is_flagged: false,
      is_deleted: false
    });
    return Response.json({ success: true, thread_id: thread.id });
  } catch (err) {
    return Response.json({ error: err.message, full: JSON.stringify(err) }, { status: 500 });
  }
});