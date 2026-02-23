import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * F-026 UI.3: PASSWORD COMPLEXITY INDICATOR
 * 
 * Shows 4 complexity rules with live status as user types.
 * Each rule displays green check (met) or red X (not met).
 * 
 * RULES:
 * - 8+ characters
 * - Uppercase letter
 * - Number
 * - Special character
 * 
 * USAGE:
 * <PasswordComplexityIndicator password={formData.password} />
 */
export default function PasswordComplexityIndicator({ password = '' }) {
  // F-026 Logic.1: Check each complexity rule
  const rules = [
    {
      label: '8+ characters',
      met: password.length >= 8
    },
    {
      label: 'Uppercase letter',
      met: /[A-Z]/.test(password)
    },
    {
      label: 'Number',
      met: /[0-9]/.test(password)
    },
    {
      label: 'Special character',
      met: /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(password)
    }
  ];

  const allMet = rules.every(rule => rule.met);

  return (
    <div className="space-y-2">
      {/* F-026 UI.3: Label */}
      <p className="text-sm font-medium text-gray-700">
        Password must contain:
      </p>

      {/* F-026 UI.3: Rules with live status */}
      <div className="space-y-1">
        {rules.map((rule, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center gap-2 text-sm transition-colors",
              rule.met ? "text-green-700" : "text-gray-500"
            )}
          >
            {/* F-026 UI.3: Green check or red X */}
            {rule.met ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-gray-400" />
            )}
            <span>{rule.label}</span>
          </div>
        ))}
      </div>

      {/* Overall status */}
      {password && (
        <p className={cn(
          "text-xs font-medium pt-1",
          allMet ? "text-green-600" : "text-gray-500"
        )}>
          {allMet ? '✓ Password meets all requirements' : 'Complete all requirements above'}
        </p>
      )}
    </div>
  );
}