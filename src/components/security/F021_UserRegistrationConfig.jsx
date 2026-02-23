/**
 * F-021: USER REGISTRATION — SPLIT FLOWS CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-021
 * User Registration with split flows (Caregiver vs Parent). Implements secure
 * registration with role selection, ToS acceptance, and atomic profile creation.
 * 
 * STATUS: Phase 1 - Authentication & User Registration
 * DEPENDENCIES: Phase 0 complete (User entity, F-018 ToS, F-012 brute-force fields)
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F021_USER_REGISTRATION_SPECIFICATION = {
  
  /**
   * DATA MODEL & CONSTRAINTS (Data.1-4)
   * User entity fields and related entities
   */
  data_model: {
    
    user_entity: {
      // Data.1: User entity fields at registration
      entity: 'User (built-in)',
      note: 'User is a built-in Base44 entity - customize via entities/User.json',
      
      fields_written_at_registration: {
        id: 'UUID (auto-generated)',
        email: 'Text (unique, lowercase-normalised) - REQUIRED',
        full_name: 'Text (min 2 chars, max 100 chars) - REQUIRED',
        role: 'Select: parent / caregiver (required, IMMUTABLE after creation)',
        email_verified: 'Boolean (default: false)',
        password_hash: 'Text (bcrypt) - only for email/password registrations',
        created_date: 'DateTime (auto-generated)',
        
        // F-012: Brute-force protection fields
        login_fail_count: 'Number (default: 0)',
        locked_until: 'DateTime (nullable)',
        
        // F-015: Suspension fields
        is_suspended: 'Boolean (default: false)',
        suspension_reason: 'Text (nullable)',
        
        // F-017: Soft delete fields
        is_deleted: 'Boolean (default: false)',
        deleted_at: 'DateTime (nullable)',
        deletion_reason: 'Text (nullable)'
      },
      
      immutability: {
        // Access.3: Role is IMMUTABLE
        rule: 'role field cannot be changed by non-admin users after creation',
        enforcement: 'API rejects any non-admin attempt to UPDATE User.role',
        exception: 'Only super_admin can change role via admin panel + AdminActionLog'
      }
    },
    
    related_entities: {
      // Data.2: Auto-created profile
      caregiver_profile: {
        entity: 'CaregiverProfile',
        created_when: 'User.role = caregiver',
        automation: 'Triggers.1 - created immediately after User creation',
        atomicity: 'If profile creation fails, User creation is rolled back'
      },
      
      parent_profile: {
        entity: 'ParentProfile',
        created_when: 'User.role = parent',
        automation: 'Triggers.1 - created immediately after User creation',
        atomicity: 'If profile creation fails, User creation is rolled back'
      },
      
      policy_acceptance: {
        // Data.3: PolicyAcceptance created atomically
        entity: 'PolicyAcceptance',
        requirement: 'F-018 - ToS acceptance captured at registration',
        atomicity: 'Created atomically with User - both succeed or both fail',
        fields: {
          user_id: 'Relation to User',
          policy_type: 'tos and privacy_policy',
          policy_version: 'Current version (server-fetched)',
          accepted_at: 'DateTime (auto)',
          ip_address: 'IP from request context (server-side)'
        }
      }
    },
    
    password_hash: {
      // Data.4: Optional field for email/password registrations
      when_written: 'Only for email/password registration path',
      not_written: 'Google SSO registrations (F-022) - no password_hash',
      algorithm: 'bcrypt with salt (F-026)',
      validation: 'F-026 password policy enforced before hashing'
    }
  },
  
  /**
   * ACCESS CONTROL & PERMISSIONS (Access.1-4)
   * Registration endpoint and role enforcement
   */
  access_control: {
    
    registration_endpoint: {
      // Access.1: Public endpoint
      path: '/api/register (or platform-provided registration endpoint)',
      auth_required: false,
      access: 'Public - no authentication required',
      rate_limit: 'Abuse.1 - 5 attempts per IP per hour'
    },
    
    role_assignment: {
      // Access.2: No admin roles via registration
      allowed_roles: ['parent', 'caregiver'],
      prohibited_roles: ['trust_admin', 'super_admin'],
      enforcement: 'Server-side validation rejects any admin role in registration payload',
      
      validation: `
        // Server-side role validation
        function validateRegistrationRole(role) {
          const allowedRoles = ['parent', 'caregiver'];
          
          if (!allowedRoles.includes(role)) {
            throw new Error('Invalid role: only parent and caregiver roles allowed at registration');
          }
          
          return role;
        }
      `
    },
    
    role_immutability: {
      // Access.3: Role cannot be self-modified
      rule: 'User.role is IMMUTABLE after creation',
      enforcement_levels: [
        'Database: No UPDATE trigger for role field by non-admin',
        'API: Reject any request to update User.role by non-admin',
        'UI: No UI element allows role change for non-admin users'
      ],
      
      admin_override: {
        who: 'super_admin only',
        how: 'Admin panel with confirmation',
        logging: 'AdminActionLog entry required (F-008)',
        
        example: `
          // Admin changes user role (super_admin only)
          await base44.asServiceRole.entities.User.update(userId, {
            role: 'caregiver'  // Changed from 'parent'
          });
          
          // Log to AdminActionLog
          await base44.asServiceRole.entities.AdminActionLog.create({
            admin_user_id: adminUser.id,
            admin_role: adminUser.role,
            action_type: 'role_change',
            target_entity_type: 'User',
            target_entity_id: userId,
            reason: 'User requested role change - verified identity',
            payload: JSON.stringify({
              old_role: 'parent',
              new_role: 'caregiver'
            }),
            action_timestamp: new Date().toISOString()
          });
        `
      }
    },
    
    sso_role_security: {
      // Access.4: SSO role injection prevention
      threat: 'Malicious actor tries to inject admin role via OAuth callback URL',
      
      mitigation: {
        approach: 'Role stored in signed server-side session BEFORE OAuth flow',
        flow: [
          '1. User selects role on role selector screen',
          '2. Server stores role in signed session/cookie',
          '3. Server initiates OAuth flow',
          '4. OAuth callback returns',
          '5. Server reads role from signed session (NOT from URL)',
          '6. Server creates User with validated role'
        ],
        
        implementation: `
          // Step 1-2: Role selection (server-side endpoint)
          app.post('/select-role', (req, res) => {
            const { role } = req.body;
            
            // Validate role
            if (!['parent', 'caregiver'].includes(role)) {
              return res.status(400).json({ error: 'Invalid role' });
            }
            
            // Store in signed session
            req.session.pendingRole = role;
            req.session.save();
            
            res.json({ success: true });
          });
          
          // Step 3: Initiate OAuth
          app.get('/auth/google', (req, res) => {
            // OAuth flow starts - role is in session, not URL
            const authUrl = generateGoogleOAuthUrl();
            res.redirect(authUrl);
          });
          
          // Step 4-6: OAuth callback
          app.get('/auth/google/callback', async (req, res) => {
            const { code } = req.query;
            
            // Get role from signed session (Access.4)
            const role = req.session.pendingRole;
            
            if (!role || !['parent', 'caregiver'].includes(role)) {
              return res.status(400).json({ error: 'Invalid session - role missing' });
            }
            
            // Complete OAuth flow
            const googleUser = await exchangeCodeForUser(code);
            
            // Create User with validated role
            const user = await base44.asServiceRole.entities.User.create({
              email: googleUser.email,
              full_name: googleUser.name,
              role: role,  // From signed session, NOT from URL
              email_verified: true  // Google verifies email
            });
            
            // Clean up session
            delete req.session.pendingRole;
            
            res.redirect('/dashboard');
          });
        `
      }
    }
  },
  
  /**
   * STATE MACHINE & LIFECYCLE (States.1-2)
   * Registration and verification lifecycle
   */
  state_machine: {
    
    registration_states: {
      // States.1: Registration lifecycle
      states: {
        unregistered: {
          state: 'Unregistered',
          description: 'User has not created an account',
          next_states: ['registered_unverified']
        },
        
        registered_unverified: {
          state: 'Registered (Email Unverified)',
          email_verified: false,
          can_login: true,
          restrictions: [
            'Caregivers cannot publish profile (F-002)',
            'Parents cannot submit booking requests',
            'Persistent banner shown: "Verify your email to unlock all features"'
          ],
          next_states: ['verified', 'abandoned']
        },
        
        verified: {
          state: 'Verified',
          email_verified: true,
          can_login: true,
          restrictions: 'None - full platform access',
          next_states: ['suspended', 'deleted']
        },
        
        abandoned: {
          state: 'Abandoned (Cleanup)',
          description: 'User registered but never verified email',
          cleanup_after: '48 hours',
          action: 'F-017 soft delete - anonymise email, set is_deleted=true'
        }
      },
      
      state_diagram: `
        ┌─────────────┐
        │Unregistered │
        └──────┬──────┘
               │
               │ Registration
               ↓
        ┌────────────────────┐
        │Registered          │
        │(Email Unverified)  │ ──────→ Abandoned (48h cleanup)
        │- Can login         │
        │- Cannot publish    │
        └──────┬─────────────┘
               │
               │ Email Verification
               ↓
        ┌─────────────┐
        │Verified     │
        │- Full access│
        └─────────────┘
      `
    },
    
    abandoned_registration_cleanup: {
      // States.2: Cleanup automation
      trigger: 'User created 48+ hours ago with email_verified=false',
      frequency: 'Daily cron job (post-MVP)',
      
      query: `
        // Find abandoned registrations
        async function getAbandonedRegistrations() {
          const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000);  // 48 hours ago
          
          const abandoned = await base44.asServiceRole.entities.User.filter({
            email_verified: false,
            created_date: { $lt: cutoffDate.toISOString() },
            is_deleted: false
          });
          
          return abandoned;
        }
      `,
      
      cleanup_action: `
        // Soft delete abandoned registrations
        async function cleanupAbandonedRegistrations() {
          const abandoned = await getAbandonedRegistrations();
          
          for (const user of abandoned) {
            // F-017 soft delete
            await base44.asServiceRole.entities.User.update(user.id, {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deletion_reason: 'Abandoned registration - email not verified within 48 hours',
              email: \`deleted_abandoned_\${user.id}@anon.local\`  // Anonymise
            });
            
            console.log('Cleaned up abandoned registration', user.id);
          }
        }
      `
    }
  },
  
  /**
   * BUSINESS LOGIC & CROSS-ENTITY RULES (Logic.1-3)
   * Role selection, ToS validation, profile creation
   */
  business_logic: {
    
    role_selection_ux: {
      // Logic.1: Role selection is a dedicated screen
      requirement: 'Role selection happens BEFORE registration form',
      rationale: 'Prevents role confusion, makes user intent clear',
      
      flow: [
        'Screen 1: Role selector (UI.1) - two cards (Parent / Caregiver)',
        'User clicks card → role is stored',
        'Screen 2: Registration form (UI.2) - role is pre-selected, not editable'
      ],
      
      implementation: `
        // Role selection page
        export default function RoleSelection() {
          const navigate = useNavigate();
          
          const selectRole = (role) => {
            // Store role in URL state (NOT editable in form)
            navigate('/register', { state: { role } });
          };
          
          return (
            <div>
              <h1>Join as a Parent or Caregiver</h1>
              
              <div className="role-cards">
                <RoleCard
                  title="I need a babysitter"
                  description="Find trusted caregivers"
                  role="parent"
                  onClick={() => selectRole('parent')}
                />
                
                <RoleCard
                  title="I am a babysitter"
                  description="Connect with families"
                  role="caregiver"
                  onClick={() => selectRole('caregiver')}
                />
              </div>
            </div>
          );
        }
        
        // Registration page
        export default function Register() {
          const location = useLocation();
          const role = location.state?.role;  // From role selector
          
          if (!role || !['parent', 'caregiver'].includes(role)) {
            // No valid role - redirect to role selector
            navigate('/select-role');
            return null;
          }
          
          // Role is pre-selected, not editable in form
          return (
            <RegistrationForm role={role} />
          );
        }
      `
    },
    
    tos_acceptance_validation: {
      // Logic.2: ToS acceptance server-side validation
      requirement: 'ToS checkbox must be validated server-side',
      rejection: 'Form submission without ToS acceptance is rejected BEFORE User creation',
      
      validation: `
        // Server-side registration handler
        async function handleRegistration(req, res) {
          const { email, full_name, password, role, tos_accepted } = req.body;
          
          // Logic.2: Validate ToS acceptance
          if (tos_accepted !== true) {
            return res.status(400).json({
              error: 'You must accept the Terms of Service to register'
            });
          }
          
          // Proceed with registration...
        }
      `,
      
      ui_requirement: {
        checkbox: 'Required checkbox with link to ToS and Privacy Policy',
        validation: 'Submit button disabled until checkbox is checked',
        server_check: 'Even if client-side validation bypassed, server rejects'
      }
    },
    
    atomic_profile_creation: {
      // Logic.3: Profile creation atomicity
      requirement: 'User + Profile creation must be atomic',
      rationale: 'Orphaned User without profile breaks all downstream features',
      
      transaction_flow: `
        // Atomic registration transaction
        async function createUserWithProfile(registrationData) {
          try {
            // Step 1: Create User
            const user = await base44.asServiceRole.entities.User.create({
              email: registrationData.email,
              full_name: registrationData.full_name,
              role: registrationData.role,
              password_hash: registrationData.password_hash,
              email_verified: false
            });
            
            try {
              // Step 2: Create Profile (Logic.3)
              let profile;
              
              if (user.role === 'caregiver') {
                profile = await base44.asServiceRole.entities.CaregiverProfile.create({
                  user_id: user.id,
                  display_name: user.full_name,
                  slug: generateSlug(user.full_name, user.id)
                });
              } else if (user.role === 'parent') {
                profile = await base44.asServiceRole.entities.ParentProfile.create({
                  user_id: user.id,
                  display_name: user.full_name
                });
              }
              
              try {
                // Step 3: Create PolicyAcceptance (Data.3)
                await createPolicyAcceptance(user.id, registrationData.ip_address);
                
                // Step 4: Send verification email (F-024)
                await sendVerificationEmail(user);
                
                return { success: true, user, profile };
                
              } catch (error) {
                // PolicyAcceptance failed - rollback User and Profile
                console.error('PolicyAcceptance creation failed', error);
                await base44.asServiceRole.entities.User.delete(user.id);
                if (profile) {
                  await deleteProfile(user.role, profile.id);
                }
                throw new Error('Registration failed - please try again');
              }
              
            } catch (error) {
              // Profile creation failed - rollback User (Logic.3)
              console.error('Profile creation failed', error);
              await base44.asServiceRole.entities.User.delete(user.id);
              throw new Error('Registration failed - please try again');
            }
            
          } catch (error) {
            // User creation failed
            console.error('User creation failed', error);
            throw error;
          }
        }
        
        // Create PolicyAcceptance (F-018)
        async function createPolicyAcceptance(userId, ipAddress) {
          // Fetch current policy versions
          const tosVersion = await getCurrentPolicyVersion('tos');
          const privacyVersion = await getCurrentPolicyVersion('privacy_policy');
          
          // Create acceptance records for both policies
          await base44.asServiceRole.entities.PolicyAcceptance.create({
            user_id: userId,
            policy_type: 'tos',
            policy_version: tosVersion.version,
            accepted_at: new Date().toISOString(),
            ip_address: ipAddress
          });
          
          await base44.asServiceRole.entities.PolicyAcceptance.create({
            user_id: userId,
            policy_type: 'privacy_policy',
            policy_version: privacyVersion.version,
            accepted_at: new Date().toISOString(),
            ip_address: ipAddress
          });
        }
      `
    }
  },
  
  /**
   * EVENT TRIGGERS & AUTOMATION (Triggers.1-2)
   * Registration sequence and duplicate detection
   */
  event_triggers: {
    
    registration_sequence: {
      // Triggers.1: Atomic registration automation
      steps: [
        '1. Validate all fields server-side',
        '2. Create User record',
        '3. Create CaregiverProfile or ParentProfile',
        '4. Create PolicyAcceptance records (ToS + Privacy)',
        '5. Send verification email (F-024)'
      ],
      
      atomicity: 'Any failure at steps 2-4 rolls back all prior steps',
      
      full_implementation: `
        // Complete registration handler
        async function registerUser(req, res) {
          const { email, full_name, password, role, tos_accepted } = req.body;
          const ip_address = req.ip;
          
          try {
            // Triggers.1 Step 1: Validate all fields
            validateRegistrationFields({ email, full_name, password, role, tos_accepted });
            
            // Hash password (F-026)
            const password_hash = await bcrypt.hash(password, 10);
            
            // Triggers.1 Steps 2-5: Atomic creation
            const result = await createUserWithProfile({
              email: email.toLowerCase().trim(),
              full_name: full_name.trim(),
              password_hash,
              role,
              ip_address
            });
            
            // Audit.1: Log successful registration
            console.info('User registered', {
              user_id: result.user.id,
              role: result.user.role,
              registration_method: 'email',
              timestamp: new Date().toISOString()
            });
            
            res.status(201).json({
              success: true,
              message: 'Registration successful. Please check your email to verify your account.',
              user_id: result.user.id
            });
            
          } catch (error) {
            // Audit.2: Log failed registration
            console.warn('Registration failed', {
              reason: error.message,
              ip: ip_address,
              timestamp: new Date().toISOString()
            });
            
            res.status(400).json({
              error: error.message
            });
          }
        }
        
        // Field validation (Triggers.1 Step 1)
        function validateRegistrationFields({ email, full_name, password, role, tos_accepted }) {
          // Email validation (Errors.2)
          if (!email || !isValidEmail(email)) {
            throw new Error('Please provide a valid email address');
          }
          
          // full_name validation (Data.1, Errors.3)
          const trimmedName = full_name?.trim();
          if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
            throw new Error('Name must be between 2 and 100 characters');
          }
          
          // Password validation (F-026)
          if (!password || password.length < 8) {
            throw new Error('Password must be at least 8 characters');
          }
          
          // Role validation (Access.2)
          if (!['parent', 'caregiver'].includes(role)) {
            throw new Error('Invalid role selected');
          }
          
          // ToS validation (Logic.2)
          if (tos_accepted !== true) {
            throw new Error('You must accept the Terms of Service');
          }
        }
        
        // Email format validation (Errors.2)
        function isValidEmail(email) {
          const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
          return emailRegex.test(email);
        }
      `
    },
    
    duplicate_email_detection: {
      // Triggers.2: Duplicate email handling
      check: 'Before User creation, check if email exists',
      message: 'An account with this email already exists. Sign in instead.',
      security: 'Do NOT reveal whether account used email/password or SSO',
      
      implementation: `
        // Duplicate email detection (Triggers.2)
        async function checkDuplicateEmail(email) {
          const normalizedEmail = email.toLowerCase().trim();
          
          const existing = await base44.asServiceRole.entities.User.filter({
            email: normalizedEmail,
            is_deleted: false
          });
          
          if (existing.length > 0) {
            // Triggers.2: Generic message (no method disclosure)
            throw new Error('An account with this email already exists. Sign in instead.');
          }
        }
        
        // Updated registration handler
        async function registerUser(req, res) {
          const { email, full_name, password, role, tos_accepted } = req.body;
          
          try {
            // Check duplicate email BEFORE validation (Triggers.2)
            await checkDuplicateEmail(email);
            
            // Proceed with validation and registration...
            
          } catch (error) {
            res.status(400).json({ error: error.message });
          }
        }
      `
    }
  },
  
  /**
   * ABUSE PREVENTION & RATE LIMITS (Abuse.1-3)
   * Registration rate limiting, CAPTCHA, disposable email
   */
  abuse_prevention: {
    
    registration_rate_limit: {
      // Abuse.1: Rate limiting
      limit: '5 registration attempts per IP per hour',
      enforcement: 'F-011 rate limiting infrastructure',
      escalation: [
        '1-5 attempts: Allow',
        '6-10 attempts: CAPTCHA required (Abuse.2)',
        '11+ attempts: Temporary IP block (F-014)'
      ],
      
      implementation: `
        // Registration rate limiter middleware
        const registrationRateLimiter = rateLimit({
          windowMs: 60 * 60 * 1000,  // 1 hour
          max: 5,  // Abuse.1: 5 attempts per IP
          message: 'Too many registration attempts. Please try again later.',
          
          handler: async (req, res) => {
            // Abuse.1: Log rate limit breach
            console.warn('Registration rate limit exceeded', {
              ip: req.ip,
              attempts: req.rateLimit.current,
              timestamp: new Date().toISOString()
            });
            
            // F-014: Create AbuseAlert
            await base44.asServiceRole.entities.AbuseAlert.create({
              alert_type: 'rate_limit_breach',
              source_ip: req.ip,
              description: \`Registration rate limit exceeded: \${req.rateLimit.current} attempts\`,
              severity: 'medium',
              triggered_at: new Date().toISOString()
            });
            
            res.status(429).json({
              error: 'Too many registration attempts. Please try again later.',
              retry_after: req.rateLimit.resetTime
            });
          }
        });
        
        // Apply to registration endpoint
        app.post('/api/register', registrationRateLimiter, registerUser);
      `
    },
    
    captcha_integration: {
      // Abuse.2: CAPTCHA on form submission
      when: 'Applied on registration form submission (F-023)',
      location: 'NOT on role selector - only on registration form',
      requirement: 'CAPTCHA token validated server-side',
      
      implementation: `
        // CAPTCHA validation (F-023)
        async function validateCaptcha(captchaToken) {
          // Validate with CAPTCHA provider (e.g., reCAPTCHA, hCaptcha)
          const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            body: JSON.stringify({
              secret: process.env.RECAPTCHA_SECRET_KEY,
              response: captchaToken
            })
          });
          
          const data = await response.json();
          
          if (!data.success) {
            throw new Error('CAPTCHA validation failed. Please try again.');
          }
        }
        
        // Updated registration handler
        async function registerUser(req, res) {
          const { email, full_name, password, role, tos_accepted, captcha_token } = req.body;
          
          try {
            // Abuse.2: Validate CAPTCHA (F-023)
            await validateCaptcha(captcha_token);
            
            // Proceed with registration...
            
          } catch (error) {
            // Audit.2: Log CAPTCHA failure
            console.warn('Registration CAPTCHA failed', {
              ip: req.ip,
              timestamp: new Date().toISOString()
            });
            
            res.status(400).json({ error: error.message });
          }
        }
      `
    },
    
    disposable_email_detection: {
      // Abuse.3: Optional disposable email check
      purpose: 'Prevent spam registrations with temporary emails',
      approach: 'Check against known disposable email domain list',
      action: 'Require non-disposable email address',
      
      implementation: `
        // Disposable email detection (Abuse.3 - optional)
        const DISPOSABLE_DOMAINS = [
          'tempmail.com', 'guerrillamail.com', '10minutemail.com',
          'throwaway.email', 'mailinator.com', 'trashmail.com'
          // Expand with comprehensive list
        ];
        
        function isDisposableEmail(email) {
          const domain = email.split('@')[1]?.toLowerCase();
          return DISPOSABLE_DOMAINS.includes(domain);
        }
        
        async function checkDisposableEmail(email) {
          if (isDisposableEmail(email)) {
            // Abuse.3: Log disposable attempt
            console.warn('Disposable email detected', {
              email: email,
              timestamp: new Date().toISOString()
            });
            
            throw new Error('Disposable email addresses are not allowed. Please use a permanent email.');
          }
        }
        
        // Add to registration handler
        async function registerUser(req, res) {
          const { email, ... } = req.body;
          
          try {
            // Abuse.3: Check disposable email (optional)
            await checkDisposableEmail(email);
            
            // Proceed...
          }
        }
      `
    }
  },
  
  /**
   * ERROR HANDLING (Errors.1-3, Edge.1-2)
   * Validation errors and edge cases
   */
  error_handling: {
    
    field_level_validation: {
      // Errors.1: Specific field errors
      requirement: 'Return specific field-level errors, not generic message',
      format: 'Each field shows its own inline error',
      
      example: `
        // Field-level validation response
        {
          "success": false,
          "errors": {
            "email": "Please enter a valid email address",
            "full_name": "Name must be at least 2 characters",
            "password": "Password must contain at least one number",
            "tos_accepted": "You must accept the Terms of Service"
          }
        }
        
        // Implementation
        function validateRegistrationFields(data) {
          const errors = {};
          
          // Email validation
          if (!data.email) {
            errors.email = 'Email is required';
          } else if (!isValidEmail(data.email)) {
            errors.email = 'Please enter a valid email address';
          }
          
          // Name validation
          const trimmedName = data.full_name?.trim();
          if (!trimmedName) {
            errors.full_name = 'Name is required';
          } else if (trimmedName.length < 2) {
            errors.full_name = 'Name must be at least 2 characters';
          } else if (trimmedName.length > 100) {
            errors.full_name = 'Name must be less than 100 characters';
          }
          
          // Password validation (F-026)
          if (!data.password) {
            errors.password = 'Password is required';
          } else if (data.password.length < 8) {
            errors.password = 'Password must be at least 8 characters';
          } else if (!/\\d/.test(data.password)) {
            errors.password = 'Password must contain at least one number';
          } else if (!/[!@#$%^&*]/.test(data.password)) {
            errors.password = 'Password must contain at least one special character';
          }
          
          // ToS validation
          if (data.tos_accepted !== true) {
            errors.tos_accepted = 'You must accept the Terms of Service';
          }
          
          if (Object.keys(errors).length > 0) {
            throw { field_errors: errors };
          }
        }
      `
    },
    
    email_format_validation: {
      // Errors.2: Server-side email regex
      requirement: 'Reject invalid email formats',
      examples: {
        invalid: ['user@', 'user@localhost', '@domain.com', 'user domain.com'],
        valid: ['user@example.com', 'user.name+tag@example.co.uk']
      },
      
      implementation: `
        // Errors.2: Email format validation
        function isValidEmail(email) {
          // Reject empty
          if (!email || typeof email !== 'string') {
            return false;
          }
          
          // Reject common invalid formats
          if (email === 'user@' || email === 'user@localhost') {
            return false;
          }
          
          // Regex validation
          const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
          return emailRegex.test(email);
        }
      `
    },
    
    full_name_sanitization: {
      // Errors.3: Whitespace handling
      requirement: 'Strip leading/trailing whitespace before saving',
      rejection: 'Reject if all whitespace (e.g., "   ")',
      
      implementation: `
        // Errors.3: full_name sanitization
        function sanitizeFullName(name) {
          if (!name || typeof name !== 'string') {
            throw new Error('Name is required');
          }
          
          const trimmed = name.trim();
          
          // Reject if all whitespace (Errors.3)
          if (trimmed.length === 0) {
            throw new Error('Name cannot be empty');
          }
          
          return trimmed;
        }
        
        // Apply in registration handler
        const sanitizedName = sanitizeFullName(req.body.full_name);
      `
    },
    
    race_condition_duplicate_email: {
      // Edge.1: Simultaneous registrations
      scenario: 'Two users register with same email simultaneously',
      database_protection: 'UNIQUE constraint on User.email',
      handling: 'Database rejects second insert with constraint error',
      
      implementation: `
        // Edge.1: Race condition handling
        async function createUser(userData) {
          try {
            const user = await base44.asServiceRole.entities.User.create(userData);
            return user;
            
          } catch (error) {
            // Edge.1: Check if unique constraint violation
            if (error.message.includes('unique') || error.message.includes('duplicate')) {
              // Surface friendly message (Triggers.2)
              throw new Error('An account with this email already exists. Sign in instead.');
            }
            
            // Other error
            throw error;
          }
        }
      `
    },
    
    sso_role_injection_prevention: {
      // Edge.2: OAuth role injection attack
      threat: 'Attacker modifies role parameter in OAuth callback URL',
      mitigation: 'Role stored in signed server-side session BEFORE OAuth',
      validation: 'Role read from session, NOT from URL parameters',
      
      attack_example: `
        // ATTACK: Malicious URL parameter injection
        // Attacker intercepts OAuth callback and modifies URL:
        // /auth/google/callback?code=abc123&role=super_admin
        
        // WRONG: Reading role from URL
        const role = req.query.role;  // NEVER DO THIS (Edge.2)
        
        // CORRECT: Reading role from signed session (Access.4)
        const role = req.session.pendingRole;  // Stored before OAuth flow
      `,
      
      full_flow: `
        // Edge.2: Secure SSO role handling
        
        // Step 1: Role selection (store in signed session)
        app.post('/select-role', (req, res) => {
          const { role } = req.body;
          
          if (!['parent', 'caregiver'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
          }
          
          // Store in signed session (Access.4, Edge.2)
          req.session.pendingRole = role;
          req.session.save();
          
          res.json({ success: true });
        });
        
        // Step 2: Initiate OAuth
        app.get('/auth/google', (req, res) => {
          // Verify session has role
          if (!req.session.pendingRole) {
            return res.status(400).json({ error: 'Role not selected' });
          }
          
          const authUrl = generateGoogleOAuthUrl();
          res.redirect(authUrl);
        });
        
        // Step 3: OAuth callback (Edge.2 - validate role from session)
        app.get('/auth/google/callback', async (req, res) => {
          const { code } = req.query;
          
          // Edge.2: Read role from SIGNED SESSION, not URL
          const role = req.session.pendingRole;
          
          if (!role || !['parent', 'caregiver'].includes(role)) {
            return res.status(400).json({
              error: 'Invalid session - role missing or tampered'
            });
          }
          
          // Complete OAuth - role is validated
          const googleUser = await exchangeCodeForUser(code);
          
          // Create user with validated role
          const user = await createUserWithProfile({
            email: googleUser.email,
            full_name: googleUser.name,
            role: role,  // From session, NOT from URL (Edge.2)
            email_verified: true
          });
          
          // Clean session
          delete req.session.pendingRole;
          
          res.redirect('/dashboard');
        });
      `
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-2)
   * Registration and failure logging
   */
  logging_audit: {
    
    successful_registration_logging: {
      // Audit.1: Log every registration
      log_level: 'INFO',
      fields: [
        'user_id',
        'role',
        'registration_method (email or Google SSO)',
        'timestamp',
        'ip_address (optional)'
      ],
      
      implementation: `
        // Audit.1: Log successful registration
        console.info('User registered', {
          user_id: user.id,
          role: user.role,
          registration_method: 'email',  // or 'google_sso'
          timestamp: new Date().toISOString(),
          ip_address: req.ip
        });
      `
    },
    
    failed_registration_logging: {
      // Audit.2: Log failed attempts
      log_level: 'WARN',
      fields: [
        'reason (validation error, duplicate email, CAPTCHA fail)',
        'ip_address',
        'timestamp',
        'attempted_email (masked)'
      ],
      aggregation: 'Aggregate for abuse detection (F-014)',
      
      implementation: `
        // Audit.2: Log failed registration
        console.warn('Registration failed', {
          reason: error.message,
          ip: req.ip,
          timestamp: new Date().toISOString(),
          attempted_email: maskEmail(email)  // user@example.com → u***@e***.com
        });
        
        // Mask email for privacy
        function maskEmail(email) {
          const [local, domain] = email.split('@');
          const maskedLocal = local[0] + '***';
          const maskedDomain = domain[0] + '***.' + domain.split('.').pop();
          return \`\${maskedLocal}@\${maskedDomain}\`;
        }
      `
    }
  }
};

/**
 * ============================================================================
 * UI SPECIFICATIONS (UI.1-2)
 * Role selector and registration form
 * ============================================================================
 */
const F021_UI_SPECIFICATIONS = {
  
  role_selector_screen: {
    // UI.1: Screen 1 - Role Selector
    layout: 'Two large cards side by side (mobile: stacked vertically)',
    
    parent_card: {
      icon: 'Parent/user icon',
      title: 'I need a babysitter',
      description: 'Find trusted caregivers for your family',
      button: 'Get started',
      action: 'Navigate to /register with role=parent'
    },
    
    caregiver_card: {
      icon: 'Heart/babysitter icon',
      title: 'I am a babysitter',
      description: 'Connect with families in your area',
      button: 'Get started',
      action: 'Navigate to /register with role=caregiver'
    },
    
    requirements: [
      'No other content on this screen - just the two cards',
      'Cards are large and visually distinct',
      'Mobile responsive: stack vertically on small screens',
      'No role dropdown - selection is via card click only'
    ]
  },
  
  registration_form_screen: {
    // UI.2: Screen 2 - Registration Form
    fields: [
      'full_name (Text input, required, 2-100 chars)',
      'email (Email input, required, unique)',
      'password (Password input, required, min 8 chars)',
      'confirm_password (Password input, required, must match password)',
      'tos_accepted (Checkbox with link to ToS and Privacy Policy)'
    ],
    
    validation: {
      client_side: 'Inline validation on blur',
      server_side: 'Final validation on submit',
      submit_button: 'Disabled until all fields valid and ToS checked'
    },
    
    captcha: {
      location: 'Embedded inline below form (F-023)',
      provider: 'reCAPTCHA or hCaptcha',
      validation: 'CAPTCHA token sent with form submission'
    },
    
    google_sso: {
      button: 'Or sign up with Google',
      location: 'Below form, separated by divider',
      flow: 'Initiates OAuth flow with role from previous screen'
    },
    
    requirements: [
      'Role is pre-selected from previous screen (not editable)',
      'All fields show inline validation errors',
      'Password strength indicator',
      'ToS checkbox links open in new tab',
      'Submit button disabled until valid',
      'Loading state during submission',
      'Success: Redirect to email verification screen (F-029)'
    ]
  }
};

/**
 * ============================================================================
 * PLATFORM CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F021_CONFIGURATION_CHECKLIST = [
  {
    category: 'User Entity Configuration',
    tasks: [
      { task: 'Verify User entity has required fields (email, full_name, role, email_verified)', status: 'verify' },
      { task: 'Ensure role field has enum: [parent, caregiver, trust_admin, super_admin]', status: 'verify' },
      { task: 'Configure role field as IMMUTABLE (no self-update)', status: 'pending' },
      { task: 'Add password_hash field (optional, for email/password registrations)', status: 'verify' },
      { task: 'F-012 fields exist (login_fail_count, locked_until)', status: 'verify' },
      { task: 'F-015 fields exist (is_suspended, suspension_reason)', status: 'verify' }
    ]
  },
  {
    category: 'Registration Endpoint',
    tasks: [
      { task: 'Create public registration endpoint (no auth required)', status: 'pending' },
      { task: 'Implement field validation (email, full_name, password, role, ToS)', status: 'pending' },
      { task: 'Implement duplicate email detection (Triggers.2)', status: 'pending' },
      { task: 'Implement CAPTCHA validation (F-023)', status: 'pending' },
      { task: 'Hash password with bcrypt (F-026)', status: 'pending' },
      { task: 'Apply rate limiting: 5 attempts/IP/hour (Abuse.1)', status: 'pending' }
    ]
  },
  {
    category: 'Atomic Profile Creation',
    tasks: [
      { task: 'Implement createUserWithProfile transaction (Logic.3)', status: 'pending' },
      { task: 'Create CaregiverProfile if role=caregiver', status: 'pending' },
      { task: 'Create ParentProfile if role=parent', status: 'pending' },
      { task: 'Rollback User if Profile creation fails', status: 'pending' },
      { task: 'Create PolicyAcceptance atomically (Data.3, F-018)', status: 'pending' },
      { task: 'Rollback all if PolicyAcceptance fails', status: 'pending' }
    ]
  },
  {
    category: 'Email Verification',
    tasks: [
      { task: 'Send verification email after registration (F-024)', status: 'pending' },
      { task: 'email_verified defaults to false', status: 'verify' },
      { task: 'Implement verification email template', status: 'pending' },
      { task: 'Generate verification token (24-hour expiry)', status: 'pending' }
    ]
  },
  {
    category: 'Google SSO Integration',
    tasks: [
      { task: 'Configure Google OAuth connector (F-022)', status: 'pending' },
      { task: 'Implement role selection before OAuth flow (Access.4)', status: 'pending' },
      { task: 'Store role in signed server-side session (Edge.2)', status: 'pending' },
      { task: 'Validate role from session in OAuth callback (NOT from URL)', status: 'pending' },
      { task: 'Set email_verified=true for Google SSO users', status: 'pending' }
    ]
  },
  {
    category: 'Abuse Prevention',
    tasks: [
      { task: 'Apply rate limiting to registration endpoint (Abuse.1)', status: 'pending' },
      { task: 'Integrate CAPTCHA on registration form (F-023)', status: 'pending' },
      { task: 'Implement disposable email detection (Abuse.3, optional)', status: 'pending' },
      { task: 'Log rate limit breaches to AbuseAlert (F-014)', status: 'pending' }
    ]
  },
  {
    category: 'Error Handling',
    tasks: [
      { task: 'Return field-level validation errors (Errors.1)', status: 'pending' },
      { task: 'Implement email format validation (Errors.2)', status: 'pending' },
      { task: 'Sanitize full_name (strip whitespace, Errors.3)', status: 'pending' },
      { task: 'Handle race condition on duplicate email (Edge.1)', status: 'pending' },
      { task: 'Prevent SSO role injection (Edge.2)', status: 'pending' }
    ]
  },
  {
    category: 'Logging & Audit',
    tasks: [
      { task: 'Log successful registrations (Audit.1)', status: 'pending' },
      { task: 'Log failed registration attempts (Audit.2)', status: 'pending' },
      { task: 'Mask email in failure logs for privacy', status: 'pending' }
    ]
  },
  {
    category: 'Cleanup Automation',
    tasks: [
      { task: 'Implement abandoned registration query (States.2)', status: 'pending' },
      { task: 'Schedule daily cleanup job (48-hour threshold)', status: 'pending' },
      { task: 'F-017 soft delete abandoned accounts', status: 'pending' }
    ]
  },
  {
    category: 'UI Implementation',
    tasks: [
      { task: 'Create RoleSelection page (UI.1)', status: 'pending' },
      { task: 'Create Register page (UI.2)', status: 'pending' },
      { task: 'Implement inline field validation', status: 'pending' },
      { task: 'Integrate CAPTCHA component', status: 'pending' },
      { task: 'Add Google SSO button', status: 'pending' },
      { task: 'Disable submit until form valid', status: 'pending' }
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * CRITICAL DEPENDENCIES (Phase 0):
 * - User entity with role field (F-000)
 * - CaregiverProfile and ParentProfile entities
 * - PolicyAcceptance entity (F-018)
 * - F-012 brute-force protection fields
 * - F-015 suspension fields
 * - F-011 rate limiting infrastructure
 * - F-014 AbuseAlert entity
 * 
 * CRITICAL SECURITY REQUIREMENTS:
 * - Access.2: No admin roles via registration
 * - Access.3: Role is IMMUTABLE after creation
 * - Access.4: SSO role validated from signed session (NOT URL)
 * - Logic.2: ToS acceptance validated server-side
 * - Logic.3: User + Profile creation is atomic (rollback on failure)
 * - Triggers.2: Duplicate email detection (generic message)
 * - Abuse.1: Rate limiting (5 attempts/IP/hour)
 * - Edge.2: Prevent SSO role injection attack
 * 
 * ATOMICITY REQUIREMENTS:
 * - User + CaregiverProfile/ParentProfile must succeed together
 * - User + PolicyAcceptance must succeed together
 * - Any failure rolls back all prior steps
 * 
 * NEXT STEPS:
 * 1. Verify User entity configuration
 * 2. Implement registration endpoint with validation
 * 3. Implement atomic profile creation transaction
 * 4. Integrate CAPTCHA (F-023)
 * 5. Configure rate limiting (F-011)
 * 6. Integrate email verification (F-024)
 * 7. Configure Google SSO with role selection (F-022)
 * 8. Create UI components (role selector + registration form)
 * 9. Test all error handling and edge cases
 * 10. Verify logging and audit trail
 */

export default function F021UserRegistrationDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-021: User Registration — Split Flows</h1>
      <p><strong>Phase 1 Status:</strong> Authentication & User Registration</p>
      <p><strong>Dependencies:</strong> Phase 0 complete (User entity, RBAC, security controls)</p>
      
      <h2>Critical Security Requirements</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ IMMUTABLE ROLE ENFORCEMENT</strong>
        <ul>
          <li><strong>Access.2:</strong> NO admin roles via registration (only parent/caregiver)</li>
          <li><strong>Access.3:</strong> Role is IMMUTABLE after creation (non-admin cannot change)</li>
          <li><strong>Access.4:</strong> SSO role validated from signed session (NOT URL parameters)</li>
          <li><strong>Logic.2:</strong> ToS acceptance validated server-side (REQUIRED)</li>
          <li><strong>Logic.3:</strong> User + Profile creation is atomic (rollback on failure)</li>
          <li><strong>Edge.2:</strong> Prevent SSO role injection attack</li>
        </ul>
      </div>
      
      <h2>Registration Flow</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`Screen 1: Role Selector
┌────────────────────────────────────────┐
│  "I need a babysitter"  │  "I am a babysitter"  │
│  (Parent card)          │  (Caregiver card)     │
└────────────────────────────────────────┘
         │                        │
         └────────┬───────────────┘
                  │
                  ↓
Screen 2: Registration Form
┌────────────────────────────────────────┐
│  Full Name:     [input]                │
│  Email:         [input]                │
│  Password:      [input]                │
│  Confirm:       [input]                │
│  ☐ I accept ToS & Privacy Policy       │
│  [CAPTCHA]                             │
│  [Register] or [Sign up with Google]   │
└────────────────────────────────────────┘
         │
         ↓
Atomic Transaction (Logic.3):
1. Validate fields
2. Create User
3. Create CaregiverProfile/ParentProfile
4. Create PolicyAcceptance (ToS + Privacy)
5. Send verification email (F-024)
         │
         ↓
Email Verification Screen (F-029)`}
      </pre>
      
      <h2>Data Model</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Field</th>
            <th>Type</th>
            <th>Constraints</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>email</td>
            <td>Text</td>
            <td>UNIQUE, lowercase-normalised, REQUIRED</td>
          </tr>
          <tr>
            <td>full_name</td>
            <td>Text</td>
            <td>2-100 chars, REQUIRED, whitespace stripped</td>
          </tr>
          <tr>
            <td>role</td>
            <td>Select</td>
            <td>parent OR caregiver, IMMUTABLE, REQUIRED</td>
          </tr>
          <tr>
            <td>email_verified</td>
            <td>Boolean</td>
            <td>Default: false</td>
          </tr>
          <tr>
            <td>password_hash</td>
            <td>Text</td>
            <td>bcrypt hash (email/password registrations only)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Atomic Profile Creation (Logic.3)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>CRITICAL: Atomicity required</strong>
        <ol>
          <li>Create User record</li>
          <li>Create CaregiverProfile OR ParentProfile (based on role)</li>
          <li>Create PolicyAcceptance records (ToS + Privacy Policy)</li>
          <li>Send verification email</li>
        </ol>
        <p><strong>If any step fails:</strong> Rollback ALL prior steps</p>
        <p><strong>Rationale:</strong> Orphaned User without profile breaks downstream features</p>
      </div>
      
      <h2>Abuse Prevention</h2>
      <ul>
        <li><strong>Rate Limiting (Abuse.1):</strong> 5 registration attempts per IP per hour</li>
        <li><strong>CAPTCHA (Abuse.2):</strong> Applied on registration form submission (F-023)</li>
        <li><strong>Disposable Email (Abuse.3):</strong> Optional detection and blocking</li>
        <li><strong>Duplicate Detection (Triggers.2):</strong> Generic message (no method disclosure)</li>
      </ul>
      
      <h2>Role Immutability (Access.3)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ ROLE CANNOT BE CHANGED BY NON-ADMIN</strong>
        <ul>
          <li>Database: Reject UPDATE of User.role by non-admin</li>
          <li>API: Reject any request to change role by non-admin</li>
          <li>UI: No UI element for role change</li>
          <li><strong>Exception:</strong> super_admin can change via admin panel + AdminActionLog</li>
        </ul>
      </div>
      
      <h2>SSO Role Injection Prevention (Edge.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL SECURITY: Prevent role parameter tampering</strong>
        <ol>
          <li>User selects role on role selector screen</li>
          <li>Server stores role in <strong>signed server-side session</strong></li>
          <li>OAuth flow initiated</li>
          <li>OAuth callback returns</li>
          <li>Server reads role from <strong>session (NOT from URL)</strong></li>
          <li>User created with validated role</li>
        </ol>
        <p><strong>NEVER:</strong> Read role from URL parameters or client-supplied data</p>
      </div>
      
      <h2>Error Handling</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Error Type</th>
            <th>Handling</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Field Validation (Errors.1)</td>
            <td>Return specific field-level errors (not generic message)</td>
          </tr>
          <tr>
            <td>Email Format (Errors.2)</td>
            <td>Server-side regex check, reject invalid domains</td>
          </tr>
          <tr>
            <td>Name Whitespace (Errors.3)</td>
            <td>Strip leading/trailing whitespace, reject if all whitespace</td>
          </tr>
          <tr>
            <td>Duplicate Email (Edge.1)</td>
            <td>Database UNIQUE constraint + friendly message</td>
          </tr>
          <tr>
            <td>SSO Role Injection (Edge.2)</td>
            <td>Validate role from signed session, NOT URL</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Registration State Machine (States.1-2)</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`Unregistered
     │
     │ Registration
     ↓
Registered (Email Unverified)
- Can login
- Cannot publish profile (caregivers)
- Cannot submit bookings (parents)
- Persistent banner: "Verify your email"
     │
     │ Email Verification (F-024)
     ↓
Verified
- Full platform access

If email not verified within 48 hours:
→ Abandoned (soft delete via cleanup automation)`}
      </pre>
      
      <h2>Logging & Audit</h2>
      <ul>
        <li><strong>Successful Registration (Audit.1):</strong> Log user_id, role, method, timestamp</li>
        <li><strong>Failed Attempts (Audit.2):</strong> Log reason, IP, timestamp (email masked)</li>
        <li><strong>Aggregation:</strong> Failed attempts used for abuse detection (F-014)</li>
      </ul>
      
      <h2>UI Specifications</h2>
      <h3>Screen 1: Role Selector (UI.1)</h3>
      <ul>
        <li>Two large cards side by side (mobile: stacked)</li>
        <li>Parent card: "I need a babysitter"</li>
        <li>Caregiver card: "I am a babysitter"</li>
        <li>No other content on screen</li>
        <li>Click card → navigate to registration form with role</li>
      </ul>
      
      <h3>Screen 2: Registration Form (UI.2)</h3>
      <ul>
        <li>Fields: full_name, email, password, confirm_password</li>
        <li>ToS checkbox with link (opens in new tab)</li>
        <li>CAPTCHA embedded inline below form</li>
        <li>Google SSO button: "Or sign up with Google"</li>
        <li>Submit button disabled until all fields valid and ToS checked</li>
        <li>Inline validation on blur</li>
        <li>Password strength indicator</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Verify User entity configuration (email, role, email_verified fields)</li>
        <li>Configure role field as IMMUTABLE (non-admin cannot update)</li>
        <li>Create public registration endpoint (no auth required)</li>
        <li>Implement field validation (email, name, password, role, ToS)</li>
        <li>Implement duplicate email detection (Triggers.2)</li>
        <li>Hash password with bcrypt (F-026)</li>
        <li>Implement atomic User + Profile + PolicyAcceptance creation (Logic.3)</li>
        <li>Rollback transaction if any step fails</li>
        <li>Send verification email after registration (F-024)</li>
        <li>Apply rate limiting: 5 attempts/IP/hour (Abuse.1)</li>
        <li>Integrate CAPTCHA validation (F-023)</li>
        <li>Implement disposable email detection (Abuse.3, optional)</li>
        <li>Configure Google SSO with role selection (F-022)</li>
        <li>Store role in signed server-side session (Access.4, Edge.2)</li>
        <li>Validate role from session in OAuth callback (NOT URL)</li>
        <li>Implement abandoned registration cleanup (States.2, 48 hours)</li>
        <li>Create RoleSelection page (UI.1)</li>
        <li>Create Register page (UI.2)</li>
        <li>Implement inline field validation</li>
        <li>Add Google SSO button</li>
        <li>Disable submit until form valid</li>
        <li>Log successful registrations (Audit.1)</li>
        <li>Log failed attempts (Audit.2, email masked)</li>
        <li>Test all error handling and edge cases</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete implementation details, validation logic, and SSO security patterns.</em></p>
    </div>
  );
}