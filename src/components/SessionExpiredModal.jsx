import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

/**
 * F-025 UI.2: SESSION EXPIRED MODAL
 * 
 * Shown when access token expires and refresh fails.
 * Prompts user to sign in again while preserving current page URL
 * for return after re-authentication.
 * 
 * USAGE:
 * Import and conditionally render when session expiry detected.
 * 
 * FEATURES:
 * - Modal overlay blocking interaction
 * - Clear "session expired" message
 * - "Sign in" button redirecting to login
 * - Preserves current URL for return after login
 * - Cannot be dismissed (user must re-authenticate)
 */
export default function SessionExpiredModal({ open, onClose }) {
  const navigate = useNavigate();

  // Prevent background scrolling when modal open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  const handleSignIn = () => {
    // F-025 UI.2: Preserve current page URL for return after login
    const currentPath = window.location.pathname + window.location.search;
    
    // Store return URL in sessionStorage
    sessionStorage.setItem('returnUrl', currentPath);
    
    // Redirect to login
    // In production, this would use base44.auth.redirectToLogin(currentPath)
    navigate(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* F-025 UI.2: Modal content */}
      <DialogContent className="sm:max-w-md" hideCloseButton>
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          
          {/* F-025 UI.2: "Your session has expired" */}
          <DialogTitle className="text-center text-xl">
            Your session has expired
          </DialogTitle>
          
          <DialogDescription className="text-center">
            Please sign in again to continue.
          </DialogDescription>
        </DialogHeader>

        {/* F-025 UI.2: Sign in button */}
        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleSignIn}
            className="w-full sm:w-auto"
            size="lg"
          >
            Sign in
          </Button>
        </DialogFooter>

        {/* Additional info */}
        <p className="text-center text-xs text-gray-500 mt-2">
          You'll return to this page after signing in.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * USAGE EXAMPLE:
 * 
 * import SessionExpiredModal from '@/components/SessionExpiredModal';
 * 
 * function App() {
 *   const [sessionExpired, setSessionExpired] = useState(false);
 * 
 *   // Detect session expiry from API responses
 *   useEffect(() => {
 *     const interceptor = (error) => {
 *       if (error.response?.status === 401 && 
 *           error.response?.data?.code === 'token_expired') {
 *         // Attempt refresh
 *         const refreshed = await refreshAccessToken();
 *         
 *         if (!refreshed) {
 *           // Refresh failed - show modal
 *           setSessionExpired(true);
 *         }
 *       }
 *     };
 *     
 *     // Add to API client
 *   }, []);
 * 
 *   return (
 *     <>
 *       <YourApp />
 *       <SessionExpiredModal 
 *         open={sessionExpired} 
 *         onClose={() => {}} // Cannot dismiss
 *       />
 *     </>
 *   );
 * }
 */