import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.app_role !== 'caregiver') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const userId = user.id;
    console.log('[getCaregiverBookings] userId:', userId);

    // Use list() then filter in-memory — filter({}) was returning empty
    const all = await base44.asServiceRole.entities.BookingRequest.list('-created_date', 500);
    console.log('[getCaregiverBookings] total records from list():', all.length);
    console.log('[getCaregiverBookings] sample caregiver_user_ids:', all.slice(0, 5).map(b => b.caregiver_user_id));

    const bookings = all.filter(b => b.caregiver_user_id === userId);
    console.log('[getCaregiverBookings] matched:', bookings.length);

    return Response.json({ bookings }, { status: 200 });
  } catch (err) {
    console.error('getCaregiverBookings error:', err.message);
    return Response.json({ error: err.message, bookings: [] }, { status: 500 });
  }
});