import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-038 Triggers.1: GET DASHBOARD METRICS
 * 
 * Fetches all dashboard metrics in parallel.
 * 
 * METRICS:
 * - Total users (by role, status)
 * - Active caregivers (published profiles)
 * - Pending verifications
 * - Open flags
 * - Bookings this week
 * - Recent admin activity (last 10)
 * 
 * SECURITY:
 * - F-038 Access.1: support_admin, trust_admin, super_admin
 * - F-038 Abuse.1: Aggregate counts only, no PII
 * 
 * PERFORMANCE:
 * - F-038 Logic.1: Parallel queries, not sequential
 * - F-038 Errors.1: Individual metric failures don't fail entire dashboard
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-038 Access.1: Admin authorization
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['support_admin', 'trust_admin', 'super_admin'];
    if (!authorizedRoles.includes(admin.role)) {
      return Response.json({ 
        error: 'Forbidden: Admin access required' 
      }, { status: 403 });
    }

    // F-038 Triggers.1: Run parallel queries
    const results = await Promise.allSettled([
      // Total users
      base44.asServiceRole.entities.User.list(),
      
      // Active caregivers (published profiles)
      base44.asServiceRole.entities.CaregiverProfile.filter({ is_published: true }),
      
      // Pending verifications
      base44.asServiceRole.entities.CaregiverProfile.filter({ 
        is_verified: false,
        is_published: false,
      }),
      
      // Open flags
      base44.asServiceRole.entities.FlaggedContent.filter({ 
        status: { $in: ['pending', 'reviewed'] }
      }),
      
      // Bookings this week
      (async () => {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return await base44.asServiceRole.entities.BookingRequest.filter({
          created_date: { $gte: oneWeekAgo.toISOString() }
        });
      })(),
      
      // Recent admin activity (last 10)
      base44.asServiceRole.entities.AdminActionLog.list('-created_date', 10),
    ]);

    // F-038 Errors.1: Extract results, handle failures individually
    const metrics = {
      totalUsers: results[0].status === 'fulfilled' ? results[0].value.length : null,
      activeCaregivers: results[1].status === 'fulfilled' ? results[1].value.length : null,
      pendingVerifications: results[2].status === 'fulfilled' ? results[2].value.length : null,
      openFlags: results[3].status === 'fulfilled' ? results[3].value.length : null,
      bookingsThisWeek: results[4].status === 'fulfilled' ? results[4].value.length : null,
      recentActivity: results[5].status === 'fulfilled' ? results[5].value : [],
    };

    // Additional breakdown for total users
    if (results[0].status === 'fulfilled') {
      const users = results[0].value;
      metrics.usersByRole = {
        parent: users.filter(u => u.role === 'parent').length,
        caregiver: users.filter(u => u.role === 'caregiver').length,
        admin: users.filter(u => u.role.includes('admin')).length,
      };
      metrics.suspendedUsers = users.filter(u => u.is_suspended).length;
    }

    return Response.json({
      success: true,
      metrics,
      loadedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});