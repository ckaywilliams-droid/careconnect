import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log('getParentBookings: searching for user.id =', user.id);
    console.log('[DEBUG] Fetching bookings for User ID:', user.id);

    // Fetch ALL bookings with service role — bypasses RLS and any filter issues
    const all = await base44.asServiceRole.entities.BookingRequest.filter({});

    console.log('getParentBookings: total bookings in system =', all.length);
    console.log('[DEBUG] Sample IDs in DB:', all.slice(0, 3).map(b => b.parent_user_id));

    // If DB has records but none match, log actual stored parent_user_id values
    if (all.length > 0) {
      console.log('getParentBookings: sample parent_user_id values in DB:',
        all.slice(0, 5).map(b => ({ id: b.id, parent_user_id: b.parent_user_id, is_deleted: b.is_deleted }))
      );
    }

    // Bulletproof Filtering and Sorting
    const bookings = all
      .filter(b => {
        // 1. Must exist and have a parent_user_id
        if (!b || !b.parent_user_id) return false;
        // 2. Must match the current Auth ID (user.id)
        if (b.parent_user_id !== user.id) return false;
        // 3. Must not be deleted
        return b.is_deleted !== true;
      })
      .sort((a, b) => {
        // 4. Safely handle missing or malformed dates to prevent 500 crashes
        const dateA = a.created_date ? new Date(a.created_date).getTime() : 0;
        const dateB = b.created_date ? new Date(b.created_date).getTime() : 0;
        return dateB - dateA; // Descending: Newest first
      });

    console.log('getParentBookings: matched', bookings.length, 'bookings');

    return Response.json({ bookings }, { status: 200 });
  } catch (error) {
    console.error('getParentBookings ERROR:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack,
      name: error.name 
    }, { status: 500 });
  }
});