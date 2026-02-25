import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-033 UNLOCK USER ACCOUNT
 * 
 * Super admin only function to remove emergency lock from a user account.
 * 
 * WORKFLOW:
 * 1. Validate super_admin authorization
 * 2. Set is_locked=false
 * 3. Write AdminActionLog
 * 
 * F-033 Edge.2: Investigation completes - unlock account.
 * All lock period actions remain in AdminActionLog permanently.
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
    
    // F-033 Data.3: Super admin authorization ONLY
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (admin.role !== 'super_admin') {
      return Response.json({ 
        error: 'Forbidden: Only super admins can unlock accounts' 
      }, { status: 403 });
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

    // Check if not locked
    if (!user.is_locked) {
      return Response.json({ 
        message: 'User is not locked',
        user_id: user.id,
      });
    }

    // F-033: REMOVE LOCK
    await base44.asServiceRole.entities.User.update(user_id, {
      is_locked: false,
      locked_reason: null,
      locked_at: null,
      locked_by: null,
    });

    // F-033 Audit.2: Write AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'manual_override',
      target_entity_type: 'User',
      target_entity_id: user_id,
      reason,
      payload: JSON.stringify({
        action: 'account_unlocked',
        target_email: user.email,
        target_full_name: user.full_name,
        previous_lock_reason: user.locked_reason,
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return Response.json({
      success: true,
      message: 'User account unlocked successfully',
      user_id,
    });

  } catch (error) {
    console.error('Error unlocking user:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});