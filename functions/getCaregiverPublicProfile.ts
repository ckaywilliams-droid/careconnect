import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Extract slug from URL
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    
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

    // Generate signed URLs for images (60-min expiry)
    let profilePhotoUrl = null;
    let headerImageUrl = null;

    if (profile.profile_photo_url) {
      try {
        const photoResult = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: profile.profile_photo_url,
          expires_in: 3600
        });
        profilePhotoUrl = photoResult.signed_url;
      } catch (e) {
        console.error('Failed to generate signed URL for profile photo:', e.message);
      }
    }

    if (profile.header_image_url) {
      try {
        const headerResult = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: profile.header_image_url,
          expires_in: 3600
        });
        headerImageUrl = headerResult.signed_url;
      } catch (e) {
        console.error('Failed to generate signed URL for header image:', e.message);
      }
    }

    // Log to PIIAccessLog (Audit.2)
    try {
      await base44.asServiceRole.entities.PIIAccessLog.create({
        accessor_user_id: 'public-visitor',
        accessor_role: 'public',
        field_accessed: 'profile_photo',
        target_entity_type: 'CaregiverProfile',
        target_entity_id: profile.id,
        access_timestamp: new Date().toISOString(),
        access_context: 'public_profile_view',
        ip_address: req.headers.get('x-forwarded-for') || 'unknown'
      });
    } catch (e) {
      console.error('Failed to log PIIAccessLog:', e.message);
    }

    // Fetch certifications (non-suppressed only)
    const certifications = await base44.asServiceRole.entities.Certification.filter({
      caregiver_profile_id: profile.id,
      is_suppressed: false,
      is_deleted: false
    });

    // Fetch availability (next 7 days)
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const availabilitySlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
      caregiver_profile_id: profile.id,
      is_available: true,
      slot_start_time: { $gte: now.toISOString(), $lte: sevenDaysFromNow.toISOString() }
    });

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
      availabilitySlots: availabilitySlots.map(slot => ({
        id: slot.id,
        slot_start_time: slot.slot_start_time,
        slot_end_time: slot.slot_end_time,
        is_available: slot.is_available
      }))
    });
  } catch (error) {
    console.error('Error fetching caregiver profile:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
});