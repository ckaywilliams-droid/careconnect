import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * F201 Fix: getCaregiverPublicProfile
 *
 * Root causes fixed:
 * 1. Removed base44.asServiceRole.entities.User.filter() suspension check —
 *    asServiceRole cannot query the User entity (returns 401), causing the
 *    function to silently fail before reaching the slot query.
 *    Suspension is now checked via the CaregiverProfile.profile_status field instead.
 *
 * 2. Removed try/catch around AvailabilitySlot query — was silently swallowing
 *    errors and returning [] instead of surfacing the real failure.
 *
 * 3. Slot query now filters on caregiver_user_id (was previously caregiver_profile_id
 *    in an earlier version — caregiver_user_id is the correct FK for RLS-passable queries).
 *
 * 4. Added guard for missing profile.user_id to prevent silent empty-slot returns
 *    caused by a bad FK rather than a legitimately empty schedule.
 */
/**
 * Generates discrete bookable sub-slots from raw availability windows.
 * Excludes any segment that overlaps with an existing pending/accepted booking.
 */
function generateBookableSlots(rawSlots, existingBookings, options = {}) {
  const { minBookingHours = 1, incrementMinutes = 60 } = options;
  const minDurationMins = minBookingHours * 60;
  const bookableSlots = [];

  const timeToMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const minsToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  for (const slot of rawSlots) {
    const windowStartMins = timeToMins(slot.start_time);
    const windowEndMins = timeToMins(slot.end_time);

    // Edge case: skip windows shorter than minimum booking duration
    if (windowEndMins - windowStartMins < minDurationMins) continue;

    // Only consider bookings on this specific date
    const dateBookings = existingBookings.filter(b =>
      b.start_time && b.start_time.substring(0, 10) === slot.slot_date
    );

    let cursor = windowStartMins;

    while (cursor + minDurationMins <= windowEndMins) {
      const segStartMins = cursor;
      const segEndMins = cursor + minDurationMins;

      const hasConflict = dateBookings.some(b => {
        const bStartMins = timeToMins(b.start_time.substring(11, 16));
        const bEndMins = timeToMins(b.end_time.substring(11, 16));
        return segStartMins < bEndMins && segEndMins > bStartMins;
      });

      if (!hasConflict) {
        bookableSlots.push({
          id: `${slot.id}::${segStartMins}`,
          original_availability_id: slot.id,
          caregiver_user_id: slot.caregiver_user_id,
          slot_date: slot.slot_date,
          start_time: minsToTime(segStartMins),
          end_time: minsToTime(segEndMins),
          status: 'open',
          is_blocked: false,
        });
      }

      cursor += incrementMinutes;
    }
  }

  return bookableSlots;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const slug = body.slug;

    if (!slug) {
      return Response.json({ error: 'Slug required' }, { status: 400 });
    }

    // Fetch caregiver profile by slug
    const profiles = await base44.asServiceRole.entities.CaregiverProfile.filter({
      slug: slug,
      is_published: true,
      is_deleted: false
    });

    if (profiles.length === 0) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = profiles[0];

    // F201 Fix #1: Suspension check via CaregiverProfile.profile_status only.
    // asServiceRole cannot query User entity — 401 was crashing the function silently.
    if (profile.profile_status === 'on_hold') {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    // F201 Fix #4: Guard against missing user_id FK
    if (!profile.user_id) {
      console.error('[getCaregiverPublicProfile] profile.user_id is missing for profile:', profile.id);
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Handle image URLs — already full URLs, no signing needed
    const profilePhotoUrl = profile.profile_photo_url || null;
    const headerImageUrl = profile.header_image_url || null;

    // Fetch certifications (non-suppressed only)
    const certifications = await base44.asServiceRole.entities.Certification.filter({
      caregiver_profile_id: profile.id,
      is_suppressed: false,
      is_deleted: false
    });

    // F201 Fix #2 & #3: Slot query — no try/catch (errors must surface), correct FK field.
    // Query uses caregiver_user_id (not caregiver_profile_id) — this is the field
    // written by createAvailabilitySlot and the one RLS evaluates against.
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const sixMonthsFromNow = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    const sixMonthsStr = sixMonthsFromNow.toISOString().split('T')[0];

    console.log('[getCaregiverPublicProfile] Fetching slots for caregiver_user_id:', profile.user_id);

    const rawSlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
      caregiver_user_id: profile.user_id,
      status: 'open',
      is_blocked: false
    });

    console.log('[getCaregiverPublicProfile] Raw slot count:', rawSlots?.length ?? 0);

    const availabilitySlots = (rawSlots || [])
      .filter(slot => slot.slot_date >= todayStr && slot.slot_date <= sixMonthsStr)
      .map(slot => ({
        id: slot.id,
        slot_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        status: slot.status,
        is_blocked: slot.is_blocked,
      }));

    console.log('[getCaregiverPublicProfile] Filtered slot count (today → 6mo):', availabilitySlots.length);

    // F-070 Access.1/Logic.1: Allowlist DTO — only safe public fields.
    return Response.json({
      profile: {
        id: profile.id,
        slug: profile.slug,
        display_name: profile.display_name,
        bio: profile.bio || null,
        profile_photo_url: profilePhotoUrl,
        header_image_url: headerImageUrl,
        hourly_rate: profile.hourly_rate_cents != null
          ? (profile.hourly_rate_cents / 100).toFixed(2)
          : null,
        services_offered: profile.services_offered || null,
        age_groups: profile.age_groups || null,
        languages: profile.languages || null,
        is_verified: profile.is_verified || false,
        average_rating: (profile.average_rating && profile.average_rating > 0) ? profile.average_rating : null,
        total_reviews: profile.total_reviews || 0,
        total_bookings_completed: profile.total_bookings_completed || 0,
        experience_years: profile.experience_years || null,
        city: profile.city || null,
        state: profile.state || null,
      },
      certifications: certifications.map(c => ({
        id: c.id,
        cert_type: c.cert_type,
        cert_name: c.cert_name,
        issuing_organization: c.issuing_organization,
        issue_date: c.issue_date,
        expiry_date: c.expiry_date,
        verification_status: c.verification_status
      })),
      availabilitySlots: availabilitySlots
    });
  } catch (error) {
    console.error('[getCaregiverPublicProfile] Unhandled error:', error.message, error.stack);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
});