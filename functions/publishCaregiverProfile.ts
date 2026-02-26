import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-043: CAREGIVER PROFILE PUBLISH GATE
 * 
 * Enforces 6 gate conditions before allowing profile publication:
 * 1. profile_photo_url is not null/empty
 * 2. bio is not null/empty (after trimming)
 * 3. hourly_rate_cents > 0
 * 4. services_offered has at least 1 item
 * 5. age_groups has at least 1 item
 * 6. is_verified = true (admin-controlled)
 * 
 * FEATURES:
 * - F-043 Logic.1: Evaluates gate conditions in order
 * - F-043 Edge.1: Atomic re-read before write to prevent race conditions
 * - F-043 Errors: Clear, specific error messages for each condition
 * - F-043 Audit.1: Logs successful publishes with gate condition snapshot
 * - F-043 Abuse.1: Rate limiting (10 toggles per hour)
 * 
 * PAYLOAD:
 * - profile_id: string (caregiver's profile ID)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-043 Access.1: Must be authenticated caregiver
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    const { profile_id } = await req.json();

    if (!profile_id) {
      return Response.json({ 
        error: 'profile_id is required' 
      }, { status: 400 });
    }

    // F-043 Access.1: Verify profile ownership
    const profile = await base44.entities.CaregiverProfile.get(profile_id);
    
    if (!profile) {
      return Response.json({ 
        error: 'Profile not found' 
      }, { status: 404 });
    }

    if (profile.user_id !== user.id) {
      return Response.json({ 
        error: 'You can only publish your own profile' 
      }, { status: 403 });
    }

    // F-043 Abuse.1: Check rate limiting (10 toggles per hour)
    await checkPublishRateLimit(base44, user.id);

    // F-043 Logic.1, Logic.2: Evaluate gate conditions in order
    // F-043 Edge.1: Atomic re-read immediately before validation
    const freshProfile = await base44.entities.CaregiverProfile.get(profile_id);
    const gateCheck = validateGateConditions(freshProfile);

    if (!gateCheck.passed) {
      // F-043 Audit.2: Log failed publish attempt
      console.log(`[publishCaregiverProfile] Failed attempt: profile_id=${profile_id}, user_id=${user.id}, failures=${JSON.stringify(gateCheck.failures)}`);
      
      return Response.json({ 
        success: false,
        error: 'Cannot publish profile',
        failures: gateCheck.failures
      }, { status: 400 });
    }

    // F-043 Logic.3: Atomic write - all conditions passed
    await base44.entities.CaregiverProfile.update(profile_id, {
      is_published: true,
      completion_pct: 100 // F-043 Triggers.1
    });

    // F-043 Audit.1: Log successful publish with gate snapshot
    console.log(`[publishCaregiverProfile] Success: profile_id=${profile_id}, user_id=${user.id}, gate_snapshot=${JSON.stringify(gateCheck.snapshot)}`);

    return Response.json({ 
      success: true,
      message: 'Profile published successfully',
      profile_url: `/caregivers/${freshProfile.slug}`
    });

  } catch (error) {
    console.error('[publishCaregiverProfile] Error:', error);
    
    return Response.json({ 
      success: false, 
      error: error.message || 'Failed to publish profile'
    }, { status: 500 });
  }
});

/**
 * F-043 Data.2: Validate all 6 gate conditions
 * Returns detailed failures for clear error messaging
 */
function validateGateConditions(profile) {
  const failures = [];
  const snapshot = {};

  // Condition 6: is_verified (checked first per Logic.2)
  snapshot.is_verified = profile.is_verified;
  if (!profile.is_verified) {
    failures.push({
      field: 'is_verified',
      message: 'Your profile is complete but has not yet been verified. Once verified by our team, you can publish your profile.'
    });
    // F-043 Logic.2: Return early if not verified
    return { passed: false, failures, snapshot };
  }

  // Condition 1: profile_photo
  snapshot.has_profile_photo = !!profile.profile_photo_url;
  if (!profile.profile_photo_url || profile.profile_photo_url.trim() === '') {
    failures.push({
      field: 'profile_photo_url',
      message: 'Please upload a profile photo.'
    });
  }

  // Condition 2: bio (with whitespace trimming per Errors.3)
  const bioTrimmed = profile.bio ? profile.bio.trim() : '';
  snapshot.has_bio = bioTrimmed.length > 0;
  if (bioTrimmed.length === 0) {
    failures.push({
      field: 'bio',
      message: 'Please add a bio to your profile.'
    });
  }

  // Condition 3: hourly_rate (in cents, must be > 0)
  snapshot.hourly_rate_cents = profile.hourly_rate_cents;
  if (!profile.hourly_rate_cents || profile.hourly_rate_cents <= 0) {
    failures.push({
      field: 'hourly_rate_cents',
      message: 'Please set an hourly rate greater than zero.'
    });
  }

  // Condition 4: services_offered (at least 1 item)
  const services = profile.services_offered ? profile.services_offered.split(',').filter(s => s.trim()) : [];
  snapshot.services_count = services.length;
  if (services.length === 0) {
    failures.push({
      field: 'services_offered',
      message: 'Please select at least one service you offer.'
    });
  }

  // Condition 5: age_groups (at least 1 item)
  const ageGroups = profile.age_groups ? profile.age_groups.split(',').filter(a => a.trim()) : [];
  snapshot.age_groups_count = ageGroups.length;
  if (ageGroups.length === 0) {
    failures.push({
      field: 'age_groups',
      message: 'Please select at least one age group you work with.'
    });
  }

  return {
    passed: failures.length === 0,
    failures,
    snapshot
  };
}

/**
 * F-043 Abuse.1: Rate limit - max 10 publish/unpublish toggles per hour
 */
async function checkPublishRateLimit(base44, userId) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  // Query admin action logs for recent publish/unpublish actions
  const recentActions = await base44.entities.AdminActionLog.filter({
    admin_user_id: userId,
    action_timestamp: { $gte: oneHourAgo }
  });

  // Count publish-related actions
  const publishActions = recentActions.filter(a => 
    a.action_type === 'profile_published' || a.action_type === 'profile_unpublished'
  );

  if (publishActions.length >= 10) {
    throw new Error('Rate limit exceeded. You can only publish/unpublish your profile 10 times per hour. Please try again later.');
  }
}