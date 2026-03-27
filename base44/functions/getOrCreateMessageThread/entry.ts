import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    console.error('[getOrCreateMessageThread] Unauthorized — no user session');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { booking_id } = body;

  if (!booking_id) {
    console.error('[getOrCreateMessageThread] Missing booking_id in request body');
    return Response.json({ error: 'booking_id is required.' }, { status: 400 });
  }

  console.log(`[getOrCreateMessageThread] Looking up booking ${booking_id} for user ${user.id}`);

  // Fetch booking via service role to bypass RLS
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id });
  const booking = bookings[0];

  if (!booking) {
    console.error(`[getOrCreateMessageThread] Booking not found: ${booking_id}`);
    return Response.json({ error: 'Booking not found.' }, { status: 404 });
  }

  console.log(`[getOrCreateMessageThread] Booking found. parent_user_id=${booking.parent_user_id}, caregiver_user_id=${booking.caregiver_user_id}, status=${booking.status}`);

  // Verify requesting user is a party to this booking
  const isParty = booking.parent_user_id === user.id || booking.caregiver_user_id === user.id;
  if (!isParty) {
    console.error(`[getOrCreateMessageThread] User ${user.id} is not a party to booking ${booking_id}`);
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  // Find existing thread (use filter, not .get(), for robustness)
  console.log(`[getOrCreateMessageThread] Searching for existing thread for booking ${booking_id}`);
  const existing = await base44.asServiceRole.entities.MessageThread.filter({ booking_id });
  const activeThread = existing.find(t => !t.is_deleted);

  if (activeThread) {
    console.log(`[getOrCreateMessageThread] Found existing thread ${activeThread.id}`);
    return Response.json({ thread: activeThread });
  }

  // Thread is missing — check if booking is terminal (no point creating)
  const terminalStatuses = ['declined', 'cancelled_by_parent', 'cancelled_by_caregiver', 'expired'];
  if (terminalStatuses.includes(booking.status)) {
    console.log(`[getOrCreateMessageThread] Booking ${booking_id} is terminal (${booking.status}), not creating thread`);
    return Response.json({ thread: null, reason: 'terminal_booking' });
  }

  // Self-heal: resolve user IDs — handles old booking records with null user ID fields
  let parentUserId = booking.parent_user_id;
  let caregiverUserId = booking.caregiver_user_id;

  if (!parentUserId && booking.parent_profile_id) {
    console.warn(`[getOrCreateMessageThread] parent_user_id is null for booking ${booking_id}, resolving from ParentProfile ${booking.parent_profile_id}`);
    const profiles = await base44.asServiceRole.entities.ParentProfile.filter({ id: booking.parent_profile_id });
    parentUserId = profiles[0]?.user_id || null;
    console.log(`[getOrCreateMessageThread] Resolved parentUserId=${parentUserId}`);
  }

  if (!caregiverUserId && booking.caregiver_profile_id) {
    console.warn(`[getOrCreateMessageThread] caregiver_user_id is null for booking ${booking_id}, resolving from CaregiverProfile ${booking.caregiver_profile_id}`);
    const profiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id });
    caregiverUserId = profiles[0]?.user_id || null;
    console.log(`[getOrCreateMessageThread] Resolved caregiverUserId=${caregiverUserId}`);
  }

  if (!parentUserId || !caregiverUserId) {
    console.error(`[getOrCreateMessageThread] Cannot resolve participant IDs for booking ${booking_id}. parentUserId=${parentUserId}, caregiverUserId=${caregiverUserId}`);
    return Response.json({ error: 'Cannot resolve participant IDs for this booking.', detail: `parentUserId=${parentUserId}, caregiverUserId=${caregiverUserId}` }, { status: 500 });
  }

  console.log(`[getOrCreateMessageThread] Creating new thread for booking ${booking_id}`);
  const thread = await base44.asServiceRole.entities.MessageThread.create({
    booking_id,
    parent_user_id: parentUserId,
    caregiver_user_id: caregiverUserId,
    is_active: true,
    is_flagged: false,
    is_deleted: false
  });

  console.log(`[getOrCreateMessageThread] Created thread ${thread.id} for booking ${booking_id}`);
  return Response.json({ thread });
});