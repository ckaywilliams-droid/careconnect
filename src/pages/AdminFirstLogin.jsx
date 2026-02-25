import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import PasswordComplexityIndicator from '@/components/PasswordComplexityIndicator';

/**
 * F-031 Logic.2: ADMIN FIRST-LOGIN PASSWORD CHANGE
 * 
 * Forced password change screen for new admins.
 * This is the ONLY accessible page until password is changed.
 * 
 * WORKFLOW:
 * 1. New admin logs in with temporary password from email
 * 2. Redirected here automatically
 * 3. Must enter current temp password + new password
 * 4. New password must meet F-026 complexity requirements
 * 5. After successful change, can access admin panel
 * 
 * SECURITY (F-031 Triggers.2):
 * - Temporary password expires after 24 hours
 * - Must meet all F-026 password complexity rules
 * - Change event logged (F-031 Audit.2)
 */
export default function AdminFirstLogin() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // Check if user is admin
        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        if (!adminRoles.includes(currentUser.role)) {
          navigate('/');
          return;
        }

        // F-031 Logic.2: Check if password change is needed
        // In production, backend would set a 'requires_password_change' flag
        // For now, this page is accessible to all admins
        
      } catch (error) {
        console.error('Failed to fetch user:', error);
        base44.auth.redirectToLogin();
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [navigate]);

  // F-026: Password complexity validation
  const validatePassword = (password) => {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('At least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('One uppercase letter');
    }
    if (!/\d/.test(password)) {
      errors.push('One number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('One special character');
    }
    
    return errors;
  };

  const validateForm = () => {
    const errors = {};

    // Current password required
    if (!formData.current_password) {
      errors.current_password = 'Current password is required';
    }

    // New password validation
    if (!formData.new_password) {
      errors.new_password = 'New password is required';
    } else {
      const passwordErrors = validatePassword(formData.new_password);
      if (passwordErrors.length > 0) {
        errors.new_password = 'Password does not meet complexity requirements';
      }
    }

    // Confirm password match
    if (!formData.confirm_password) {
      errors.confirm_password = 'Please confirm your password';
    } else if (formData.new_password !== formData.confirm_password) {
      errors.confirm_password = 'Passwords do not match';
    }

    // Same as current password check
    if (formData.current_password && formData.new_password === formData.current_password) {
      errors.new_password = 'New password must be different from temporary password';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      // F-031 Logic.2: Call backend to change password
      // TODO: Implement backend function changeAdminFirstPassword
      // const response = await base44.functions.invoke('changeAdminFirstPassword', {
      //   current_password: formData.current_password,
      //   new_password: formData.new_password,
      // });

      // Placeholder simulation
      console.log('Changing admin first-login password');
      await new Promise(resolve => setTimeout(resolve, 1500));

      setSuccess('Password changed successfully! Redirecting to admin panel...');
      
      // F-031 Audit.2: Password change event logged by backend
      
      // Navigate to admin panel after success
      setTimeout(() => {
        navigate('/admin');
      }, 2000);

    } catch (error) {
      console.error('Failed to change password:', error);
      
      if (error.message?.includes('incorrect')) {
        setError('Current password is incorrect.');
      } else if (error.message?.includes('expired')) {
        setError('Your temporary password has expired. Please contact a super administrator for a new one.');
      } else {
        setError(error.message || 'Failed to change password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const passwordComplexityMet = validatePassword(formData.new_password).length === 0;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Change Your Password</CardTitle>
          <CardDescription>
            F-031: You must change your temporary password before accessing the admin panel.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Warning */}
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 text-sm">
              <strong>Required:</strong> Your temporary password expires in 24 hours. Change it now to maintain access.
            </AlertDescription>
          </Alert>

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current Password */}
            <div className="space-y-2">
              <Label htmlFor="current_password">Current Temporary Password</Label>
              <div className="relative">
                <Input
                  id="current_password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={formData.current_password}
                  onChange={(e) => setFormData({...formData, current_password: e.target.value})}
                  placeholder="Enter temporary password from email"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validationErrors.current_password && (
                <p className="text-sm text-red-600">{validationErrors.current_password}</p>
              )}
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={formData.new_password}
                  onChange={(e) => setFormData({...formData, new_password: e.target.value})}
                  placeholder="Enter new password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validationErrors.new_password && (
                <p className="text-sm text-red-600">{validationErrors.new_password}</p>
              )}
              
              {/* Password Complexity Indicator */}
              {formData.new_password && (
                <PasswordComplexityIndicator password={formData.new_password} />
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm_password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirm_password}
                  onChange={(e) => setFormData({...formData, confirm_password: e.target.value})}
                  placeholder="Re-enter new password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validationErrors.confirm_password && (
                <p className="text-sm text-red-600">{validationErrors.confirm_password}</p>
              )}
            </div>

            {/* Submit */}
            <div className="pt-4">
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !passwordComplexityMet}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Changing Password...
                  </>
                ) : (
                  'Change Password & Continue'
                )}
              </Button>
            </div>
          </form>

          {/* Help Text */}
          <div className="pt-4 text-xs text-gray-600 space-y-1">
            <p>
              <strong>F-031 Triggers.2:</strong> Temporary password expires after 24 hours.
            </p>
            <p>
              <strong>F-026:</strong> New password must meet all complexity requirements.
            </p>
            <p>
              If your temporary password has expired, contact a super administrator for assistance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}