import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Mail } from 'lucide-react';

/**
 * F-033 UI.2: LOCKED ACCOUNT BANNER
 * 
 * Yellow info banner shown at top of dashboard for locked users.
 * 
 * FEATURES (F-033 UI.2):
 * - Shows when user.is_locked = true
 * - Sticky at top of page
 * - Generic message (does not reveal lock details)
 * - Support contact link
 * 
 * USAGE:
 * Place in Layout or at top of dashboard pages.
 * Only renders if user is authenticated and locked.
 */
export default function LockedAccountBanner() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        // User not authenticated - banner not needed
        console.log('User not authenticated');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();

    // Poll every 30 seconds to check if lock status changed
    const interval = setInterval(fetchUser, 30000);
    return () => clearInterval(interval);
  }, []);

  // Don't render if loading, not authenticated, or not locked
  if (loading || !user || !user.is_locked) {
    return null;
  }

  // F-033 Edge.1: If suspended, don't show lock banner (suspension takes precedence)
  if (user.is_suspended) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50">
      <Alert className="rounded-none border-l-0 border-r-0 border-t-0 border-b-4 border-amber-500 bg-amber-50">
        <Lock className="h-5 w-5 text-amber-600" />
        <AlertDescription className="text-amber-900">
          <div className="flex items-center justify-between">
            <div>
              <strong className="font-semibold">Your account is under review.</strong>
              {' '}
              Some features are temporarily unavailable. You can view your account but cannot make changes.
            </div>
            <a
              href="mailto:support@example.com"
              className="flex items-center gap-1 text-amber-700 hover:text-amber-900 underline whitespace-nowrap ml-4"
            >
              <Mail className="w-4 h-4" />
              Contact Support
            </a>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}