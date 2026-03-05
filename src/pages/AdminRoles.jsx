import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, ArrowLeft } from 'lucide-react';
import PermissionMatrix from '@/components/admin/PermissionMatrix';
import { isSuperAdmin } from '@/components/admin/PermissionMatrix';

/**
 * F-030 UI.1: ADMIN ROLES & PERMISSIONS PAGE
 * 
 * Super admin only page showing the permission matrix reference.
 * Role assignment happens on individual user records (F-039), not here.
 * 
 * ACCESS CONTROL (F-030 UI.1):
 * - Visible to super_admin only
 * - Shows read-only permission matrix table
 * 
 * NO PUBLIC EXPOSURE (F-030 UI.2, Errors.1):
 * - Admin role names never shown to regular users
 * - This page is admin-only
 */
export default function AdminRoles() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // F-030 UI.1: Super admin only
        if (!isSuperAdmin(currentUser)) {
          setError('Access denied. This page is restricted to super administrators.');
          setTimeout(() => navigate('/'), 2000);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setError('Failed to verify access. Please try again.');
        setTimeout(() => navigate('/'), 2000);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/AdminDashboard')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Admin
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-red-600" />
                  Roles & Permissions
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  F-030: Admin role hierarchy and permission matrix reference
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Warning Banner */}
        <Alert className="mb-6 border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Static Configuration:</strong> Changes to this permission matrix require code updates,
            Base44 automation rule changes, and AdminActionLog entry (F-030 Triggers.2).
          </AlertDescription>
        </Alert>

        {/* Key Information Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Role Assignment</h3>
            <p className="text-xs text-gray-600">
              Role changes happen on individual user records via User Management (F-039).
              Only super_admin can assign admin roles.
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Horizontal Escalation</h3>
            <p className="text-xs text-gray-600">
              Trust admins cannot grant admin roles to others.
              Only super_admin can create new admins (F-030 Access.3).
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Emergency Access</h3>
            <p className="text-xs text-gray-600">
              Minimum of two super_admin accounts required before launch.
              Document emergency access procedure (F-030 Edge.1).
            </p>
          </div>
        </div>

        {/* Permission Matrix */}
        <PermissionMatrix />

        {/* Documentation Notes */}
        <div className="mt-6 bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">
            Implementation Notes (F-030)
          </h3>
          <div className="space-y-2 text-xs text-blue-800">
            <p>
              <strong>Data.1:</strong> Role hierarchy uses User.role field (Select) with values:
              parent, caregiver, support_admin, trust_admin, super_admin.
            </p>
            <p>
              <strong>Access.1:</strong> Permissions are additive downward — super_admin includes
              all trust_admin and support_admin permissions.
            </p>
            <p>
              <strong>Access.2:</strong> Only super_admin can modify User.role field. No exceptions.
            </p>
            <p>
              <strong>Logic.1:</strong> Permission checks follow three gates: (1) authenticated,
              (2) not suspended/locked, (3) role permits action per matrix.
            </p>
            <p>
              <strong>Abuse.1:</strong> Privilege escalation attempts logged to AdminActionLog
              with action_type='manual_override'.
            </p>
            <p>
              <strong>Abuse.2:</strong> Rate limit: 10 role changes per super_admin per hour.
            </p>
            <p>
              <strong>Audit.2:</strong> Every role change logged to AdminActionLog with
              old_role, new_role, and reason (required).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}