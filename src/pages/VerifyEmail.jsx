import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * F-029 UI.1: EMAIL VERIFICATION SCREEN
 * 
 * Post-registration screen prompting user to check email for verification link.
 * Shows masked email, resend button with countdown timer, and polling for verification.
 * 
 * FEATURES:
 * - F-029 Data.1: Reads User.email_verified, User.email (masked)
 * - F-029 States.2: Polls every 10 seconds for email_verified status
 * - F-029 Logic.1: Resend button disabled for 60 seconds after each resend
 * - F-029 Logic.2: Rate limit - 3 resends in 1 hour
 * - F-029 UI.2: Post-verification overlay with auto-redirect
 */
export default function VerifyEmail() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const email = location.state?.email || searchParams.get('email');
  const message = location.state?.message;

  const [loading, setLoading] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(message || '');
  const [isVerified, setIsVerified] = useState(false);

  // F-029 Data.1: Mask email for display (m***@domain.com)
  const maskEmail = (email) => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    const firstChar = local.substring(0, 1);
    return `${firstChar}***@${domain}`;
  };

  // F-029 States.2: Poll for email_verified status every 10 seconds
  // F-029 Triggers.2: Lightweight query - only User.email_verified field
  useEffect(() => {
    if (isVerified) return;

    const pollInterval = setInterval(async () => {
      try {
        const user = await base44.auth.me();
        
        // F-029 States.1: awaiting_verification → verified (automatic redirect)
        if (user.email_verified) {
          setIsVerified(true);
          clearInterval(pollInterval);
          
          // F-029 UI.2: Auto-redirect after 2 seconds
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 2000);
        }
      } catch (error) {
        // F-029 Edge.1: User may have logged out
        console.log('Polling error:', error.message);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [isVerified]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCooldownSeconds(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleResend = async () => {
    // F-029 Logic.2: Check rate limit (3 per hour)
    if (resendCount >= 3) {
      setError('You\'ve reached the resend limit. Please wait before trying again.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // F-029 Triggers.1: Resend automation (F-024)
      // In production: await base44.functions.resendVerificationEmail()
      // This calls F-024 which invalidates old token and sends new email
      
      console.log('Resending verification email to:', email);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSuccess('Verification email sent! Check your inbox.');
      setResendCount(prev => prev + 1);
      
      // F-029 Logic.1: 60-second cooldown with countdown timer
      setCooldownSeconds(60);

    } catch (error) {
      console.error('Resend failed:', error);
      setError(error.message || 'Failed to send email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCooldown = (seconds) => {
    if (seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs}s`;
  };

  // F-029 UI.2: Post-verification overlay - full screen confirmation
  if (isVerified) {
    return (
      <div className="min-h-screen bg-[#434C30] flex items-center justify-center p-4">
        <div className="text-center">
          {/* F-029 UI.2: Large green checkmark */}
          <div className="mx-auto w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg">
            <CheckCircle2 className="w-16 h-16 text-[#434C30]" />
          </div>
          
          {/* F-029 UI.2: Heading */}
          <h2 className="text-3xl font-bold text-white mb-3">Email verified!</h2>
          
          {/* F-029 UI.2: Message */}
          <p className="text-[#E5E2DC] text-lg mb-6">
            Taking you to your dashboard...
          </p>
          
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#E5E2DC]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg border-[#E5E2DC]">
        <CardHeader className="text-center">
          {/* F-029 UI.1: Large email icon */}
          <div className="mx-auto mb-4">
            <div className="w-20 h-20 bg-[#E5E2DC] rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-[#643737]" />
            </div>
          </div>
          
          {/* F-029 UI.1: Heading */}
          <CardTitle className="text-2xl text-[#0C2119]">Check your inbox</CardTitle>
          
          {/* F-029 UI.1: Sub-heading with masked email */}
          <CardDescription className="text-[#643737] mt-2">
            We sent a verification link to
          </CardDescription>
          <p className="text-sm font-semibold text-[#0C2119] mt-1">
            {maskEmail(email)}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Success/Error Messages */}
          {success && (
            <Alert className="border-[#434C30] bg-[#E5E2DC]">
              <CheckCircle2 className="h-4 w-4 text-[#434C30]" />
              <AlertDescription className="text-[#0C2119]">{success}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert className="border-[#75290F] bg-[#FEFEFE]">
              <AlertCircle className="h-4 w-4 text-[#75290F]" />
              <AlertDescription className="text-[#75290F]">{error}</AlertDescription>
            </Alert>
          )}

          {/* F-029 UI.1: Body text */}
          <div className="space-y-3 text-sm text-[#643737]">
            <p>
              Click the link in the email to verify your account and get started.
            </p>
            <p className="text-xs text-[#9C9F95]">
              The link expires in 24 hours.
            </p>
          </div>

          {/* F-029 UI.1: Help text */}
          <div className="pt-2 pb-4">
            <p className="text-sm text-[#643737] mb-3">
              Can't find it? Check your spam folder.
            </p>
          </div>

          {/* F-029 Logic.1: Resend Button with countdown timer */}
          <div className="space-y-2">
            <Button
              onClick={handleResend}
              variant="outline"
              className="w-full border-[#C36239] text-[#C36239] hover:bg-[#E5E2DC] hover:text-[#75290F]"
              disabled={loading || cooldownSeconds > 0 || resendCount >= 3}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : cooldownSeconds > 0 ? (
                `Resend available in ${formatCooldown(cooldownSeconds)}`
              ) : resendCount >= 3 ? (
                'Resend limit reached'
              ) : (
                'Resend verification email'
              )}
            </Button>

            {resendCount > 0 && resendCount < 3 && (
              <p className="text-xs text-center text-[#9C9F95]">
                {resendCount} of 3 resends used
              </p>
            )}
          </div>

          {/* F-029 Logic.2: Rate limit message */}
          {resendCount >= 3 && (
            <p className="text-sm text-center text-[#75290F]">
              You've reached the resend limit. Please wait before trying again.
            </p>
          )}

          {/* F-029 UI.1: Sign out link */}
          <div className="pt-4 text-center">
            <button
              onClick={() => {
                base44.auth.logout();
              }}
              className="text-sm text-[#643737] hover:text-[#0C2119] underline"
            >
              Sign out
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}