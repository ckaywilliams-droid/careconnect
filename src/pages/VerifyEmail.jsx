import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function VerifyEmail() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(location.state?.email || searchParams.get('email') || '');

  // Fallback: fetch email from current user if not passed via navigation
  useEffect(() => {
    if (!email) {
      base44.auth.me().then(user => {
        if (user?.email) setEmail(user.email);
      }).catch(() => {});
    }
  }, []);

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  // Mask email for display
  const maskEmail = (email) => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    return `${local.substring(0, 1)}***@${domain}`;
  };

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (otp.length === 6) {
      handleVerify(otp);
    }
  }, [otp]);

  const handleVerify = async (code) => {
    setLoading(true);
    setError('');
    try {
      await base44.auth.verifyOtp({ email, otpCode: code });
      setIsVerified(true);
      setTimeout(() => {
        window.location.href = '/select-role';
      }, 2000);
    } catch (err) {
      setError(err.message || 'Invalid or expired code. Please try again.');
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCount >= 3) {
      setError("You've reached the resend limit. Please wait before trying again.");
      return;
    }
    setResendLoading(true);
    setError('');
    setSuccess('');
    try {
      await base44.auth.resendOtp(email);
      setSuccess('A new code has been sent. Check your inbox.');
      setResendCount(prev => prev + 1);
      setCooldownSeconds(60);
      setOtp('');
    } catch (err) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const formatCooldown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  // Post-verification overlay
  if (isVerified) {
    return (
      <div className="min-h-screen bg-[#434C30] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg">
            <CheckCircle2 className="w-16 h-16 text-[#434C30]" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">Email verified!</h2>
          <p className="text-[#E5E2DC] text-lg mb-6">Taking you to finish setup...</p>
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#E5E2DC]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg border-[#E5E2DC]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <div className="w-20 h-20 bg-[#E5E2DC] rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-[#643737]" />
            </div>
          </div>
          <CardTitle className="text-2xl text-[#0C2119]">Check your inbox</CardTitle>
          <CardDescription className="text-[#643737] mt-2">
            We sent a 6-digit verification code to
          </CardDescription>
          <p className="text-sm font-semibold text-[#0C2119] mt-1">{maskEmail(email)}</p>
        </CardHeader>

        <CardContent className="space-y-5">
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

          {/* OTP Input */}
          <div className="flex flex-col items-center gap-3">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={setOtp}
              disabled={loading}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>

            <Button
              className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
              onClick={() => handleVerify(otp)}
              disabled={otp.length !== 6 || loading}
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : 'Verify'}
            </Button>
          </div>

          <p className="text-xs text-center text-[#9C9F95]">
            The code expires in 10 minutes. Can't find it? Check your spam folder.
          </p>

          {/* Resend */}
          <div className="space-y-1">
            <Button
              onClick={handleResend}
              variant="outline"
              className="w-full border-[#C36239] text-[#C36239] hover:bg-[#E5E2DC] hover:text-[#75290F]"
              disabled={resendLoading || cooldownSeconds > 0 || resendCount >= 3}
            >
              {resendLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
              ) : cooldownSeconds > 0 ? (
                `Resend available in ${formatCooldown(cooldownSeconds)}`
              ) : resendCount >= 3 ? (
                'Resend limit reached'
              ) : (
                'Resend code'
              )}
            </Button>
            {resendCount > 0 && resendCount < 3 && (
              <p className="text-xs text-center text-[#9C9F95]">{resendCount} of 3 resends used</p>
            )}
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={() => base44.auth.logout()}
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