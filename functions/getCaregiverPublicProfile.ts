import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Extract slug from request body
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

    // F-068 Access.3: Check suspension — return 404 indistinguishable from a missing profile
    // Never return 403 or any status that reveals the profile exists
    const userRecords = await base44.asServiceRole.entities.User.filter({ id: profile.user_id }, null, 1);
    if (userRecords.length === 0 || userRecords[0].is_suspended) {
        return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Handle image URLs — already full URLs, no signing needed
    let profilePhotoUrl = profile.profile_photo_url || null;
    let headerImageUrl = profile.header_image_url || null;

    // Fetch certifications (non-suppressed only)
    const certifications = await base44.asServiceRole.entities.Certification.filter({
      caregiver_profile_id: profile.id,
      is_suppressed: false,
      is_deleted: false
    });

    // Fetch availability (next 7 days) using correct AvailabilitySlot field names
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0]; // YYYY-MM-DD

    let availabilitySlots = [];
    try {
      // Fetch all open, unblocked slots for this caregiver and filter date range in JS
      const rawSlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
        caregiver_profile_id: profile.id,
        status: 'open',
        is_blocked: false
      });

      // Filter to next 7 days using string comparison on slot_date
      availabilitySlots = (rawSlots || [])
        .filter(slot => slot.slot_date >= todayStr && slot.slot_date <= sevenDaysStr)
        .map(slot => ({
          id: slot.id,
          slot_start_time: new Date(`${slot.slot_date}T${slot.start_time}:00`).toISOString(),
          slot_end_time: new Date(`${slot.slot_date}T${slot.end_time}:00`).toISOString(),
        }));
    } catch (e) {
      console.error('Failed to fetch availability slots:', e.message);
      availabilitySlots = [];
    }

    // F-070 Access.1/Logic.1: Allowlist DTO — only safe public fields included.
    // hourly_rate as dollar string (Logic.3). avg_rating null when absent (Errors.2).
    // Excluded: user_id, email, phone, address, zip_code, completion_pct, is_suspended,
    //           is_published, is_deleted, created_date, updated_date, profile_photo raw URI.
    return Response.json({
      profile: {
        id: profile.id,
        slug: profile.slug,
        display_name: profile.display_name,
        bio: profile.bio || null,
        profile_photo_url: profilePhotoUrl,
        header_image_url: headerImageUrl,
        // Logic.3: cents → dollar string; never expose raw cents
        hourly_rate: profile.hourly_rate_cents != null
          ? (profile.hourly_rate_cents / 100).toFixed(2)
          : null,
        services_offered: profile.services_offered || null,
        age_groups: profile.age_groups || null,
        languages: profile.languages || null,
        is_verified: profile.is_verified || false,
        // Errors.2: null when no reviews — never 0
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
    console.error('Error fetching caregiver profile:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
});