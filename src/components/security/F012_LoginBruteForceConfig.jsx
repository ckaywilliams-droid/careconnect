/**
 * F-012: LOGIN BRUTE-FORCE PROTECTION CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-012
 * Login Brute-Force Protection. Protects against password guessing attacks by
 * locking accounts after 5 failed login attempts for 15 minutes.
 * 
 * STATUS: Phase 0 - User entity updated with login_fail_count and locked_until
 * NEXT STEP: Implement login failure logic + unlock email automation
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F012_LOGIN_BRUTE_FORCE_SPECIFICATION = {
  
  /**
   * USER ENTITY FIELDS (Data.1-2)
   * Required fields for brute-force protection
   */
  user_entity_fields: {
    
    login_fail_count: {
      field: 'login_fail_count',
      type: 'Number (Integer)',
      default: 0,
      description: 'Number of consecutive failed login attempts',
      operations: [
        'Incremented on each failed login',
        'Reset to 0 on successful login',
        'When reaches 5 → account locked'
      ],
      
      access_control: {
        // Access.1: Auth automation only
        read: 'Auth automation only (not users, not standard admin UI)',
        write: 'Auth automation only',
        rationale: 'Internal counter - users should not know exact fail count'
      }
    },
    
    locked_until: {
      field: 'locked_until',
      type: 'DateTime',
      nullable: true,
      default: null,
      description: 'Timestamp when account lockout expires',
      operations: [
        'Set to now + 15 minutes when login_fail_count reaches 5',
        'Cleared on unlock (email link OR auto-expiry)',
        'null = not locked'
      ],
      
      access_control: {
        // Access.2: Auth system only
        read: 'Auth system only',
        write: 'Auth automation only',
        user_visibility: 'Users NOT shown exact timestamp - only generic "Account locked" message'
      }
    }
  },
  
  /**
   * ACCOUNT LOCKOUT STATE MACHINE (States.1-2)
   * Unlocked → Locked → Unlocked
   */
  state_machine: {
    
    unlocked: {
      state: 'Unlocked',
      conditions: [
        'login_fail_count < 5',
        'locked_until = null'
      ],
      allowed_actions: ['Login attempt'],
      
      on_failed_login: {
        action: 'Increment login_fail_count',
        transition: 'If login_fail_count reaches 5 → Locked'
      },
      
      on_successful_login: {
        // States.2: Counter resets on success
        action: 'Reset login_fail_count to 0',
        transition: 'Remain Unlocked'
      }
    },
    
    locked: {
      state: 'Locked',
      conditions: [
        'login_fail_count = 5',
        'locked_until = now + 15 minutes'
      ],
      allowed_actions: ['Wait for expiry', 'Click unlock email link'],
      
      on_login_attempt: {
        // Logic.2: Check locked_until on login attempt
        check: 'Compare locked_until with current time',
        if_still_locked: {
          condition: 'locked_until > now',
          action: 'Reject login with "Account locked" message',
          no_increment: 'Do NOT increment login_fail_count (already locked)'
        },
        if_lock_expired: {
          condition: 'locked_until <= now',
          action: 'Auto-unlock: reset login_fail_count to 0, clear locked_until',
          transition: 'Unlocked',
          allow_login: 'Process login attempt normally'
        }
      },
      
      unlock_methods: [
        'Email unlock link (Triggers.2)',
        'Auto-unlock when locked_until expires (Logic.2)',
        'Manual unlock by support_admin (Edge.1)'
      ]
    },
    
    state_diagram: `
      [Unlocked]
         |
         | Failed login (increment counter)
         v
      [login_fail_count < 5]
         |
         | 5th failed login
         v
      [Locked] (locked_until = now + 15 min)
         |
         | - Email unlock link clicked
         | - locked_until expires
         | - Support admin manual unlock
         v
      [Unlocked] (login_fail_count reset to 0)
    `
  },
  
  /**
   * LOGIN FAILURE LOGIC (Logic.1)
   * On every failed login attempt
   */
  login_failure_logic: {
    
    on_failed_login: {
      // Logic.1: Increment counter and check threshold
      
      steps: [
        'Step 1: Verify credentials (email + password)',
        'Step 2: If credentials invalid → failed login',
        'Step 3: Load user record by email',
        'Step 4: Check if already locked (locked_until > now)',
        'Step 5: If not locked → increment login_fail_count',
        'Step 6: If login_fail_count reaches 5 → lock account',
        'Step 7: Return generic error message'
      ],
      
      implementation: `
        async function handleLoginAttempt(email, password) {
          // Step 1-2: Verify credentials
          const user = await base44.entities.User.filter({ email: email });
          
          if (!user || !verifyPassword(password, user.password_hash)) {
            // Failed login
            
            if (user) {
              // Step 4: Check if already locked
              if (user.locked_until && new Date(user.locked_until) > new Date()) {
                // Still locked - return locked message
                const remainingMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
                
                // Audit.1: Log failed login attempt
                await logFailedLogin({
                  ip: request.ip,
                  email: maskEmail(email),
                  attempt_number: user.login_fail_count + 1,
                  reason: 'account_locked',
                  timestamp: new Date().toISOString()
                });
                
                return {
                  success: false,
                  error: 'Account locked. Check your email for an unlock link.'
                };
              }
              
              // Step 5: Increment counter
              const newFailCount = user.login_fail_count + 1;
              
              // Step 6: Check threshold
              if (newFailCount >= 5) {
                // Lock account
                const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);  // 15 minutes
                
                await base44.asServiceRole.entities.User.update(user.id, {
                  login_fail_count: newFailCount,
                  locked_until: lockedUntil.toISOString()
                });
                
                // Triggers.1: Send unlock email
                await sendUnlockEmail(user);
                
                // Audit.1: Log lockout
                await logFailedLogin({
                  ip: request.ip,
                  email: maskEmail(email),
                  attempt_number: newFailCount,
                  reason: 'threshold_reached',
                  action: 'account_locked',
                  timestamp: new Date().toISOString()
                });
                
                return {
                  success: false,
                  error: 'Account locked due to too many failed attempts. Check your email for an unlock link.'
                };
              } else {
                // Increment counter (not yet locked)
                await base44.asServiceRole.entities.User.update(user.id, {
                  login_fail_count: newFailCount
                });
                
                // Audit.1: Log failed attempt
                await logFailedLogin({
                  ip: request.ip,
                  email: maskEmail(email),
                  attempt_number: newFailCount,
                  reason: 'invalid_credentials',
                  timestamp: new Date().toISOString()
                });
              }
            } else {
              // Errors.2: Account doesn't exist - same response time as invalid password
              await simulatePasswordVerification();  // Add delay to prevent timing attack
              
              // Audit.1: Log attempt on non-existent account
              await logFailedLogin({
                ip: request.ip,
                email: maskEmail(email),
                attempt_number: 0,
                reason: 'account_not_found',
                timestamp: new Date().toISOString()
              });
            }
            
            // Step 7: Generic error message (Errors.1)
            return {
              success: false,
              error: 'Invalid email or password'
            };
          }
          
          // Successful login - reset counter (States.2)
          if (user.login_fail_count > 0 || user.locked_until) {
            await base44.asServiceRole.entities.User.update(user.id, {
              login_fail_count: 0,
              locked_until: null
            });
          }
          
          return {
            success: true,
            token: generateJWT(user)
          };
        }
      `
    }
  },
  
  /**
   * LOCKED ACCOUNT LOGIN LOGIC (Logic.2)
   * Check locked_until on login attempt
   */
  locked_account_logic: {
    
    on_login_attempt_while_locked: {
      // Logic.2: Check if lock has expired
      
      scenario_1_still_locked: {
        condition: 'locked_until > now',
        action: 'Reject login with locked message',
        no_counter_increment: true,
        response: 'Account locked. Check your email for an unlock link.',
        
        implementation: `
          if (user.locked_until && new Date(user.locked_until) > new Date()) {
            // Still locked - reject
            return {
              success: false,
              error: 'Account locked. Check your email for an unlock link.'
            };
          }
        `
      },
      
      scenario_2_lock_expired: {
        condition: 'locked_until <= now',
        action: 'Auto-unlock and allow login attempt',
        reset_counter: true,
        clear_locked_until: true,
        
        implementation: `
          if (user.locked_until && new Date(user.locked_until) <= new Date()) {
            // Lock expired - auto-unlock
            await base44.asServiceRole.entities.User.update(user.id, {
              login_fail_count: 0,
              locked_until: null
            });
            
            // Now process login attempt normally
            // (credentials still need to be valid)
          }
        `
      }
    }
  },
  
  /**
   * UNLOCK EMAIL AUTOMATION (Triggers.1-2)
   * Send email with single-use token
   */
  unlock_email_automation: {
    
    email_trigger: {
      // Triggers.1: Sent when login_fail_count reaches 5
      when: 'Account locked (5th failed login)',
      to: 'user.email',
      subject: 'Account Locked - Unlock Your Account',
      integration: 'Base44 + Resend or Gmail (F-010)'
    },
    
    unlock_token: {
      // Triggers.2: Single-use time-limited token
      format: 'JWT or UUID',
      expiry: '30 minutes',
      single_use: true,
      
      token_payload: {
        user_id: 'User ID',
        action: 'unlock_account',
        issued_at: 'Timestamp',
        expires_at: 'Timestamp (issued_at + 30 minutes)'
      },
      
      generation: `
        async function generateUnlockToken(user) {
          const token = jwt.sign(
            {
              user_id: user.id,
              action: 'unlock_account',
              issued_at: Date.now()
            },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
          );
          
          // Store token in database for single-use verification
          await base44.entities.UnlockToken.create({
            user_id: user.id,
            token: token,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            used: false
          });
          
          return token;
        }
      `
    },
    
    email_content: {
      template: `
        Subject: Account Locked - Unlock Your Account
        
        Hi {{user.full_name}},
        
        Your account has been locked due to multiple failed login attempts.
        This is a security measure to protect your account.
        
        Click the link below to unlock your account:
        {{unlock_url}}
        
        This link will expire in 30 minutes.
        
        If you did not attempt to login, please ignore this email and contact support.
        
        For security, you can only use this link once.
        
        Best regards,
        The Team
      `,
      
      unlock_url: 'https://yourdomain.com/auth/unlock?token=<unlock_token>',
      
      implementation: `
        async function sendUnlockEmail(user) {
          const token = await generateUnlockToken(user);
          const unlockUrl = \`https://yourdomain.com/auth/unlock?token=\${token}\`;
          
          await base44.integrations.Core.SendEmail({
            to: user.email,
            subject: 'Account Locked - Unlock Your Account',
            body: \`
              Hi \${user.full_name},
              
              Your account has been locked due to multiple failed login attempts.
              
              Click the link below to unlock your account:
              \${unlockUrl}
              
              This link will expire in 30 minutes.
              
              If you did not attempt to login, please ignore this email.
            \`
          });
        }
      `
    },
    
    unlock_endpoint: {
      // Endpoint to handle unlock link clicks
      endpoint: 'GET /auth/unlock?token=<token>',
      
      implementation: `
        async function handleUnlock(token) {
          try {
            // Verify token
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            
            // Check if token has been used
            const unlockToken = await base44.entities.UnlockToken.filter({
              token: token,
              used: false
            });
            
            if (!unlockToken || unlockToken.length === 0) {
              return {
                success: false,
                error: 'Invalid or expired unlock link'
              };
            }
            
            // Check expiry
            if (new Date(unlockToken[0].expires_at) < new Date()) {
              return {
                success: false,
                error: 'Unlock link has expired'
              };
            }
            
            // Unlock account
            await base44.asServiceRole.entities.User.update(payload.user_id, {
              login_fail_count: 0,
              locked_until: null
            });
            
            // Mark token as used (single-use)
            await base44.entities.UnlockToken.update(unlockToken[0].id, {
              used: true,
              used_at: new Date().toISOString()
            });
            
            return {
              success: true,
              message: 'Account unlocked successfully. You can now login.'
            };
          } catch (error) {
            return {
              success: false,
              error: 'Invalid unlock link'
            };
          }
        }
      `
    }
  },
  
  /**
   * CREDENTIAL STUFFING DETECTION (Abuse.1)
   * Flag IPs with failed attempts across multiple accounts
   */
  credential_stuffing_detection: {
    
    pattern: {
      // Abuse.1: Same IP, many different accounts
      definition: 'Failed login attempts from same IP across multiple different email addresses',
      threshold: '20 failed attempts across any accounts within 10 minutes',
      action: 'Flag IP for blocking (F-014)',
      rationale: 'Attacker testing stolen credentials against many accounts'
    },
    
    implementation: `
      // After each failed login attempt
      async function checkCredentialStuffing(ip) {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        // Count failed login attempts from this IP (any email)
        const recentFailures = await base44.entities.LoginFailureLog.filter({
          ip_address: ip,
          attempt_timestamp: { $gte: tenMinutesAgo.toISOString() }
        });
        
        // Count unique email addresses attempted
        const uniqueEmails = new Set(recentFailures.map(f => f.email));
        
        if (recentFailures.length >= 20 && uniqueEmails.size >= 10) {
          // Abuse.1: Credential stuffing detected
          
          // Flag IP for blocking (F-014)
          await base44.entities.IPBlocklist.create({
            ip_address: ip,
            block_reason: 'credential_stuffing',
            blocked_at: new Date().toISOString(),
            blocked_by_admin_id: 'SYSTEM',
            unblock_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),  // 24 hours
            is_permanent: false,
            invalid_attempt_count: recentFailures.length
          });
          
          // Alert admins
          await sendAdminAlert({
            severity: 'WARNING',
            title: 'Credential stuffing detected',
            details: {
              ip_address: ip,
              failed_attempts: recentFailures.length,
              unique_accounts_targeted: uniqueEmails.size,
              time_window: '10 minutes'
            }
          });
        }
      }
    `
  },
  
  /**
   * UNLOCK EMAIL RATE LIMITING (Abuse.2)
   * Prevent email flooding
   */
  unlock_email_rate_limit: {
    
    limit: {
      // Abuse.2: 3 resend requests per hour per account
      threshold: '3 unlock email requests per hour per account',
      action: 'Reject resend request with "Too many requests" message',
      rationale: 'Prevent attacker from flooding user\'s inbox'
    },
    
    implementation: `
      async function sendUnlockEmail(user) {
        // Check rate limit
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const recentUnlockEmails = await base44.entities.UnlockToken.filter({
          user_id: user.id,
          created_date: { $gte: oneHourAgo.toISOString() }
        });
        
        if (recentUnlockEmails.length >= 3) {
          // Abuse.2: Rate limit exceeded
          console.warn('Unlock email rate limit exceeded', {
            user_id: user.id,
            email_count: recentUnlockEmails.length
          });
          
          // Do NOT send email, but don't reveal this to attacker
          return;  // Silent failure
        }
        
        // Generate token and send email
        const token = await generateUnlockToken(user);
        await base44.integrations.Core.SendEmail({
          to: user.email,
          subject: 'Account Locked - Unlock Your Account',
          body: generateUnlockEmailBody(token)
        });
      }
    `
  },
  
  /**
   * ACCOUNT ENUMERATION PREVENTION (Errors.1-2)
   * Generic error messages and timing consistency
   */
  enumeration_prevention: {
    
    generic_error_message: {
      // Errors.1: Same message for 'account not found' vs 'wrong password'
      requirement: 'Return identical error message for both cases',
      forbidden: [
        'Account not found',
        'Email does not exist',
        'Incorrect password'
      ],
      required: 'Invalid email or password',
      
      rationale: 'Prevents attacker from discovering which email addresses have accounts',
      
      example: `
        // WRONG - reveals account existence
        if (!user) {
          return { error: 'Account not found' };
        }
        if (!verifyPassword(password, user.password_hash)) {
          return { error: 'Incorrect password' };
        }
        
        // CORRECT - generic message for both
        if (!user || !verifyPassword(password, user.password_hash)) {
          return { error: 'Invalid email or password' };
        }
      `
    },
    
    timing_attack_prevention: {
      // Errors.2: Consistent response time
      problem: 'Non-existent account returns faster (no password hash verification)',
      solution: 'Simulate password verification for non-existent accounts',
      
      implementation: `
        async function handleLoginAttempt(email, password) {
          const user = await base44.entities.User.filter({ email: email });
          
          let isValidPassword = false;
          
          if (user) {
            // Account exists - verify password
            isValidPassword = await bcrypt.compare(password, user.password_hash);
          } else {
            // Errors.2: Account doesn't exist - simulate password verification
            // to prevent timing attack
            await bcrypt.compare(password, '$2b$10$DUMMY_HASH_FOR_TIMING');
          }
          
          if (!user || !isValidPassword) {
            // Same error message and response time for both cases
            return { error: 'Invalid email or password' };
          }
          
          // Successful login
          return { token: generateJWT(user) };
        }
      `
    }
  },
  
  /**
   * MANUAL UNLOCK BY SUPPORT (Edge.1)
   * Admin can clear lockout
   */
  manual_unlock: {
    
    scenario: {
      // Edge.1: User doesn't receive unlock email
      problem: 'User locked out and email not received (spam filter, wrong email, etc.)',
      solution: 'Support admin can manually unlock from admin panel'
    },
    
    admin_action: {
      endpoint: 'POST /api/admin/unlock-account',
      required_role: 'support_admin, trust_admin, super_admin',
      
      implementation: `
        async function adminUnlockAccount(adminUser, userId, reason) {
          // Verify admin role
          if (!['support_admin', 'trust_admin', 'super_admin'].includes(adminUser.role)) {
            return { error: 'Forbidden' };
          }
          
          // Get user
          const user = await base44.entities.User.read(userId);
          
          // Unlock account
          await base44.asServiceRole.entities.User.update(userId, {
            login_fail_count: 0,
            locked_until: null
          });
          
          // Audit.2: Log to AdminActionLog
          await base44.entities.AdminActionLog.create({
            admin_user_id: adminUser.id,
            admin_role: adminUser.role,
            action_type: 'manual_override',
            target_entity_type: 'User',
            target_entity_id: userId,
            reason: reason,
            payload: JSON.stringify({
              action: 'unlock_account',
              previous_locked_until: user.locked_until,
              previous_fail_count: user.login_fail_count
            }),
            action_timestamp: new Date().toISOString()
          });
          
          return {
            success: true,
            message: 'Account unlocked successfully'
          };
        }
      `
    }
  },
  
  /**
   * SUSPENDED VS LOCKED PRECEDENCE (Edge.2)
   * Suspended status takes priority
   */
  suspended_vs_locked: {
    
    rule: {
      // Edge.2: Suspended takes precedence over locked
      condition: 'User is both suspended (is_suspended=true) and locked (locked_until > now)',
      behavior: 'Show "Account suspended" message, not "Account locked"',
      rationale: 'Suspended is more severe - user should contact admin, not wait for unlock'
    },
    
    implementation: `
      async function handleLoginAttempt(email, password) {
        const user = await base44.entities.User.filter({ email: email });
        
        if (!user || !verifyPassword(password, user.password_hash)) {
          // Failed login logic...
          return { error: 'Invalid email or password' };
        }
        
        // Edge.2: Check suspended BEFORE checking locked
        if (user.is_suspended) {
          return {
            success: false,
            error: 'Account suspended. Please contact support.'
          };
        }
        
        // Then check locked
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
          return {
            success: false,
            error: 'Account locked. Check your email for an unlock link.'
          };
        }
        
        // Successful login
        return { token: generateJWT(user) };
      }
    `
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-2)
   * Track all failed login attempts
   */
  logging_and_audit: {
    
    failed_login_logging: {
      // Audit.1: Every failed login attempt logged
      requirement: 'Log every failed login with IP, masked email, attempt number, timestamp',
      
      fields: {
        ip_address: 'IP address of requester',
        email_attempted: 'Email address attempted (masked for privacy)',
        attempt_number: 'Current login_fail_count for this user',
        reason: 'invalid_credentials, account_locked, account_not_found, account_suspended',
        timestamp: 'When attempt occurred'
      },
      
      email_masking: `
        function maskEmail(email) {
          // user@example.com → u***@example.com
          const [local, domain] = email.split('@');
          const masked = local[0] + '***';
          return \`\${masked}@\${domain}\`;
        }
      `,
      
      implementation: `
        async function logFailedLogin(details) {
          // Option 1: Log to external service (Sentry - F-010)
          Sentry.captureMessage('Failed login attempt', {
            level: 'warning',
            tags: {
              reason: details.reason
            },
            extra: {
              ip: details.ip,
              email: details.email,  // Already masked
              attempt_number: details.attempt_number
            }
          });
          
          // Option 2: Log to database
          await base44.entities.LoginFailureLog.create({
            ip_address: details.ip,
            email_attempted: details.email,
            attempt_number: details.attempt_number,
            failure_reason: details.reason,
            attempt_timestamp: details.timestamp
          });
        }
      `
    },
    
    manual_unlock_logging: {
      // Audit.2: Admin manual unlock logged to AdminActionLog
      requirement: 'When support admin manually unlocks account, log to AdminActionLog',
      action_type: 'manual_override',
      
      example_log_entry: {
        admin_user_id: 'admin_abc123',
        admin_role: 'support_admin',
        action_type: 'manual_override',
        target_entity_type: 'User',
        target_entity_id: 'user_def456',
        reason: 'User reported not receiving unlock email - verified identity via phone',
        payload: {
          action: 'unlock_account',
          previous_locked_until: '2025-01-15T14:45:00Z',
          previous_fail_count: 5
        }
      }
    }
  },
  
  /**
   * USER-FACING UI (UI.1)
   * Login page messages
   */
  user_interface: {
    
    login_page_messages: {
      // UI.1: User-facing error messages
      
      failed_login_unlocked: {
        when: 'Failed login, account not yet locked',
        message: 'Invalid email or password',
        no_count_shown: true,
        rationale: 'Do not reveal fail count to attacker'
      },
      
      account_locked: {
        when: 'Account locked (5th failed login or login while locked)',
        message: 'Account locked. Check your email for an unlock link.',
        no_countdown: true,
        rationale: 'Do not show countdown - would help attacker time retries'
      },
      
      account_suspended: {
        when: 'Account suspended (is_suspended=true)',
        message: 'Account suspended. Please contact support.',
        takes_precedence: 'Show this even if also locked (Edge.2)'
      }
    },
    
    no_internal_details: {
      // UI.1: Do not expose internal implementation
      forbidden: [
        'Failed login count: 3/5',
        'Account will lock after 2 more attempts',
        'Locked for 15 minutes',
        'Locked until 2:45 PM',
        'Unlock token expired'
      ],
      allowed: [
        'Invalid email or password',
        'Account locked',
        'Check your email'
      ]
    }
  }
};

/**
 * ============================================================================
 * SUPPORTING ENTITIES (OPTIONAL)
 * ============================================================================
 */
const SUPPORTING_ENTITIES = {
  
  unlock_token: {
    entity_name: 'UnlockToken',
    purpose: 'Track unlock email tokens for single-use verification',
    
    schema: {
      user_id: 'Relation:User - User who needs to unlock',
      token: 'Text - JWT or UUID token',
      expires_at: 'DateTime - When token expires (30 minutes)',
      used: 'Boolean - Whether token has been used (single-use)',
      used_at: 'DateTime - When token was used (nullable)'
    }
  },
  
  login_failure_log: {
    entity_name: 'LoginFailureLog',
    purpose: 'Track failed login attempts for credential stuffing detection',
    note: 'Can use F-010 structured logging instead',
    
    schema: {
      ip_address: 'Text - IP address of requester',
      email_attempted: 'Text - Masked email address',
      attempt_number: 'Number - login_fail_count at time of attempt',
      failure_reason: 'Text - invalid_credentials, account_locked, etc.',
      attempt_timestamp: 'DateTime - When attempt occurred'
    }
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F012_CONFIGURATION_CHECKLIST = [
  {
    category: 'User Entity Fields',
    tasks: [
      { task: 'Verify login_fail_count field exists on User entity', status: 'complete' },
      { task: 'Verify locked_until field exists on User entity', status: 'complete' },
      { task: 'Configure access control: auth automation only (Access.1)', status: 'pending' }
    ]
  },
  {
    category: 'Login Failure Logic',
    tasks: [
      { task: 'Implement handleLoginAttempt function', status: 'pending' },
      { task: 'Increment login_fail_count on failed login', status: 'pending' },
      { task: 'Lock account when login_fail_count reaches 5', status: 'pending' },
      { task: 'Set locked_until = now + 15 minutes on lock', status: 'pending' },
      { task: 'Reset login_fail_count to 0 on successful login (States.2)', status: 'pending' }
    ]
  },
  {
    category: 'Locked Account Logic',
    tasks: [
      { task: 'Check locked_until on login attempt (Logic.2)', status: 'pending' },
      { task: 'If locked_until > now → reject with "Account locked"', status: 'pending' },
      { task: 'If locked_until <= now → auto-unlock and allow attempt', status: 'pending' }
    ]
  },
  {
    category: 'Unlock Email Automation',
    tasks: [
      { task: 'Create UnlockToken entity', status: 'pending' },
      { task: 'Implement generateUnlockToken function', status: 'pending' },
      { task: 'Implement sendUnlockEmail function (Triggers.1)', status: 'pending' },
      { task: 'Token expiry: 30 minutes (Triggers.2)', status: 'pending' },
      { task: 'Implement GET /auth/unlock endpoint', status: 'pending' },
      { task: 'Single-use token verification', status: 'pending' }
    ]
  },
  {
    category: 'Credential Stuffing Detection',
    tasks: [
      { task: 'Create LoginFailureLog entity (or use Sentry)', status: 'pending' },
      { task: 'Log all failed login attempts (Audit.1)', status: 'pending' },
      { task: 'Implement checkCredentialStuffing function', status: 'pending' },
      { task: 'Threshold: 20 failures across accounts in 10 min (Abuse.1)', status: 'pending' },
      { task: 'Create IPBlocklist entry when threshold reached', status: 'pending' }
    ]
  },
  {
    category: 'Unlock Email Rate Limiting',
    tasks: [
      { task: 'Rate limit: 3 unlock emails per hour per account (Abuse.2)', status: 'pending' },
      { task: 'Silent failure on rate limit (do not reveal to attacker)', status: 'pending' }
    ]
  },
  {
    category: 'Enumeration Prevention',
    tasks: [
      { task: 'Generic error: "Invalid email or password" (Errors.1)', status: 'pending' },
      { task: 'Same message for account_not_found and wrong_password', status: 'pending' },
      { task: 'Timing attack prevention: simulate password verification (Errors.2)', status: 'pending' },
      { task: 'Test: Response time consistent for both cases', status: 'pending' }
    ]
  },
  {
    category: 'Manual Unlock',
    tasks: [
      { task: 'Implement POST /api/admin/unlock-account endpoint', status: 'pending' },
      { task: 'Require support_admin role or higher', status: 'pending' },
      { task: 'Log to AdminActionLog (Audit.2)', status: 'pending' },
      { task: 'Test: Support admin can unlock locked account', status: 'pending' }
    ]
  },
  {
    category: 'Suspended vs Locked',
    tasks: [
      { task: 'Check is_suspended BEFORE checking locked_until (Edge.2)', status: 'pending' },
      { task: 'Show "Account suspended" if suspended (even if also locked)', status: 'pending' },
      { task: 'Test: Suspended user sees suspended message, not locked', status: 'pending' }
    ]
  },
  {
    category: 'UI Messages',
    tasks: [
      { task: 'Login page: "Invalid email or password" for failed attempts', status: 'pending' },
      { task: 'Login page: "Account locked. Check email" when locked', status: 'pending' },
      { task: 'Do NOT show fail count or countdown (UI.1)', status: 'pending' },
      { task: 'Do NOT expose internal details', status: 'pending' }
    ]
  }
];

/**
 * ============================================================================
 * ACCEPTANCE CRITERIA
 * ============================================================================
 */
const ACCEPTANCE_TESTS = [
  {
    test: 'Account Lockout',
    steps: [
      'Attempt login with wrong password 4 times',
      'Verify: login_fail_count = 4, account still unlocked',
      'Attempt 5th time with wrong password',
      'Verify: Account locked (locked_until set to now + 15 min)',
      'Verify: Unlock email sent',
      'Verify: Response: "Account locked. Check your email"'
    ]
  },
  {
    test: 'Counter Reset on Success',
    steps: [
      'Attempt login with wrong password 3 times',
      'Verify: login_fail_count = 3',
      'Attempt login with correct password',
      'Verify: Login succeeds',
      'Verify: login_fail_count reset to 0 (States.2)'
    ]
  },
  {
    test: 'Auto-Unlock on Expiry',
    steps: [
      'Lock account (5 failed attempts)',
      'Verify: locked_until set to now + 15 min',
      'Wait 16 minutes',
      'Attempt login',
      'Verify: Auto-unlock (login_fail_count reset, locked_until cleared)',
      'Verify: Login attempt processed normally (Logic.2)'
    ]
  },
  {
    test: 'Unlock Email Token',
    steps: [
      'Lock account',
      'Check email for unlock link',
      'Click unlock link',
      'Verify: Account unlocked (login_fail_count=0, locked_until=null)',
      'Verify: Can login successfully',
      'Try to use same link again',
      'Verify: "Invalid or expired unlock link" (single-use - Triggers.2)'
    ]
  },
  {
    test: 'Token Expiry',
    steps: [
      'Lock account',
      'Generate unlock token',
      'Wait 31 minutes',
      'Click unlock link',
      'Verify: "Unlock link has expired"',
      'Verify: Account still locked'
    ]
  },
  {
    test: 'Credential Stuffing Detection',
    steps: [
      'From same IP, attempt login to 15 different accounts (all fail)',
      'Verify: 15 failed attempts logged',
      'Attempt 5 more logins to different accounts',
      'Verify: After 20th attempt, IP blocked (Abuse.1)',
      'Verify: IPBlocklist entry created',
      'Verify: Admin alert sent'
    ]
  },
  {
    test: 'Unlock Email Rate Limit',
    steps: [
      'Lock account 3 times (trigger unlock email 3 times)',
      'Try to lock account 4th time within same hour',
      'Verify: No 4th unlock email sent (Abuse.2)',
      'Verify: Rate limit silently enforced'
    ]
  },
  {
    test: 'Generic Error Message',
    steps: [
      'Attempt login with non-existent email',
      'Verify: "Invalid email or password" (Errors.1)',
      'Attempt login with existing email, wrong password',
      'Verify: Same message - "Invalid email or password"',
      'Verify: Cannot distinguish between the two cases'
    ]
  },
  {
    test: 'Timing Attack Prevention',
    steps: [
      'Measure response time for non-existent account',
      'Measure response time for existing account with wrong password',
      'Verify: Response times are similar (Errors.2)',
      'Verify: No significant difference that would reveal account existence'
    ]
  },
  {
    test: 'Manual Unlock by Admin',
    steps: [
      'Lock account',
      'Login as support_admin',
      'Manually unlock account via admin panel',
      'Verify: Account unlocked (login_fail_count=0, locked_until=null)',
      'Verify: AdminActionLog entry created (Audit.2)',
      'Verify: User can login'
    ]
  },
  {
    test: 'Suspended Takes Precedence',
    steps: [
      'Lock account (5 failed attempts)',
      'Suspend account (is_suspended=true)',
      'Attempt login',
      'Verify: "Account suspended. Please contact support" (Edge.2)',
      'Verify: NOT "Account locked" message'
    ]
  },
  {
    test: 'Login While Locked',
    steps: [
      'Lock account',
      'Attempt login immediately',
      'Verify: "Account locked. Check your email"',
      'Verify: login_fail_count NOT incremented (already locked)',
      'Wait for locked_until to expire',
      'Attempt login',
      'Verify: Auto-unlock and login processed normally'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - User entity with login_fail_count and locked_until fields
 * - Auth automation with server-side logic
 * - Email integration (Resend or Gmail)
 * - JWT generation for unlock tokens
 * 
 * Supporting Entities:
 * - UnlockToken: Track unlock email tokens
 * - LoginFailureLog: Track failed attempts (or use F-010 Sentry)
 * 
 * Integration with Other Features:
 * - F-003: is_suspended takes precedence over locked (Edge.2)
 * - F-008: AdminActionLog logs manual unlock (Audit.2)
 * - F-010: Structured logging for failed login attempts
 * - F-014: IPBlocklist for credential stuffing (Abuse.1)
 * 
 * CRITICAL WARNINGS:
 * - States.2: Reset counter on successful login
 * - Logic.2: Auto-unlock when locked_until expires
 * - Triggers.2: Single-use tokens with 30-minute expiry
 * - Abuse.1: Credential stuffing detection (20 fails in 10 min)
 * - Abuse.2: Unlock email rate limit (3/hour)
 * - Errors.1: Generic error messages (no enumeration)
 * - Errors.2: Consistent response times (no timing attack)
 * - Edge.1: Support admin can manually unlock
 * - Edge.2: Suspended takes precedence over locked
 * 
 * NEXT STEPS:
 * 1. Implement login failure logic with counter increment
 * 2. Implement account locking at threshold
 * 3. Create UnlockToken entity
 * 4. Implement unlock email automation
 * 5. Implement unlock endpoint with single-use verification
 * 6. Implement credential stuffing detection
 * 7. Implement unlock email rate limiting
 * 8. Implement manual unlock endpoint for admins
 * 9. Test all acceptance criteria
 */

export default function F012LoginBruteForceDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-012: Login Brute-Force Protection - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> User entity updated with login_fail_count and locked_until</p>
      <p><strong>Next Step:</strong> Implement login failure logic + unlock email automation</p>
      
      <h2>Account Lockout State Machine (States.1-2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>State</th>
            <th>Conditions</th>
            <th>On Action</th>
            <th>Transition</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Unlocked</td>
            <td>login_fail_count &lt; 5<br/>locked_until = null</td>
            <td>Failed login → increment counter<br/>Success → reset to 0</td>
            <td>5th fail → Locked</td>
          </tr>
          <tr>
            <td>Locked</td>
            <td>login_fail_count = 5<br/>locked_until = now + 15 min</td>
            <td>Email unlock link<br/>OR wait for expiry</td>
            <td>Unlock → Unlocked</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Critical Requirements</h2>
      <ul>
        <li><strong>Threshold (Logic.1):</strong> 5 failed login attempts → lock for 15 minutes</li>
        <li><strong>Counter Reset (States.2):</strong> Reset login_fail_count to 0 on successful login</li>
        <li><strong>Auto-Unlock (Logic.2):</strong> When locked_until expires, auto-unlock on next attempt</li>
        <li><strong>Unlock Email (Triggers.1):</strong> Send email with single-use 30-minute token</li>
        <li><strong>Generic Errors (Errors.1):</strong> Same message for account_not_found and wrong_password</li>
        <li><strong>Timing Attack (Errors.2):</strong> Consistent response time regardless of account existence</li>
      </ul>
      
      <h2>Unlock Email (Triggers.1-2)</h2>
      <ul>
        <li><strong>Trigger:</strong> Sent when account locked (5th failed login)</li>
        <li><strong>Token:</strong> JWT or UUID with 30-minute expiry</li>
        <li><strong>Single-Use:</strong> Token can only be used once</li>
        <li><strong>Link:</strong> https://yourdomain.com/auth/unlock?token=&lt;token&gt;</li>
        <li><strong>Rate Limit:</strong> 3 unlock emails per hour per account (Abuse.2)</li>
      </ul>
      
      <h2>Credential Stuffing Detection (Abuse.1)</h2>
      <ul>
        <li><strong>Pattern:</strong> Same IP, failed attempts across multiple accounts</li>
        <li><strong>Threshold:</strong> 20 failed attempts across any accounts in 10 minutes</li>
        <li><strong>Action:</strong> Flag IP for blocking (create IPBlocklist entry)</li>
        <li><strong>Integration:</strong> F-014 IP blocking</li>
      </ul>
      
      <h2>Account Enumeration Prevention (Errors.1-2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Prevent account discovery</strong>
        <ul>
          <li><strong>Generic Message:</strong> "Invalid email or password" for both cases</li>
          <li><strong>Forbidden:</strong> "Account not found", "Incorrect password"</li>
          <li><strong>Timing Attack:</strong> Simulate password verification for non-existent accounts</li>
          <li><strong>Consistency:</strong> Response time must be same regardless of account existence</li>
        </ul>
      </div>
      
      <h2>Manual Unlock (Edge.1)</h2>
      <ul>
        <li><strong>Scenario:</strong> User doesn't receive unlock email</li>
        <li><strong>Solution:</strong> Support admin can manually unlock from admin panel</li>
        <li><strong>Logging:</strong> Logged to AdminActionLog with action_type=manual_override (Audit.2)</li>
        <li><strong>Roles:</strong> support_admin, trust_admin, super_admin</li>
      </ul>
      
      <h2>Suspended vs Locked (Edge.2)</h2>
      <ul>
        <li><strong>Rule:</strong> If user is both suspended and locked, suspended takes precedence</li>
        <li><strong>Message:</strong> Show "Account suspended. Contact support" not "Account locked"</li>
        <li><strong>Check Order:</strong> Check is_suspended BEFORE checking locked_until</li>
      </ul>
      
      <h2>User-Facing Messages (UI.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Scenario</th>
            <th>Message</th>
            <th>Do NOT Show</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Failed login (not locked)</td>
            <td>"Invalid email or password"</td>
            <td>Fail count, attempts remaining</td>
          </tr>
          <tr>
            <td>Account locked</td>
            <td>"Account locked. Check your email for unlock link"</td>
            <td>Countdown, locked_until timestamp</td>
          </tr>
          <tr>
            <td>Account suspended</td>
            <td>"Account suspended. Contact support"</td>
            <td>Reason, duration</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Logging & Audit (Audit.1-2)</h2>
      <ul>
        <li><strong>Failed Login (Audit.1):</strong> Log IP, masked email, attempt number, reason, timestamp</li>
        <li><strong>Manual Unlock (Audit.2):</strong> Log to AdminActionLog when admin unlocks account</li>
        <li><strong>Email Masking:</strong> user@example.com → u***@example.com</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Implement login failure logic with counter increment</li>
        <li>Lock account when login_fail_count reaches 5 (set locked_until)</li>
        <li>Reset counter to 0 on successful login</li>
        <li>Create UnlockToken entity</li>
        <li>Implement unlock email automation with 30-min token</li>
        <li>Implement unlock endpoint with single-use verification</li>
        <li>Check locked_until on login - auto-unlock if expired</li>
        <li>Implement credential stuffing detection (20 fails in 10 min)</li>
        <li>Implement unlock email rate limiting (3/hour)</li>
        <li>Generic error messages + timing attack prevention</li>
        <li>Implement manual unlock by support admin</li>
        <li>Check suspended BEFORE locked (Edge.2)</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete implementation examples, state machine logic, and security patterns.</em></p>
    </div>
  );
}