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

    // F-042 Data.2: Generate unique slug
    const baseSlug = generateBaseSlug(user.full_name, user.id);
    const { slug, collisionCount } = await generateUniqueSlug(base44, baseSlug, user.id);

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

    // F-042 Audit.1: Log profile creation with slug details
    console.log(`[createCaregiverProfile] Profile created: user_id=${user.id}, profile_id=${profile.id}, slug=${slug}, collisions=${collisionCount}`);

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
 * F-042 Data.2, Data.3: Generate base slug from user full_name
 * Algorithm:
 * 1. Lowercase
 * 2. Replace non-alphanumeric with hyphens
 * 3. Collapse multiple hyphens to one
 * 4. Strip leading/trailing hyphens
 * 5. Truncate to 60 chars at word boundary
 * 6. Fallback for edge cases (empty or all-hyphens)
 */
function generateBaseSlug(fullName, userId) {
  if (!fullName) {
    // F-042 Edge.2: Fallback for missing name
    console.warn(`[generateBaseSlug] Missing full_name for user ${userId} - using UUID fallback`);
    return `caregiver-${userId.substring(0, 8)}`;
  }

  // F-042 Data.2: Lowercase and replace non-alphanumeric with hyphens
  let slug = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace any non-alphanumeric sequence with single hyphen
    .replace(/-+/g, '-') // Collapse multiple hyphens to one
    .replace(/^-+|-+$/g, ''); // Strip leading and trailing hyphens

  // F-042 Edge.2, Edge.3: Check if slug is empty or all hyphens
  if (!slug || slug.length === 0) {
    console.warn(`[generateBaseSlug] Normalized slug is empty for "${fullName}" - using UUID fallback`);
    return `caregiver-${userId.substring(0, 8)}`;
  }

  // F-042 Data.2, Edge.1: Truncate to 60 chars at word boundary
  if (slug.length > 60) {
    // Try to truncate at last hyphen (word boundary) before char 60
    const truncated = slug.substring(0, 60);
    const lastHyphen = truncated.lastIndexOf('-');
    
    if (lastHyphen > 0) {
      // Truncate at word boundary
      slug = truncated.substring(0, lastHyphen);
    } else {
      // No word boundary found - truncate at exactly 60 chars
      slug = truncated;
    }
    
    // Remove trailing hyphen if present
    slug = slug.replace(/-+$/, '');
  }

  return slug;
}

/**
 * F-042 Triggers.2: Generate unique slug with collision handling
 * Uses incremental counter (-2, -3, etc) for collisions
 * Falls back to UUID after 10 attempts
 */
async function generateUniqueSlug(base44, baseSlug, userId, maxAttempts = 10) {
  let slug = baseSlug;
  let collisionCount = 0;

  // Check base slug first
  const baseExists = await base44.asServiceRole.entities.CaregiverProfile.filter({ 
    slug: slug 
  });

  if (!baseExists || baseExists.length === 0) {
    // F-042 Audit.1: Log successful generation with no collisions
    console.log(`[generateUniqueSlug] Slug generated: ${slug} (0 collisions)`);
    return { slug, collisionCount: 0 };
  }

  // F-042 Triggers.2: Handle collisions with incremental counter
  for (let counter = 2; counter <= maxAttempts + 1; counter++) {
    slug = `${baseSlug}-${counter}`;
    collisionCount++;

    const exists = await base44.asServiceRole.entities.CaregiverProfile.filter({ 
      slug: slug 
    });

    if (!exists || exists.length === 0) {
      // F-042 Audit.1: Log successful generation with collision count
      console.log(`[generateUniqueSlug] Slug generated: ${slug} (${collisionCount} collisions)`);
      return { slug, collisionCount };
    }
  }

  // F-042 Triggers.2: Fallback to UUID after max attempts
  const fallbackSlug = `${baseSlug}-${userId.substring(0, 8)}`;
  
  // F-042 Audit.2: Log fallback event
  console.warn(`[generateUniqueSlug] UUID fallback slug: ${fallbackSlug} after ${collisionCount} collisions`);
  
  return { slug: fallbackSlug, collisionCount };
}