import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-034 Logic.1: GRANT VERIFICATION BADGE
 * 
 * Atomically grants background verified badge to a caregiver profile.
 * 
 * WORKFLOW:
 * 1. Validate trust_admin or super_admin authorization
 * 2. Check rate limit (50 per day)
 * 3. Set is_verified=true
 * 4. Write AdminActionLog (if fails, rollback)
 * 5. Send celebration email to caregiver
 * 
 * SECURITY:
 * - F-034 Access.1: trust_admin and super_admin only
 * - F-034 Access.3: Any other role attempt logged to AdminActionLog
 * - F-034 Abuse.1: Rate limit 50 per trust_admin per day
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
        action_type: 'grant_verification',
        target_entity_type: 'CaregiverProfile',
        target_entity_id: 'N/A',
        reason: 'unauthorized_verification_grant_attempt',
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });

      return Response.json({ 
        error: 'Forbidden: Only trust_admin and super_admin can grant verification badges' 
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

    // F-034 Abuse.1: Rate limit check - 50 per trust_admin per day
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const recentGrants = await base44.asServiceRole.entities.AdminActionLog.filter({
      admin_user_id: admin.id,
      action_type: 'grant_verification',
      created_date: { $gte: oneDayAgo.toISOString() },
    });

    if (recentGrants.length >= 50) {
      // F-034 Abuse.1: Alert super_admin about unusual volume
      console.error('ALERT: Rate limit exceeded for verification grants', {
        admin_id: admin.id,
        count: recentGrants.length,
      });

      return Response.json({ 
        error: 'Rate limit exceeded: Maximum 50 verification grants per day' 
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

    // Check if already verified (idempotent)
    if (profile.is_verified) {
      return Response.json({ 
        message: 'Caregiver is already verified',
        profile_id: profile.id,
      });
    }

    // F-034 Logic.1: SET is_verified=true
    await base44.asServiceRole.entities.CaregiverProfile.update(caregiver_profile_id, {
      is_verified: true,
    });

    try {
      // F-034 Audit.1: Write AdminActionLog (CRITICAL - if this fails, rollback)
      await base44.asServiceRole.entities.AdminActionLog.create({
        admin_user_id: admin.id,
        admin_role: admin.role,
        action_type: 'grant_verification',
        target_entity_type: 'CaregiverProfile',
        target_entity_id: caregiver_profile_id,
        reason,
        payload: JSON.stringify({
          caregiver_user_id: profile.user_id,
          caregiver_email: caregiver.email,
          caregiver_name: profile.display_name,
          previous_state: { is_verified: false },
        }),
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });

      // F-034 Triggers.1: Send celebration email
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: caregiver.email,
          subject: '🎉 Your Background Verified Badge Has Been Added!',
          body: `Hello ${profile.display_name},

Congratulations! Your Background Verified badge has been added to your profile.

What this means:
✓ Your profile now shows the "Background Verified" badge
✓ You are eligible to publish your profile and appear in search results
✓ Families can book your services with confidence

Next Steps:
If you haven't already, make sure your profile is complete and published so families can find you.

Thank you for taking the extra step to build trust in our community!

Best regards,
The Team`,
        });

        // F-034 Audit.3: Log email delivery
        console.log('Verification grant email sent:', {
          caregiver_id: profile.user_id,
          profile_id: caregiver_profile_id,
          email_type: 'grant',
          timestamp: new Date().toISOString(),
        });

      } catch (emailError) {
        console.error('Failed to send verification grant email:', emailError);
        // Continue - email failure should not block the grant
      }

      return Response.json({
        success: true,
        message: 'Verification badge granted successfully',
        profile_id: caregiver_profile_id,
      });

    } catch (logError) {
      // F-034 Logic.3: If AdminActionLog write fails, rollback
      console.error('AdminActionLog write failed, rolling back verification grant:', logError);
      
      await base44.asServiceRole.entities.CaregiverProfile.update(caregiver_profile_id, {
        is_verified: false,
      });

      return Response.json({ 
        error: 'Failed to create audit log. Verification grant rolled back.' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error granting verification badge:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});