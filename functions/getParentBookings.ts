import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'parent') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter(
    { parent_user_id: user.id },
    '-created_date'
  );

  return Response.json({ bookings }, { status: 200 });
});