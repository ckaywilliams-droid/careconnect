import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'caregiver') return Response.json({ error: 'Forbidden' }, { status: 403 });

  try {
    // DEBUG: identify correct user id field vs. stored caregiver_user_id
    console.log('[getCaregiverBookings] full user object:', JSON.stringify(user, null, 2));
    const sample = await base44.asServiceRole.entities.BookingRequest.filter({});
    const recentSample = sample
      .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
      .slice(0, 5);
    console.log('[getCaregiverBookings] sample caregiver_user_id values in DB:',
      recentSample.map(b => ({ id: b.id, caregiver_user_id: b.caregiver_user_id }))
    );
    console.log('[getCaregiverBookings] user.id =', user.id,
      '| user._id =', user._id,
      '| user.entity_id =', user.entity_id
    );

    // Fallback chain: prefer entity ID properties over auth JWT subject
    const userId = user._id || user.entity_id || user.id;

    const allForCaregiver = await base44.asServiceRole.entities.BookingRequest.filter(
      { caregiver_user_id: userId }
    );

    const bookings = allForCaregiver
      .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());

    console.log('[getCaregiverBookings] matched', bookings.length, 'bookings for userId:', userId);

    return Response.json({ bookings, debug: { matched: bookings.length, user_id: userId } }, { status: 200 });
  } catch (err) {
    console.error('getCaregiverBookings error:', err.message);
    return Response.json({ error: err.message, bookings: [] }, { status: 500 });
  }
});