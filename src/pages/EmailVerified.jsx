import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

/**
 * F-024 UI.3: EMAIL VERIFICATION SUCCESS LANDING
 * 
 * Brief full-screen confirmation shown after user clicks verification link.
 * Displays success message with auto-redirect to dashboard after 3 seconds.
 * 
 * FEATURES:
 * - Large success checkmark
 * - "Email verified — you're all set." message
 * - "Go to dashboard" button
 * - Auto-redirects after 3 seconds
 */
export default function EmailVerified() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const success = searchParams.get('success');

  // F-024 UI.3: Auto-redirect after 3 seconds
  useEffect(() => {
    if (success === 'true') {
      const timer = setTimeout(() => {
        navigate('/RoleSelection');
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [success, navigate]);

  if (success !== 'true') {
    // Redirect to error page or home if accessed without success parameter
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-10 pb-8">
          {/* F-024 UI.3: Large green checkmark */}
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>

          {/* F-024 UI.3: Success heading */}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Email verified!
          </h1>

          {/* F-024 UI.3: Confirmation message */}
          <p className="text-lg text-gray-600 mb-8">
            You're all set.
          </p>

          {/* F-024 UI.3: Dashboard button */}
          <Button
            onClick={() => navigate('/RoleSelection')}
            className="w-full max-w-xs mx-auto"
            size="lg"
          >
            Go to dashboard
          </Button>

          {/* Auto-redirect indicator */}
          <p className="text-sm text-gray-500 mt-4">
            Redirecting automatically in 3 seconds...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}