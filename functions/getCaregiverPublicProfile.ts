import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * F-056.1: Returns raw availability windows (no sub-slot generation).
 * Parents pick start time + duration within each window in the frontend.
 * Overlap enforcement is done at booking submission time.
 */

const timeToMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

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

    if (profile.profile_status === 'on_hold') {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (!profile.user_id) {
      console.error('[getCaregiverPublicProfile] profile.user_id is missing for profile:', profile.id);
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Fetch certifications (non-suppressed only)
    const certifications = await base44.asServiceRole.entities.Certification.filter({
      caregiver_profile_id: profile.id,
      is_suppressed: false,
      is_deleted: false
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const sixMonthsFromNow = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    const sixMonthsStr = sixMonthsFromNow.toISOString().split('T')[0];

    const minimumHours = profile.minimum_hours || 2;

    console.log('[getCaregiverPublicProfile] Fetching slots for caregiver_user_id:', profile.user_id, 'min_hours:', minimumHours);

    const rawSlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
      caregiver_user_id: profile.user_id,
      status: 'open',
      is_blocked: false
    });

    console.log('[getCaregiverPublicProfile] Raw slot count:', rawSlots?.length ?? 0);

    // Return raw availability windows. Only show windows that are:
    // - In the future and within 6 months
    // - Long enough to satisfy minimum booking hours
    const availabilitySlots = (rawSlots || [])
      .filter(slot =>
        slot.slot_date >= todayStr &&
        slot.slot_date <= sixMonthsStr &&
        (timeToMins(slot.end_time) - timeToMins(slot.start_time)) >= minimumHours * 60
      )
      .map(slot => ({
        id: slot.id,
        caregiver_user_id: slot.caregiver_user_id,
        slot_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        status: slot.status,
        is_blocked: slot.is_blocked
      }));

    console.log('[getCaregiverPublicProfile] Available windows returned:', availabilitySlots.length);

    return Response.json({
      profile: {
        id: profile.id,
        slug: profile.slug,
        display_name: profile.display_name,
        bio: profile.bio || null,
        profile_photo_url: profile.profile_photo_url || null,
        header_image_url: profile.header_image_url || null,
        hourly_rate: profile.hourly_rate_cents != null ? (profile.hourly_rate_cents / 100).toFixed(2) : null,
        hourly_rate_cents: profile.hourly_rate_cents || null,
        minimum_hours: minimumHours,
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
      availabilitySlots
    });
  } catch (error) {
    console.error('[getCaregiverPublicProfile] Unhandled error:', error.message, error.stack);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
});