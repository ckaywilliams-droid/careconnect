import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-041: CAREGIVER PROFILE RECORD CREATION
 * 
 * Creates a CaregiverProfile when a new User with role='caregiver' registers.
 * 
 * FEATURES:
 * - F-041 Logic.1: Triggered by User creation automation
 * - F-041 States.1: Creates profile with default values
 * - F-042: Auto-generates unique slug
 * - F-041 Errors.1: Checks for existing profile
 * - F-041 Edge.1: Handles orphaned User records
 * 
 * PAYLOAD:
 * - event: { type: 'create', entity_name: 'User', entity_id: string }
 * - data: User record (or null if payload_too_large)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // F-041 Logic.1: Validate this is a caregiver User creation
    let user = data;
    
    // Handle payload_too_large case
    if (!user) {
      user = await base44.asServiceRole.entities.User.get(event.entity_id);
    }

    // F-041 Errors.2: Only create profile for caregivers
    if (user.role !== 'caregiver') {
      console.log(`[createCaregiverProfile] Skipping - User ${user.id} is not a caregiver (role: ${user.role})`);
      return Response.json({ 
        success: true, 
        message: 'Not a caregiver user - no profile created' 
      });
    }

    // F-041 Errors.1: Check if profile already exists (prevent duplicates)
    const existingProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ 
      user_id: user.id 
    });

    if (existingProfiles && existingProfiles.length > 0) {
      console.warn(`[createCaregiverProfile] Profile already exists for User ${user.id} - skipping creation`);
      return Response.json({ 
        success: true, 
        message: 'Profile already exists',
        profile_id: existingProfiles[0].id
      });
    }

    // F-042: Generate unique slug
    const baseSlug = generateBaseSlug(user.full_name || user.email);
    const slug = await generateUniqueSlug(base44, baseSlug);

    // F-041 Triggers.2: If slug generation failed after retries
    if (!slug) {
      console.error(`[createCaregiverProfile] CRITICAL: Slug generation failed for User ${user.id}`);
      return Response.json({ 
        success: false, 
        error: 'Slug generation failed - alert operators'
      }, { status: 500 });
    }

    // F-041 Data.1: Create CaregiverProfile with defaults
    const profile = await base44.asServiceRole.entities.CaregiverProfile.create({
      user_id: user.id,
      slug: slug,
      display_name: user.full_name || 'Caregiver',
      bio: null,
      experience_years: null,
      hourly_rate_cents: null,
      services_offered: null,
      age_groups: null,
      specializations: null,
      languages: null,
      is_verified: false,
      is_background_checked: false,
      is_published: false,
      completion_pct: 0,
      profile_photo_url: null,
      header_image_url: null,
      city: null,
      state: null,
      zip_code: null,
      average_rating: 0,
      total_reviews: 0,
      total_bookings_completed: 0,
      is_deleted: false
    });

    // F-041 Audit.1: Log profile creation
    console.log(`[createCaregiverProfile] Profile created: user_id=${user.id}, profile_id=${profile.id}, slug=${slug}`);

    return Response.json({ 
      success: true, 
      profile_id: profile.id,
      slug: slug,
      message: 'Caregiver profile created successfully'
    });

  } catch (error) {
    // F-041 Audit.2: Log critical failure
    console.error('[createCaregiverProfile] CRITICAL ERROR:', error);
    
    return Response.json({ 
      success: false, 
      error: error.message || 'Failed to create caregiver profile'
    }, { status: 500 });
  }
});

/**
 * F-042: Generate base slug from user name or email
 */
function generateBaseSlug(nameOrEmail) {
  // Remove @ and domain from email if present
  let base = nameOrEmail.split('@')[0];
  
  // Convert to lowercase, replace spaces/special chars with hyphens
  base = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  
  // Truncate to 30 chars
  if (base.length > 30) {
    base = base.substring(0, 30).replace(/-+$/, '');
  }
  
  return base || 'caregiver';
}

/**
 * F-042: Generate unique slug with collision handling
 */
async function generateUniqueSlug(base44, baseSlug, maxAttempts = 10) {
  let slug = baseSlug;
  let attempt = 0;

  while (attempt < maxAttempts) {
    // Check if slug exists
    const existing = await base44.asServiceRole.entities.CaregiverProfile.filter({ 
      slug: slug 
    });

    if (!existing || existing.length === 0) {
      return slug; // Found unique slug
    }

    // Collision detected - append random suffix
    attempt++;
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    slug = `${baseSlug}-${randomSuffix}`;
  }

  // F-041 Triggers.2: Max attempts exceeded
  console.error(`[generateUniqueSlug] Failed to generate unique slug after ${maxAttempts} attempts for base: ${baseSlug}`);
  return null;
}