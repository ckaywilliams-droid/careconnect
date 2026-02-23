/**
 * F-026: PASSWORD SECURITY POLICY CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * STATUS: Phase 1 — Platform-Managed
 * 
 * ============================================================================
 * PLATFORM-MANAGED vs BUILD REQUIRED
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Build Required):
 * - Password hashing with bcrypt (automatic)
 * - Password reset flow and token management
 * - Reset email generation and delivery
 * - Token expiry and single-use enforcement
 * - Session invalidation on password reset
 * 
 * BUILD REQUIRED:
 * - Configure password complexity in Dashboard → App Login and Registration settings
 * - Optional: Customize password reset email template
 * - Remove PasswordResetToken entity from data model (not needed)
 * 
 * CRITICAL: Do NOT define password_hash field in User.json
 * - Base44 manages password_hash internally
 * - Defining it in your schema will cause validation error
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F026_PASSWORD_POLICY_SPECIFICATION = {
  
  /**
   * PLATFORM PASSWORD MANAGEMENT
   * Base44 handles password hashing and storage automatically
   */
  platform_password_management: {
    
    what_base44_handles: {
      password_hashing: 'Base44 automatically hashes passwords with bcrypt',
      password_storage: 'password_hash managed internally - NOT in your User schema',
      password_verification: 'Base44 verifies passwords during login',
      hash_upgrades: 'Platform handles bcrypt cost factor upgrades',
      
      developer_action: 'None - platform handles password hashing'
    },
    
    critical_warning: {
      do_not_define: 'NEVER define password_hash field in entities/User.json',
      reason: 'Base44 manages password_hash internally',
      error_if_defined: 'Defining password_hash will cause validation error',
      note: 'User entity has no password field in your schema'
    }
  },
  
  /**
   * PASSWORD RESET FLOW
   * Platform-managed
   */
  password_reset_platform: {
    
    what_base44_handles: {
      reset_request: 'User submits email via forgot password page',
      token_generation: 'Base44 generates secure reset token',
      token_storage: 'Base44 stores hashed token internally',
      email_delivery: 'Base44 sends reset email with time-limited link',
      token_validation: 'Base44 validates token when user clicks link',
      password_update: 'Base44 updates password hash',
      session_invalidation: 'Base44 invalidates all active sessions',
      
      developer_action: 'None - platform handles reset flow'
    },
    
    reset_flow: `
      User submits email
      ↓
      Base44 generates reset token
      ↓
      Base44 sends reset email
      ↓
      User clicks link in email
      ↓
      Base44 validates token
      ↓
      User submits new password
      ↓
      Base44 validates complexity
      ↓
      Base44 updates password
      ↓
      Base44 invalidates sessions
      ↓
      User must re-authenticate
    `
  },
  
  /**
   * ENTITY TO REMOVE FROM DATA MODEL
   * Not needed - Base44 manages internally
   */
  entity_to_remove: {
    PasswordResetToken: {
      status: 'REMOVE FROM DATA MODEL',
      reason: 'Base44 manages password reset tokens internally',
      action: 'Delete entities/PasswordResetToken.json if it exists'
    }
  },
  
  /**
   * PASSWORD COMPLEXITY CONFIGURATION
   * Configure in Dashboard settings
   */
  password_complexity: {
    
    configuration_location: 'Dashboard → App Login and Registration → Password settings',
    
    recommended_rules: {
      minimum_length: '8 characters',
      uppercase: 'At least 1 uppercase letter (A-Z)',
      lowercase: 'At least 1 lowercase letter (a-z)',
      number: 'At least 1 number (0-9)',
      special_character: 'At least 1 special character (!@#$%^&*)',
      
      note: 'Configure these rules in Base44 Dashboard - no code required'
    },
    
    enforcement: {
      registration: 'Base44 enforces complexity on user registration',
      password_change: 'Base44 enforces complexity on password change',
      password_reset: 'Base44 enforces complexity on password reset',
      
      client_side: 'Base44 auth SDK provides client-side validation feedback',
      server_side: 'Base44 validates complexity server-side (authoritative)'
    },
    
    error_handling: {
      display: 'Base44 shows all unmet rules simultaneously',
      user_friendly: 'Clear error messages for each unmet requirement',
      real_time: 'Optional real-time validation as user types (SDK feature)'
    }
  },
  
  /**
   * EMAIL CUSTOMIZATION (Optional)
   * Customize password reset email template
   */
  email_customization: {
    
    where_to_configure: 'Dashboard → Settings → Email Templates',
    
    default_template: {
      subject: 'Reset your password',
      body: 'Click the link below to reset your password. This link expires in 30 minutes.',
      includes: 'Reset link with secure token',
      expiry: 'Base44 enforces 30-minute expiry automatically'
    },
    
    customization_options: {
      branding: 'Add your logo and brand colors',
      copy: 'Customize email copy and tone',
      footer: 'Add company information and links',
      
      note: 'Customize in Base44 Dashboard email settings - no code required'
    },
    
    security_built_in: {
      token_security: 'Base44 generates cryptographically random tokens',
      expiry: 'Tokens expire after 30 minutes automatically',
      single_use: 'Tokens can only be used once',
      invalidation: 'New reset request invalidates previous tokens'
    }
  },
  
  /**
   * PLATFORM SECURITY FEATURES
   * Built into Base44 authentication
   */
  platform_security_features: {
    
    bcrypt_hashing: {
      algorithm: 'bcrypt',
      cost_factor: 'Platform-configured (industry standard: 12+)',
      automatic: 'Base44 automatically hashes passwords on registration, change, reset',
      
      security: [
        'Passwords never stored in plaintext',
        'Base44 uses bcrypt with appropriate cost factor',
        'Platform handles hash verification on login',
        'Automatic cost factor upgrades as hardware improves'
      ],
      
      developer_action: 'None - platform handles password hashing'
    },
    
    session_invalidation: {
      on_password_reset: 'Base44 invalidates all active sessions automatically',
      on_password_change: 'Base44 invalidates all active sessions automatically',
      
      security_benefit: 'If attacker resets password, legitimate user is logged out',
      user_impact: 'User must re-authenticate on all devices after password change',
      
      developer_action: 'None - platform handles session invalidation'
    },
    
    rate_limiting: {
      reset_requests: 'Base44 applies rate limiting to password reset requests',
      protection: 'Prevents email enumeration and abuse',
      limit: 'Platform-configured (typically 3-5 requests per email per hour)',
      
      developer_action: 'None - platform handles rate limiting'
    },
    
    email_enumeration_prevention: {
      consistent_response: 'Base44 returns same message whether account exists or not',
      message: 'If an account exists with this email, you will receive a reset link',
      security: 'Prevents attackers from discovering valid email addresses',
      
      developer_action: 'None - platform handles response messaging'
    }
  },
  
  /**
   * CLIENT-SIDE PASSWORD UI
   * Optional: Real-time validation feedback
   */
  client_side_validation: {
    
    password_complexity_indicator: {
      component: 'Use PasswordComplexityIndicator component (already exists)',
      location: 'components/PasswordComplexityIndicator',
      
      features: [
        'Real-time visual feedback as user types',
        'Shows each complexity rule with checkmark or X',
        'Indicates when password meets all requirements',
        'Client-side validation for immediate UX feedback'
      ],
      
      usage: `
        import PasswordComplexityIndicator from '@/components/PasswordComplexityIndicator';
        
        <PasswordComplexityIndicator password={password} />
      `,
      
      note: 'Server-side validation is still authoritative - Base44 validates on submit'
    },
    
    forgot_password_pages: {
      forgot_password: 'pages/ForgotPassword.js (already exists)',
      reset_password: 'pages/ResetPassword.js (already exists)',
      
      integration: [
        'ForgotPassword page submits email to Base44 reset endpoint',
        'Base44 sends reset email with secure token',
        'ResetPassword page validates token and submits new password',
        'Base44 handles all backend logic automatically'
      ],
      
      developer_action: 'Pages already built - no changes needed'
    }
  },
  
  /**
   * FUTURE ENHANCEMENTS (Post-MVP)
   * Additional security features
   */
  future_enhancements: {
    
    password_history: {
      status: 'Post-MVP enhancement',
      feature: 'Prevent reuse of last N passwords (e.g., N=5)',
      
      implementation_approach: [
        'Store bcrypt hashes of last 5 passwords',
        'Check new password against historical hashes on change/reset',
        'Reject if match found',
        'Rotate history (remove oldest when adding 6th)'
      ],
      
      note: 'Not required for MVP - add if compliance demands it'
    },
    
    breached_password_check: {
      status: 'Post-MVP enhancement',
      service: 'Have I Been Pwned Passwords API',
      method: 'k-anonymity model (privacy-preserving)',
      
      how_it_works: [
        'Hash password with SHA-1',
        'Send first 5 chars of hash to HIBP API',
        'API returns matching hash suffixes',
        'Check if full hash in results',
        'Reject if password found in breach database'
      ],
      
      security: 'Privacy-preserving - only hash prefix sent to API',
      note: 'Consider for Phase 2 if additional password security needed'
    },
    
    multi_factor_authentication: {
      status: 'Post-MVP enhancement',
      options: ['TOTP (authenticator apps)', 'SMS codes', 'Email codes'],
      
      implementation: 'Requires MFA entity and backend function integration',
      note: 'Not in scope for Phase 1 - add if required for compliance'
    }
  },
  
  /**
   * ERROR HANDLING (Errors.1-3, Edge.1-3)
   * Validation errors and edge cases
   */
  error_handling: {
    
    non_existent_email: {
      // Errors.1: Password reset for non-existent email
      response: 'If an account exists with this email, you will receive a reset link.',
      consistency: 'SAME response whether account exists or not',
      security: 'Prevents email enumeration attack',
      
      implementation: `
        // Errors.1: Prevent email enumeration
        async function handlePasswordResetRequest(email) {
          const user = await findUserByEmail(email);
          
          if (user) {
            // User exists - send reset email
            await sendResetEmail(user);
          } else {
            // User does NOT exist - same response
            // Do nothing, but return success message
          }
          
          // Errors.1: Same response either way
          return {
            message: 'If an account exists with this email, you will receive a reset link.'
          };
        }
      `
    },
    
    complexity_errors: {
      // Errors.2: Show all unmet rules simultaneously
      requirement: 'Display ALL validation errors at once',
      bad_ux: 'Revealing rules one at a time',
      good_ux: 'Show all requirements with current status',
      
      examples: [
        'Password must be at least 8 characters.',
        'Password must contain at least one uppercase letter.',
        'Password must contain at least one number.',
        'Password must contain at least one special character.'
      ],
      
      implementation: `
        // Errors.2: Collect all complexity errors
        function getPasswordComplexityErrors(password) {
          const errors = [];
          
          if (password.length < 8) {
            errors.push('Password must be at least 8 characters.');
          }
          
          if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter.');
          }
          
          if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number.');
          }
          
          if (!/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(password)) {
            errors.push('Password must contain at least one special character.');
          }
          
          return errors;
        }
        
        // Return all errors at once
        const errors = getPasswordComplexityErrors(password);
        if (errors.length > 0) {
          throw new Error(errors.join(' '));
        }
      `
    },
    
    expired_reset_token: {
      // Errors.3: Expired token message
      message: 'This reset link has expired. Please request a new one.',
      cta: 'Link back to forgot-password page',
      
      ui: `
        <div className="error-container">
          <h2>Link Expired</h2>
          <p>This reset link has expired.</p>
          <Button onClick={() => navigate('/forgot-password')}>
            Request a new reset link
          </Button>
        </div>
      `
    },
    
    token_replay_protection: {
      // Edge.1: Cannot reverse bcrypt hash
      security: 'Token hashed with bcrypt before storage',
      protection: 'Even if database compromised, attacker cannot get raw token',
      brute_force: 'Infeasible for 64-char hex token (256 bits entropy)',
      
      threat_model: `
        Attacker gains read access to database
        ↓
        Sees token_hash: $2b$12$abc...xyz
        ↓
        Cannot reverse bcrypt hash to get raw token
        ↓
        Cannot send reset request (no raw token)
        ↓
        64-char hex = 2^256 possibilities = brute-force infeasible
      `
    },
    
    cost_factor_upgrade: {
      // Edge.2: Progressive hash upgrade
      scenario: 'Bcrypt cost factor increased from 12 to 13',
      old_hashes: 'Remain valid (use cost factor 12)',
      new_hashes: 'Use new cost factor 13',
      upgrade: 'Old hashes upgraded on next successful login',
      
      implementation: `
        // Edge.2: Progressive bcrypt cost factor upgrade
        async function loginUser(email, password) {
          const user = await findUserByEmail(email);
          
          // Verify password
          const valid = await bcrypt.compare(password, user.password_hash);
          
          if (!valid) {
            throw new Error('Invalid credentials');
          }
          
          // Check if hash uses old cost factor
          const currentCost = parseInt(process.env.BCRYPT_COST_FACTOR) || 12;
          const hashCost = bcrypt.getRounds(user.password_hash);
          
          if (hashCost < currentCost) {
            // Upgrade hash on successful login
            const newHash = await bcrypt.hash(password, currentCost);
            await base44.asServiceRole.entities.User.update(user.id, {
              password_hash: newHash
            });
            
            console.info('Password hash upgraded', {
              user_id: user.id,
              old_cost: hashCost,
              new_cost: currentCost
            });
          }
          
          return user;
        }
      `
    },
    
    timing_safe_comparison: {
      // Edge.3: Constant-time token comparison
      requirement: 'Use time-safe comparison for token validation',
      threat: 'Timing attacks could reveal valid token prefixes',
      
      implementation: `
        // Edge.3: Time-safe token comparison
        import crypto from 'crypto';
        
        async function validatePasswordResetToken(rawToken) {
          const tokenRecords = await base44.asServiceRole.entities.PasswordResetToken.filter({
            expires_at: { $gte: new Date().toISOString() },
            used_at: null
          });
          
          // Edge.3: Use bcrypt.compare (inherently constant-time)
          for (const record of tokenRecords) {
            const matches = await bcrypt.compare(rawToken, record.token_hash);
            
            if (matches) {
              return record;
            }
          }
          
          // Token not found or invalid
          throw new Error('TOKEN_INVALID');
        }
        
        // bcrypt.compare is constant-time by design
        // Prevents timing attacks
      `
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-3)
   * Reset requests, password changes, complexity failures
   */
  logging_audit: {
    
    reset_requests: {
      // Audit.1: Log password reset requests
      log_level: 'INFO',
      fields: [
        'email (masked - first 3 chars + domain)',
        'ip_address',
        'timestamp',
        'success (true/false)'
      ],
      
      log_both: 'Success and failure both logged',
      
      implementation: `
        // Audit.1: Log password reset request
        console.info('Password reset requested', {
          email: maskEmail(email),
          ip: req.ip,
          success: userExists,
          timestamp: new Date().toISOString()
        });
      `
    },
    
    password_changes: {
      // Audit.2: Log password change events
      log_level: 'INFO',
      fields: [
        'user_id',
        'method (reset / change)',
        'timestamp'
      ],
      
      never_log: 'New password hash',
      
      implementation: `
        // Audit.2: Log password change
        console.info('Password changed', {
          user_id: userId,
          method: 'reset',  // or 'change' for user-initiated
          timestamp: new Date().toISOString()
          // NEVER log password or password_hash
        });
      `
    },
    
    complexity_failures: {
      // Audit.3: Log failed complexity checks
      purpose: 'Understand UX friction',
      fields: [
        'reason (too_short / missing_number / missing_special)',
        'user_id (if available)',
        'timestamp'
      ],
      
      implementation: `
        // Audit.3: Log complexity validation failures
        function validatePasswordWithLogging(password, userId = null) {
          const errors = getPasswordComplexityErrors(password);
          
          if (errors.length > 0) {
            console.info('Password complexity check failed', {
              reasons: errors,
              user_id: userId,
              timestamp: new Date().toISOString()
            });
            
            throw new Error(errors.join(' '));
          }
        }
      `
    }
  }
};

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 */
export default function F026PasswordPolicyDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-026: Password Security Policy</h1>
      <p><strong>Status:</strong> Phase 1 - Authentication & User Registration</p>
      <p><strong>Priority:</strong> CRITICAL</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', margin: '1rem 0' }}>
        <strong>⚠️ CRITICAL SECURITY REQUIREMENTS</strong>
        <ul>
          <li><strong>Logic.2:</strong> Bcrypt with cost factor ≥12</li>
          <li><strong>Triggers.1:</strong> Hash BEFORE User creation (never store plaintext)</li>
          <li><strong>Triggers.3:</strong> Invalidate all sessions on password reset</li>
          <li><strong>Access.1:</strong> password_hash NEVER returned in API responses</li>
          <li><strong>Edge.3:</strong> Use time-safe comparison (bcrypt.compare)</li>
        </ul>
      </div>
      
      <h2>Password Complexity Rules (Logic.1)</h2>
      <ul>
        <li>✓ Minimum 8 characters</li>
        <li>✓ At least 1 uppercase letter (A-Z)</li>
        <li>✓ At least 1 number (0-9)</li>
        <li>✓ At least 1 special character (!@#$%^&*()_+-=[]{}|;':",./&lt;&gt;?)</li>
      </ul>
      
      <h2>Bcrypt Configuration (Logic.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', margin: '1rem 0' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Parameter</th>
            <th>Value</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Algorithm</td>
            <td>bcrypt</td>
            <td>Industry standard for password hashing</td>
          </tr>
          <tr>
            <td>Cost Factor</td>
            <td>12 (minimum)</td>
            <td>Configurable via BCRYPT_COST_FACTOR env var</td>
          </tr>
          <tr>
            <td>NEVER Use</td>
            <td>MD5, SHA1, SHA256 without salt</td>
            <td>Insecure - vulnerable to rainbow tables</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Password Reset Flow</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`Step 1: User Requests Reset
POST /api/auth/forgot-password
{ email: "user@example.com" }
↓
Check rate limit (3 per hour)
↓
Find user by email (or not - same response)

Step 2: Generate Token
64-char hex token generated (256 bits entropy)
↓
Hash token with bcrypt (cost factor 12)
↓
Store hash in PasswordResetToken (30-min TTL)
↓
Send raw token via email (Data.3)

Step 3: User Clicks Link
GET /reset-password?token={64-char-hex}
↓
Validate token (not expired, not used)
↓
Show reset password form

Step 4: User Submits New Password
POST /api/auth/reset-password
{ token, new_password }
↓
Validate token hash (Edge.3 - time-safe)
Validate password complexity (Logic.1)
Hash new password with bcrypt
↓
Update User.password_hash
Mark token as used
Invalidate all sessions (Triggers.3)
Send confirmation email

Step 5: User Re-Authenticates
All sessions revoked
↓
User must log in with new password`}
      </pre>
      
      <h2>See source code for:</h2>
      <ul>
        <li>Complete entity schema (PasswordResetToken)</li>
        <li>Password complexity validation logic</li>
        <li>Bcrypt hashing implementation</li>
        <li>Reset token generation and validation</li>
        <li>Session invalidation on reset</li>
        <li>Rate limiting (3 per hour)</li>
        <li>Email enumeration prevention</li>
        <li>Timing attack prevention</li>
        <li>Audit logging requirements</li>
      </ul>
    </div>
  );
}