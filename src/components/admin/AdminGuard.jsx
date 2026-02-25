import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';
import { isAdmin } from './PermissionMatrix';

/**
 * F-030 ACCESS CONTROL: ADMIN GUARD COMPONENT
 * 
 * Wraps admin pages to enforce authentication and role requirements.
 * 
 * USAGE:
 * <AdminGuard requiredRole="super_admin">
 *   <YourAdminPage />
 * </AdminGuard>
 * 
 * @param {string} requiredRole - Minimum role required (support_admin, trust_admin, super_admin)
 * @param {React.ReactNode} children - Content to render if authorized
 */
export default function AdminGuard({ requiredRole, children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const roleHierarchy = {
    support_admin: 1,
    trust_admin: 2,
    super_admin: 3,
  };

  useEffect(() => {
    const checkAccess = async () => {
      try {
        // F-030 Logic.1 Gate 1: Is user authenticated?
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // F-030 Logic.1 Gate 2: Is user suspended or locked?
        if (currentUser.is_suspended) {
          setError('Your account has been suspended.');
          setTimeout(() => navigate('/'), 2000);
          return;
        }

        if (currentUser.locked_until && new Date(currentUser.locked_until) > new Date()) {
          setError('Your account is temporarily locked.');
          setTimeout(() => navigate('/'), 2000);
          return;
        }

        // F-030 Logic.1 Gate 3: Does role permit access?
        if (!isAdmin(currentUser)) {
          setError('Access denied. This area is restricted to administrators.');
          setTimeout(() => navigate('/'), 2000);
          return;
        }

        // F-030 Access.1: Check role hierarchy (additive downward)
        if (requiredRole) {
          const userRoleLevel = roleHierarchy[currentUser.role] || 0;
          const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

          if (userRoleLevel < requiredRoleLevel) {
            // F-030 Abuse.1: Log privilege escalation attempt
            console.warn('Privilege escalation attempt:', {
              user_id: currentUser.id,
              user_role: currentUser.role,
              required_role: requiredRole,
            });
            // TODO: Log to AdminActionLog when backend function exists

            setError(`Access denied. This page requires ${requiredRole} role or higher.`);
            setTimeout(() => navigate('/admin'), 2000);
            return;
          }
        }
      } catch (error) {
        console.error('Failed to verify access:', error);
        setError('Authentication required. Please log in.');
        setTimeout(() => base44.auth.redirectToLogin(), 2000);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [navigate, requiredRole]);

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

  // F-030: Render protected content
  return <>{children}</>;
}