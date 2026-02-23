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
   * ACCESS CONTROL & PERMISSIONS (Access.1-3)
   * Password field security and reset endpoint
   */
  access_control: {
    
    password_hash_exclusion: {
      // Access.1: password_hash NEVER returned
      rule: 'Excluded from ALL API responses and query results',
      applies_to: 'All roles - even admins',
      
      enforcement: 'Platform-level field exclusion',
      
      implementation: `
        // Access.1: Exclude password_hash from responses
        // Platform configuration - never return this field
        
        // Example query result (password_hash excluded):
        {
          "id": "user-123",
          "email": "user@example.com",
          "full_name": "John Doe",
          "role": "parent",
          // password_hash NOT included
        }
      `
    },
    
    reset_token_write_access: {
      // Access.2: PasswordResetToken writable by automations only
      restriction: 'Server-side automations only',
      no_client_writes: 'NEVER allow direct client creation',
      
      who_can_create: [
        'Password reset request automation',
        'Token cleanup automation'
      ]
    },
    
    reset_endpoint: {
      // Access.3: Public password reset endpoint
      accessibility: 'No authentication required',
      reason: 'User cannot log in (forgot password)',
      validation: 'Validates token hash only',
      
      endpoint: '/api/auth/reset-password',
      method: 'POST',
      payload: { token: '64-char-hex', new_password: 'string' }
    }
  },
  
  /**
   * STATE MACHINE & LIFECYCLE (States.1-2)
   * Reset token lifecycle
   */
  state_machine: {
    
    reset_lifecycle: {
      // States.1: Password reset states
      states: {
        reset_requested: {
          condition: 'Token issued, email sent',
          valid_for: '30 minutes',
          user_action: 'Click link in email'
        },
        reset_completed: {
          condition: 'Token used, password updated, token.used_at set',
          terminal: true,
          sessions: 'All active sessions invalidated (Triggers.3)'
        },
        expired: {
          condition: 'expires_at passed, token never used',
          user_action: 'Request new reset link',
          cleanup: 'Token can be deleted from database'
        }
      },
      
      state_diagram: `
        Forgot Password Form
        ↓
        RESET_REQUESTED
        (Token created, email sent, 30-min TTL)
        ↓
        User clicks link in email
        ↓
        Token validated
        ↓
        User sets new password
        ↓
        RESET_COMPLETED
        (Password updated, sessions invalidated)
        
        OR
        
        30 minutes pass without click
        ↓
        EXPIRED
        (User must request new link)
      `
    },
    
    token_invalidation: {
      // States.2: Second reset invalidates first
      behavior: 'New reset request invalidates previous tokens',
      only_latest_valid: 'Only most recent token is valid',
      
      implementation: `
        // States.2: Invalidate previous reset tokens
        async function createPasswordResetToken(userId) {
          // Invalidate all previous unused tokens
          await base44.asServiceRole.entities.PasswordResetToken.update_many(
            { 
              user_id: userId, 
              used_at: null  // Only invalidate unused tokens
            },
            { 
              expires_at: new Date()  // Expire immediately
            }
          );
          
          // Generate and store new token
          const rawToken = await generatePasswordResetToken(userId);
          
          return rawToken;
        }
      `
    }
  },
  
  /**
   * BUSINESS LOGIC & CROSS-ENTITY RULES (Logic.1-3)
   * Password complexity and hashing
   */
  business_logic: {
    
    complexity_rules: {
      // Logic.1: Password complexity requirements
      enforcement: 'Server-side validation (registration, password change, reset)',
      rules: [
        'Minimum 8 characters',
        'At least 1 uppercase letter (A-Z)',
        'At least 1 number (0-9)',
        'At least 1 special character (!@#$%^&*()_+-=[]{}|;\':",./<>?)'
      ],
      
      validation: `
        // Logic.1: Validate password complexity
        function validatePasswordComplexity(password) {
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
          
          if (errors.length > 0) {
            // Errors.2: Show all unmet rules simultaneously
            throw new Error(errors.join(' '));
          }
          
          return true;
        }
      `
    },
    
    password_hashing: {
      // Logic.2: Bcrypt hashing requirements
      algorithm: 'bcrypt',
      cost_factor: 12,
      configurable: 'Via environment variable (BCRYPT_COST_FACTOR)',
      
      never_use: ['MD5', 'SHA1', 'SHA256 without salt'],
      
      implementation: `
        // Logic.2: Hash password with bcrypt
        import bcrypt from 'bcrypt';
        
        async function hashPassword(plainPassword) {
          const costFactor = parseInt(process.env.BCRYPT_COST_FACTOR) || 12;
          
          // Hash with bcrypt
          const hash = await bcrypt.hash(plainPassword, costFactor);
          
          return hash;
        }
        
        async function verifyPassword(plainPassword, hash) {
          return await bcrypt.compare(plainPassword, hash);
        }
      `,
      
      cost_factor_guidance: {
        current: 12,
        future: 'Increase as hardware improves (e.g., 13, 14)',
        impact: 'Higher cost = slower hashing = better security',
        tradeoff: 'Balance security vs login latency'
      }
    },
    
    password_history: {
      // Logic.3: Password history NOT enforced at MVP
      mvp_status: 'Not implemented',
      post_mvp: 'Cannot reuse last N passwords (e.g., N=5)',
      
      future_implementation: 'Store hashes of last 5 passwords, check on reset/change'
    }
  },
  
  /**
   * EVENT TRIGGERS & AUTOMATION (Triggers.1-3)
   * Registration hashing, reset flow, session invalidation
   */
  event_triggers: {
    
    registration_hashing: {
      // Triggers.1: Hash password on registration
      timing: 'BEFORE User record creation',
      guarantee: 'Plaintext password NEVER touches database or logs',
      
      implementation: `
        // Triggers.1: Registration with password hashing
        async function registerUser(formData) {
          // Validate complexity
          validatePasswordComplexity(formData.password);
          
          // Triggers.1: Hash password BEFORE creating User
          const passwordHash = await hashPassword(formData.password);
          
          // Create User with hash (plaintext never stored)
          const user = await base44.asServiceRole.entities.User.create({
            email: formData.email.toLowerCase(),
            full_name: formData.full_name,
            role: formData.role,
            password_hash: passwordHash  // Hashed
          });
          
          // plaintext formData.password discarded (garbage collected)
          // Never logged, never persisted
          
          return user;
        }
      `
    },
    
    password_reset_automation: {
      // Triggers.2: Complete password reset sequence
      steps: [
        '1. Validate token hash',
        '2. Validate new password complexity',
        '3. Hash new password',
        '4. Update User.password_hash',
        '5. Set token.used_at',
        '6. Invalidate all active sessions',
        '7. Send confirmation email'
      ],
      
      atomic: 'All steps must complete or rollback',
      
      full_implementation: `
        // Triggers.2: Password reset automation
        async function resetPassword(resetToken, newPassword) {
          // Step 1: Validate token
          const tokenRecord = await validatePasswordResetToken(resetToken);
          
          // Step 2: Validate new password complexity
          validatePasswordComplexity(newPassword);
          
          // Step 3: Hash new password
          const newPasswordHash = await hashPassword(newPassword);
          
          // Step 4: Update User.password_hash
          await base44.asServiceRole.entities.User.update(tokenRecord.user_id, {
            password_hash: newPasswordHash
          });
          
          // Step 5: Mark token as used
          await base44.asServiceRole.entities.PasswordResetToken.update(tokenRecord.id, {
            used_at: new Date().toISOString()
          });
          
          // Step 6: Invalidate all active sessions (Triggers.3)
          await base44.asServiceRole.entities.RefreshToken.update_many(
            { user_id: tokenRecord.user_id, revoked_at: null },
            { revoked_at: new Date().toISOString() }
          );
          
          // Optional: Blacklist active access tokens for immediate effect
          // (Requires tracking active JTIs)
          
          // Step 7: Send confirmation email
          const user = await base44.asServiceRole.entities.User.read(tokenRecord.user_id);
          await sendPasswordChangedEmail(user.email);
          
          // Audit.2: Log password change
          console.info('Password reset completed', {
            user_id: tokenRecord.user_id,
            method: 'reset',
            timestamp: new Date().toISOString()
          });
          
          return { success: true };
        }
      `
    },
    
    session_invalidation: {
      // Triggers.3: Mandatory session invalidation on reset
      requirement: 'All active sessions MUST be invalidated on password reset',
      security_rationale: 'If attacker reset password, legitimate user sessions revoked',
      detection: 'Legitimate user experiences unexpected logout',
      
      implementation: `
        // Triggers.3: Invalidate sessions on password reset
        async function invalidateAllSessions(userId) {
          // Revoke all refresh tokens
          await base44.asServiceRole.entities.RefreshToken.update_many(
            { user_id: userId, revoked_at: null },
            { revoked_at: new Date().toISOString() }
          );
          
          // Audit.2: Log session revocation
          console.info('All sessions invalidated', {
            user_id: userId,
            reason: 'password_reset',
            timestamp: new Date().toISOString()
          });
        }
      `,
      
      user_impact: 'User logged out on all devices - must re-authenticate',
      security_benefit: 'Attacker cannot maintain access after password reset'
    }
  },
  
  /**
   * ABUSE PREVENTION & RATE LIMITS (Abuse.1-2)
   * Reset request limiting and breached password checking
   */
  abuse_prevention: {
    
    reset_rate_limit: {
      // Abuse.1: Max 3 reset requests per email per hour
      limit: '3 requests per email per hour',
      message: 'Please wait before requesting another password reset.',
      no_email_disclosure: 'Do NOT reveal whether email exists',
      
      implementation: `
        // Abuse.1: Password reset rate limiting
        const resetAttempts = new Map(); // email → { count, resetTime }
        
        async function checkResetRateLimit(email) {
          const now = Date.now();
          const emailAttempts = resetAttempts.get(email);
          
          // Reset if hour has passed
          if (!emailAttempts || now > emailAttempts.resetTime) {
            resetAttempts.set(email, {
              count: 0,
              resetTime: now + 60 * 60 * 1000  // 1 hour
            });
            return true;
          }
          
          // Check limit
          if (emailAttempts.count >= 3) {
            // Errors.1: Do NOT reveal if email exists
            throw new Error(
              'Please wait before requesting another password reset.'
            );
          }
          
          // Increment count
          emailAttempts.count++;
          return true;
        }
        
        async function requestPasswordReset(email) {
          // Check rate limit
          await checkResetRateLimit(email);
          
          // Find user (or not - same response either way)
          const users = await base44.asServiceRole.entities.User.filter({
            email: email.toLowerCase()
          });
          
          if (users.length > 0) {
            // User exists - send reset email
            const token = await createPasswordResetToken(users[0].id);
            await sendPasswordResetEmail(users[0], token);
          }
          
          // Errors.1: Same response regardless
          return {
            message: 'If an account exists with this email, you will receive a reset link.'
          };
        }
      `
    },
    
    breached_password_check: {
      // Abuse.2: Have I Been Pwned integration (post-MVP)
      status: 'Flag for post-MVP if not implemented at launch',
      service: 'Have I Been Pwned Passwords API',
      method: 'k-anonymity model (privacy-preserving)',
      
      how_it_works: [
        '1. Hash password with SHA-1',
        '2. Take first 5 chars of hash (prefix)',
        '3. Send prefix to HIBP API',
        '4. API returns all hash suffixes matching prefix',
        '5. Check if full hash exists in returned list',
        '6. If found: reject password as breached'
      ],
      
      implementation: `
        // Abuse.2: Check if password is breached (post-MVP)
        import crypto from 'crypto';
        
        async function isPasswordBreached(password) {
          // Hash with SHA-1
          const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
          
          // k-anonymity: send only first 5 chars
          const prefix = hash.substring(0, 5);
          const suffix = hash.substring(5);
          
          // Query HIBP API
          const response = await fetch(\`https://api.pwnedpasswords.com/range/\${prefix}\`);
          const text = await response.text();
          
          // Check if full hash in results
          const breached = text.split('\\n').some(line => {
            const [hashSuffix] = line.split(':');
            return hashSuffix === suffix;
          });
          
          if (breached) {
            throw new Error(
              'This password has been found in a data breach. ' +
              'Please choose a different password.'
            );
          }
          
          return false;
        }
      `
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