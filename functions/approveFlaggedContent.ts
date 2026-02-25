import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-035 Logic.1: APPROVE FLAGGED CONTENT (CLEAR FLAG)
 * 
 * Admin reviews content and determines it does NOT violate guidelines.
 * Marks the flag as resolved with no action on target content.
 * 
 * WORKFLOW:
 * 1. Validate admin authorization (support/trust/super admin)
 * 2. Set FlaggedContent.status='resolved'
 * 3. Set resolution_note='Reviewed — no violation found'
 * 4. Write AdminActionLog
 * 
 * SECURITY:
 * - F-035 Access.1: support_admin, trust_admin, super_admin
 * - F-035 Abuse.1: Rate limit 100 per admin per hour
 * 
 * PAYLOAD:
 * {
 *   flagged_content_id: string (required)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-035 Access.1: Admin authorization
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['support_admin', 'trust_admin', 'super_admin'];
    if (!authorizedRoles.includes(admin.role)) {
      return Response.json({ 
        error: 'Forbidden: Admin access required for moderation' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { flagged_content_id } = payload;

    if (!flagged_content_id) {
      return Response.json({ error: 'flagged_content_id is required' }, { status: 400 });
    }

    // F-035 Abuse.1: Rate limit check - 100 per admin per hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentActions = await base44.asServiceRole.entities.AdminActionLog.filter({
      admin_user_id: admin.id,
      action_type: { $in: ['content_approved', 'content_removed'] },
      created_date: { $gte: oneHourAgo.toISOString() },
    });

    if (recentActions.length >= 100) {
      return Response.json({ 
        error: 'Rate limit exceeded: Maximum 100 moderation actions per hour' 
      }, { status: 429 });
    }

    // Get flagged content
    const flags = await base44.asServiceRole.entities.FlaggedContent.filter({ 
      id: flagged_content_id 
    });
    
    if (!flags || flags.length === 0) {
      return Response.json({ error: 'Flagged content not found' }, { status: 404 });
    }
    const flag = flags[0];

    // Check if already resolved
    if (flag.status === 'resolved') {
      return Response.json({ 
        message: 'This flag has already been resolved',
        flag_id: flag.id,
      });
    }

    // F-035 Logic.1: Set status=resolved
    await base44.asServiceRole.entities.FlaggedContent.update(flagged_content_id, {
      status: 'resolved',
      resolution_note: 'Reviewed — no violation found',
      reviewed_by_admin_id: admin.id,
      reviewed_at: new Date().toISOString(),
    });

    // F-035 Audit.1: Write AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'content_approved',
      target_entity_type: flag.target_type,
      target_entity_id: flag.target_id,
      reason: 'Flag approved - no violation found',
      payload: JSON.stringify({
        flagged_content_id: flag.id,
        report_reason: flag.reason,
        reporter_user_id: flag.reporter_user_id,
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return Response.json({
      success: true,
      message: 'Flag approved successfully',
      flag_id: flagged_content_id,
    });

  } catch (error) {
    console.error('Error approving flagged content:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});