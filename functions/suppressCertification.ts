import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-046: SUPPRESS CERTIFICATION (ADMIN ONLY)
 * 
 * Allows trust_admin or super_admin to suppress a certification document.
 * Suppressed certs are hidden from public and caregiver views without deletion.
 * 
 * FEATURES:
 * - F-046 Access.3: Admin-only write access
 * - F-046 States.1: Reversible suppression
 * - F-046 Triggers.2: Silent suppression (no email notification)
 * - F-046 Audit.3: AdminActionLog for all suppressions
 * 
 * PAYLOAD:
 * - certification_id: string - certification record ID
 * - suppress: boolean - true to suppress, false to unsuppress
 * - reason: string - admin reason for action
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-046 Access.3: Must be trust_admin or super_admin
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    if (user.role !== 'trust_admin' && user.role !== 'super_admin') {
      return Response.json({ 
        error: 'Forbidden: Only trust_admin and super_admin can suppress certifications' 
      }, { status: 403 });
    }

    const { certification_id, suppress, reason } = await req.json();

    if (!certification_id || typeof suppress !== 'boolean' || !reason) {
      return Response.json({ 
        error: 'certification_id, suppress (boolean), and reason are required' 
      }, { status: 400 });
    }

    // Get certification
    const cert = await base44.entities.Certification.get(certification_id);
    
    if (!cert) {
      return Response.json({ 
        error: 'Certification not found' 
      }, { status: 404 });
    }

    // F-046 Triggers.2: Update suppression status
    await base44.asServiceRole.entities.Certification.update(certification_id, {
      is_suppressed: suppress
    });

    // F-046 Audit.3: Log suppression action
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: user.id,
      admin_role: user.role,
      action_type: suppress ? 'content_removed' : 'content_approved',
      target_entity_type: 'Certification',
      target_entity_id: certification_id,
      reason: reason,
      payload: JSON.stringify({
        before: { is_suppressed: !suppress },
        after: { is_suppressed: suppress },
        caregiver_profile_id: cert.caregiver_profile_id,
        cert_type: cert.cert_type
      })
    });

    console.log(`[suppressCertification] ${suppress ? 'Suppressed' : 'Unsuppressed'}: cert_id=${certification_id}, admin=${user.id}, reason=${reason}`);

    return Response.json({ 
      success: true,
      message: `Certification ${suppress ? 'suppressed' : 'unsuppressed'} successfully`
    });

  } catch (error) {
    console.error('[suppressCertification] Error:', error);
    
    return Response.json({ 
      success: false, 
      error: error.message || 'Failed to update certification suppression status'
    }, { status: 500 });
  }
});