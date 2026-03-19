import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * F-039: GET USER DETAIL
 * 
 * Fetches full user details for the admin detail panel.
 * Used by UserDetailPanel to populate all user fields.
 * 
 * PAYLOAD:
 * {
 *   userId: string (required)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-039 Access.1: Admin authorization
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['support_admin', 'trust_admin', 'super_admin'];
    if (!authorizedRoles.includes(admin.app_role)) {
      return Response.json({ 
        error: 'Forbidden: Admin access required' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { userId } = payload;

    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 });
    }

    // Fetch full user record using service role (bypasses RLS)
    const users = await base44.asServiceRole.entities.User.filter({ id: userId });
    const user = users[0];

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // If caregiver, fetch profile
    let profile = null;
    if (user.app_role === 'caregiver') {
      const profiles = await base44.asServiceRole.entities.CaregiverProfile.filter({ 
        user_id: userId 
      });
      profile = profiles[0];
    }

    return Response.json({
      success: true,
      user,
      profile: profile || null,
    });

  } catch (error) {
    console.error('Error fetching user detail:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});