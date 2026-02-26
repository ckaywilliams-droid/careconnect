import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-047: PROFILE COMPLETION INDICATOR
 * 
 * Automatically recalculates completion_pct for a caregiver profile based on
 * the 6 required fields. Fires on every CaregiverProfile update.
 * 
 * FEATURES:
 * - F-047 Data.2: Evaluates 6 required fields (same as F-043 gate conditions)
 * - F-047 Data.3: Formula (count of met / 6) * 100, rounded to integer
 * - F-047 Logic.1: Fires on every profile write
 * - F-047 Logic.2: Synchronous calculation within transaction
 * - F-047 Audit.1: Logs completion_pct changes
 * 
 * PAYLOAD:
 * - event: { type: 'create' | 'update', entity_name: 'CaregiverProfile', entity_id: string }
 * - data: current CaregiverProfile record
 * - old_data: previous CaregiverProfile record (for updates)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    // Handle payload_too_large case
    let currentProfile = data;
    
    if (!currentProfile) {
      currentProfile = await base44.asServiceRole.entities.CaregiverProfile.get(event.entity_id);
    }

    // F-047 Data.2: Evaluate all 6 required fields
    const completion = calculateCompletion(currentProfile);
    const newCompletionPct = completion.percentage;
    const oldCompletionPct = old_data?.completion_pct || 0;

    // Only update if completion_pct has changed
    if (newCompletionPct !== oldCompletionPct) {
      // F-047 Logic.2: Update completion_pct synchronously
      await base44.asServiceRole.entities.CaregiverProfile.update(event.entity_id, {
        completion_pct: newCompletionPct
      });

      // F-047 Audit.1: Log completion_pct change
      console.log(`[updateProfileCompletion] Profile ${event.entity_id}: ${oldCompletionPct}% → ${newCompletionPct}% (${completion.metCount}/6 fields met)`);
      console.log(`[updateProfileCompletion] Met: [${completion.metFields.join(', ')}], Missing: [${completion.missingFields.join(', ')}]`);
    } else {
      console.log(`[updateProfileCompletion] Profile ${event.entity_id}: completion_pct unchanged at ${newCompletionPct}%`);
    }

    return Response.json({ 
      success: true,
      completion_pct: newCompletionPct,
      met_count: completion.metCount,
      met_fields: completion.metFields,
      missing_fields: completion.missingFields
    });

  } catch (error) {
    console.error('[updateProfileCompletion] Error:', error);
    
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});

/**
 * F-047 Data.2, Data.3: Calculate completion percentage
 * Evaluates the same 6 conditions as F-043 publish gate
 * 
 * Required fields:
 * 1. profile_photo (not null/empty)
 * 2. bio (not null/empty after trim)
 * 3. hourly_rate (not null and > 0)
 * 4. services_offered (at least 1 item)
 * 5. age_groups (at least 1 item)
 * 6. is_verified (true - admin-controlled)
 */
function calculateCompletion(profile) {
  const metFields = [];
  const missingFields = [];

  // Condition 1: profile_photo
  if (profile.profile_photo_url && profile.profile_photo_url.trim() !== '') {
    metFields.push('profile_photo');
  } else {
    missingFields.push('profile_photo');
  }

  // Condition 2: bio (with whitespace trimming)
  const bioTrimmed = profile.bio ? profile.bio.trim() : '';
  if (bioTrimmed.length > 0) {
    metFields.push('bio');
  } else {
    missingFields.push('bio');
  }

  // Condition 3: hourly_rate
  if (profile.hourly_rate_cents && profile.hourly_rate_cents > 0) {
    metFields.push('hourly_rate');
  } else {
    missingFields.push('hourly_rate');
  }

  // Condition 4: services_offered
  const services = profile.services_offered ? profile.services_offered.split(',').filter(s => s.trim()) : [];
  if (services.length > 0) {
    metFields.push('services_offered');
  } else {
    missingFields.push('services_offered');
  }

  // Condition 5: age_groups
  const ageGroups = profile.age_groups ? profile.age_groups.split(',').filter(a => a.trim()) : [];
  if (ageGroups.length > 0) {
    metFields.push('age_groups');
  } else {
    missingFields.push('age_groups');
  }

  // Condition 6: is_verified
  if (profile.is_verified === true) {
    metFields.push('is_verified');
  } else {
    missingFields.push('is_verified');
  }

  // F-047 Data.3: Calculate percentage (rounded to nearest integer)
  const metCount = metFields.length;
  const percentage = Math.round((metCount / 6) * 100);

  return {
    percentage,
    metCount,
    metFields,
    missingFields
  };
}