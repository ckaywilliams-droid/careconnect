import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    console.error('[getMessages] Unauthorized — no user session');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { thread_id } = body;

  if (!thread_id) {
    console.error('[getMessages] Missing thread_id in request body');
    return Response.json({ error: 'thread_id is required.' }, { status: 400 });
  }

  console.log(`[getMessages] Fetching messages for thread ${thread_id}, user ${user.id}`);

  // Use filter instead of .get() — avoids hard 404 throws on missing records
  const threads = await base44.asServiceRole.entities.MessageThread.filter({ id: thread_id });
  const thread = threads[0] || null;

  if (!thread) {
    console.error(`[getMessages] Thread ${thread_id} not found via service role filter`);
    return Response.json({ error: 'Thread not found.', thread_id }, { status: 404 });
  }

  console.log(`[getMessages] Thread found. parent_user_id=${thread.parent_user_id}, caregiver_user_id=${thread.caregiver_user_id}`);

  // Verify the calling user is a participant
  const isParticipant = thread.parent_user_id === user.id || thread.caregiver_user_id === user.id;
  if (!isParticipant) {
    console.error(`[getMessages] User ${user.id} is not a participant in thread ${thread_id}`);
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  // Fetch messages via service role
  const messages = await base44.asServiceRole.entities.Message.filter(
    { thread_id, is_deleted: false },
    'sent_at'
  );

  console.log(`[getMessages] Returning ${messages.length} messages for thread ${thread_id}`);
  return Response.json({ messages });
});