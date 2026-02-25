import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-035 Logic.3: ESCALATE FLAGGED CONTENT
 * 
 * Admin cannot resolve the item and escalates to higher authority.
 * Item remains pending but assigned to next tier.
 * 
 * WORKFLOW:
 * 1. Validate admin authorization
 * 2. Add internal note to FlaggedContent
 * 3. Status remains 'pending' (F-035 States.2)
 * 4. Write AdminActionLog
 * 
 * ESCALATION PATH (F-035 Access.3):
 * - support_admin → trust_admin
 * - trust_admin → super_admin
 * 
 * PAYLOAD:
 * {
 *   flagged_content_id: string (required)
 *   escalation_note: string (required, min 10 chars)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Admin authorization
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
    const { flagged_content_id, escalation_note } = payload;

    if (!flagged_content_id || !escalation_note) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (escalation_note.length < 10) {
      return Response.json({ error: 'Escalation note must be at least 10 characters' }, { status: 400 });
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
        message: 'Cannot escalate a resolved flag',
        flag_id: flag.id,
      }, { status: 400 });
    }

    // F-035 Access.3: Determine escalation target
    let escalatedTo = '';
    if (admin.role === 'support_admin') {
      escalatedTo = 'trust_admin';
    } else if (admin.role === 'trust_admin') {
      escalatedTo = 'super_admin';
    } else {
      return Response.json({ 
        error: 'super_admin cannot escalate further' 
      }, { status: 400 });
    }

    // F-035 Logic.3: Add internal note, status remains pending
    const existingNotes = flag.resolution_note || '';
    const newNote = `[Escalated by ${admin.role} to ${escalatedTo}] ${escalation_note}`;
    const updatedNote = existingNotes ? `${existingNotes}\n\n${newNote}` : newNote;

    await base44.asServiceRole.entities.FlaggedContent.update(flagged_content_id, {
      resolution_note: updatedNote,
      // Status remains 'pending' - F-035 States.2
    });

    // Write AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'manual_override',
      target_entity_type: flag.target_type,
      target_entity_id: flag.target_id,
      reason: `Escalated to ${escalatedTo}: ${escalation_note}`,
      payload: JSON.stringify({
        action: 'escalate_flagged_content',
        flagged_content_id: flag.id,
        escalated_from: admin.role,
        escalated_to: escalatedTo,
        report_reason: flag.reason,
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return Response.json({
      success: true,
      message: `Flag escalated to ${escalatedTo} successfully`,
      flag_id: flagged_content_id,
      escalated_to: escalatedTo,
    });

  } catch (error) {
    console.error('Error escalating flagged content:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});