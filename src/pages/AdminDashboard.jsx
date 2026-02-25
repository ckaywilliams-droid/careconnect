import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users, 
  UserCheck, 
  Shield, 
  Flag, 
  Calendar,
  RefreshCw,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import MetricCard from '@/components/admin/MetricCard';
import { createPageUrl } from '@/utils';

/**
 * F-038: ADMIN DASHBOARD PAGE
 * 
 * Main admin dashboard with metrics and quick actions.
 * 
 * FEATURES (F-038 UI.1):
 * - Sidebar navigation
 * - Metric cards row
 * - Recent admin activity
 * - Quick actions
 * - F-038 Triggers.1: Parallel queries
 * - F-038 UI.2: Mobile responsive
 */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // F-038 Access.1: Admin access required
        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        if (!adminRoles.includes(currentUser.role)) {
          setError('Access denied. Admin access required.');
          setTimeout(() => navigate('/'), 2000);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setError('Authentication required.');
        setTimeout(() => base44.auth.redirectToLogin(), 2000);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [navigate]);

  // F-038 Triggers.1: Fetch dashboard metrics
  const { data: metricsData, isLoading: metricsLoading, refetch } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getDashboardMetrics');
      return response.data;
    },
    enabled: !!user,
    refetchInterval: false, // F-038 Access.2: No real-time at MVP
  });

  const metrics = metricsData?.metrics || {};

  // F-038 Edge.2: Dashboard load time warning
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  useEffect(() => {
    if (metricsLoading) {
      const timer = setTimeout(() => {
        setShowSlowWarning(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowSlowWarning(false);
    }
  }, [metricsLoading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !user) {
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
      {/* F-038 UI.1: Sidebar navigation */}
      <AdminSidebar user={user} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main Content */}
      <div className="lg:ml-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                F-038: Admin overview and quick actions
              </p>
            </div>
            
            {/* F-038 Access.2: Refresh button */}
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={metricsLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${metricsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* F-038 Edge.2: Slow loading warning */}
          {showSlowWarning && (
            <Alert className="mb-6 border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Dashboard is taking longer than expected. You can still access quick actions below.
              </AlertDescription>
            </Alert>
          )}

          {/* F-038 UI.1: Metric cards row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard
              icon={Users}
              value={metrics.totalUsers}
              label="Total Users"
              loading={metricsLoading}
            />
            
            <MetricCard
              icon={UserCheck}
              value={metrics.activeCaregivers}
              label="Active Caregivers"
              loading={metricsLoading}
            />
            
            <MetricCard
              icon={Shield}
              value={metrics.pendingVerifications}
              label="Pending Verifications"
              loading={metricsLoading}
              onClick={() => navigate(createPageUrl('CaregiverVerification'))}
            />
            
            <MetricCard
              icon={Flag}
              value={metrics.openFlags}
              label="Open Flags"
              loading={metricsLoading}
              onClick={() => navigate(createPageUrl('ModerationQueue'))}
            />
            
            <MetricCard
              icon={Calendar}
              value={metrics.bookingsThisWeek}
              label="Bookings This Week"
              loading={metricsLoading}
            />
          </div>

          {/* F-038 UI.1: Two columns below */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Recent Admin Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Admin Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
                    <p className="text-sm text-gray-600">Loading activity...</p>
                  </div>
                ) : !metrics.recentActivity || metrics.recentActivity.length === 0 ? (
                  <p className="text-gray-600 text-sm py-8 text-center">
                    No recent activity
                  </p>
                ) : (
                  <div className="space-y-3">
                    {metrics.recentActivity.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs capitalize">
                              {log.action_type.replace('_', ' ')}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(log.created_date).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 truncate">
                            {log.reason}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            by {log.admin_role}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right: Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-between"
                  variant="outline"
                  onClick={() => navigate(createPageUrl('AdminUsers'))}
                >
                  <span className="flex items-center">
                    <Users className="w-4 h-4 mr-3" />
                    User Management
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <Button
                  className="w-full justify-between"
                  variant="outline"
                  onClick={() => navigate(createPageUrl('ModerationQueue'))}
                >
                  <span className="flex items-center">
                    <Shield className="w-4 h-4 mr-3" />
                    Moderation Queue
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <Button
                  className="w-full justify-between"
                  variant="outline"
                  onClick={() => navigate(createPageUrl('AdminDisputeDashboard'))}
                >
                  <span className="flex items-center">
                    <Shield className="w-4 h-4 mr-3" />
                    Dispute Cases
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <Button
                  className="w-full justify-between"
                  variant="outline"
                  onClick={() => navigate(createPageUrl('AuditLog'))}
                >
                  <span className="flex items-center">
                    <Shield className="w-4 h-4 mr-3" />
                    Audit Log
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}