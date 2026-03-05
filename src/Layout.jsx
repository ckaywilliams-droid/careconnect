import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

// Pages that never require the onboarding guard
const PUBLIC_PAGES = [
  'register', 'login', 'roleselection', 'selectrole',
  'verifyemail', 'emailverified', 'forgotpassword', 'resetpassword',
  'home', 'findcaregivers', 'publiccaregiverprofile',
  'suspendedaccount', 'adminlogin', 'adminfirstlogin',
  'admindashboard', 'adminusers', 'adminroles', 'admindisputedashboard',
  'moderationqueue', 'submitevidence', 'disputedetail'
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

  const [checking, setChecking] = useState(true);

  const pageKey = (currentPageName || '').toLowerCase().replace(/[^a-z]/g, '');
  const isPublicPage = PUBLIC_PAGES.includes(pageKey);

  useEffect(() => {
    if (isPublicPage) {
      setChecking(false);
      return;
    }

    (async () => {
      try {
        const authenticated = await base44.auth.isAuthenticated();
        if (!authenticated) {
          setChecking(false);
          return;
        }

        const user = await base44.auth.me();

        // F-021B Global Route Guard:
        // If logged in AND (role == null OR onboarding_complete == false)
        // AND not an admin role → redirect to /select-role
        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        const isAdmin = adminRoles.includes(user.app_role);
        // Don't redirect if user is on the email verification page
        const isVerifyPage = pageKey === 'verifyemail' || pageKey === 'emailverified';
        if (!isAdmin && !isVerifyPage && (!user.app_role || !user.onboarding_complete)) {
          if (pageKey !== 'roleselection' && pageKey !== 'selectrole') {
            navigate('/select-role', { replace: true });
            return;
          }
        }
      } catch (e) {
        // Not authenticated or error — let the page handle it
      } finally {
        setChecking(false);
      }
    })();
  }, [location.pathname]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFEFE]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C36239]" />
      </div>
    );
  }

  return <>{children}</>;
}