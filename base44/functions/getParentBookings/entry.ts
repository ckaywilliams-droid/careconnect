import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // DEBUG: identify correct user id field vs. stored parent_user_id
    console.log('[getParentBookings] full user object:', JSON.stringify(user, null, 2));
    const sample = await base44.asServiceRole.entities.BookingRequest.filter({});
    const recentSample = sample
      .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
      .slice(0, 5);
    console.log('[getParentBookings] sample parent_user_id values in DB:',
      recentSample.map(b => ({ id: b.id, parent_user_id: b.parent_user_id }))
    );
    console.log('[getParentBookings] user.id =', user.id,
      '| user._id =', user._id,
      '| user.entity_id =', user.entity_id
    );

    // Fallback chain: prefer entity ID properties over auth JWT subject
    const userId = user._id || user.entity_id || user.id;

    const allForParent = await base44.asServiceRole.entities.BookingRequest.filter(
      { parent_user_id: userId }
    );
    const bookings = allForParent
      .filter(b => b.is_deleted !== true)
      .sort((a, b) => {
        const dateA = a.created_date ? new Date(a.created_date).getTime() : 0;
        const dateB = b.created_date ? new Date(b.created_date).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 100);

    console.log('[getParentBookings] matched', bookings.length, 'bookings for userId:', userId);

    return Response.json({
      bookings,
      debug: { matched: bookings.length, user_id: userId, user_id_raw: user.id }
    }, { status: 200 });
  } catch (error) {
    console.error('getParentBookings ERROR:', error);
    return Response.json({ error: error.message, stack: error.stack, name: error.name }, { status: 500 });
  }
});