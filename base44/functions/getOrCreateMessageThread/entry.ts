import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { booking_id } = body;
  if (!booking_id) return Response.json({ error: 'booking_id is required.' }, { status: 400 });

  // Look up booking via service role (resolves user IDs — handles old data with null user IDs)
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id });
  const booking = bookings[0];
  if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 });

  // Verify requesting user is a party to this booking
  const isParty = booking.parent_user_id === user.id || booking.caregiver_user_id === user.id;
  if (!isParty) return Response.json({ error: 'Not found.' }, { status: 404 });

  // Find existing thread
  const existing = await base44.asServiceRole.entities.MessageThread.filter({ booking_id });
  if (existing.length > 0) {
    return Response.json({ thread: existing[0] });
  }

  // Thread is missing — check if booking is terminal
  const terminalStatuses = ['declined', 'cancelled_by_parent', 'cancelled_by_caregiver', 'expired'];
  if (terminalStatuses.includes(booking.status)) {
    return Response.json({ thread: null, reason: 'terminal_booking' });
  }

  // Self-heal: create missing thread
  console.warn(`[Messaging Audit] Thread missing for booking ${booking_id}. Triggering emergency creation.`);

  // Resolve user IDs (handles old data where fields may be null)
  let parentUserId = booking.parent_user_id;
  let caregiverUserId = booking.caregiver_user_id;

  if (!parentUserId && booking.parent_profile_id) {
    const profiles = await base44.asServiceRole.entities.ParentProfile.filter({ id: booking.parent_profile_id });
    parentUserId = profiles[0]?.user_id || null;
  }
  if (!caregiverUserId && booking.caregiver_profile_id) {
    const profiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id });
    caregiverUserId = profiles[0]?.user_id || null;
  }

  if (!parentUserId || !caregiverUserId) {
    return Response.json({ error: 'Cannot resolve participant IDs for this booking.' }, { status: 500 });
  }

  try {
    const thread = await base44.asServiceRole.entities.MessageThread.create({
      booking_id,
      parent_user_id: parentUserId,
      caregiver_user_id: caregiverUserId,
      is_active: true,
      is_flagged: false,
      is_deleted: false
    });
    return Response.json({ thread });
  } catch (err) {
    return Response.json({ error: 'Thread creation failed.', detail: err.message }, { status: 500 });
  }
});