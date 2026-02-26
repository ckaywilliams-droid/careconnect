import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-039: GET USERS TABLE DATA
 * 
 * Server-side search, filter, sort, and pagination.
 * 
 * FEATURES:
 * - F-039 Logic.1: Search by full_name, email
 * - F-039 Logic.2: Filter by role, status, verified, date range
 * - F-039 Logic.3: Sort by joined, name, last_login
 * - F-039 States.1: Pagination (50 per page)
 * 
 * SECURITY:
 * - F-039 Access.1: Admin access required
 * - F-039 Access.3: Email masking
 * 
 * PAYLOAD:
 * {
 *   search: string (optional, min 2 chars)
 *   role: string (optional)
 *   status: 'active' | 'suspended' | 'locked' (optional)
 *   verified: boolean (optional, caregiver only)
 *   dateFrom: string (optional)
 *   dateTo: string (optional)
 *   sortBy: 'joined' | 'name' | 'last_login' (default: 'joined')
 *   sortOrder: 'asc' | 'desc' (default: 'desc')
 *   page: number (default: 1)
 *   perPage: number (default: 50)
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
    if (!authorizedRoles.includes(admin.role)) {
      return Response.json({ 
        error: 'Forbidden: Admin access required' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const {
      search = '',
      role = '',
      status = '',
      verified = '',
      dateFrom = '',
      dateTo = '',
      sortBy = 'joined',
      sortOrder = 'desc',
      page = 1,
      perPage = 50,
    } = payload;

    // Build query
    const query = {};

    // F-039 Logic.1: Search (min 2 chars)
    if (search && search.length >= 2) {
      // Search in full_name or email
      query.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // F-039 Logic.2: Filters
    if (role) {
      query.role = role;
    }

    if (status === 'suspended') {
      query.is_suspended = true;
    } else if (status === 'locked') {
      query.is_locked = true;
    } else if (status === 'active') {
      query.is_suspended = false;
      query.is_locked = false;
    }

    if (dateFrom || dateTo) {
      query.created_date = {};
      if (dateFrom) query.created_date.$gte = dateFrom;
      if (dateTo) query.created_date.$lte = dateTo;
    }

    // F-039 Logic.3: Sort
    const sortField = sortBy === 'joined' ? 'created_date' : 
                      sortBy === 'name' ? 'full_name' : 
                      'last_login_at';
    const sortPrefix = sortOrder === 'desc' ? '-' : '';
    const sortString = `${sortPrefix}${sortField}`;

    // Fetch users with pagination
    const skip = (page - 1) * perPage;
    const users = await base44.asServiceRole.entities.User.filter(
      query,
      sortString,
      perPage,
      skip
    );

    // Get total count for pagination
    const allUsers = await base44.asServiceRole.entities.User.filter(query);
    const totalCount = allUsers.length;

    // F-039 Access.3: Mask emails
    const maskedUsers = users.map(user => ({
      ...user,
      email_masked: maskEmail(user.email),
    }));

    // If caregiver, fetch profile data
    const caregiverIds = maskedUsers.filter(u => u.role === 'caregiver').map(u => u.id);
    let caregiverProfiles = [];
    if (caregiverIds.length > 0) {
      caregiverProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({
        user_id: { $in: caregiverIds }
      });
    }

    // Merge profile data
    const enrichedUsers = maskedUsers.map(user => {
      if (user.role === 'caregiver') {
        const profile = caregiverProfiles.find(p => p.user_id === user.id);
        return {
          ...user,
          is_verified: profile?.is_verified || false,
          is_published: profile?.is_published || false,
        };
      }
      return user;
    });

    // Apply verified filter (caregiver only)
    let filteredUsers = enrichedUsers;
    if (verified !== '' && verified !== 'all') {
      const verifiedBool = verified === 'true' || verified === true;
      filteredUsers = enrichedUsers.filter(u => {
        if (u.role !== 'caregiver') return true;
        return u.is_verified === verifiedBool;
      });
    }

    return Response.json({
      success: true,
      users: filteredUsers,
      pagination: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage),
      },
    });

  } catch (error) {
    console.error('Error fetching users table:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});

// F-039 Access.3: Email masking helper
function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.charAt(0) + '***';
  return `${maskedLocal}@${domain}`;
}