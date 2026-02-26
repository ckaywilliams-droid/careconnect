import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-043: CAREGIVER PROFILE UNPUBLISH
 * 
 * Allows caregiver to unpublish their profile at any time.
 * No gate conditions or reasons required.
 * 
 * FEATURES:
 * - F-043 States.2: Can unpublish anytime without reason
 * - F-043 Abuse.1: Rate limiting (10 toggles per hour)
 * - Audit logging for unpublish events
 * 
 * PAYLOAD:
 * - profile_id: string (caregiver's profile ID)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Must be authenticated caregiver
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

    // Verify profile ownership
    const profile = await base44.entities.CaregiverProfile.get(profile_id);
    
    if (!profile) {
      return Response.json({ 
        error: 'Profile not found' 
      }, { status: 404 });
    }

    if (profile.user_id !== user.id) {
      return Response.json({ 
        error: 'You can only unpublish your own profile' 
      }, { status: 403 });
    }

    // Check if already unpublished
    if (!profile.is_published) {
      return Response.json({ 
        success: true,
        message: 'Profile is already unpublished'
      });
    }

    // F-043 Abuse.1: Check rate limiting
    await checkUnpublishRateLimit(base44, user.id);

    // Unpublish the profile
    await base44.entities.CaregiverProfile.update(profile_id, {
      is_published: false
    });

    // Log unpublish event
    console.log(`[unpublishCaregiverProfile] Success: profile_id=${profile_id}, user_id=${user.id}, slug=${profile.slug}`);

    return Response.json({ 
      success: true,
      message: 'Profile unpublished successfully'
    });

  } catch (error) {
    console.error('[unpublishCaregiverProfile] Error:', error);
    
    return Response.json({ 
      success: false, 
      error: error.message || 'Failed to unpublish profile'
    }, { status: 500 });
  }
});

/**
 * F-043 Abuse.1: Rate limit - max 10 publish/unpublish toggles per hour
 */
async function checkUnpublishRateLimit(base44, userId) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  // Query admin action logs for recent publish/unpublish actions
  // Note: We use created_by (auto-set by platform) to filter caregiver's own actions
  const recentActions = await base44.entities.AdminActionLog.filter({
    created_by: userId,
    created_date: { $gte: oneHourAgo }
  });

  // Count publish-related actions
  const publishActions = recentActions.filter(a => 
    a.action_type === 'profile_published' || a.action_type === 'profile_unpublished'
  );

  if (publishActions.length >= 10) {
    throw new Error('Rate limit exceeded. You can only publish/unpublish your profile 10 times per hour. Please try again later.');
  }
}