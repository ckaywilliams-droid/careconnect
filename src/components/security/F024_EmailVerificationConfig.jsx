/**
 * F-024: EMAIL VERIFICATION FLOW CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * Documents Base44 platform configuration for email verification via Resend.
 * Implements secure token-based email verification with single-use tokens,
 * resend rate limiting, and verification gates for critical features.
 * 
 * STATUS: Phase 1 - Authentication & User Registration
 * DEPENDENCIES: User entity, Resend integration, F-021 registration flow
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F024_EMAIL_VERIFICATION_SPECIFICATION = {
  
  /**
   * DATA MODEL & CONSTRAINTS (Data.1-3)
   * User entity field and token collection
   */
  data_model: {
    
    user_entity_field: {
      // Data.1: email_verified field on User entity
      field_name: 'email_verified',
      type: 'Boolean',
      default: false,
      description: 'Whether user has verified their email address',
      
      set_to_true_on: [
        'Email verification token clicked and validated',
        'Google SSO registration (F-022 - Google verifies email)'
      ],
      
      usage: [
        'Logic.1: Gate for caregiver profile publishing',
        'Logic.2: Gate for parent booking requests',
        'UI.2: Controls dashboard banner visibility'
      ]
    },
    
    token_entity: {
      // Data.2: EmailVerificationToken collection
      entity_name: 'EmailVerificationToken',
      fields: {
        id: 'UUID (auto-generated)',
        user_id: 'Relation to User (required)',
        token: 'Text, unique - 64-char hex string (256 bits entropy)',
        expires_at: 'DateTime, required - now + 24 hours',
        used_at: 'DateTime, nullable - set when token clicked',
        created_at: 'DateTime, auto-generated'
      },
      
      token_generation: `
        // Data.2, Edge.2: Generate 64-char hex token (256 bits entropy)
        import crypto from 'crypto';
        
        function generateVerificationToken() {
          // 64 hex chars = 32 bytes = 256 bits
          const token = crypto.randomBytes(32).toString('hex');
          return token;
        }
        
        // Edge.2: NEVER reduce token length below 64 chars
        // 256 bits of entropy makes guessing computationally infeasible
      `
    },
    
    single_use_constraint: {
      // Data.3: Tokens are single-use
      enforcement: 'Once used_at is set, token cannot be reused',
      validation: 'Check both expires_at AND used_at before accepting token',
      
      validation_logic: `
        // Data.3: Single-use token validation
        async function validateToken(token) {
          const tokenRecord = await base44.asServiceRole.entities.EmailVerificationToken.filter({
            token: token
          });
          
          if (tokenRecord.length === 0) {
            // Errors.3: Token not found
            throw new Error('INVALID_TOKEN');
          }
          
          const now = new Date();
          
          // Check if already used (Data.3)
          if (tokenRecord[0].used_at) {
            // Errors.2: Already used
            throw new Error('TOKEN_ALREADY_USED');
          }
          
          // Check if expired
          if (new Date(tokenRecord[0].expires_at) < now) {
            // Errors.1: Expired
            throw new Error('TOKEN_EXPIRED');
          }
          
          return tokenRecord[0];
        }
      `
    }
  },
  
  /**
   * ACCESS CONTROL & PERMISSIONS (Access.1-3)
   * Token creation, exposure, and verification endpoint
   */
  access_control: {
    
    token_creation: {
      // Access.1: Writable only by server-side automations
      restriction: 'EmailVerificationToken writable only by server-side code',
      no_client_writes: 'NEVER allow direct client action to create tokens',
      
      who_can_create: [
        'Registration automation (Triggers.1)',
        'Resend automation',
        'Email change automation (post-MVP)'
      ],
      
      implementation: `
        // Access.1: Server-side token creation only
        // Backend function or automation
        async function createVerificationToken(userId) {
          const token = generateVerificationToken();
          
          // States.2: Invalidate previous tokens
          await base44.asServiceRole.entities.EmailVerificationToken.update_many(
            { user_id: userId, used_at: null },
            { expires_at: new Date() }  // Mark as expired
          );
          
          // Create new token
          const tokenRecord = await base44.asServiceRole.entities.EmailVerificationToken.create({
            user_id: userId,
            token: token,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),  // 24 hours
            used_at: null
          });
          
          return token;  // Return plaintext token (to send in email)
        }
      `
    },
    
    token_exposure: {
      // Access.2: Token value security
      rules: [
        'NEVER log token value (log token prefix only - first 8 chars)',
        'NEVER expose token in API responses',
        'Only deliver token to user via email',
        'Token appears only in verification URL'
      ],
      
      audit_logging: `
        // Access.2: Log token prefix only (Audit.2)
        console.info('Verification email sent', {
          user_id: user.id,
          email: maskEmail(user.email),  // first 3 chars + domain
          token_prefix: token.substring(0, 8),  // First 8 chars only
          timestamp: new Date().toISOString()
        });
      `
    },
    
    verification_endpoint: {
      // Access.3: Public endpoint
      accessibility: 'No authentication required',
      reason: 'User may not be logged in when clicking email link',
      validation: 'Validates token only, no session required',
      
      endpoint: '/verify-email?token={64-char-hex}',
      method: 'GET',
      
      implementation: `
        // Access.3: Public verification endpoint
        // No auth required - user may be logged out
        app.get('/verify-email', async (req, res) => {
          const { token } = req.query;
          
          if (!token) {
            return res.redirect('/verify-email-error?error=missing');
          }
          
          try {
            // Triggers.3: Validate and mark as used
            const tokenRecord = await validateToken(token);
            
            // Set email_verified = true
            await base44.asServiceRole.entities.User.update(tokenRecord.user_id, {
              email_verified: true
            });
            
            // Mark token as used
            await base44.asServiceRole.entities.EmailVerificationToken.update(tokenRecord.id, {
              used_at: new Date()
            });
            
            // Audit.2: Log successful verification
            console.info('Email verified', {
              user_id: tokenRecord.user_id,
              timestamp: new Date().toISOString()
            });
            
            // Redirect to success page
            res.redirect('/email-verified?success=true');
            
          } catch (error) {
            // Audit.2: Log failed attempt
            console.warn('Email verification failed', {
              token_prefix: token.substring(0, 8),
              ip: req.ip,
              error: error.message,
              timestamp: new Date().toISOString()
            });
            
            res.redirect(\`/verify-email-error?error=\${error.message}\`);
          }
        });
      `
    }
  },
  
  /**
   * STATE MACHINE & LIFECYCLE (States.1-3)
   * Verification states and token lifecycle
   */
  state_machine: {
    
    verification_lifecycle: {
      // States.1: User email verification states
      states: {
        unverified: {
          condition: 'email_verified = false, token issued',
          user_can: ['Login', 'View dashboard', 'Request resend'],
          user_cannot: ['Publish caregiver profile', 'Create booking request']
        },
        verified: {
          condition: 'email_verified = true, token.used_at set',
          terminal: true,
          description: 'Cannot be unverified (except for email change - post-MVP)'
        }
      },
      
      state_diagram: `
        Registration
        ↓
        User Created (email_verified = false)
        ↓
        Token Issued + Verification Email Sent
        ↓
        [User clicks link in email]
        ↓
        Token Validated
        ↓
        email_verified = true
        ↓
        Token.used_at = now
        ↓
        VERIFIED (terminal state)
      `
    },
    
    resend_lifecycle: {
      // States.2: Token resend invalidation
      behavior: 'New token request invalidates all previous unused tokens',
      only_latest_valid: 'Only the most recent token is valid',
      
      implementation: `
        // States.2: Resend token lifecycle
        async function resendVerificationEmail(userId) {
          // Invalidate all previous unused tokens for this user
          await base44.asServiceRole.entities.EmailVerificationToken.update_many(
            { 
              user_id: userId, 
              used_at: null  // Only invalidate unused tokens
            },
            { 
              expires_at: new Date()  // Mark as expired immediately
            }
          );
          
          // Create new token
          const newToken = await createVerificationToken(userId);
          
          // Send email with new token
          await sendVerificationEmail(userId, newToken);
          
          // Edge.3: Old links stop working after resend
          console.info('Previous tokens invalidated on resend', {
            user_id: userId
          });
        }
      `
    },
    
    abandoned_accounts_cleanup: {
      // States.3: Soft-delete unverified accounts after 48 hours
      trigger: 'Scheduled automation (runs daily)',
      condition: 'email_verified = false AND created_at > 48 hours ago',
      action: 'Soft-delete User record (is_deleted = true)',
      
      implementation: `
        // States.3: Cleanup abandoned unverified accounts
        async function cleanupAbandonedAccounts() {
          const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
          
          const abandonedUsers = await base44.asServiceRole.entities.User.filter({
            email_verified: false,
            created_at: { $lt: fortyEightHoursAgo.toISOString() },
            is_deleted: false
          });
          
          for (const user of abandonedUsers) {
            // F-017: Soft delete
            await base44.asServiceRole.entities.User.update(user.id, {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deletion_reason: 'Email not verified within 48 hours'
            });
            
            console.info('Abandoned unverified account soft-deleted', {
              user_id: user.id,
              created_at: user.created_at
            });
          }
        }
        
        // Run daily via scheduled automation
        // Cron: 0 3 * * * (3 AM daily)
      `
    }
  },
  
  /**
   * BUSINESS LOGIC & CROSS-ENTITY RULES (Logic.1-3)
   * Verification gates and user capabilities
   */
  business_logic: {
    
    caregiver_verification_gate: {
      // Logic.1: Cannot publish profile without verification
      rule: 'CaregiverProfile.is_published cannot be set to true while email_verified = false',
      enforcement: 'Server-side in publish automation (NOT just UI)',
      
      implementation: `
        // Logic.1: Caregiver publish gate
        async function publishCaregiverProfile(profileId, userId) {
          // Check email verification
          const user = await base44.asServiceRole.entities.User.read(userId);
          
          if (!user.email_verified) {
            throw new Error(
              'Please verify your email before publishing your profile. ' +
              'Check your inbox for the verification link.'
            );
          }
          
          // Email verified - allow publish
          await base44.asServiceRole.entities.CaregiverProfile.update(profileId, {
            is_published: true
          });
        }
      `
    },
    
    parent_verification_gate: {
      // Logic.2: Cannot create booking without verification
      rule: 'BookingRequest cannot be created while email_verified = false',
      enforcement: 'Server-side at BookingRequest creation',
      
      implementation: `
        // Logic.2: Parent booking gate
        async function createBookingRequest(bookingData, parentUserId) {
          // Check email verification
          const user = await base44.asServiceRole.entities.User.read(parentUserId);
          
          if (!user.email_verified) {
            throw new Error(
              'Please verify your email before submitting a booking request. ' +
              'Check your inbox for the verification link.'
            );
          }
          
          // Email verified - allow booking
          const booking = await base44.asServiceRole.entities.BookingRequest.create(bookingData);
          return booking;
        }
      `
    },
    
    unverified_user_capabilities: {
      // Logic.3: What unverified users CAN do
      allowed: [
        'Log in to their account',
        'View their dashboard',
        'View verification prompt/banner',
        'Request resend of verification email',
        'View their profile (but not publish it)',
        'Update basic profile information',
        'Log out'
      ],
      
      blocked: [
        'Publish caregiver profile',
        'Submit booking requests',
        'Send messages',
        'View caregiver search results',
        'Access any privileged features'
      ],
      
      middleware_check: `
        // Logic.3: Middleware for verification-gated endpoints
        async function requireEmailVerified(req, res, next) {
          const user = await base44.auth.me();
          
          if (!user.email_verified) {
            return res.status(403).json({
              error: 'Email verification required',
              message: 'Please verify your email to access this feature'
            });
          }
          
          next();
        }
        
        // Apply to gated endpoints
        app.post('/api/bookings', requireEmailVerified, createBookingHandler);
        app.post('/api/profiles/publish', requireEmailVerified, publishProfileHandler);
      `
    }
  },
  
  /**
   * EVENT TRIGGERS & AUTOMATION (Triggers.1-3)
   * Email sending and token validation
   */
  event_triggers: {
    
    registration_email: {
      // Triggers.1: Send verification email on registration
      timing: 'Immediately after User record creation',
      provider: 'Resend',
      
      email_content: {
        subject: 'Verify your email address',
        greeting: 'Hi {user.first_name},',
        body: 'Welcome! Please verify your email to activate your account.',
        cta_button: 'Verify my email',
        cta_url: 'https://[domain]/verify-email?token={token}',
        fallback_url: 'Plain-text URL for email clients without HTML',
        expiry_note: 'This link expires in 24 hours.'
      },
      
      implementation: `
        // Triggers.1: Send verification email on registration
        async function sendVerificationEmail(userId, token) {
          const user = await base44.asServiceRole.entities.User.read(userId);
          
          const verificationUrl = \`https://\${process.env.DOMAIN}/verify-email?token=\${token}\`;
          
          const emailHtml = \`
            <h2>Hi \${user.full_name.split(' ')[0]},</h2>
            <p>Welcome to our platform! Please verify your email to activate your account.</p>
            <p>
              <a href="\${verificationUrl}" 
                 style="display:inline-block;padding:12px 24px;background:#4F46E5;color:white;text-decoration:none;border-radius:6px;font-weight:600;">
                Verify my email
              </a>
            </p>
            <p style="color:#666;font-size:14px;">
              Or copy this link: <br>
              <a href="\${verificationUrl}">\${verificationUrl}</a>
            </p>
            <p style="color:#999;font-size:12px;">
              This link expires in 24 hours.
            </p>
          \`;
          
          // Send via Resend
          await base44.integrations.Core.SendEmail({
            to: user.email,
            from_name: 'Your Platform',
            subject: 'Verify your email address',
            body: emailHtml
          });
          
          // Audit.1: Log email send
          console.info('Verification email sent', {
            user_id: userId,
            email: maskEmail(user.email),
            send_timestamp: new Date().toISOString()
          });
        }
      `
    },
    
    verification_url_format: {
      // Triggers.2: URL format with token as query parameter
      format: 'https://[domain]/verify-email?token=[64-char-hex]',
      token_position: 'Query parameter (NOT in URL path)',
      reason: 'Avoids token logging in server access logs',
      
      security_note: 'Query parameters not logged by most web servers. Path parameters are logged.',
      
      example: 'https://example.com/verify-email?token=a3f2d8e9c1b4567890abcdef1234567890abcdef1234567890abcdef12345678'
    },
    
    token_click_automation: {
      // Triggers.3: On token click
      steps: [
        '1. Validate token (exists, not expired, not used)',
        '2. Set User.email_verified = true',
        '3. Set EmailVerificationToken.used_at = now',
        '4. Redirect to success page with message'
      ],
      
      full_implementation: `
        // Triggers.3: Complete token verification automation
        async function handleTokenClick(token, req) {
          // Step 1: Validate token
          try {
            const tokenRecord = await validateToken(token);
            
            // Step 2: Set email_verified = true
            await base44.asServiceRole.entities.User.update(tokenRecord.user_id, {
              email_verified: true
            });
            
            // Step 3: Mark token as used
            await base44.asServiceRole.entities.EmailVerificationToken.update(tokenRecord.id, {
              used_at: new Date().toISOString()
            });
            
            // Audit.2: Log success
            console.info('Email verified successfully', {
              user_id: tokenRecord.user_id,
              timestamp: new Date().toISOString()
            });
            
            // Step 4: Return success
            return {
              success: true,
              message: 'Email verified — you\\'re all set!'
            };
            
          } catch (error) {
            // Audit.2: Log failure
            console.warn('Verification failed', {
              token_prefix: token.substring(0, 8),
              ip: req.ip,
              error: error.message,
              timestamp: new Date().toISOString()
            });
            
            throw error;
          }
        }
      `
    }
  },
  
  /**
   * ABUSE PREVENTION & RATE LIMITS (Abuse.1-2)
   * Resend rate limiting and delivery monitoring
   */
  abuse_prevention: {
    
    resend_rate_limit: {
      // Abuse.1: Max 3 resend requests per user per hour
      limit: '3 resends per user per hour',
      enforcement: 'Server-side rate limiting',
      user_message: 'Please wait before requesting another verification email.',
      
      implementation: `
        // Abuse.1: Resend rate limiting
        const resendAttempts = new Map(); // user_id → { count, resetTime }
        
        async function checkResendRateLimit(userId) {
          const now = Date.now();
          const userAttempts = resendAttempts.get(userId);
          
          // Reset if hour has passed
          if (!userAttempts || now > userAttempts.resetTime) {
            resendAttempts.set(userId, {
              count: 0,
              resetTime: now + 60 * 60 * 1000  // 1 hour from now
            });
            return true;
          }
          
          // Check count
          if (userAttempts.count >= 3) {
            const minutesLeft = Math.ceil((userAttempts.resetTime - now) / 60000);
            throw new Error(
              \`Please wait \${minutesLeft} minutes before requesting another verification email.\`
            );
          }
          
          // Increment count
          userAttempts.count++;
          return true;
        }
        
        async function resendVerificationEmailWithRateLimit(userId) {
          // Check rate limit
          await checkResendRateLimit(userId);
          
          // Send email
          const token = await createVerificationToken(userId);
          await sendVerificationEmail(userId, token);
        }
      `
    },
    
    delivery_monitoring: {
      // Abuse.2: Monitor email delivery failures
      requirement: 'Log bounces and blocks from Resend',
      action: 'Flag User account for admin review',
      reason: 'Bounced email may indicate fake account',
      
      implementation: `
        // Abuse.2: Email delivery failure monitoring
        async function handleEmailDeliveryFailure(userId, bounceType) {
          // Log failure
          console.warn('Verification email bounce', {
            user_id: userId,
            bounce_type: bounceType,
            timestamp: new Date().toISOString()
          });
          
          // Flag user account
          await base44.asServiceRole.entities.User.update(userId, {
            // Add custom field: email_bounce_flag
            email_bounce_flag: true,
            email_bounce_reason: bounceType
          });
          
          // Create alert for admin review
          await base44.asServiceRole.entities.AbuseAlert.create({
            alert_type: 'other',
            source_user_id: userId,
            description: \`Verification email bounced: \${bounceType}\`,
            severity: 'medium'
          });
        }
        
        // Webhook handler for Resend delivery events
        app.post('/webhooks/resend', async (req, res) => {
          const { type, data } = req.body;
          
          if (type === 'email.bounced' || type === 'email.delivery_delayed') {
            // Extract user_id from email metadata
            const userId = data.tags?.user_id;
            if (userId) {
              await handleEmailDeliveryFailure(userId, type);
            }
          }
          
          res.sendStatus(200);
        });
      `
    }
  },
  
  /**
   * ERROR HANDLING (Errors.1-3, Edge.1-3)
   * Token validation errors and edge cases
   */
  error_handling: {
    
    expired_token: {
      // Errors.1: Expired token clicked
      message: 'This verification link has expired. Request a new one.',
      show_resend_button: true,
      no_generic_error: 'Show specific expired message',
      
      ui_display: `
        <div className="error-container">
          <h2>Link Expired</h2>
          <p>This verification link has expired.</p>
          <Button onClick={handleResend}>
            Request a new verification email
          </Button>
        </div>
      `
    },
    
    already_used_token: {
      // Errors.2: Already-used token clicked
      message: 'This link has already been used. If your email is not verified, please request a new link.',
      no_account_probing: 'Do NOT indicate whether account is verified',
      security_reason: 'Prevents attackers from probing verified accounts',
      
      implementation: `
        // Errors.2: Already-used token handling
        if (tokenRecord.used_at) {
          // Do NOT reveal if account is verified
          throw new Error(
            'This link has already been used. ' +
            'If your email is not verified, please request a new link.'
          );
        }
      `
    },
    
    invalid_token: {
      // Errors.3: Token not found in database
      message: 'Same as expired token message',
      no_disclosure: 'Do NOT reveal token does not exist',
      security_reason: 'Prevents token enumeration attacks',
      
      implementation: `
        // Errors.3: Invalid token - same message as expired
        const tokenRecord = await base44.asServiceRole.entities.EmailVerificationToken.filter({
          token: token
        });
        
        if (tokenRecord.length === 0) {
          // Errors.3: Use same message as expired token
          throw new Error('This verification link has expired. Request a new one.');
        }
      `
    },
    
    email_change_flow: {
      // Edge.1: Email change after verification (post-MVP)
      behavior: 'email_verified resets to false',
      new_flow: 'New verification flow starts for new address',
      
      implementation: `
        // Edge.1: Email change flow (post-MVP)
        async function changeUserEmail(userId, newEmail) {
          // Reset verification status
          await base44.asServiceRole.entities.User.update(userId, {
            email: newEmail,
            email_verified: false  // Reset to unverified
          });
          
          // Start new verification flow
          const token = await createVerificationToken(userId);
          await sendVerificationEmail(userId, token);
        }
      `
    },
    
    token_entropy: {
      // Edge.2: Token length security
      length: '64 hex characters',
      entropy: '256 bits',
      security: 'Computationally infeasible to guess',
      do_not_reduce: 'NEVER reduce below 64 chars',
      
      calculation: '64 hex chars = 32 bytes = 256 bits = 2^256 possible values'
    },
    
    resend_invalidation: {
      // Edge.3: Resend during active token window
      behavior: 'Issuing resend invalidates previous token immediately',
      result: 'Old link shows expired-token message',
      
      user_experience: [
        'User receives first email',
        'User requests resend',
        'First token marked as expired',
        'New token generated and emailed',
        'If user clicks old link: "expired" message',
        'User must use new link from second email'
      ]
    }
  }
};

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 */
export default function F024EmailVerificationDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-024: Email Verification Flow</h1>
      <p><strong>Status:</strong> Phase 1 - Authentication & User Registration</p>
      <p><strong>Priority:</strong> CRITICAL</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', margin: '1rem 0' }}>
        <strong>⚠️ CRITICAL SECURITY REQUIREMENTS</strong>
        <ul>
          <li><strong>Access.2:</strong> NEVER log or expose token value (only first 8 chars)</li>
          <li><strong>Data.3:</strong> Tokens are single-use (check used_at)</li>
          <li><strong>Logic.1-2:</strong> Verification gates enforced server-side</li>
          <li><strong>Errors.3:</strong> Same error message for expired/invalid/used (no disclosure)</li>
        </ul>
      </div>
      
      <h2>See source code for:</h2>
      <ul>
        <li>Complete entity schema and token generation</li>
        <li>Server-side validation logic</li>
        <li>Email sending automation via Resend</li>
        <li>Resend rate limiting (3 per hour)</li>
        <li>Verification gates for caregivers and parents</li>
        <li>Error handling and edge cases</li>
        <li>Audit logging requirements</li>
      </ul>
    </div>
  );
}