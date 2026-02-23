/**
 * F-022: GOOGLE SSO CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-022
 * Google OAuth 2.0 Single Sign-On integration. Implements secure OAuth flow with
 * role selection, account linking, and CSRF protection.
 * 
 * STATUS: Phase 1 - Authentication & User Registration
 * DEPENDENCIES: F-021 (User Registration), User entity with google_sub field
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F022_GOOGLE_SSO_SPECIFICATION = {
  
  /**
   * DATA MODEL & CONSTRAINTS (Data.1-4)
   * Google OAuth configuration and User entity fields
   */
  data_model: {
    
    google_oauth_configuration: {
      // Data.1: Google OAuth 2.0 as Base44 connector
      provider: 'Google OAuth 2.0',
      integration_type: 'Base44 connector (app_connectors)',
      
      environment_variables: {
        GOOGLE_CLIENT_ID: 'OAuth Client ID from Google Cloud Console',
        GOOGLE_CLIENT_SECRET: 'OAuth Client Secret (NEVER in source code)',
        GOOGLE_REDIRECT_URI: 'https://[domain]/auth/google/callback',
        
        security_note: 'Client ID and Secret stored in Base44 environment variables ONLY'
      },
      
      google_cloud_console_setup: [
        '1. Create OAuth 2.0 Client ID in Google Cloud Console',
        '2. Add authorized redirect URI: https://[domain]/auth/google/callback',
        '3. Copy Client ID and Client Secret to Base44 environment',
        '4. Enable Google+ API (for profile data)'
      ]
    },
    
    user_entity_fields: {
      // Data.2: Fields written on first SSO registration
      id: 'UUID (auto-generated)',
      email: 'From Google profile, lowercase-normalised',
      full_name: 'From Google profile displayName',
      role: 'From pre-OAuth role selection (Logic.1)',
      email_verified: 'Set to true immediately - Google verifies email',
      google_sub: 'Text (unique) - Google\'s persistent user ID for login matching',
      created_at: 'DateTime (auto-generated)',
      
      // Data.3: password_hash NOT written for SSO users
      password_hash: 'NULL for SSO-only users (setting password is post-MVP)',
      
      note: 'google_sub is Google\'s "sub" claim - stable user identifier'
    },
    
    account_matching: {
      // Data.4: Subsequent SSO logins
      matching_strategy: [
        '1. First: Match by google_sub (if exists)',
        '2. Then: Match by email (if google_sub not set)',
        '3. Never create duplicate User if one already exists'
      ],
      
      implementation: `
        // Account matching logic (Data.4)
        async function findOrCreateUser(googleProfile, role) {
          // Step 1: Try to match by google_sub
          let user = await base44.asServiceRole.entities.User.filter({
            google_sub: googleProfile.sub
          });
          
          if (user.length > 0) {
            // States.2: Returning SSO user
            return { user: user[0], isNew: false };
          }
          
          // Step 2: Try to match by email
          user = await base44.asServiceRole.entities.User.filter({
            email: googleProfile.email.toLowerCase(),
            is_deleted: false
          });
          
          if (user.length > 0) {
            // States.3: Account linking - set google_sub on existing user
            await base44.asServiceRole.entities.User.update(user[0].id, {
              google_sub: googleProfile.sub,
              email_verified: true  // Google verified email
            });
            
            console.log('Account linked', {
              user_id: user[0].id,
              google_sub: googleProfile.sub.substring(0, 8)
            });
            
            return { user: user[0], isNew: false };
          }
          
          // Step 3: New user - create account
          // States.1: First-time SSO registration
          const newUser = await createUserFromGoogle(googleProfile, role);
          return { user: newUser, isNew: true };
        }
      `
    }
  },
  
  /**
   * ACCESS CONTROL & PERMISSIONS (Access.1-3)
   * OAuth redirect URI and token validation
   */
  access_control: {
    
    redirect_uri_security: {
      // Access.1: Redirect URI must be registered in Google Cloud Console
      requirement: 'Only registered redirect URIs accepted by Google',
      registered_uri: 'https://[domain]/auth/google/callback',
      security_control: 'Architectural control outside Base44 - Google enforces',
      
      threat: 'Attacker cannot redirect OAuth callback to malicious domain',
      mitigation: 'Google validates redirect_uri against registered list'
    },
    
    token_validation: {
      // Access.2: Validate Google ID token
      requirement: 'Server MUST validate Google ID token before creating/updating User',
      
      validation_checks: [
        'Signature: Verify JWT signature using Google\'s public keys',
        'Audience: Verify aud claim matches GOOGLE_CLIENT_ID',
        'Expiry: Verify exp claim is not in the past',
        'Issuer: Verify iss claim is accounts.google.com or https://accounts.google.com'
      ],
      
      implementation: `
        // Access.2: Google ID token validation
        async function validateGoogleIdToken(idToken) {
          try {
            // Use Google's token verification library
            const ticket = await googleClient.verifyIdToken({
              idToken: idToken,
              audience: process.env.GOOGLE_CLIENT_ID
            });
            
            const payload = ticket.getPayload();
            
            // Verify issuer
            if (payload.iss !== 'accounts.google.com' && 
                payload.iss !== 'https://accounts.google.com') {
              throw new Error('Invalid issuer');
            }
            
            // Verify audience
            if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
              throw new Error('Invalid audience');
            }
            
            // Verify expiry (library does this automatically)
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp < now) {
              throw new Error('Token expired');
            }
            
            return {
              sub: payload.sub,  // Google user ID
              email: payload.email,
              email_verified: payload.email_verified,
              name: payload.name,
              picture: payload.picture
            };
            
          } catch (error) {
            // Errors.1: Token validation failure
            console.error('Google token validation failed', error);
            throw new Error('Sign in failed — please try again.');
          }
        }
      `
    },
    
    oauth_scopes: {
      // Access.3: Minimal scopes
      scopes_requested: ['email', 'profile'],
      not_requested: ['drive', 'calendar', 'contacts'],
      rationale: 'Request only necessary scopes - email and profile for authentication',
      
      scope_string: 'email profile'
    }
  },
  
  /**
   * STATE MACHINE & LIFECYCLE (States.1-3)
   * First-time vs returning SSO users
   */
  state_machine: {
    
    first_time_sso: {
      // States.1: First-time SSO lifecycle
      flow: [
        '1. OAuth completes',
        '2. Role selection required (if not already set in session)',
        '3. User record created with google_sub',
        '4. CaregiverProfile or ParentProfile created',
        '5. PolicyAcceptance records created',
        '6. User lands on dashboard'
      ],
      
      state_diagram: `
        Role Selection (pre-OAuth)
               │
               │ Store role in signed session
               ↓
        Initiate Google OAuth
               │
               │ User authenticates with Google
               ↓
        OAuth Callback
               │
               │ Validate ID token
               │ Read role from session
               ↓
        Create User + Profile + PolicyAcceptance
               │
               ↓
        Issue JWT Session
               │
               ↓
        Dashboard
      `
    },
    
    returning_sso: {
      // States.2: Returning SSO lifecycle
      flow: [
        '1. OAuth completes',
        '2. Match existing User by google_sub',
        '3. Update last_login_at',
        '4. Issue JWT session',
        '5. User lands on dashboard'
      ],
      
      implementation: `
        // States.2: Returning SSO user
        async function handleReturningUser(user) {
          // Update last login timestamp
          await base44.asServiceRole.entities.User.update(user.id, {
            last_login_at: new Date().toISOString()
          });
          
          // Triggers.2: Optionally update full_name if changed
          // Only on first login after linking, not every time
          if (!user.google_profile_synced && googleProfile.name !== user.full_name) {
            await base44.asServiceRole.entities.User.update(user.id, {
              full_name: googleProfile.name,
              google_profile_synced: true
            });
          }
          
          // Issue JWT session
          const jwt = generateJWT(user);
          
          return { user, jwt };
        }
      `
    },
    
    account_linking: {
      // States.3: Link email/password account with Google
      scenario: 'User previously registered with email/password, now logs in with Google',
      action: 'Set google_sub on existing User record',
      no_duplicate: 'Do not create duplicate User',
      
      implementation: `
        // States.3: Account linking
        async function linkGoogleAccount(existingUser, googleProfile) {
          // User exists with email/password, now logging in via Google
          await base44.asServiceRole.entities.User.update(existingUser.id, {
            google_sub: googleProfile.sub,
            email_verified: true  // Google verified email
          });
          
          console.log('Account linked with Google', {
            user_id: existingUser.id,
            google_sub: googleProfile.sub.substring(0, 8),
            email: existingUser.email
          });
          
          return existingUser;
        }
      `
    }
  },
  
  /**
   * BUSINESS LOGIC & CROSS-ENTITY RULES (Logic.1-3)
   * Role selection, ToS acceptance, OAuth dismissal
   */
  business_logic: {
    
    role_selection_security: {
      // Logic.1: Role selection BEFORE OAuth
      requirement: 'Role must be selected before OAuth flow initiates',
      storage: 'Signed server-side session (NOT URL parameter)',
      validation: 'Role read from session after OAuth callback',
      
      threat_prevention: 'F-021 Edge.2 - Prevents SSO role injection attack',
      
      flow: `
        // Logic.1: Role selection flow
        
        // Step 1: User selects role on RoleSelection page
        async function selectRoleForSSO(role) {
          // Validate role
          if (!['parent', 'caregiver'].includes(role)) {
            throw new Error('Invalid role');
          }
          
          // Store in signed server-side session
          req.session.pendingOAuthRole = role;
          req.session.oauthState = generateRandomState();  // Abuse.1
          req.session.save();
          
          return { success: true };
        }
        
        // Step 2: Initiate OAuth flow
        function initiateGoogleOAuth(req, res) {
          // Verify role is set in session
          if (!req.session.pendingOAuthRole) {
            return res.redirect('/select-role');
          }
          
          const authUrl = googleClient.generateAuthUrl({
            access_type: 'offline',
            scope: ['email', 'profile'],
            state: req.session.oauthState  // CSRF protection (Abuse.1)
          });
          
          res.redirect(authUrl);
        }
        
        // Step 3: OAuth callback
        async function handleGoogleCallback(req, res) {
          const { code, state } = req.query;
          
          // Abuse.1: Validate state parameter (CSRF protection)
          if (state !== req.session.oauthState) {
            throw new Error('Invalid state - possible CSRF attack');
          }
          
          // Logic.1: Read role from signed session (NOT from URL)
          const role = req.session.pendingOAuthRole;
          
          if (!role || !['parent', 'caregiver'].includes(role)) {
            throw new Error('Invalid session - role missing');
          }
          
          // Exchange code for tokens
          const { tokens } = await googleClient.getToken(code);
          const idToken = tokens.id_token;
          
          // Validate ID token (Access.2)
          const googleProfile = await validateGoogleIdToken(idToken);
          
          // Find or create user
          const { user, isNew } = await findOrCreateUser(googleProfile, role);
          
          // Clean up session
          delete req.session.pendingOAuthRole;
          delete req.session.oauthState;
          
          // Issue JWT
          const jwt = generateJWT(user);
          
          res.redirect('/dashboard');
        }
      `
    },
    
    tos_acceptance: {
      // Logic.2: ToS acceptance for SSO users
      timing: 'Captured on role selection screen before OAuth starts',
      creation: 'PolicyAcceptance record created after OAuth callback completes',
      
      implementation: `
        // Logic.2: ToS acceptance for SSO users
        async function createUserFromGoogle(googleProfile, role) {
          // Create User record
          const user = await base44.asServiceRole.entities.User.create({
            email: googleProfile.email.toLowerCase(),
            full_name: googleProfile.name,
            role: role,
            email_verified: true,  // Google verified
            google_sub: googleProfile.sub
          });
          
          // Create profile
          if (role === 'caregiver') {
            await base44.asServiceRole.entities.CaregiverProfile.create({
              user_id: user.id,
              display_name: user.full_name,
              slug: generateSlug(user.full_name, user.id)
            });
          } else {
            await base44.asServiceRole.entities.ParentProfile.create({
              user_id: user.id,
              display_name: user.full_name
            });
          }
          
          // Logic.2: Create PolicyAcceptance (F-018)
          const currentPolicies = await getCurrentPolicyVersions();
          
          for (const policyType of ['tos', 'privacy_policy']) {
            await base44.asServiceRole.entities.PolicyAcceptance.create({
              user_id: user.id,
              policy_type: policyType,
              policy_version: currentPolicies[policyType].version,
              accepted_at: new Date().toISOString(),
              ip_address: req.ip
            });
          }
          
          return user;
        }
      `
    },
    
    oauth_dismissal: {
      // Logic.3: User dismisses OAuth popup
      scenario: 'User closes Google OAuth popup without completing authentication',
      action: 'Discard pending session state',
      result: 'User returns to role selection screen',
      
      implementation: `
        // Logic.3: OAuth dismissal handling
        // Google OAuth popup closed without completing
        // Callback endpoint is never reached
        // Session state expires naturally (30-minute session timeout)
        // User can restart flow from role selection
        
        // Optional: Cleanup expired OAuth sessions
        async function cleanupExpiredOAuthSessions() {
          // Run periodically to clean up sessions with pendingOAuthRole
          // older than 30 minutes
        }
      `
    }
  },
  
  /**
   * EVENT TRIGGERS & AUTOMATION (Triggers.1-2)
   * OAuth callback automation and profile refresh
   */
  event_triggers: {
    
    oauth_callback_automation: {
      // Triggers.1: OAuth callback sequence
      steps: [
        '1. Validate Google ID token (signature, audience, expiry)',
        '2. Check for existing User by google_sub or email',
        '3. If new: create User, profile, PolicyAcceptance',
        '4. If existing: update last_login_at, set google_sub if missing',
        '5. Issue JWT session'
      ],
      
      full_implementation: `
        // Triggers.1: Complete OAuth callback automation
        async function handleGoogleOAuthCallback(req, res) {
          try {
            const { code, state } = req.query;
            
            // Step 1: Validate state (CSRF protection)
            if (state !== req.session.oauthState) {
              throw new Error('Invalid state parameter');
            }
            
            // Exchange authorization code for tokens
            const { tokens } = await googleClient.getToken(code);
            
            // Step 1: Validate Google ID token
            const googleProfile = await validateGoogleIdToken(tokens.id_token);
            
            // Errors.2: Check if email exists
            if (!googleProfile.email) {
              throw new Error('A valid email address is required to create an account.');
            }
            
            // Get role from session
            const role = req.session.pendingOAuthRole;
            
            // Step 2: Check for existing User
            const { user, isNew } = await findOrCreateUser(googleProfile, role);
            
            // Step 4: Update last_login_at for existing user
            if (!isNew) {
              await base44.asServiceRole.entities.User.update(user.id, {
                last_login_at: new Date().toISOString()
              });
            }
            
            // Step 5: Issue JWT session
            const jwt = generateJWT(user);
            
            // Audit.1: Log SSO login
            console.info('SSO login successful', {
              user_id: user.id,
              google_sub: googleProfile.sub.substring(0, 8),
              login_method: 'google_sso',
              timestamp: new Date().toISOString(),
              is_new_user: isNew
            });
            
            // Clean up session
            delete req.session.pendingOAuthRole;
            delete req.session.oauthState;
            
            // Redirect to dashboard
            res.redirect('/dashboard');
            
          } catch (error) {
            // Audit.2: Log failed SSO attempt
            console.warn('SSO login failed', {
              reason: error.message,
              ip: req.ip,
              timestamp: new Date().toISOString()
            });
            
            // Errors.1: Generic error message
            res.redirect('/login?error=sso_failed');
          }
        }
      `
    },
    
    profile_data_refresh: {
      // Triggers.2: Update full_name from Google profile
      timing: 'On each login',
      condition: 'Only update on first login (one-time sync)',
      no_overwrite: 'Do not overwrite user-edited full_name without consent',
      
      implementation: `
        // Triggers.2: Profile data refresh
        async function syncGoogleProfileData(user, googleProfile) {
          // Only sync on first login after account linking
          if (!user.google_profile_synced && googleProfile.name !== user.full_name) {
            await base44.asServiceRole.entities.User.update(user.id, {
              full_name: googleProfile.name,
              google_profile_synced: true
            });
            
            console.log('Google profile synced', {
              user_id: user.id,
              old_name: user.full_name,
              new_name: googleProfile.name
            });
          }
        }
      `
    }
  },
  
  /**
   * ABUSE PREVENTION & RATE LIMITS (Abuse.1-2)
   * CSRF protection and rate limiting
   */
  abuse_prevention: {
    
    csrf_protection: {
      // Abuse.1: OAuth state parameter
      requirement: 'Include random state value in OAuth request',
      validation: 'Validate state in callback to prevent CSRF',
      
      implementation: `
        // Abuse.1: CSRF protection via state parameter
        function generateOAuthState() {
          // Generate cryptographically random state
          const state = crypto.randomBytes(32).toString('hex');
          return state;
        }
        
        // Store in session
        req.session.oauthState = generateOAuthState();
        
        // Include in OAuth URL
        const authUrl = googleClient.generateAuthUrl({
          scope: ['email', 'profile'],
          state: req.session.oauthState  // CSRF token
        });
        
        // Validate in callback
        if (req.query.state !== req.session.oauthState) {
          throw new Error('CSRF detected - state mismatch');
        }
      `
    },
    
    rate_limiting: {
      // Abuse.2: SSO login rate limit
      limit: '10 SSO login attempts per IP per 5 minutes',
      rationale: 'Prevent brute-force token replay attempts',
      
      implementation: `
        // Abuse.2: Rate limit SSO logins
        const ssoRateLimiter = rateLimit({
          windowMs: 5 * 60 * 1000,  // 5 minutes
          max: 10,  // 10 attempts
          message: 'Too many login attempts. Please try again later.',
          
          handler: async (req, res) => {
            console.warn('SSO rate limit exceeded', {
              ip: req.ip,
              attempts: req.rateLimit.current,
              timestamp: new Date().toISOString()
            });
            
            res.status(429).json({
              error: 'Too many login attempts. Please try again later.'
            });
          }
        });
        
        // Apply to OAuth callback
        app.get('/auth/google/callback', ssoRateLimiter, handleGoogleOAuthCallback);
      `
    }
  },
  
  /**
   * ERROR HANDLING (Errors.1-2, Edge.1-2)
   * Token validation failures and edge cases
   */
  error_handling: {
    
    token_validation_failure: {
      // Errors.1: Google token validation failure
      errors: ['Expired token', 'Invalid signature', 'Wrong audience'],
      user_message: 'Sign in failed — please try again.',
      no_disclosure: 'Do NOT expose specific token validation error to user',
      
      implementation: `
        // Errors.1: Token validation error handling
        try {
          const googleProfile = await validateGoogleIdToken(idToken);
        } catch (error) {
          // Log specific error for debugging
          console.error('Google token validation failed', {
            error: error.message,
            ip: req.ip
          });
          
          // Errors.1: Generic user-facing message
          throw new Error('Sign in failed — please try again.');
        }
      `
    },
    
    missing_email: {
      // Errors.2: Google account with no email
      scenario: 'Google profile rarely lacks email, but handle if encountered',
      action: 'Reject login with clear message',
      
      implementation: `
        // Errors.2: Missing email validation
        if (!googleProfile.email) {
          throw new Error('A valid email address is required to create an account.');
        }
      `
    },
    
    account_linking_collision: {
      // Edge.1: Different emails on Google and email/password accounts
      scenario: 'User has email/password account with email_A@example.com',
      google_email: 'User logs in via Google with email_B@gmail.com',
      result: 'Two separate accounts - do NOT merge automatically',
      
      message: 'Google email differs from existing account',
      
      implementation: `
        // Edge.1: Account linking collision handling
        // If user is logged in and tries to link Google account with different email
        async function linkGoogleAccountToExisting(currentUser, googleProfile) {
          if (currentUser.email !== googleProfile.email.toLowerCase()) {
            // Edge.1: Email mismatch
            throw new Error(
              'The Google account email does not match your current account. ' +
              'Please sign in with the Google account associated with ' + 
              currentUser.email
            );
          }
          
          // Email matches - link accounts
          await base44.asServiceRole.entities.User.update(currentUser.id, {
            google_sub: googleProfile.sub
          });
        }
      `
    },
    
    google_service_outage: {
      // Edge.2: Google OAuth endpoint unavailable
      scenario: 'Google\'s OAuth service is down',
      fallback: 'Email/password path remains operational',
      user_message: 'Google sign-in is temporarily unavailable — please use email and password.',
      
      implementation: `
        // Edge.2: Google service outage handling
        try {
          const { tokens } = await googleClient.getToken(code);
        } catch (error) {
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            // Edge.2: Google service unavailable
            console.error('Google OAuth service unavailable', error);
            
            throw new Error(
              'Google sign-in is temporarily unavailable. ' +
              'Please use email and password to sign in.'
            );
          }
          
          throw error;
        }
      `
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-2)
   * SSO login and failure logging
   */
  logging_audit: {
    
    successful_sso_login: {
      // Audit.1: Log every SSO login
      log_level: 'INFO',
      fields: [
        'user_id',
        'google_sub (partial - first 8 chars)',
        'login_method: google_sso',
        'timestamp'
      ],
      
      implementation: `
        // Audit.1: Log successful SSO login
        console.info('SSO login successful', {
          user_id: user.id,
          google_sub: googleProfile.sub.substring(0, 8),  // First 8 chars only
          login_method: 'google_sso',
          timestamp: new Date().toISOString(),
          is_new_user: isNew,
          ip_address: req.ip
        });
      `
    },
    
    failed_sso_attempts: {
      // Audit.2: Log failed SSO attempts
      log_level: 'WARN',
      fields: [
        'reason (token invalid, account conflict, etc.)',
        'ip',
        'timestamp'
      ],
      
      implementation: `
        // Audit.2: Log failed SSO attempt
        console.warn('SSO login failed', {
          reason: error.message,
          ip: req.ip,
          timestamp: new Date().toISOString(),
          google_email: googleProfile?.email  // If available
        });
      `
    }
  }
};

/**
 * ============================================================================
 * UI SPECIFICATIONS (UI.1-3)
 * Google SSO buttons and flows
 * ============================================================================
 */
const F022_UI_SPECIFICATIONS = {
  
  login_page: {
    // UI.1: Login page Google SSO button
    button_text: 'Sign in with Google',
    styling: 'Google official button style (white button, Google logo)',
    position: 'Below email/password form with "Or" divider',
    
    requirements: [
      'Use Google\'s official button styling',
      'White background with Google logo',
      'Full width button',
      '"Or" divider between email/password and SSO'
    ]
  },
  
  registration_page: {
    // UI.2: Registration page Google SSO button
    button_text: 'Sign up with Google',
    styling: 'Same as login page',
    flow: 'Click → Role selector screen → OAuth',
    
    requirements: [
      'Same styling as login page',
      'Clicking initiates role selection if not already set',
      'Then initiates OAuth flow'
    ]
  },
  
  first_time_sso_flow: {
    // UI.3: First-time SSO after OAuth callback
    condition: 'If role is set',
    destination: 'Role-appropriate empty dashboard',
    no_additional_screens: 'Unless ToS acceptance not completed',
    
    flow: [
      '1. OAuth callback completes',
      '2. User + profile created',
      '3. Redirect to dashboard (parent or caregiver)',
      '4. No intermediate screens'
    ]
  }
};

/**
 * ============================================================================
 * PLATFORM CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F022_CONFIGURATION_CHECKLIST = [
  {
    category: 'Google OAuth Setup',
    tasks: [
      { task: 'Create OAuth 2.0 Client ID in Google Cloud Console', status: 'pending' },
      { task: 'Add authorized redirect URI: https://[domain]/auth/google/callback', status: 'pending' },
      { task: 'Enable Google+ API for profile data', status: 'pending' },
      { task: 'Store Client ID in Base44 environment (GOOGLE_CLIENT_ID)', status: 'pending' },
      { task: 'Store Client Secret in Base44 environment (GOOGLE_CLIENT_SECRET)', status: 'pending' }
    ]
  },
  {
    category: 'User Entity Configuration',
    tasks: [
      { task: 'Add google_sub field to User entity (Text, unique)', status: 'pending' },
      { task: 'Add google_profile_synced field (Boolean, default false)', status: 'pending' },
      { task: 'Ensure email_verified can be set to true for SSO users', status: 'pending' },
      { task: 'Ensure password_hash is optional (NULL for SSO users)', status: 'pending' }
    ]
  },
  {
    category: 'OAuth Flow Implementation',
    tasks: [
      { task: 'Implement role selection storage in signed session (Logic.1)', status: 'pending' },
      { task: 'Implement OAuth state parameter generation (Abuse.1)', status: 'pending' },
      { task: 'Implement Google OAuth initiation endpoint', status: 'pending' },
      { task: 'Implement OAuth callback endpoint (/auth/google/callback)', status: 'pending' },
      { task: 'Validate Google ID token (signature, audience, expiry)', status: 'pending' }
    ]
  },
  {
    category: 'Account Matching & Creation',
    tasks: [
      { task: 'Implement findOrCreateUser function (Data.4)', status: 'pending' },
      { task: 'Match by google_sub first, then by email', status: 'pending' },
      { task: 'Implement account linking (States.3)', status: 'pending' },
      { task: 'Create User + Profile + PolicyAcceptance atomically (States.1)', status: 'pending' },
      { task: 'Update last_login_at for returning users (States.2)', status: 'pending' }
    ]
  },
  {
    category: 'Security Controls',
    tasks: [
      { task: 'Validate OAuth state parameter in callback (Abuse.1)', status: 'pending' },
      { task: 'Apply rate limiting: 10 attempts per IP per 5 min (Abuse.2)', status: 'pending' },
      { task: 'Validate role from signed session (NOT from URL)', status: 'pending' },
      { task: 'Request minimal scopes: email + profile only (Access.3)', status: 'pending' }
    ]
  },
  {
    category: 'Error Handling',
    tasks: [
      { task: 'Handle token validation failures (Errors.1)', status: 'pending' },
      { task: 'Handle missing email from Google profile (Errors.2)', status: 'pending' },
      { task: 'Handle account linking collisions (Edge.1)', status: 'pending' },
      { task: 'Handle Google service outages (Edge.2)', status: 'pending' }
    ]
  },
  {
    category: 'Logging & Audit',
    tasks: [
      { task: 'Log successful SSO logins (Audit.1)', status: 'pending' },
      { task: 'Log failed SSO attempts (Audit.2)', status: 'pending' },
      { task: 'Mask google_sub in logs (first 8 chars only)', status: 'pending' }
    ]
  },
  {
    category: 'UI Implementation',
    tasks: [
      { task: 'Add "Sign in with Google" button to Login page (UI.1)', status: 'pending' },
      { task: 'Add "Sign up with Google" button to Register page (UI.2)', status: 'pending' },
      { task: 'Implement role selection before OAuth (Logic.1)', status: 'pending' },
      { task: 'Use Google official button styling', status: 'pending' }
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * CRITICAL DEPENDENCIES:
 * - Google Cloud Console OAuth setup
 * - User entity with google_sub field
 * - F-021 role selection flow
 * - F-018 PolicyAcceptance entity
 * 
 * CRITICAL SECURITY REQUIREMENTS:
 * - Access.2: Validate Google ID token (signature, audience, expiry)
 * - Logic.1: Role stored in signed server-side session (NOT URL)
 * - Abuse.1: OAuth state parameter for CSRF protection
 * - Data.4: Match by google_sub first, then email (no duplicates)
 * - States.3: Link accounts if email matches existing user
 * 
 * OAUTH FLOW SECURITY:
 * - Role selection BEFORE OAuth (prevents injection)
 * - State parameter validation (prevents CSRF)
 * - ID token validation (ensures authenticity)
 * - Signed session for role storage (tamper-proof)
 * 
 * NEXT STEPS:
 * 1. Set up Google OAuth in Google Cloud Console
 * 2. Add google_sub field to User entity
 * 3. Implement role selection with signed session storage
 * 4. Implement OAuth initiation endpoint
 * 5. Implement OAuth callback with token validation
 * 6. Implement account matching and linking logic
 * 7. Add Google SSO buttons to Login and Register pages
 * 8. Test first-time SSO and returning user flows
 * 9. Test account linking with email/password users
 * 10. Verify logging and audit trail
 */

export default function F022GoogleSSODocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-022: Google SSO - OAuth 2.0 Integration</h1>
      <p><strong>Phase 1 Status:</strong> Authentication & User Registration</p>
      <p><strong>Dependencies:</strong> F-021 (Role Selection), User entity, Google Cloud Console setup</p>
      
      <h2>Critical Security Requirements</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ OAUTH SECURITY</strong>
        <ul>
          <li><strong>Access.2:</strong> Validate Google ID token (signature, audience, expiry)</li>
          <li><strong>Logic.1:</strong> Role stored in signed server-side session (NOT URL parameter)</li>
          <li><strong>Abuse.1:</strong> OAuth state parameter for CSRF protection</li>
          <li><strong>Data.4:</strong> Match by google_sub first, then email (no duplicates)</li>
          <li><strong>States.3:</strong> Link accounts if email matches existing user</li>
        </ul>
      </div>
      
      <h2>Google OAuth Flow</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`Step 1: Role Selection (Logic.1)
User selects role (parent/caregiver)
↓
Role stored in signed server-side session
State parameter generated for CSRF protection

Step 2: Initiate OAuth
Redirect to Google OAuth with:
- client_id
- redirect_uri
- scope: email, profile
- state: random CSRF token

Step 3: Google Authentication
User authenticates with Google
User grants permissions

Step 4: OAuth Callback
Google redirects to /auth/google/callback?code=...&state=...
↓
Validate state parameter (CSRF check)
Exchange code for ID token
Validate ID token (signature, audience, expiry)
Extract profile: sub, email, name

Step 5: Account Matching (Data.4)
Match by google_sub (if exists) →  Returning user
OR match by email → Link existing account
OR create new User → First-time SSO

Step 6: Create/Update User
New: Create User + Profile + PolicyAcceptance
Existing: Update last_login_at, set google_sub

Step 7: Issue JWT Session
Generate JWT with user_id, role
Redirect to dashboard`}
      </pre>
      
      <h2>Data Model</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Field</th>
            <th>Value</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>google_sub</td>
            <td>Google's "sub" claim</td>
            <td>Unique, stable user identifier from Google</td>
          </tr>
          <tr>
            <td>email</td>
            <td>From Google profile</td>
            <td>Lowercase-normalised</td>
          </tr>
          <tr>
            <td>full_name</td>
            <td>From Google displayName</td>
            <td>Can be synced on first login only</td>
          </tr>
          <tr>
            <td>email_verified</td>
            <td>true</td>
            <td>Google verifies email - set immediately</td>
          </tr>
          <tr>
            <td>password_hash</td>
            <td>NULL</td>
            <td>NOT written for SSO users</td>
          </tr>
          <tr>
            <td>role</td>
            <td>parent/caregiver</td>
            <td>From pre-OAuth role selection (Logic.1)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Account Matching Strategy (Data.4)</h2>
      <ol>
        <li><strong>Match by google_sub:</strong> If google_sub exists, returning SSO user</li>
        <li><strong>Match by email:</strong> If email matches, link accounts (set google_sub)</li>
        <li><strong>Create new:</strong> If no match, create User + Profile + PolicyAcceptance</li>
      </ol>
      
      <h2>State Machine</h2>
      <h3>States.1: First-Time SSO</h3>
      <ul>
        <li>OAuth completes → role selection → User created → dashboard</li>
        <li>email_verified set to true immediately</li>
        <li>No verification email needed</li>
      </ul>
      
      <h3>States.2: Returning SSO</h3>
      <ul>
        <li>OAuth completes → match by google_sub → update last_login_at → dashboard</li>
        <li>Fast login - no new records created</li>
      </ul>
      
      <h3>States.3: Account Linking</h3>
      <ul>
        <li>User previously registered with email/password</li>
        <li>Now logs in via Google with same email</li>
        <li>Set google_sub on existing User → linked</li>
        <li>No duplicate User created</li>
      </ul>
      
      <h2>Role Selection Security (Logic.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Prevent role injection</strong>
        <ol>
          <li>User selects role on RoleSelection page</li>
          <li><strong>Server stores role in SIGNED session</strong></li>
          <li>OAuth flow initiated</li>
          <li>OAuth callback returns</li>
          <li><strong>Server reads role from session (NOT URL)</strong></li>
          <li>User created with validated role</li>
        </ol>
        <p><strong>NEVER:</strong> Read role from URL parameter or client-supplied data</p>
      </div>
      
      <h2>CSRF Protection (Abuse.1)</h2>
      <ul>
        <li><strong>State Parameter:</strong> Random 64-char hex string</li>
        <li><strong>Storage:</strong> Stored in server-side session</li>
        <li><strong>Validation:</strong> Verified in OAuth callback</li>
        <li><strong>Mismatch:</strong> Reject as CSRF attack</li>
      </ul>
      
      <h2>Token Validation (Access.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>REQUIRED: Validate Google ID token</strong>
        <ul>
          <li><strong>Signature:</strong> Verify JWT signature using Google's public keys</li>
          <li><strong>Audience:</strong> Verify aud claim matches GOOGLE_CLIENT_ID</li>
          <li><strong>Expiry:</strong> Verify exp claim is not in the past</li>
          <li><strong>Issuer:</strong> Verify iss is accounts.google.com</li>
        </ul>
      </div>
      
      <h2>OAuth Scopes (Access.3)</h2>
      <ul>
        <li><strong>Requested:</strong> email, profile</li>
        <li><strong>NOT Requested:</strong> drive, calendar, contacts</li>
        <li><strong>Rationale:</strong> Minimal necessary scopes for authentication</li>
      </ul>
      
      <h2>Rate Limiting (Abuse.2)</h2>
      <ul>
        <li><strong>Limit:</strong> 10 SSO login attempts per IP per 5 minutes</li>
        <li><strong>Rationale:</strong> Prevent token replay attempts</li>
        <li><strong>Google Limits:</strong> Also apply but cannot be solely relied upon</li>
      </ul>
      
      <h2>Error Handling</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Error</th>
            <th>User Message</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Token validation failure (Errors.1)</td>
            <td>"Sign in failed — please try again."</td>
          </tr>
          <tr>
            <td>Missing email (Errors.2)</td>
            <td>"A valid email address is required to create an account."</td>
          </tr>
          <tr>
            <td>Account linking collision (Edge.1)</td>
            <td>"Google email differs from existing account."</td>
          </tr>
          <tr>
            <td>Google service outage (Edge.2)</td>
            <td>"Google sign-in is temporarily unavailable — please use email and password."</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Logging & Audit</h2>
      <ul>
        <li><strong>Successful SSO (Audit.1):</strong> Log user_id, google_sub (first 8 chars), method, timestamp</li>
        <li><strong>Failed SSO (Audit.2):</strong> Log reason, IP, timestamp</li>
      </ul>
      
      <h2>UI Specifications</h2>
      <h3>Login Page (UI.1)</h3>
      <ul>
        <li>"Sign in with Google" button</li>
        <li>Google official styling (white button, Google logo)</li>
        <li>Positioned below email/password form with "Or" divider</li>
      </ul>
      
      <h3>Registration Page (UI.2)</h3>
      <ul>
        <li>"Sign up with Google" button</li>
        <li>Same styling as login</li>
        <li>Click → role selector → OAuth</li>
      </ul>
      
      <h3>First-Time SSO (UI.3)</h3>
      <ul>
        <li>After OAuth callback, redirect to dashboard</li>
        <li>No intermediate screens (unless ToS not completed)</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Create OAuth 2.0 Client ID in Google Cloud Console</li>
        <li>Add redirect URI: https://[domain]/auth/google/callback</li>
        <li>Store Client ID and Secret in Base44 environment</li>
        <li>Add google_sub field to User entity</li>
        <li>Implement role selection with signed session storage (Logic.1)</li>
        <li>Implement OAuth state parameter generation (Abuse.1)</li>
        <li>Implement OAuth initiation endpoint</li>
        <li>Implement OAuth callback with token validation (Access.2)</li>
        <li>Implement account matching (google_sub → email → create)</li>
        <li>Implement account linking (States.3)</li>
        <li>Apply rate limiting (10 attempts per IP per 5 min)</li>
        <li>Add "Sign in with Google" button to Login page</li>
        <li>Add "Sign up with Google" button to Register page</li>
        <li>Test first-time SSO flow</li>
        <li>Test returning user flow</li>
        <li>Test account linking with email/password users</li>
        <li>Verify logging and audit trail</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete OAuth flow implementation, token validation, and security patterns.</em></p>
    </div>
  );
}