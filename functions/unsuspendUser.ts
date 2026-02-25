import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-032 Logic.3: USER UNSUSPENSION BACKEND FUNCTION
 * 
 * Atomically removes suspension from a user account.
 * Same atomicity rule as suspension.
 * 
 * WORKFLOW:
 * 1. Validate admin authorization
 * 2. Set is_suspended=false
 * 3. Write AdminActionLog (if this fails, rollback)
 * 4. Clear suspension_reason
 * 
 * NOTE: Profile remains unpublished until manual re-verification (F-032 UI.3)
 * 
 * PAYLOAD:
 * {
 *   user_id: string (required)
 *   reason: string (required, min 10 chars)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authorization check
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
    if (!adminRoles.includes(admin.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { user_id, reason } = payload;

    // Validation
    if (!user_id || !reason) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (reason.length < 10) {
      return Response.json({ error: 'Reason must be at least 10 characters' }, { status: 400 });
    }

    // Get target user
    const targetUser = await base44.asServiceRole.entities.User.filter({ id: user_id });
    if (!targetUser || targetUser.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    const user = targetUser[0];

    // F-032 Access.2: Only super admin can unsuspend other admins
    const targetIsAdmin = adminRoles.includes(user.role);
    if (targetIsAdmin && admin.role !== 'super_admin') {
      return Response.json({ 
        error: 'Forbidden: Only super admins can unsuspend admin accounts' 
      }, { status: 403 });
    }

    // Check if not suspended
    if (!user.is_suspended) {
      return Response.json({ 
        message: 'User is not suspended',
        user_id: user.id,
      });
    }

    // F-032 Logic.3: ATOMIC UNSUSPENSION SEQUENCE

    // Step 1: Capture previous state
    const previousState = {
      is_suspended: user.is_suspended,
      suspension_reason: user.suspension_reason,
    };

    // Step 2: Set is_suspended=false
    await base44.asServiceRole.entities.User.update(user_id, {
      is_suspended: false,
      suspension_reason: null,
    });

    try {
      // Step 3: Write AdminActionLog (CRITICAL - if this fails, rollback)
      const logEntry = await base44.asServiceRole.entities.AdminActionLog.create({
        admin_user_id: admin.id,
        admin_role: admin.role,
        action_type: 'unsuspend_user',
        target_entity_type: 'User',
        target_entity_id: user_id,
        reason,
        payload: JSON.stringify({
          previous_state: previousState,
          target_email: user.email,
          target_full_name: user.full_name,
        }),
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });

      // F-032 Audit.2: Unsuspension logged
      
      // F-032 UI.3: Profile remains unpublished - admin must manually re-verify
      const caregiverProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({
        user_id: user_id,
      });

      let profileStatus = null;
      if (caregiverProfiles.length > 0) {
        profileStatus = {
          has_caregiver_profile: true,
          is_published: caregiverProfiles[0].is_published,
          note: 'Profile remains unpublished. Manual re-verification required.',
        };
      }

      return Response.json({
        success: true,
        message: 'User unsuspended successfully',
        user_id,
        profile_status: profileStatus,
      });

    } catch (logError) {
      // F-032 Logic.3: If AdminActionLog write fails, rollback unsuspension
      console.error('AdminActionLog write failed, rolling back unsuspension:', logError);
      
      await base44.asServiceRole.entities.User.update(user_id, {
        is_suspended: true,
        suspension_reason: previousState.suspension_reason,
      });

      return Response.json({ 
        error: 'Failed to create audit log. Unsuspension rolled back.' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error unsuspending user:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});