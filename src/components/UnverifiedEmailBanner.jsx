import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

/**
 * F-029 UI.3: PERSISTENT DASHBOARD BANNER (UNVERIFIED USERS)
 * 
 * Sticky warning bar shown at top of all dashboard pages for unverified users.
 * Includes resend link. Banner disappears automatically when email_verified becomes true.
 * 
 * USAGE:
 * Import and place at top of Layout component.
 * 
 * FEATURES:
 * - F-029 Access.2: Shows for unverified users on all protected pages
 * - F-029 States.2: Polls email_verified status every 10 seconds
 * - F-029 UI.3: Sticky yellow bar with warning icon and resend link
 * - Disappears automatically when verified (no page reload needed)
 */
export default function UnverifiedEmailBanner() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Fetch user and check verification status
  const checkVerificationStatus = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      // If verified, banner should not show
      if (currentUser.email_verified) {
        setLoading(false);
        return;
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial check
  useEffect(() => {
    checkVerificationStatus();
  }, []);

  // F-029 States.2: Poll for verification status every 10 seconds
  useEffect(() => {
    if (!user || user.email_verified) return;

    const pollInterval = setInterval(async () => {
      try {
        const currentUser = await base44.auth.me();
        
        // F-029 UI.3: Banner disappears automatically when verified
        if (currentUser.email_verified) {
          setUser(currentUser);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [user]);

  const handleResend = async () => {
    setResending(true);
    setResendSuccess(false);

    try {
      // F-029 Triggers.1: Resend automation (F-024)
      // In production: await base44.functions.resendVerificationEmail()
      
      console.log('Resending verification email');
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setResendSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => {
        setResendSuccess(false);
      }, 3000);

    } catch (error) {
      console.error('Resend failed:', error);
      alert(error.message || 'Failed to resend email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  // Don't render if:
  // - Still loading
  // - User not found
  // - User is verified
  // - Banner dismissed (temporary)
  if (loading || !user || user.email_verified || dismissed) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50">
      {/* F-029 UI.3: Sticky yellow bar */}
      <Alert className="rounded-none border-x-0 border-t-0 bg-[#C36239] border-[#75290F]">
        <div className="container mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <AlertTriangle className="h-5 w-5 text-white flex-shrink-0" />
              
              <AlertDescription className="text-sm text-white flex-1">
                {/* F-029 UI.3: Warning message */}
                <span className="font-medium">Please verify your email to unlock all features.</span>
                
                {/* Success message */}
                {resendSuccess && (
                  <span className="ml-2 text-[#E5E2DC] font-medium">
                    ✓ Email sent!
                  </span>
                )}
              </AlertDescription>
            </div>

            {/* F-029 UI.3: Resend link */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResend}
              disabled={resending}
              className="text-white hover:text-white hover:bg-[#75290F] flex-shrink-0"
            >
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Resend email'
              )}
            </Button>

            {/* Dismiss button (temporary) */}
            <button
              onClick={() => setDismissed(true)}
              className="text-white hover:text-[#E5E2DC] flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Alert>
    </div>
  );
}