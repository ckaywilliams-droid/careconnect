import React from 'react';

/**
 * F-028 UI.3: PASSWORD STRENGTH INDICATOR
 * 
 * Visual bar below password field. Client-side UX guide only.
 * Strength computed based on length, character variety, common-password check.
 * Does NOT replace server-side complexity enforcement.
 */
export default function PasswordStrengthIndicator({ password }) {
  const getStrength = () => {
    if (!password) return { level: 0, label: '', color: '' };

    let score = 0;
    
    // Length scoring
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    
    // Character variety
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
    
    // Penalize common patterns (basic check)
    const commonPatterns = ['password', '123456', 'qwerty', 'abc123'];
    if (commonPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
      score = Math.max(0, score - 2);
    }

    // Map score to strength level
    if (score <= 2) return { level: 1, label: 'Weak', color: '#75290F' }; // Terracotta
    if (score <= 4) return { level: 2, label: 'Fair', color: '#C36239' }; // Warm orange
    if (score <= 5) return { level: 3, label: 'Strong', color: '#434C30' }; // Dark olive
    return { level: 4, label: 'Very Strong', color: '#434C30' }; // Dark olive
  };

  const strength = getStrength();
  
  if (!password) return null;

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className="h-1 flex-1 rounded-full transition-all"
            style={{
              backgroundColor: level <= strength.level ? strength.color : '#E5E2DC'
            }}
          />
        ))}
      </div>
      <p className="text-xs" style={{ color: strength.color }}>
        Password strength: <span className="font-medium">{strength.label}</span>
      </p>
    </div>
  );
}