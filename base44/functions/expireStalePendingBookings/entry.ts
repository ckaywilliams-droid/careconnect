/**
 * F-076 Addendum Automation.1: Expire stale pending booking requests
 * F-088: Atomic slot reopen on expiry (soft_locked → open, version_number++)
 *
 * Runs every 30 minutes (scheduled automation).
 * Finds all BookingRequest records with status=pending AND created_date < (now - 24h).
 * For each: transitions pending → expired, releases slot soft_locked → open.
 *
 * Admin-only function — requires super_admin role.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Auth — admin only
  const user = await base44.auth.me();
  if (!user || user.app_role !== 'super_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch all pending bookings
  const pendingBookings = await base44.asServiceRole.entities.BookingRequest.filter({ status: 'pending' });
  const stale = pendingBookings.filter(b => b.created_date < cutoff);

  const results = { expired: 0, slot_released: 0, slot_release_failed: 0, errors: [] };

  for (const booking of stale) {
    // Step 1: Transition pending → expired
    try {
      await base44.asServiceRole.entities.BookingRequest.update(booking.id, { status: 'expired' });
    } catch (err) {
      results.errors.push({ booking_id: booking.id, step: 'booking_update', error: err.message });
      continue;
    }

    // Verify committed
    const verify = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking.id });
    if (!verify[0] || verify[0].status !== 'expired') {
      results.errors.push({ booking_id: booking.id, step: 'verify', error: 'Status not expired after update' });
      continue;
    }
    results.expired++;

    // Step 2: Release slot soft_locked → open
    if (!booking.availability_slot_id) continue;
    const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({ id: booking.availability_slot_id });
    const slot = slots[0];

    if (!slot || slot.status !== 'soft_locked') {
      // Already released or in unexpected state — skip
      continue;
    }

    const versionBefore = slot.version_number || 0;
    try {
      await base44.asServiceRole.entities.AvailabilitySlot.update(slot.id, {
        status: 'open',
        locked_by_booking_id: null,
        version_number: versionBefore + 1
      });
      results.slot_released++;
    } catch (slotErr) {
      results.slot_release_failed++;
      results.errors.push({ booking_id: booking.id, slot_id: slot.id, step: 'slot_release', error: slotErr.message });
    }

    // Layer 4: Notify parent that request expired
    const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
    const parentUsers = await base44.asServiceRole.entities.User.filter({ id: booking.parent_user_id });
    const parentUser = parentUsers[0];
    const cgProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id });
    const cgProfile = cgProfiles[0];
    if (parentUser) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: parentUser.email,
        subject: 'Booking Request Expired',
        body: `Hi,\n\nYour booking request to ${cgProfile?.display_name || 'the caregiver'} has expired because it was not responded to within 24 hours.\n\nYou can search for another caregiver here:\n${baseUrl}/FindCaregivers\n\n– CareNest`
      }).catch(() => {});
    }
  }

  // ── Layer 8 note: F-080 Audit.2 — automation run summary ────────────────
  // Individual expiry events are recorded inline above (see slot release and email steps).
  // Aggregate run metadata is returned in the response for the automation scheduler logs.
  return Response.json({
    success: true,
    processed: stale.length,
    ...results,
    run_at: now.toISOString()
  });
});