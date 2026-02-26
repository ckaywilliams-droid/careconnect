import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-046: REMOVE CERTIFICATION
 * 
 * Allows caregiver to soft-delete their certification document.
 * Uses soft delete (is_deleted=true) per F-046 States.2.
 * 
 * FEATURES:
 * - Ownership verification
 * - Soft delete
 * - Audit logging
 * 
 * PAYLOAD:
 * - certification_id: string - certification record ID
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

    const { certification_id } = await req.json();

    if (!certification_id) {
      return Response.json({ 
        error: 'certification_id is required' 
      }, { status: 400 });
    }

    // Get certification
    const cert = await base44.entities.Certification.get(certification_id);
    
    if (!cert) {
      return Response.json({ 
        error: 'Certification not found' 
      }, { status: 404 });
    }

    // Verify profile ownership
    const profile = await base44.entities.CaregiverProfile.get(cert.caregiver_profile_id);
    
    if (!profile || profile.user_id !== user.id) {
      return Response.json({ 
        error: 'You can only remove certifications from your own profile' 
      }, { status: 403 });
    }

    // F-046 States.2: Soft delete
    await base44.entities.Certification.update(certification_id, {
      is_deleted: true
    });

    console.log(`[removeCertification] Soft-deleted: cert_id=${certification_id}, profile_id=${cert.caregiver_profile_id}`);

    return Response.json({ 
      success: true,
      message: 'Certification removed successfully'
    });

  } catch (error) {
    console.error('[removeCertification] Error:', error);
    
    return Response.json({ 
      success: false, 
      error: error.message || 'Failed to remove certification'
    }, { status: 500 });
  }
});