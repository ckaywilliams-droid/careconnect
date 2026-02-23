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
   * CONFIGURATION CHECKLIST
   * What to configure in Base44 Dashboard
   */
  configuration_checklist: [
    {
      task: 'Configure password complexity requirements',
      location: 'Dashboard → App Login and Registration → Password settings',
      requirements: [
        'Minimum length (recommend 8+ characters)',
        'Uppercase letter requirement',
        'Number requirement',
        'Special character requirement'
      ],
      status: 'required'
    },
    {
      task: 'Optional: Customize password reset email',
      location: 'Dashboard → Settings → Email Templates',
      customizations: [
        'Add brand logo',
        'Customize email copy',
        'Add company footer'
      ],
      status: 'optional'
    },
    {
      task: 'Remove PasswordResetToken entity',
      action: 'Delete entities/PasswordResetToken.json if it exists',
      reason: 'Base44 manages password reset tokens internally',
      status: 'required'
    },
    {
      task: 'Verify User entity has NO password_hash field',
      action: 'Check entities/User.json - must NOT contain password_hash',
      reason: 'Base44 manages password_hash internally',
      status: 'critical'
    }
  ]
};
    
/**
 * ============================================================================
 * IMPLEMENTATION SUMMARY
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Code Required):
 * 1. Password hashing with bcrypt (automatic)
 * 2. Password reset flow and token management
 * 3. Reset email generation and delivery
 * 4. Token expiry and single-use enforcement
 * 5. Session invalidation on password reset
 * 6. Rate limiting and email enumeration prevention
 * 
 * BUILD REQUIRED:
 * 1. Configure password complexity in Dashboard → App Login and Registration
 * 2. Optional: Customize password reset email template in Dashboard
 * 3. Remove PasswordResetToken entity from data model (not needed)
 * 4. Verify User entity has NO password_hash field (platform-managed)
 * 
 * ENTITIES TO REMOVE:
 * - entities/PasswordResetToken.json (if exists) - Base44 manages internally
 * 
 * CRITICAL: Do NOT define password_hash in User.json
 * - Base44 manages password_hash internally
 * - Defining it will cause validation error
 * 
 * UI COMPONENTS:
 * - pages/ForgotPassword.js (already exists)
 * - pages/ResetPassword.js (already exists)
 * - components/PasswordComplexityIndicator (already exists)
 */

export default function F026PasswordPolicyDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-026: Password Security Policy</h1>
      <p><strong>Status:</strong> Phase 1 — Platform-Managed</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#dbeafe', borderLeft: '4px solid #3b82f6', marginBottom: '2rem' }}>
        <strong>ℹ️ PLATFORM-MANAGED vs BUILD REQUIRED</strong>
        <p><strong>Platform-Managed (No Build Required):</strong></p>
        <ul>
          <li>Password hashing with bcrypt (automatic)</li>
          <li>Password reset flow and token management</li>
          <li>Reset email generation and delivery</li>
          <li>Token expiry and single-use enforcement</li>
          <li>Session invalidation on password reset</li>
          <li>Rate limiting and email enumeration prevention</li>
        </ul>
        <p><strong>Build Required:</strong></p>
        <ul>
          <li>Configure password complexity in Dashboard</li>
          <li>Optional: Customize reset email template</li>
          <li>Remove PasswordResetToken entity from data model</li>
        </ul>
      </div>
      
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', margin: '1rem 0' }}>
        <strong>⚠️ CRITICAL: Do NOT define password_hash in User.json</strong>
        <p>Base44 manages password_hash internally. Defining it in your User entity schema will cause a validation error.</p>
      </div>
      
      <h2>Configuration Checklist</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', margin: '1rem 0' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Task</th>
            <th>Location</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Configure password complexity</td>
            <td>Dashboard → App Login and Registration</td>
            <td>Required</td>
          </tr>
          <tr>
            <td>Customize reset email (optional)</td>
            <td>Dashboard → Settings → Email Templates</td>
            <td>Optional</td>
          </tr>
          <tr>
            <td>Remove PasswordResetToken entity</td>
            <td>Delete entities/PasswordResetToken.json</td>
            <td>Required</td>
          </tr>
          <tr>
            <td>Verify NO password_hash in User.json</td>
            <td>Check entities/User.json</td>
            <td>Critical</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Password Complexity (Configure in Dashboard)</h2>
      <p>Recommended settings:</p>
      <ul>
        <li>✓ Minimum 8 characters</li>
        <li>✓ At least 1 uppercase letter (A-Z)</li>
        <li>✓ At least 1 lowercase letter (a-z)</li>
        <li>✓ At least 1 number (0-9)</li>
        <li>✓ At least 1 special character (!@#$%^&*)</li>
      </ul>
      
      <h2>Password Reset Flow (Platform-Managed)</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`Step 1: User Requests Reset
User submits email via ForgotPassword page
↓
Base44 checks rate limit
Base44 finds user (or not - same response)

Step 2: Token Generation
Base44 generates secure 64-char token
↓
Base44 hashes token with bcrypt
↓
Base44 stores hashed token (30-min TTL)
↓
Base44 sends reset email with link

Step 3: User Clicks Link
User lands on ResetPassword page
↓
Base44 validates token (not expired, not used)
↓
User sees password reset form

Step 4: User Submits New Password
User submits new password
↓
Base44 validates password complexity
Base44 hashes new password with bcrypt
↓
Base44 updates password
Base44 marks token as used
Base44 invalidates all sessions
Base44 sends confirmation email

Step 5: User Re-Authenticates
All sessions revoked
↓
User logs in with new password`}
      </pre>
      
      <h2>UI Components (Already Built)</h2>
      <ul>
        <li><strong>pages/ForgotPassword.js</strong> - Password reset request page</li>
        <li><strong>pages/ResetPassword.js</strong> - New password submission page</li>
        <li><strong>components/PasswordComplexityIndicator</strong> - Real-time validation feedback</li>
      </ul>
      
      <h2>Security Features (Automatic)</h2>
      <ul>
        <li>Bcrypt password hashing (platform-configured cost factor)</li>
        <li>Secure token generation (256-bit entropy)</li>
        <li>30-minute token expiry</li>
        <li>Single-use tokens</li>
        <li>Session invalidation on password reset</li>
        <li>Rate limiting (prevents abuse)</li>
        <li>Email enumeration prevention</li>
      </ul>
      
      <p><em>See component source code for complete platform password security specification.</em></p>
    </div>
  );
}