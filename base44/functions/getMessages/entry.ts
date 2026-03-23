import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { thread_id } = body;

    if (!thread_id) {
      return Response.json({ error: 'thread_id is required.' }, { status: 400 });
    }

    // Use asServiceRole to look up the MessageThread
    const threads = await base44.asServiceRole.entities.MessageThread.filter({ id: thread_id });
    const thread = threads[0];

    if (!thread) {
      return Response.json({ error: 'Thread not found.' }, { status: 404 });
    }

    // Verify the calling user is a participant
    const isParticipant = thread.parent_user_id === user.id || thread.caregiver_user_id === user.id;
    if (!isParticipant) {
      return Response.json({ error: 'Access denied.' }, { status: 403 });
    }

    // Use asServiceRole to fetch all Message records for this thread
    const messages = await base44.asServiceRole.entities.Message.filter(
      { thread_id: thread_id },
      'sent_at'
    );

    return Response.json({ messages });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});