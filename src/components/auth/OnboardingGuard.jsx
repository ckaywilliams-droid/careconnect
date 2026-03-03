import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Loader2 } from 'lucide-react';

export default function OnboardingGuard({ children, requireOnboarding = true }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (!isAuth) {
          setLoading(false);
          return;
        }
        
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        
        // If onboarding required but not complete, redirect to role selection
        if (requireOnboarding && !currentUser.onboarding_complete) {
          window.location.href = createPageUrl('SelectRole');
          return;
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      }
      setLoading(false);
    };
    
    checkAuth();
  }, [requireOnboarding]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-rose-50">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return children;
}