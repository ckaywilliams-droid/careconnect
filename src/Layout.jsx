import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import NotificationBell from "@/components/NotificationBell";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

// Pages that never require the onboarding guard
const PUBLIC_PAGES = [
  'register', 'login', 'roleselection', 'selectrole',
  'verifyemail', 'emailverified', 'forgotpassword', 'resetpassword',
  'home', 'findcaregivers', 'publiccaregiverprofile',
  'suspendedaccount', 'adminlogin', 'adminfirstlogin',
  'admindashboard', 'adminusers', 'adminroles', 'admindisputedashboard',
  'moderationqueue', 'submitevidence', 'disputedetail',
  'parentbookings', 'parentonboarding', 'bookingsuccess'
];



export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Base44 hardcodes /verify-email in its email links — redirect to our page
  if (location.pathname === '/verify-email') {
    window.location.replace('/VerifyEmail' + location.search);
    return null;
  }

  // Redirect /select-role → /RoleSelection
  if (location.pathname === '/select-role') {
    window.location.replace('/RoleSelection' + location.search);
    return null;
  }

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  const handleLogout = async () => {
    await base44.auth.logout();
    setCurrentUser(null);
    navigate('/');
  };

  const pageKey = (currentPageName || '').toLowerCase().replace(/[^a-z]/g, '');
  const isPublicPage = PUBLIC_PAGES.includes(pageKey);

  useEffect(() => {
    (async () => {
      try {
        const authenticated = await base44.auth.isAuthenticated();
        if (!authenticated) {
          setCurrentUser(null);
          setCheckingAuth(false);
          return;
        }

        const user = await base44.auth.me();
        setCurrentUser(user);

        // F-021B Global Route Guard:
        // If logged in AND (role == null OR onboarding_complete == false)
        // AND not an admin role → redirect to /select-role
        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        const isAdmin = adminRoles.includes(user.app_role);
        // Don't redirect if user is on the email verification page
        const isVerifyPage = pageKey === 'verifyemail' || pageKey === 'emailverified';
        const needsRoleSelection = !user.app_role || user.app_role === 'user';
        if (!isAdmin && !isVerifyPage && needsRoleSelection) {
          if (pageKey !== 'roleselection' && pageKey !== 'selectrole') {
            navigate(createPageUrl('RoleSelection'), { replace: true });
            return;
          }
        }
        // F-099 Logic.2: Parent with incomplete onboarding → redirect to onboarding page
        if (!isAdmin && !isVerifyPage && user.app_role === 'parent' && !user.onboarding_complete) {
          if (pageKey !== 'parentonboarding' && pageKey !== 'roleselection' && pageKey !== 'selectrole' && pageKey !== 'bookingsuccess') {
            navigate(createPageUrl('ParentOnboarding'), { replace: true });
            return;
          }
        }
      } catch (e) {
        // Not authenticated or error — let the page handle it
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [location.pathname]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFEFE]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C36239]" />
      </div>
    );
  }

  return (
    <>
      {!checkingAuth && currentUser && (
        <div className="flex justify-end items-center gap-2 p-4 bg-white border-b border-[#E5E2DC] shadow-sm">
          <NotificationBell user={currentUser} />
          <Button variant="ghost" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      )}
      {children}
      <SonnerToaster />
    </>
  );
}