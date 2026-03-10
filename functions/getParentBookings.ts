import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Filter by parent_user_id directly — no profile lookup needed
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter(
      { parent_user_id: user.id }
    );

    // Sort by created_date descending in-memory
    bookings.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    return Response.json({ bookings }, { status: 200 });
  } catch (err) {
    console.error('getParentBookings error:', err.message);
    return Response.json({ error: err.message, bookings: [] }, { status: 500 });
  }
});