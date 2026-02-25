import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-035 Logic.2: REMOVE FLAGGED CONTENT
 * 
 * Admin determines content violates guidelines and removes it.
 * Soft-deletes or blanks content field on target record.
 * 
 * WORKFLOW:
 * 1. Validate trust_admin or super_admin authorization
 * 2. Soft-delete or blank content field on target
 * 3. Set FlaggedContent.status='resolved'
 * 4. Write AdminActionLog
 * 
 * SECURITY:
 * - F-035 Access.2: trust_admin and super_admin ONLY
 * - support_admin cannot remove content (only approve or escalate)
 * 
 * PAYLOAD:
 * {
 *   flagged_content_id: string (required)
 *   violation_category: string (required, min 10 chars)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-035 Access.2: trust_admin or super_admin ONLY
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['trust_admin', 'super_admin'];
    if (!authorizedRoles.includes(admin.role)) {
      return Response.json({ 
        error: 'Forbidden: Only trust_admin and super_admin can remove content' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { flagged_content_id, violation_category } = payload;

    if (!flagged_content_id || !violation_category) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (violation_category.length < 10) {
      return Response.json({ error: 'Violation category must be at least 10 characters' }, { status: 400 });
    }

    // F-035 Abuse.1: Rate limit check
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

    // F-035 Logic.2: Remove content from target record
    // F-035 Triggers.3: For messages, set body to removal text
    try {
      if (flag.target_type === 'message') {
        await base44.asServiceRole.entities.Message.update(flag.target_id, {
          content: '[Content removed by moderation team]',
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deletion_reason: violation_category,
        });
      } else if (flag.target_type === 'caregiver_profile' || flag.target_type === 'parent_profile') {
        // Soft delete profile
        const entityName = flag.target_type === 'caregiver_profile' ? 'CaregiverProfile' : 'ParentProfile';
        await base44.asServiceRole.entities[entityName].update(flag.target_id, {
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deletion_reason: violation_category,
        });
      } else {
        // Generic soft delete for other types
        await base44.asServiceRole.entities[flag.target_type].update(flag.target_id, {
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deletion_reason: violation_category,
        });
      }
    } catch (targetError) {
      // F-035 Errors.1: Target content may no longer exist
      console.warn('Failed to update target content (may be deleted):', targetError);
    }

    // F-035 Logic.2: Set FlaggedContent status=resolved
    await base44.asServiceRole.entities.FlaggedContent.update(flagged_content_id, {
      status: 'resolved',
      resolution_note: `Content removed — ${violation_category}`,
      reviewed_by_admin_id: admin.id,
      reviewed_at: new Date().toISOString(),
    });

    // F-035 Audit.1, Audit.3: Write AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'content_removed',
      target_entity_type: flag.target_type,
      target_entity_id: flag.target_id,
      reason: violation_category,
      payload: JSON.stringify({
        flagged_content_id: flag.id,
        report_reason: flag.reason,
        reporter_user_id: flag.reporter_user_id,
        violation_category,
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return Response.json({
      success: true,
      message: 'Content removed successfully',
      flag_id: flagged_content_id,
    });

  } catch (error) {
    console.error('Error removing flagged content:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});