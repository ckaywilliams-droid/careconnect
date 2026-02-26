import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-041 Edge.1: ORPHANED CAREGIVER RECONCILIATION
 * 
 * Daily reconciliation tool to detect and fix User records with role='caregiver'
 * that don't have a linked CaregiverProfile (orphaned accounts).
 * 
 * ADMIN-ONLY: Only super_admin can invoke this function.
 * 
 * USE CASES:
 * - F-041 Edge.1: Registration transaction timeout
 * - Profile creation automation failures
 * - Manual admin recovery
 * 
 * RETURNS:
 * - List of orphaned users detected
 * - List of profiles created
 * - List of failures
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-041 Edge.1: Admin-only access
    const admin = await base44.auth.me();
    
    if (!admin || admin.role !== 'super_admin') {
      return Response.json({ 
        error: 'Forbidden: super_admin access required' 
      }, { status: 403 });
    }

    const { auto_create = false } = await req.json().catch(() => ({}));

    // Get all caregiver users
    const caregivers = await base44.asServiceRole.entities.User.filter({ 
      role: 'caregiver' 
    });

    // Get all caregiver profiles
    const profiles = await base44.asServiceRole.entities.CaregiverProfile.filter({});
    const profileUserIds = new Set(profiles.map(p => p.user_id));

    // Find orphaned caregivers (User exists, no CaregiverProfile)
    const orphaned = caregivers.filter(user => !profileUserIds.has(user.id));

    if (orphaned.length === 0) {
      return Response.json({ 
        success: true,
        message: 'No orphaned caregiver accounts detected',
        orphaned_count: 0
      });
    }

    // Alert: orphaned accounts detected
    console.warn(`[reconcileOrphanedCaregivers] ALERT: ${orphaned.length} orphaned caregiver(s) detected`);

    const results = {
      orphaned_users: orphaned.map(u => ({ 
        id: u.id, 
        email: u.email, 
        created_date: u.created_date 
      })),
      profiles_created: [],
      failures: []
    };

    // If auto_create enabled, create profiles
    if (auto_create) {
      for (const user of orphaned) {
        try {
          // Call profile creation function
          const response = await base44.functions.invoke('createCaregiverProfile', {
            event: { 
              type: 'create', 
              entity_name: 'User', 
              entity_id: user.id 
            },
            data: user
          });

          if (response.data.success) {
            results.profiles_created.push({
              user_id: user.id,
              email: user.email,
              profile_id: response.data.profile_id,
              slug: response.data.slug
            });
          } else {
            results.failures.push({
              user_id: user.id,
              email: user.email,
              error: response.data.error
            });
          }
        } catch (error) {
          results.failures.push({
            user_id: user.id,
            email: user.email,
            error: error.message
          });
        }
      }
    }

    return Response.json({ 
      success: true,
      orphaned_count: orphaned.length,
      profiles_created_count: results.profiles_created.length,
      failures_count: results.failures.length,
      results
    });

  } catch (error) {
    console.error('[reconcileOrphanedCaregivers] Error:', error);
    
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});