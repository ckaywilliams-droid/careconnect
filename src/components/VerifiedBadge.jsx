import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * F-034 UI.4: VERIFIED BADGE DISPLAY
 * 
 * Green checkmark badge shown on verified caregiver profiles.
 * 
 * FEATURES (F-034 UI.4):
 * - Green checkmark icon next to name
 * - Tooltip: "Background Verified"
 * - Only shown when is_verified=true
 * - Unverified caregivers show NO badge (not a "not verified" indicator)
 * 
 * USAGE:
 * <VerifiedBadge isVerified={profile.is_verified} />
 * 
 * PROPS:
 * - isVerified: boolean (required)
 * - size?: 'sm' | 'md' | 'lg' (default: 'md')
 */
export default function VerifiedBadge({ isVerified, size = 'md' }) {
  // F-034 UI.4: Unverified caregivers show no badge
  if (!isVerified) {
    return null;
  }

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center">
            <ShieldCheck 
              className={`${sizeClasses[size]} text-green-600 flex-shrink-0`}
              aria-label="Background Verified"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm font-medium">Background Verified</p>
          <p className="text-xs text-gray-300 mt-1">
            This caregiver has completed background verification
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}