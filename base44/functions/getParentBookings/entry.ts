import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;
    console.log('[getParentBookings] userId:', userId, 'role:', user.app_role);

    // Use list() then filter in-memory — filter({}) was returning empty
    const all = await base44.asServiceRole.entities.BookingRequest.list('-created_date', 500);
    console.log('[getParentBookings] total records from list():', all.length);
    console.log('[getParentBookings] sample parent_user_ids:', all.slice(0, 5).map(b => b.parent_user_id));

    const bookings = all.filter(b => b.parent_user_id === userId && b.is_deleted !== true);
    console.log('[getParentBookings] matched:', bookings.length);

    return Response.json({ bookings }, { status: 200 });
  } catch (error) {
    console.error('getParentBookings ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});