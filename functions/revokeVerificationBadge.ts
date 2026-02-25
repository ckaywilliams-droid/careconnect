import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-034 Logic.2: REVOKE VERIFICATION BADGE
 * 
 * Atomically revokes background verified badge from a caregiver profile.
 * Also unpublishes the profile automatically.
 * 
 * WORKFLOW:
 * 1. Validate trust_admin or super_admin authorization
 * 2. Check rate limit (20 per day)
 * 3. Set is_verified=false
 * 4. Set is_published=false (F-034 States.2)
 * 5. Write AdminActionLog (if fails, rollback)
 * 6. Send notification email to caregiver
 * 
 * SECURITY:
 * - F-034 Access.1: trust_admin and super_admin only
 * - F-034 Abuse.2: Rate limit 20 per trust_admin per day
 * 
 * PAYLOAD:
 * {
 *   caregiver_profile_id: string (required)
 *   reason: string (required, min 10 chars)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-034 Access.1: trust_admin or super_admin authorization
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['trust_admin', 'super_admin'];
    if (!authorizedRoles.includes(admin.role)) {
      // F-034 Access.3: Log unauthorized attempt
      await base44.asServiceRole.entities.AdminActionLog.create({
        admin_user_id: admin.id,
        admin_role: admin.role,
        action_type: 'revoke_verification',
        target_entity_type: 'CaregiverProfile',
        target_entity_id: 'N/A',
        reason: 'unauthorized_verification_revoke_attempt',
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });

      return Response.json({ 
        error: 'Forbidden: Only trust_admin and super_admin can revoke verification badges' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { caregiver_profile_id, reason } = payload;

    // Validation
    if (!caregiver_profile_id || !reason) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (reason.length < 10) {
      return Response.json({ error: 'Reason must be at least 10 characters' }, { status: 400 });
    }

    // F-034 Abuse.2: Rate limit check - 20 per trust_admin per day
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const recentRevokes = await base44.asServiceRole.entities.AdminActionLog.filter({
      admin_user_id: admin.id,
      action_type: 'revoke_verification',
      created_date: { $gte: oneDayAgo.toISOString() },
    });

    if (recentRevokes.length >= 20) {
      // F-034 Abuse.2: Alert super_admin about unusual volume
      console.error('ALERT: Rate limit exceeded for verification revocations', {
        admin_id: admin.id,
        count: recentRevokes.length,
      });

      return Response.json({ 
        error: 'Rate limit exceeded: Maximum 20 verification revocations per day' 
      }, { status: 429 });
    }

    // Get caregiver profile
    const profiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ 
      id: caregiver_profile_id 
    });
    
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Caregiver profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    // Get caregiver user
    const users = await base44.asServiceRole.entities.User.filter({ id: profile.user_id });
    if (!users || users.length === 0) {
      return Response.json({ error: 'Caregiver user not found' }, { status: 404 });
    }
    const caregiver = users[0];

    // Check if not verified
    if (!profile.is_verified) {
      return Response.json({ 
        message: 'Caregiver is not verified',
        profile_id: profile.id,
      });
    }

    // F-034 Logic.2: Capture previous state
    const previousState = {
      is_verified: profile.is_verified,
      is_published: profile.is_published,
    };

    // F-034 Logic.2: SET is_verified=false AND is_published=false (F-034 States.2, Triggers.3)
    await base44.asServiceRole.entities.CaregiverProfile.update(caregiver_profile_id, {
      is_verified: false,
      is_published: false,
    });

    try {
      // F-034 Audit.2: Write AdminActionLog (CRITICAL - if this fails, rollback)
      await base44.asServiceRole.entities.AdminActionLog.create({
        admin_user_id: admin.id,
        admin_role: admin.role,
        action_type: 'revoke_verification',
        target_entity_type: 'CaregiverProfile',
        target_entity_id: caregiver_profile_id,
        reason,
        payload: JSON.stringify({
          caregiver_user_id: profile.user_id,
          caregiver_email: caregiver.email,
          caregiver_name: profile.display_name,
          previous_state: previousState,
          auto_unpublished: previousState.is_published,
        }),
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });

      // F-034 Triggers.2: Send revocation notification email
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: caregiver.email,
          subject: 'Update on Your Background Verified Badge',
          body: `Hello ${profile.display_name},

Your Background Verified badge has been removed from your profile. As a result, your profile has been unpublished and is no longer visible in search results.

What this means:
• Your profile is no longer public
• Families cannot find or book your services
• You will need to reapply for verification if you wish to continue

Next Steps:
If you believe this is an error or have questions, please contact our support team.

Thank you for your understanding.

Best regards,
The Team`,
        });

        // F-034 Audit.3: Log email delivery
        console.log('Verification revoke email sent:', {
          caregiver_id: profile.user_id,
          profile_id: caregiver_profile_id,
          email_type: 'revoke',
          timestamp: new Date().toISOString(),
        });

      } catch (emailError) {
        console.error('Failed to send verification revoke email:', emailError);
        // Continue - email failure should not block the revoke
      }

      return Response.json({
        success: true,
        message: 'Verification badge revoked successfully',
        profile_id: caregiver_profile_id,
        profile_unpublished: previousState.is_published,
      });

    } catch (logError) {
      // F-034 Logic.3: If AdminActionLog write fails, rollback
      console.error('AdminActionLog write failed, rolling back verification revoke:', logError);
      
      await base44.asServiceRole.entities.CaregiverProfile.update(caregiver_profile_id, {
        is_verified: previousState.is_verified,
        is_published: previousState.is_published,
      });

      return Response.json({ 
        error: 'Failed to create audit log. Verification revoke rolled back.' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error revoking verification badge:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});