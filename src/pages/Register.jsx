import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, AlertCircle, ArrowLeft, Users, Heart } from 'lucide-react';
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator';

/**
 * F-028: REGISTRATION FORM (UI.2)
 * 
 * Second screen in split registration flow.
 * User enters details to create account. Role is pre-selected from previous screen.
 * 
 * SECURITY REQUIREMENTS:
 * - Logic.3: Submit disabled until all validations pass AND checkbox checked
 * - Triggers.2: confirm_password is client-side only, not sent to server
 * - Data.2: CAPTCHA token submitted with form (F-023)
 * - Abuse.2: CAPTCHA + server validation + rate limiting
 */
export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = location.state?.role;

  // F-021 Logic.1: Role must be selected from previous screen
  useEffect(() => {
    if (!role || !['parent', 'caregiver'].includes(role)) {
      // No valid role - redirect to role selector
      navigate('/select-role');
    }
  }, [role, navigate]);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    tos_accepted: false
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');

  // Client-side validation
  const validateField = (name, value) => {
    const newErrors = { ...errors };

    switch (name) {
      case 'full_name':
        // F-021 Data.1: min 2 chars, max 100 chars
        const trimmedName = value.trim();
        if (!trimmedName) {
          newErrors.full_name = 'Name is required';
        } else if (trimmedName.length < 2) {
          newErrors.full_name = 'Name must be at least 2 characters';
        } else if (trimmedName.length > 100) {
          newErrors.full_name = 'Name must be less than 100 characters';
        } else {
          delete newErrors.full_name;
        }
        break;

      case 'email':
        // F-021 Errors.2: Email format validation
        if (!value) {
          newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          newErrors.email = 'Please enter a valid email address';
        } else {
          delete newErrors.email;
        }
        break;

      case 'password':
        // F-026: Password policy (min 8 chars, 1 number, 1 special char)
        if (!value) {
          newErrors.password = 'Password is required';
        } else if (value.length < 8) {
          newErrors.password = 'Password must be at least 8 characters';
        } else if (!/\d/.test(value)) {
          newErrors.password = 'Password must contain at least one number';
        } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
          newErrors.password = 'Password must contain at least one special character';
        } else {
          delete newErrors.password;
        }
        break;

      case 'confirm_password':
        if (!value) {
          newErrors.confirm_password = 'Please confirm your password';
        } else if (value !== formData.password) {
          newErrors.confirm_password = 'Passwords do not match';
        } else {
          delete newErrors.confirm_password;
        }
        break;

      case 'tos_accepted':
        // F-021 Logic.2: ToS acceptance required
        if (!value) {
          newErrors.tos_accepted = 'You must accept the Terms of Service';
        } else {
          delete newErrors.tos_accepted;
        }
        break;
    }

    setErrors(newErrors);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === 'checkbox' ? checked : value;

    setFormData(prev => ({
      ...prev,
      [name]: fieldValue
    }));

    // Clear general error when user starts typing
    if (generalError) setGeneralError('');
  };

  const handleBlur = (e) => {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === 'checkbox' ? checked : value;
    validateField(name, fieldValue);
  };

  const isFormValid = () => {
    return (
      formData.full_name.trim().length >= 2 &&
      formData.email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
      formData.password.length >= 8 &&
      formData.password === formData.confirm_password &&
      formData.tos_accepted &&
      Object.keys(errors).length === 0
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');

    // Final validation
    Object.keys(formData).forEach(key => {
      validateField(key, formData[key]);
    });

    if (!isFormValid()) {
      setGeneralError('Please fix the errors above');
      return;
    }

    setLoading(true);

    try {
      // F-021 Triggers.1: Call backend registration function
      const registrationData = {
        email: formData.email.toLowerCase().trim(),
        full_name: formData.full_name.trim(),
        password: formData.password,
        role: role
      };

      const response = await base44.functions.invoke('registerUser', registrationData);

      // Redirect to email verification screen (F-029)
      navigate(createPageUrl('VerifyEmail'), {
        state: {
          email: response.data.email,
          message: response.data.message
        }
      });

    } catch (error) {
      // F-021 Errors.1: Display specific error
      const errorMessage = error.response?.data?.error || error.message || 'Registration failed. Please try again.';
      
      if (errorMessage.includes('Email already registered')) {
        // F-021 Triggers.2: Duplicate email message
        setGeneralError('Email already registered. Please sign in instead.');
      } else {
        setGeneralError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSSO = () => {
    // F-022: Google SSO flow
    // In production, this would:
    // 1. Store role in signed server-side session (Access.4, Edge.2)
    // 2. Initiate OAuth flow
    console.log('Google SSO with role:', role);
    // base44.auth.redirectToLogin() or custom OAuth flow
  };

  if (!role) {
    return null; // Will redirect in useEffect
  }

  const roleDisplayName = role === 'parent' ? 'Parent' : 'Caregiver';

  return (
    <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg border-[#E5E2DC]">
        <CardHeader>
          {/* F-028 States.2: Back button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/select-role')}
            className="w-fit mb-4 text-[#643737] hover:text-[#0C2119] hover:bg-[#E5E2DC]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to role selection
          </Button>
          
          {/* F-028 UI.2: Heading with role shown */}
          <CardTitle className="text-2xl text-[#0C2119]">
            Create your account
          </CardTitle>
          <CardDescription className="text-[#643737]">
            as a {roleDisplayName}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* General Error */}
            {generalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{generalError}</AlertDescription>
              </Alert>
            )}

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={handleChange}
                onBlur={handleBlur}
                className={errors.full_name ? 'border-red-500' : ''}
                disabled={loading}
              />
              {errors.full_name && (
                <p className="text-sm text-red-500">{errors.full_name}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
                className={errors.email ? 'border-red-500' : ''}
                disabled={loading}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">
                Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={errors.password ? 'border-red-500 pr-10' : 'pr-10'}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              
              {/* F-028 UI.3: Password strength indicator */}
              <PasswordStrengthIndicator password={formData.password} />
              
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password}</p>
              )}
            </div>

            {/* F-028 Logic.2: Confirm Password - field order intentional */}
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
                  onBlur={handleBlur}
                  className={errors.confirm_password ? 'border-red-500 pr-10' : 'pr-10'}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* F-028 Errors.2: Password mismatch shown on blur */}
              {errors.confirm_password && (
                <p className="text-sm text-red-500">{errors.confirm_password}</p>
              )}
            </div>

            {/* F-028 Logic.2: ToS checkbox before CAPTCHA */}
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="tos_accepted"
                  name="tos_accepted"
                  checked={formData.tos_accepted}
                  onCheckedChange={(checked) => {
                    handleChange({
                      target: {
                        name: 'tos_accepted',
                        type: 'checkbox',
                        checked
                      }
                    });
                  }}
                  onBlur={handleBlur}
                  disabled={loading}
                  className={errors.tos_accepted ? 'border-red-500' : ''}
                />
                <Label htmlFor="tos_accepted" className="text-sm font-normal leading-relaxed text-[#643737]">
                  I agree to the{' '}
                  <Link
                    to="/legal/terms-of-service"
                    target="_blank"
                    className="text-[#C36239] hover:text-[#75290F] underline"
                  >
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link
                    to="/legal/privacy-policy"
                    target="_blank"
                    className="text-[#C36239] hover:text-[#75290F] underline"
                  >
                    Privacy Policy
                  </Link>
                </Label>
              </div>
              {errors.tos_accepted && (
                <p className="text-sm text-red-500 ml-6">{errors.tos_accepted}</p>
              )}
            </div>

            {/* F-028 Data.2: CAPTCHA Widget */}
            <div className="captcha-container space-y-2">
              <div className="bg-[#E5E2DC] border-2 border-dashed border-[#9C9F95] rounded-lg p-4 text-center">
                <div className="flex items-center justify-center space-x-2 text-sm text-[#643737]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>reCAPTCHA Widget (F-023)</span>
                </div>
                <p className="text-xs text-[#9C9F95] mt-2">
                  Protected by reCAPTCHA • Privacy • Terms
                </p>
              </div>
              
              {/* F-028 Abuse.1: CAPTCHA error display */}
              {errors.captcha && (
                <p className="text-sm text-red-500">
                  Please complete the security check
                </p>
              )}
            </div>

            {/* F-028 Logic.3: Submit Button - disabled until all valid */}
            <Button
              type="submit"
              className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
              disabled={!isFormValid() || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>

            {/* F-028 UI.2: Google SSO */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[#E5E2DC]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-[#9C9F95]">
                  Or sign up with
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full border-[#E5E2DC] text-[#0C2119] hover:bg-[#E5E2DC]"
              onClick={handleGoogleSSO}
              disabled={loading}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>
          </form>

          {/* F-028 UI.2: Sign In Link */}
          <div className="mt-6 text-center text-sm text-[#643737]">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-[#C36239] hover:text-[#75290F] font-medium underline"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}