import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.app_role !== 'parent') return Response.json({ error: 'Forbidden' }, { status: 403 });

  try {
    // Get the parent's profile record (has a proper indexed relation field)
    const profiles = await base44.asServiceRole.entities.ParentProfile.filter({ user_id: user.id });
    const profile = profiles[0];

    if (!profile) {
      return Response.json({ bookings: [] }, { status: 200 });
    }

    // Filter by parent_profile_id — a proper relation field in Base44
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter(
      { parent_profile_id: profile.id }
    );

    // Sort by created_date descending in-memory (avoids sort param issues)
    bookings.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    return Response.json({ bookings }, { status: 200 });
  } catch (err) {
    console.error('getParentBookings error:', err.message);
    return Response.json({ error: err.message, bookings: [] }, { status: 500 });
  }
});