import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const threads = await base44.asServiceRole.entities.MessageThread.filter({
    caregiver_user_id: user.id
  });

  const sorted = threads.sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at) : new Date(0);
    const bTime = b.last_message_at ? new Date(b.last_message_at) : new Date(0);
    return bTime - aTime;
  });

  return Response.json({ threads: sorted });
});