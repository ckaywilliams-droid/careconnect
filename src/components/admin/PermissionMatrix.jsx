import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * F-030 UI.1: PERMISSION MATRIX (READ-ONLY REFERENCE)
 * 
 * Displays the complete role-permission matrix for admin roles.
 * This is a static reference — changes require code updates, Base44 automation
 * rule updates, and AdminActionLog entry (F-030 Triggers.2).
 * 
 * ROLE HIERARCHY (F-030 Data.2):
 * - support_admin: Read-only access to users, bookings, flags
 * - trust_admin: support_admin + grant/revoke CaregiverProfile.is_verified
 * - super_admin: trust_admin + change admin roles + system config + PIIAccessLog
 * 
 * ACCESS CONTROL (F-030 Access.1):
 * Additive downward: super_admin can do everything, trust_admin includes
 * support_admin permissions, etc.
 */

// F-030 Data.3: Permission matrix - each role-action combination explicitly listed
const PERMISSION_MATRIX = {
  // User Management
  'View Users': {
    support_admin: true,
    trust_admin: true,
    super_admin: true,
  },
  'View User Details': {
    support_admin: true,
    trust_admin: true,
    super_admin: true,
  },
  'Change User Role': {
    support_admin: false,
    trust_admin: false,
    super_admin: true, // F-030 Access.2
  },
  'Suspend/Unsuspend User': {
    support_admin: false,
    trust_admin: true,
    super_admin: true,
  },
  'Soft Delete User': {
    support_admin: false,
    trust_admin: false,
    super_admin: true,
  },
  
  // Caregiver Management
  'View Caregiver Profiles': {
    support_admin: true,
    trust_admin: true,
    super_admin: true,
  },
  'Grant/Revoke Profile Verification': {
    support_admin: false,
    trust_admin: true, // F-030 Data.2
    super_admin: true,
  },
  'Verify Certifications': {
    support_admin: false,
    trust_admin: true,
    super_admin: true,
  },
  
  // Booking Management
  'View Bookings': {
    support_admin: true,
    trust_admin: true,
    super_admin: true,
  },
  'Force Cancel Booking': {
    support_admin: false,
    trust_admin: true,
    super_admin: true,
  },
  
  // Content Moderation
  'View Flagged Content': {
    support_admin: true,
    trust_admin: true,
    super_admin: true,
  },
  'Resolve/Dismiss Flags': {
    support_admin: false,
    trust_admin: true,
    super_admin: true,
  },
  'Delete Messages/Content': {
    support_admin: false,
    trust_admin: true,
    super_admin: true,
  },
  
  // System Access
  'View Admin Action Log': {
    support_admin: true,
    trust_admin: true,
    super_admin: true,
  },
  'View PII Access Log': {
    support_admin: false,
    trust_admin: false,
    super_admin: true, // F-030 Data.2
  },
  'View System Configuration': {
    support_admin: false,
    trust_admin: false,
    super_admin: true,
  },
  'Manage IP Blocks': {
    support_admin: false,
    trust_admin: true,
    super_admin: true,
  },
  'View Abuse Alerts': {
    support_admin: true,
    trust_admin: true,
    super_admin: true,
  },
};

export default function PermissionMatrix() {
  const actions = Object.keys(PERMISSION_MATRIX);
  const roles = ['support_admin', 'trust_admin', 'super_admin'];

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'support_admin':
        return 'bg-blue-100 text-blue-800';
      case 'trust_admin':
        return 'bg-purple-100 text-purple-800';
      case 'super_admin':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRoleName = (role) => {
    return role.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role Permission Matrix</CardTitle>
        <CardDescription>
          F-030: Static reference showing all role-action combinations.
          Changes require code updates and audit logging.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Role Hierarchy Explanation */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-sm text-blue-900 mb-2">
            Role Hierarchy (Additive Downward)
          </h4>
          <div className="space-y-1 text-xs text-blue-800">
            <p>
              <Badge className={getRoleBadgeColor('super_admin')}>Super Admin</Badge>
              {' '}can do everything Trust Admin and Support Admin can do
            </p>
            <p>
              <Badge className={getRoleBadgeColor('trust_admin')}>Trust Admin</Badge>
              {' '}can do everything Support Admin can do
            </p>
            <p>
              <Badge className={getRoleBadgeColor('support_admin')}>Support Admin</Badge>
              {' '}has read-only access
            </p>
          </div>
        </div>

        {/* Permission Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/2">Action</TableHead>
                {roles.map(role => (
                  <TableHead key={role} className="text-center">
                    <Badge className={getRoleBadgeColor(role)}>
                      {formatRoleName(role)}
                    </Badge>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((action, idx) => (
                <TableRow key={action} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                  <TableCell className="font-medium text-sm">{action}</TableCell>
                  {roles.map(role => {
                    const hasPermission = PERMISSION_MATRIX[action][role];
                    return (
                      <TableCell key={role} className="text-center">
                        {hasPermission ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-5 h-5 text-gray-300 mx-auto" />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Notes */}
        <div className="mt-4 space-y-2 text-xs text-gray-600">
          <p>
            <strong>F-030 Access.2:</strong> Only super_admin can change user roles.
          </p>
          <p>
            <strong>F-030 Access.3:</strong> No horizontal escalation — trust_admin cannot grant admin roles.
          </p>
          <p>
            <strong>F-030 Abuse.1:</strong> Privilege escalation attempts are logged to AdminActionLog.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * F-030 Logic.1: PERMISSION CHECK UTILITY
 * 
 * Helper function to check if a user has permission for an action.
 * Used by admin UI components to show/hide features.
 * 
 * @param {Object} user - User object with role field
 * @param {string} action - Action name from PERMISSION_MATRIX
 * @returns {boolean} - Whether user has permission
 */
export function hasPermission(user, action) {
  if (!user || !user.role) return false;
  
  // F-030 Logic.1: Check gates
  // Gate 1: Is user authenticated? (assumed if user object exists)
  // Gate 2: Is user suspended or locked?
  if (user.is_suspended || (user.locked_until && new Date(user.locked_until) > new Date())) {
    return false;
  }
  
  // Gate 3: Does role permit this action?
  const permissions = PERMISSION_MATRIX[action];
  if (!permissions) return false;
  
  return permissions[user.role] === true;
}

/**
 * Check if user is an admin (any admin role)
 */
export function isAdmin(user) {
  if (!user || !user.role) return false;
  return ['support_admin', 'trust_admin', 'super_admin'].includes(user.role);
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}

/**
 * Check if user is trust admin or higher
 */
export function isTrustAdmin(user) {
  return user?.role === 'trust_admin' || user?.role === 'super_admin';
}

export { PERMISSION_MATRIX };