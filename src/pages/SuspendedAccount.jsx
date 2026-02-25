import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Mail, LogOut } from 'lucide-react';

/**
 * F-032 UI.2: SUSPENDED USER BLOCK PAGE
 * 
 * Full-screen block page shown to suspended users on login attempt.
 * 
 * FEATURES (F-032 UI.2):
 * - Full-screen block with clear message
 * - No navigation to other parts of the app
 * - Support contact link
 * - Sign out option
 * - F-032 Access.3: suspension_reason NOT shown to user
 * 
 * ROUTING:
 * This page should be shown when:
 * 1. User attempts to log in (redirect from login if is_suspended=true)
 * 2. User's next API request after suspension (F-032 Data.3)
 */
export default function SuspendedAccount() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // If not suspended, redirect away
        if (!currentUser.is_suspended) {
          window.location.href = '/';
        }
      } catch (error) {
        // If not logged in, redirect to login
        base44.auth.redirectToLogin();
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, []);

  const handleSignOut = () => {
    base44.auth.logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          {/* F-032 UI.2: Red suspended shield icon */}
          <div className="mx-auto mb-4">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-12 h-12 text-red-600" />
            </div>
          </div>
          
          <CardTitle className="text-2xl text-red-900">
            Account Suspended
          </CardTitle>
          <CardDescription className="text-base text-gray-700 mt-2">
            Your account has been suspended and you cannot access the platform at this time.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* F-032 UI.2: Main message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              <strong>What this means:</strong>
            </p>
            <ul className="list-disc list-inside text-sm text-red-700 mt-2 space-y-1">
              <li>You cannot log in or use any platform features</li>
              <li>Your profile is not visible to other users</li>
              <li>All active bookings have been reviewed</li>
            </ul>
          </div>

          {/* F-032 Access.3: suspension_reason NOT shown to user */}
          {/* User only sees generic message */}

          {/* F-032 UI.2: Support contact */}
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-600">
              If you believe this is an error or have questions about your account status, please contact our support team.
            </p>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.location.href = 'mailto:support@example.com'}
            >
              <Mail className="w-4 h-4 mr-2" />
              Contact Support
            </Button>

            {/* F-032 UI.2: Sign out link */}
            <Button
              variant="ghost"
              className="w-full text-gray-600 hover:text-gray-800"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {/* Additional info */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              F-032: Suspension is permanent until manually lifted by an administrator.
              There is no automatic expiry.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}