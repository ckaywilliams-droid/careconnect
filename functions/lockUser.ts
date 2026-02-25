import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-033 Triggers.1: EMERGENCY ACCOUNT LOCK
 * 
 * Super admin only function to lock user accounts pending investigation.
 * Locked users can READ but cannot WRITE (F-033 Access.1).
 * 
 * DISTINCTION FROM SUSPENSION (F-033 Data.2):
 * - Lock: Blocks writes, allows reads
 * - Suspension: Blocks everything
 * - Brute-force lockout: Temporary, auto-expires
 * 
 * WORKFLOW:
 * 1. Validate super_admin authorization
 * 2. Check rate limit (10 per hour)
 * 3. Set is_locked=true
 * 4. Write AdminActionLog
 * 5. Optional: Send notification email
 * 
 * SECURITY:
 * - F-033 Data.3: Super admin only
 * - F-033 Abuse.1: Rate limit 10 per super admin per hour
 * - F-033 Logic.3: Does NOT invalidate sessions (intentional)
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
        error: 'Forbidden: Only super admins can lock accounts' 
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

    // Cannot lock yourself
    if (user_id === admin.id) {
      return Response.json({ error: 'You cannot lock your own account' }, { status: 400 });
    }

    // F-033 Abuse.1: Rate limit check - 10 per super admin per hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentLocks = await base44.asServiceRole.entities.AdminActionLog.filter({
      admin_user_id: admin.id,
      action_type: 'manual_override', // Using manual_override for lock actions
      created_date: { $gte: oneHourAgo.toISOString() },
    });

    // Count lock actions
    const lockCount = recentLocks.filter(log => {
      try {
        const p = JSON.parse(log.payload || '{}');
        return p.action === 'account_locked';
      } catch {
        return false;
      }
    }).length;

    if (lockCount >= 10) {
      return Response.json({ 
        error: 'Rate limit exceeded: Maximum 10 lock actions per hour' 
      }, { status: 429 });
    }

    // Get target user
    const targetUser = await base44.asServiceRole.entities.User.filter({ id: user_id });
    if (!targetUser || targetUser.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    const user = targetUser[0];

    // Check if already locked (idempotent)
    if (user.is_locked) {
      return Response.json({ 
        message: 'User is already locked',
        user_id: user.id,
      });
    }

    // F-033 Edge.1: If suspended, lock is irrelevant
    if (user.is_suspended) {
      return Response.json({ 
        error: 'User is suspended. Lock is not applicable to suspended accounts.' 
      }, { status: 400 });
    }

    // F-033 Triggers.1: SET LOCK
    await base44.asServiceRole.entities.User.update(user_id, {
      is_locked: true,
      locked_reason: reason,
      locked_at: new Date().toISOString(),
      locked_by: admin.id,
    });

    // F-033 Audit.1: Write AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'manual_override',
      target_entity_type: 'User',
      target_entity_id: user_id,
      reason,
      payload: JSON.stringify({
        action: 'account_locked',
        target_email: user.email,
        target_full_name: user.full_name,
        target_role: user.role,
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    // F-033 Triggers.1: Optional notification email
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: 'Your Account is Under Review',
        body: `Hello ${user.full_name},

Your account is currently under review. You can still view your account information, but some features are temporarily unavailable.

If you have questions or believe this is an error, please contact our support team.

Thank you for your understanding.`,
      });
    } catch (emailError) {
      console.error('Failed to send lock notification email:', emailError);
      // Continue - email failure should not block the lock
    }

    return Response.json({
      success: true,
      message: 'User account locked successfully',
      user_id,
    });

  } catch (error) {
    console.error('Error locking user:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});