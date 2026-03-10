import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.app_role !== 'parent') {
    return Response.json({ error: 'Forbidden: Only parents can use this function' }, { status: 403 });
  }

  const correctId = user.id;

  // ── Referential orphan detection ──────────────────────────────────────────
  const allUsers = await base44.asServiceRole.entities.User.list();
  const validUserIds = new Set(allUsers.map(u => u.id));

  const allParentProfiles = await base44.asServiceRole.entities.ParentProfile.list();
  
  const orphans = allParentProfiles.filter(profile => 
    profile.user_id !== correctId && !validUserIds.has(profile.user_id)
  );

  const alreadyCorrect = allParentProfiles.some(p => p.user_id === correctId);

  // ── Short-circuit if already correct ──────────────────────────────────────
  if (alreadyCorrect && orphans.length === 0) {
    return Response.json({
      success: true,
      correct_id: correctId,
      already_correct: true,
      orphaned_profiles_found: 0,
      old_id_detected: null,
      profile_repaired: false,
      bookings_repaired: 0,
      errors: []
    });
  }

  // ── Single-orphan safety check ────────────────────────────────────────────
  if (orphans.length !== 1) {
    return Response.json({
      error: `Expected exactly 1 orphan profile, found ${orphans.length}. Manual review required.`,
      orphaned_profiles_found: orphans.length,
      orphan_ids: orphans.map(o => o.id)
    }, { status: 409 });
  }

  // ── Repair sequence ───────────────────────────────────────────────────────
  const orphan = orphans[0];
  const oldId = orphan.user_id;

  // Update ParentProfile
  let profileRepaired = false;
  try {
    await base44.asServiceRole.entities.ParentProfile.update(orphan.id, {
      user_id: correctId
    });
    profileRepaired = true;
  } catch (error) {
    return Response.json({
      error: 'Failed to update ParentProfile',
      details: error.message,
      correct_id: correctId,
      old_id_detected: oldId,
      profile_repaired: false,
      bookings_repaired: 0,
      errors: [error.message]
    }, { status: 500 });
  }

  // Update BookingRequest records
  const allBookings = await base44.asServiceRole.entities.BookingRequest.list();
  const matchedBookings = allBookings.filter(b => 
    b.parent_user_id === oldId && b.parent_profile_id === orphan.id
  );

  let bookingsRepaired = 0;
  const errors = [];

  for (const booking of matchedBookings) {
    try {
      await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
        parent_user_id: correctId
      });
      bookingsRepaired++;
    } catch (error) {
      errors.push({
        booking_id: booking.id,
        error: error.message
      });
    }
  }

  // Return report
  const status = errors.length > 0 ? 207 : 200;
  return Response.json({
    success: true,
    correct_id: correctId,
    already_correct: alreadyCorrect,
    orphaned_profiles_found: 1,
    old_id_detected: oldId,
    profile_repaired: profileRepaired,
    bookings_repaired: bookingsRepaired,
    errors: errors
  }, { status });
});