import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator';

/**
 * Native registration — no role pre-selection.
 * Role is chosen post-auth on /select-role.
 */
export default function Register() {
  const navigate = useNavigate();

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

  // If already authenticated, redirect based on onboarding status
  useEffect(() => {
    (async () => {
      const authenticated = await base44.auth.isAuthenticated();
      if (!authenticated) return;

      const user = await base44.auth.me();
      const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
      if (adminRoles.includes(user.app_role)) {
        navigate('/AdminDashboard', { replace: true });
      } else if (!user.app_role || !user.onboarding_complete) {
        navigate('/RoleSelection', { replace: true });
      } else {
        navigate(user.app_role === 'caregiver' ? '/CaregiverProfile' : '/FindCaregivers', { replace: true });
      }
    })();
  }, []);

  const validateField = (name, value) => {
    const newErrors = { ...errors };

    switch (name) {
      case 'full_name': {
        const trimmedName = value.trim();
        if (!trimmedName) newErrors.full_name = 'Name is required';
        else if (trimmedName.length < 2) newErrors.full_name = 'Name must be at least 2 characters';
        else if (trimmedName.length > 100) newErrors.full_name = 'Name must be less than 100 characters';
        else delete newErrors.full_name;
        break;
      }
      case 'email':
        if (!value) newErrors.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) newErrors.email = 'Please enter a valid email address';
        else delete newErrors.email;
        break;
      case 'password':
        if (!value) newErrors.password = 'Password is required';
        else if (value.length < 8) newErrors.password = 'Password must be at least 8 characters';
        else if (!/\d/.test(value)) newErrors.password = 'Password must contain at least one number';
        else if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) newErrors.password = 'Password must contain at least one special character';
        else delete newErrors.password;
        break;
      case 'confirm_password':
        if (!value) newErrors.confirm_password = 'Please confirm your password';
        else if (value !== formData.password) newErrors.confirm_password = 'Passwords do not match';
        else delete newErrors.confirm_password;
        break;
      case 'tos_accepted':
        if (!value) newErrors.tos_accepted = 'You must accept the Terms of Service';
        else delete newErrors.tos_accepted;
        break;
    }

    setErrors(newErrors);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === 'checkbox' ? checked : value;
    setFormData(prev => ({ ...prev, [name]: fieldValue }));
    if (generalError) setGeneralError('');
  };

  const handleBlur = (e) => {
    const { name, value, type, checked } = e.target;
    validateField(name, type === 'checkbox' ? checked : value);
  };

  const isFormValid = () =>
    formData.full_name.trim().length >= 2 &&
    formData.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
    formData.password.length >= 8 &&
    formData.password === formData.confirm_password &&
    formData.tos_accepted &&
    Object.keys(errors).length === 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');
    Object.keys(formData).forEach(key => validateField(key, formData[key]));
    if (!isFormValid()) { setGeneralError('Please fix the errors above'); return; }

    setLoading(true);
    try {
      await base44.auth.register({
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        full_name: formData.full_name.trim()
      });

      navigate('/VerifyEmail', {
        state: {
          email: formData.email.toLowerCase().trim()
        }
      });
    } catch (error) {
      const msg = error.message || 'Registration failed. Please try again.';
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
        setGeneralError('Email already registered. Please sign in instead.');
      } else {
        setGeneralError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg border-[#E5E2DC]">
        <CardHeader>
          <CardTitle className="text-2xl text-[#0C2119]">Create your account</CardTitle>
          <CardDescription className="text-[#643737]">
            Join CareNest — choose your role after signing up
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {generalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{generalError}</AlertDescription>
              </Alert>
            )}

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name <span className="text-red-500">*</span></Label>
              <Input
                id="full_name" name="full_name" type="text" placeholder="John Doe"
                value={formData.full_name} onChange={handleChange} onBlur={handleBlur}
                className={errors.full_name ? 'border-red-500' : ''} disabled={loading}
              />
              {errors.full_name && <p className="text-sm text-red-500">{errors.full_name}</p>}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
              <Input
                id="email" name="email" type="email" placeholder="you@example.com"
                value={formData.email} onChange={handleChange} onBlur={handleBlur}
                className={errors.email ? 'border-red-500' : ''} disabled={loading}
              />
              {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                  value={formData.password} onChange={handleChange} onBlur={handleBlur}
                  className={errors.password ? 'border-red-500 pr-10' : 'pr-10'} disabled={loading}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthIndicator password={formData.password} />
              {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm Password <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  id="confirm_password" name="confirm_password" type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••"
                  value={formData.confirm_password} onChange={handleChange} onBlur={handleBlur}
                  className={errors.confirm_password ? 'border-red-500 pr-10' : 'pr-10'} disabled={loading}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm_password && <p className="text-sm text-red-500">{errors.confirm_password}</p>}
            </div>

            {/* ToS */}
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="tos_accepted" name="tos_accepted" checked={formData.tos_accepted}
                  onCheckedChange={(checked) => handleChange({ target: { name: 'tos_accepted', type: 'checkbox', checked } })}
                  disabled={loading} className={errors.tos_accepted ? 'border-red-500' : ''}
                />
                <Label htmlFor="tos_accepted" className="text-sm font-normal leading-relaxed text-[#643737]">
                  I agree to the{' '}
                  <Link to="/legal/terms-of-service" target="_blank" className="text-[#C36239] hover:text-[#75290F] underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/legal/privacy-policy" target="_blank" className="text-[#C36239] hover:text-[#75290F] underline">Privacy Policy</Link>
                </Label>
              </div>
              {errors.tos_accepted && <p className="text-sm text-red-500 ml-6">{errors.tos_accepted}</p>}
            </div>

            <Button type="submit" className="w-full bg-[#C36239] hover:bg-[#75290F] text-white" disabled={!isFormValid() || loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</> : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-[#643737]">
            Already have an account?{' '}
            <Link to="/login" className="text-[#C36239] hover:text-[#75290F] font-medium underline">Sign in</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}