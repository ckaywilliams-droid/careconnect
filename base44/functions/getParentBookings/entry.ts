import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || !user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[getParentBookings] Fetching bookings for parent_user_id:', user.id);

    const allForParent = await base44.asServiceRole.entities.BookingRequest.filter(
      { parent_user_id: user.id },
      '-created_date',
      100
    );

    const bookings = allForParent.filter(b => b.is_deleted !== true);

    console.log('[getParentBookings] matched', bookings.length, 'bookings');

    return Response.json({
      bookings,
      debug: { matched: bookings.length, user_id: user.id }
    }, { status: 200 });

  } catch (error) {
    console.error('getParentBookings ERROR:', error);
    return Response.json({
      error: error.message,
      stack: error.stack,
      name: error.name
    }, { status: 500 });
  }
});