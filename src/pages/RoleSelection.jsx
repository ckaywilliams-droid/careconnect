import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Heart, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * F-021B: POST-AUTH ONBOARDING — ROLE SELECTION
 *
 * Shown to authenticated users who have not yet completed onboarding
 * (app_role == null OR onboarding_complete == false).
 *
 * On submission: calls initializeRole which atomically:
 *   1. Sets User.app_role
 *   2. Creates the corresponding Profile record
 *   3. Sets User.onboarding_complete = true
 *
 * On failure: user stays in registered_uninitialized state and can retry.
 */
export default function RoleSelection() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingRole, setLoadingRole] = useState(null);
  const [error, setError] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [pendingRole, setPendingRole] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];

  useEffect(() => {
    (async () => {
      try {
        const user = await base44.auth.me();
        if (!user) {
          base44.auth.redirectToLogin();
          return;
        }
        // Already onboarded — redirect to appropriate page
        if (user.onboarding_complete && user.app_role) {
          if (adminRoles.includes(user.app_role)) {
            navigate(createPageUrl('AdminDashboard'), { replace: true });
          } else if (user.app_role === 'caregiver') {
            navigate(createPageUrl('CaregiverProfile'), { replace: true });
          } else {
            navigate(createPageUrl('ParentBookings'), { replace: true });
          }
          return;
        }
        setInitialized(true);
      } catch {
        base44.auth.redirectToLogin();
      }
    })();
  }, []);

  const selectRole = async (role) => {
    if (!tosAccepted) {
      setPendingRole(role);
      return;
    }

    setLoadingRole(role);
    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('initializeRole', { role, display_name: displayName });
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      if (response.data?.already_complete) {
        navigate(role === 'caregiver' ? createPageUrl('CaregiverProfile') : createPageUrl('ParentBookings'), { replace: true });
        return;
      }
      // Refresh the auth session so the updated app_role + onboarding_complete
      // are reflected in base44.auth.me() before the Layout guard runs.
      await base44.auth.me();
      navigate(role === 'caregiver' ? createPageUrl('CaregiverProfile') : createPageUrl('FindCaregivers'), { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingRole(null);
    }
  };

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#C36239]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center p-4">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[#0C2119] mb-3">
            Join as a...
          </h1>
          <p className="text-lg text-[#643737]">
            Almost there! Choose your role to complete setup.
          </p>
        </div>

        {/* Name Input */}
        <div className="max-w-md mx-auto mb-8">
          <label className="block text-sm font-medium text-[#0C2119] mb-2">
            Full Name
          </label>
          <Input
            type="text"
            placeholder="Enter your full name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="border-[#E5E2DC] text-[#0C2119]"
          />
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* ToS acceptance */}
        <div className="max-w-md mx-auto mb-8 bg-white border border-[#E5E2DC] rounded-xl p-4 flex items-start gap-3">
            <Checkbox
              id="tos"
              checked={tosAccepted}
              onCheckedChange={setTosAccepted}
              className="mt-0.5"
            />
            <Label htmlFor="tos" className="text-sm text-[#643737] font-normal leading-relaxed cursor-pointer">
              I agree to the{' '}
              <Link to="/legal/terms-of-service" target="_blank" className="text-[#C36239] underline hover:text-[#75290F]">
                Terms of Service
              </Link>{' '}and{' '}
              <Link to="/legal/privacy-policy" target="_blank" className="text-[#C36239] underline hover:text-[#75290F]">
                Privacy Policy
              </Link>
            </Label>
          </div>

        {!tosAccepted && pendingRole && (
          <div className="max-w-md mx-auto mb-4">
            <Alert className="border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Please accept the Terms of Service above before continuing.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* Parent Card */}
          <Card
            className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 hover:border-[#C36239] bg-white"
            onClick={() => !loading && tosAccepted && displayName && selectRole('parent')}
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-[#E5E2DC] flex items-center justify-center">
                <Users className="w-10 h-10 text-[#643737]" />
              </div>
              <CardTitle className="text-2xl mb-2 text-[#0C2119]">Parent / Guardian</CardTitle>
              <CardDescription className="text-base text-[#643737]">
                Find trusted babysitters near you
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button
                size="lg"
                className="w-full bg-[#C36239] hover:bg-[#75290F] text-white disabled:opacity-50"
                disabled={loading || !tosAccepted || !displayName}
                onClick={(e) => { e.stopPropagation(); selectRole('parent'); }}
              >
                {loadingRole === 'parent' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get started'}
              </Button>
            </CardContent>
          </Card>

          {/* Caregiver Card */}
          <Card
            className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 hover:border-[#C36239] bg-white"
            onClick={() => !loading && tosAccepted && displayName && selectRole('caregiver')}
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-[#E5E2DC] flex items-center justify-center">
                <Heart className="w-10 h-10 text-[#643737]" />
              </div>
              <CardTitle className="text-2xl mb-2 text-[#0C2119]">Babysitter / Caregiver</CardTitle>
              <CardDescription className="text-base text-[#643737]">
                Offer your childcare services
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button
                size="lg"
                className="w-full bg-[#C36239] hover:bg-[#75290F] text-white disabled:opacity-50"
                disabled={loading || !tosAccepted || !displayName}
                onClick={(e) => { e.stopPropagation(); selectRole('caregiver'); }}
              >
                {loadingRole === 'caregiver' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get started'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8 text-sm text-[#643737]">
          <button
            onClick={() => base44.auth.logout()}
            className="text-[#9C9F95] hover:text-[#643737] underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}