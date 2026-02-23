import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';

/**
 * F-026 UI.1: FORGOT PASSWORD PAGE
 * 
 * Single email input field with CAPTCHA.
 * Returns consistent confirmation message regardless of whether email exists.
 * 
 * FEATURES:
 * - Email input field
 * - CAPTCHA integration (F-023)
 * - Submit button
 * - Consistent response (prevents email enumeration)
 * - Rate limiting (3 per hour)
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      // F-026 Abuse.1: Password reset request (rate limited server-side)
      // In production, this would call backend function that:
      // 1. Checks rate limit (3 per hour)
      // 2. Validates CAPTCHA (F-023)
      // 3. Finds user by email (or not)
      // 4. Generates reset token if user exists
      // 5. Sends reset email via Resend
      // 6. Returns same message regardless
      
      // Placeholder: await base44.functions.requestPasswordReset({ email })
      console.log('Password reset requested for:', email);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // F-026 Errors.1: Consistent message regardless of email existence
      setSubmitted(true);

      // Audit.1: Log reset request (server-side)
      console.info('Password reset requested', {
        email: maskEmail(email),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Password reset request failed:', error);
      
      // F-026 Abuse.1: Rate limit error
      if (error.message?.includes('wait')) {
        setError('Please wait before requesting another password reset.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const maskEmail = (email) => {
    const [local, domain] = email.split('@');
    return `${local.substring(0, Math.min(3, local.length))}***@${domain}`;
  };

  // F-026 UI.1: Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              {/* F-026 Errors.1: Consistent message regardless of email existence */}
              If an account exists with this email, you will receive a reset link.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              The reset link will expire in 30 minutes.
            </p>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.location.href = '/login'}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Forgot password?</CardTitle>
          <CardDescription>
            Enter your email and we'll send you a reset link
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* F-026 UI.1: Email input field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>

            {/* F-026 UI.1: CAPTCHA placeholder (F-023) */}
            <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>reCAPTCHA Widget</span>
              </div>
            </div>

            {/* F-026 UI.1: Submit button */}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending reset link...
                </>
              ) : (
                'Send reset link'
              )}
            </Button>
          </form>

          {/* Back to sign in link */}
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm text-blue-600 hover:text-blue-700 underline inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}