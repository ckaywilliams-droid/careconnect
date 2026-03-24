import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutDashboard, 
  Users, 
  Shield, 
  Flag,
  Scale,
  FileText,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

/**
 * F-038 UI.1: ADMIN SIDEBAR NAVIGATION
 * 
 * Left sidebar with navigation links, user info, and sign-out.
 * 
 * FEATURES:
 * - Logo
 * - Nav links (Dashboard, User Management, Moderation Queue, etc.)
 * - Logged-in admin name and role badge
 * - Sign-out button
 * - F-038 UI.2: Collapses to hamburger on mobile
 */
export default function AdminSidebar({ user, mobileOpen, setMobileOpen, pendingCount = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
    { label: 'User Management', icon: Users, path: '/admin-users' },
    { label: 'Moderation Queue', icon: Shield, path: '/moderation-queue', badge: pendingCount },
    { label: 'Disputes', icon: Scale, path: '/admin-dispute-dashboard' },
    { label: 'Flagged Content', icon: Flag, path: '/flagged-content' },
    { label: 'Audit Log', icon: FileText, path: '/audit-log' },
  ];

  const handleSignOut = async () => {
    await base44.auth.logout();
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold">Admin Panel</h1>
        <p className="text-xs text-gray-400 mt-1">F-038 Dashboard</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Button
              key={item.path}
              variant="ghost"
              className={`w-full justify-start ${
                isActive 
                  ? 'bg-gray-800 text-white' 
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
              onClick={() => {
                navigate(createPageUrl(item.path.replace('/', '')));
                if (setMobileOpen) setMobileOpen(false);
              }}
            >
              <Icon className="w-4 h-4 mr-3" />
              {item.label}
              {/* F-040 Abuse.1: Pending count badge */}
              {item.badge > 0 && (
                <Badge variant="destructive" className="ml-auto">
                  {item.badge}
                </Badge>
              )}
            </Button>
          );
        })}
      </nav>

      {/* User Info */}
      {user && (
        <div className="p-4 border-t border-gray-800 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
              <span className="text-sm font-semibold">
                {user.full_name?.substring(0, 2).toUpperCase() || 'AD'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.full_name || user.email}</p>
              <Badge variant="outline" className="text-xs mt-1">
                {user.app_role?.replace('_', ' ')}
              </Badge>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 h-screen fixed left-0 top-0">
        {sidebarContent}
      </div>

      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="bg-white"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-64">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}