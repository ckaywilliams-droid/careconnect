import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  LayoutDashboard,
  Users, 
  UserCheck, 
  Shield, 
  Flag, 
  Calendar,
  ClipboardList,
  AlertTriangle,
  Menu,
  X
} from 'lucide-react';
import OverviewSection from '@/components/admin/sections/OverviewSection.jsx';
import UsersSection from '@/components/admin/sections/UsersSection.jsx';
import VerificationQueueSection from '@/components/admin/sections/VerificationQueueSection.jsx';
import ModerationQueueSection from '@/components/admin/sections/ModerationQueueSection.jsx';
import BookingControlsSection from '@/components/admin/sections/BookingControlsSection.jsx';
import AvailabilitySection from '@/components/admin/sections/AvailabilitySection.jsx';
import AuditLogSection from '@/components/admin/sections/AuditLogSection.jsx';

/**
 * P-02: ADMIN DASHBOARD PAGE
 * 
 * Protected admin-only dashboard with role-based access and section-based navigation.
 * Restricted to support_admin, trust_admin, and super_admin roles.
 */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // P-02 Access Control: Restrict to admin roles only
        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        if (!adminRoles.includes(currentUser.app_role)) {
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

  // Sidebar navigation items
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, roles: ['support_admin', 'trust_admin', 'super_admin'] },
    { id: 'users', label: 'Users', icon: Users, roles: ['support_admin', 'trust_admin', 'super_admin'] },
    { id: 'verification', label: 'Verification Queue', icon: UserCheck, roles: ['trust_admin', 'super_admin'] },
    { id: 'moderation', label: 'Moderation Queue', icon: Shield, roles: ['trust_admin', 'super_admin'] },
    { id: 'bookings', label: 'Booking Controls', icon: Calendar, roles: ['super_admin'] },
    { id: 'availability', label: 'Availability', icon: ClipboardList, roles: ['support_admin', 'trust_admin', 'super_admin'] },
    { id: 'audit', label: 'Audit Log', icon: Flag, roles: ['super_admin'] }
  ];

  const filteredNavItems = user ? navItems.filter(item => item.roles.includes(user.app_role)) : [];

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return <OverviewSection user={user} />;
      case 'users':
        return <UsersSection user={user} />;
      case 'verification':
        return <VerificationQueueSection user={user} />;
      case 'moderation':
        return <ModerationQueueSection user={user} />;
      case 'bookings':
        return <BookingControlsSection user={user} />;
      case 'availability':
        return <AvailabilitySection user={user} />;
      case 'audit':
        return <AuditLogSection user={user} />;
      default:
        return <OverviewSection user={user} />;
    }
  };

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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Admin Dashboard</h2>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* User Badge */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                <Shield className="w-5 h-5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors
                    ${activeSection === item.id 
                      ? 'bg-gray-100 text-gray-900' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => base44.auth.logout()}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-white border-b border-gray-200">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">Admin Dashboard</h1>
          <div className="w-10" />
        </header>

        {/* Section Content */}
        <main className="flex-1 p-4 lg:p-8">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}