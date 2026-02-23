import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import PasswordComplexityIndicator from '@/components/PasswordComplexityIndicator';

/**
 * F-026 UI.2: RESET PASSWORD PAGE
 * 
 * Accessed via email link with reset token.
 * Shows new password and confirm password fields with real-time complexity indicator.
 * Submit button disabled until all rules met and passwords match.
 * 
 * FEATURES:
 * - New password field with show/hide toggle
 * - Confirm password field with show/hide toggle
 * - Real-time complexity indicator (green checkmarks per rule)
 * - Submit disabled until valid
 * - Token validation
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [formData, setFormData] = useState({
    new_password: '',
    confirm_password: ''
  });

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  // Validate token on mount
  useEffect(() => {
    if (!token || token.length !== 64) {
      setError('Invalid reset link. Please request a new one.');
    }
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear errors when typing
    if (error) setError('');
    if (name === 'confirm_password' && confirmError) setConfirmError('');
  };

  const handleConfirmBlur = () => {
    // Check password match on blur
    if (formData.confirm_password && formData.confirm_password !== formData.new_password) {
      setConfirmError('Passwords do not match.');
    } else {
      setConfirmError('');
    }
  };

  // Check if all complexity rules are met
  const checkComplexity = (password) => {
    return (
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(password)
    );
  };

  const isFormValid = () => {
    return (
      checkComplexity(formData.new_password) &&
      formData.new_password === formData.confirm_password &&
      !error
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isFormValid()) {
      setError('Please meet all password requirements');
      return;
    }

    setLoading(true);

    try {
      // F-026 Triggers.2: Password reset automation
      // In production, this would call backend function that:
      // 1. Validates token hash (Edge.3 - time-safe comparison)
      // 2. Validates new password complexity (Logic.1)
      // 3. Hashes new password with bcrypt (Logic.2)
      // 4. Updates User.password_hash
      // 5. Sets token.used_at
      // 6. Invalidates all active sessions (Triggers.3)
      // 7. Sends confirmation email
      
      // Placeholder: await base44.functions.resetPassword({ token, new_password })
      console.log('Password reset with token:', token.substring(0, 8) + '...');

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Audit.2: Log password change (server-side)
      console.info('Password reset completed', {
        method: 'reset',
        timestamp: new Date().toISOString()
      });

      // Success - redirect to login with message
      navigate('/login?message=password_reset_success');

    } catch (error) {
      console.error('Password reset failed:', error);

      // F-026 Error handling
      if (error.message?.includes('expired')) {
        // Errors.3: Expired token
        setError('This reset link has expired. Please request a new one.');
      } else if (error.message?.includes('used')) {
        setError('This link has already been used. Please request a new one if needed.');
      } else if (error.message?.includes('invalid')) {
        setError('Invalid reset link. Please request a new one.');
      } else {
        setError(error.message || 'Password reset failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            Choose a new password for your account
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* F-026 UI.2: New password field */}
            <div className="space-y-2">
              <Label htmlFor="new_password">
                New Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="new_password"
                  name="new_password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.new_password}
                  onChange={handleChange}
                  disabled={loading}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* F-026 UI.3: Real-time complexity indicator */}
            <PasswordComplexityIndicator password={formData.new_password} />

            {/* F-026 UI.2: Confirm password field */}
            <div className="space-y-2">
              <Label htmlFor="confirm_password">
                Confirm Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.confirm_password}
                  onChange={handleChange}
                  onBlur={handleConfirmBlur}
                  disabled={loading}
                  required
                  className={confirmError ? 'border-red-500 pr-10' : 'pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmError && (
                <p className="text-sm text-red-500">{confirmError}</p>
              )}
            </div>

            {/* F-026 UI.2: Submit button - disabled until valid */}
            <Button
              type="submit"
              className="w-full"
              disabled={!isFormValid() || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting password...
                </>
              ) : (
                'Reset password'
              )}
            </Button>
          </form>

          {/* Back to forgot password */}
          {error && error.includes('expired') && (
            <div className="mt-4 text-center">
              <Link
                to="/forgot-password"
                className="text-sm text-blue-600 hover:text-blue-700 underline"
              >
                Request a new reset link
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}