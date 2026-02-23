/**
 * F-023: CAPTCHA ON REGISTRATION CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * Documents Base44 platform configuration for reCAPTCHA integration on registration,
 * booking requests, and password resets. Implements bot detection and abuse prevention.
 * 
 * STATUS: Phase 1 - Authentication & User Registration
 * DEPENDENCIES: Google reCAPTCHA v2/v3, Base44 environment variables
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F023_CAPTCHA_SPECIFICATION = {
  
  /**
   * DATA MODEL & CONSTRAINTS (Data.1-3)
   * CAPTCHA as transient validation - not persisted
   */
  data_model: {
    
    no_persistence: {
      // Data.1: CAPTCHA is NOT stored in database
      requirement: 'No new collection or entity needed',
      nature: 'Form-level validation step only',
      lifecycle: 'Token validated and discarded immediately',
      
      rationale: 'CAPTCHA tokens are single-use, short-lived. No need to persist.'
    },
    
    captcha_token: {
      // Data.2: Transient token field
      field_name: 'captcha_token',
      submitted_with: 'Registration form payload',
      validation: 'Server-side against CAPTCHA provider API',
      disposal: 'Discarded after validation',
      storage: 'NEVER stored in database',
      
      flow: `
        Client Form Submission
        ↓
        { email, password, full_name, role, captcha_token }
        ↓
        Server receives payload
        ↓
        Extract captcha_token
        ↓
        Validate with reCAPTCHA API
        ↓
        Discard token (do not persist)
        ↓
        If valid: proceed with registration
        If invalid: reject form submission
      `
    },
    
    provider_configuration: {
      // Data.3: reCAPTCHA provider setup
      provider: 'Google reCAPTCHA',
      versions: {
        v2: {
          type: 'Checkbox widget ("I\'m not a robot")',
          visibility: 'Always visible',
          user_interaction: 'Required',
          use_case: 'Explicit bot check',
          accessibility: 'Audio challenge available'
        },
        v3: {
          type: 'Invisible, score-based',
          visibility: 'No visible widget unless score is low',
          user_interaction: 'Automatic, challenges only when suspicious',
          use_case: 'Seamless UX with bot detection',
          score_threshold: 0.5
        }
      },
      
      environment_variables: {
        RECAPTCHA_SITE_KEY: 'Public key for client-side widget',
        RECAPTCHA_SECRET_KEY: 'Private key for server-side verification',
        RECAPTCHA_VERSION: '"v2" or "v3"',
        
        security_note: 'NEVER expose SECRET_KEY in client code or source control'
      },
      
      setup_instructions: [
        '1. Register at https://www.google.com/recaptcha/admin',
        '2. Create new site (choose v2 or v3)',
        '3. Add domain(s) to authorized list',
        '4. Copy Site Key and Secret Key',
        '5. Store in Base44 environment variables',
        '6. NEVER commit keys to source control'
      ]
    }
  },
  
  /**
   * ACCESS CONTROL & PERMISSIONS (Access.1-2)
   * Server-side validation only
   */
  access_control: {
    
    server_side_validation: {
      // Access.1: CAPTCHA validation MUST be server-side
      requirement: 'Client-side CAPTCHA status CANNOT be trusted',
      enforcement: 'Server calls reCAPTCHA verification API',
      
      threat: 'Attacker can bypass client-side checks',
      mitigation: 'Server validates token with Google before accepting submission',
      
      implementation: `
        // Access.1: Server-side CAPTCHA validation
        async function validateCaptcha(captchaToken, userIP) {
          // NEVER trust client-supplied "captcha_valid" field
          // Always call Google's verification API
          
          const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              secret: process.env.RECAPTCHA_SECRET_KEY,
              response: captchaToken,
              remoteip: userIP  // Optional but recommended
            })
          });
          
          const result = await response.json();
          
          if (!result.success) {
            console.warn('CAPTCHA validation failed', {
              error_codes: result['error-codes'],
              ip: userIP,
              timestamp: new Date().toISOString()
            });
            
            throw new Error('CAPTCHA validation failed');
          }
          
          // For reCAPTCHA v3: check score
          if (process.env.RECAPTCHA_VERSION === 'v3') {
            if (result.score < 0.5) {  // Triggers.2: Minimum score threshold
              console.warn('CAPTCHA score too low', {
                score: result.score,
                ip: userIP,
                timestamp: new Date().toISOString()
              });
              
              throw new Error('Bot detection score too low');
            }
          }
          
          return { valid: true, score: result.score };
        }
      `
    },
    
    application_points: {
      // Access.2: Where CAPTCHA is applied
      forms_requiring_captcha: [
        {
          form: 'Registration form',
          feature: 'F-023 (this feature)',
          endpoint: '/api/auth/register',
          timing: 'Before User record creation'
        },
        {
          form: 'Booking request submission',
          feature: 'Phase 6 — F-074',
          endpoint: '/api/bookings/create',
          timing: 'Before BookingRequest record creation'
        },
        {
          form: 'Password reset request',
          feature: 'F-026',
          endpoint: '/api/auth/forgot-password',
          timing: 'Before PasswordResetToken creation'
        }
      ],
      
      note: 'Apply CAPTCHA consistently to high-value endpoints that bots target'
    }
  },
  
  /**
   * STATE MACHINE & LIFECYCLE (States.1)
   * Stateless validation
   */
  state_machine: {
    
    stateless_nature: {
      // States.1: CAPTCHA has no lifecycle states
      model: 'Stateless per-submission check',
      no_persistence: 'No state stored between requests',
      
      validation_flow: `
        Form Submission
        ↓
        Extract CAPTCHA token
        ↓
        Validate with Google
        ↓
        [Valid] → Proceed    [Invalid] → Reject
        ↓                    ↓
        Continue logic       Return error
        
        No state persisted. Each submission is independent.
      `
    }
  },
  
  /**
   * BUSINESS LOGIC & CROSS-ENTITY RULES (Logic.1-2)
   * Validation sequence and atomicity
   */
  business_logic: {
    
    validation_sequence: {
      // Logic.1: Server-side validation order
      steps: [
        '1. Extract CAPTCHA token from form payload',
        '2. Call CAPTCHA provider verify API',
        '3. If verification FAILS: Reject entire form submission, return error',
        '4. If verification PASSES: Proceed with registration logic'
      ],
      
      implementation: `
        // Logic.1: Registration with CAPTCHA validation
        async function registerUser(formData, req) {
          // Step 1: Extract CAPTCHA token
          const { captcha_token, email, password, full_name, role } = formData;
          
          if (!captcha_token) {
            throw new Error('CAPTCHA token missing');
          }
          
          // Step 2: Validate CAPTCHA first (before any DB operations)
          try {
            await validateCaptcha(captcha_token, req.ip);
          } catch (error) {
            // Step 3: CAPTCHA failed - reject immediately
            console.warn('CAPTCHA validation failed', {
              email: email,
              ip: req.ip,
              timestamp: new Date().toISOString()
            });
            
            throw new Error('Please complete the security check to continue.');
          }
          
          // Step 4: CAPTCHA passed - proceed with registration
          const user = await base44.asServiceRole.entities.User.create({
            email: email.toLowerCase(),
            full_name: full_name,
            role: role,
            password_hash: await hashPassword(password)
          });
          
          // Create profile, PolicyAcceptance, etc.
          // ...
          
          return user;
        }
      `
    },
    
    atomicity_requirement: {
      // Logic.2: CAPTCHA validation is atomic
      requirement: 'CAPTCHA validated BEFORE any User record creation',
      no_partial_writes: 'Failed CAPTCHA MUST NOT result in partial DB writes',
      
      order: [
        '1. CAPTCHA validation (blocking step)',
        '2. User record creation',
        '3. Profile creation',
        '4. PolicyAcceptance creation'
      ],
      
      rollback: 'If CAPTCHA fails at step 1, steps 2-4 never execute'
    }
  },
  
  /**
   * EVENT TRIGGERS & AUTOMATION (Triggers.1-2)
   * Blocking validation step
   */
  event_triggers: {
    
    blocking_step: {
      // Triggers.1: CAPTCHA is a blocking gate
      nature: 'Registration does not proceed if CAPTCHA fails',
      automation_sequence: [
        '1. Form submission received',
        '2. CAPTCHA validation (blocking)',
        '3. If failed: return error, stop processing',
        '4. If passed: continue with User creation'
      ],
      
      implementation: `
        // Triggers.1: CAPTCHA as blocking step in registration automation
        async function registrationAutomation(req, res) {
          try {
            const formData = req.body;
            
            // BLOCKING STEP: CAPTCHA validation
            await validateCaptcha(formData.captcha_token, req.ip);
            
            // CAPTCHA passed - proceed with registration
            const user = await createUser(formData);
            const profile = await createProfile(user.id, formData.role);
            const policyAcceptance = await createPolicyAcceptance(user.id);
            
            res.json({ success: true, user_id: user.id });
            
          } catch (error) {
            // CAPTCHA failure stops entire flow
            if (error.message.includes('CAPTCHA')) {
              res.status(400).json({
                error: 'Please complete the security check to continue.'
              });
            } else {
              res.status(500).json({ error: 'Registration failed' });
            }
          }
        }
      `
    },
    
    score_threshold: {
      // Triggers.2: reCAPTCHA v3 score threshold
      version: 'v3 only',
      minimum_score: 0.5,
      interpretation: {
        '0.9 - 1.0': 'Very likely human',
        '0.5 - 0.9': 'Likely human (acceptable)',
        '0.0 - 0.5': 'Likely bot (reject)',
      },
      
      action: 'Requests scoring below 0.5 treated as bots and rejected',
      
      implementation: `
        // Triggers.2: reCAPTCHA v3 score threshold
        if (process.env.RECAPTCHA_VERSION === 'v3') {
          const result = await verifyCaptchaWithGoogle(token);
          
          if (result.score < 0.5) {
            // Treat as bot
            console.warn('Low reCAPTCHA score', {
              score: result.score,
              ip: req.ip,
              action: result.action
            });
            
            throw new Error('Bot detection failed');
          }
        }
      `
    }
  },
  
  /**
   * ABUSE PREVENTION & RATE LIMITS (Abuse.1-2)
   * CAPTCHA failure monitoring
   */
  abuse_prevention: {
    
    failure_rate_monitoring: {
      // Abuse.1: Monitor CAPTCHA failures by IP
      threshold: '10 CAPTCHA failures per IP in 30 minutes',
      action: 'Flag IP for review and apply temporary rate-limiting',
      
      implementation: `
        // Abuse.1: CAPTCHA failure rate monitoring
        const captchaFailureCache = new Map(); // IP → failure count
        
        async function validateCaptchaWithMonitoring(token, userIP) {
          try {
            await validateCaptcha(token, userIP);
            
            // Success - reset failure count
            captchaFailureCache.delete(userIP);
            
          } catch (error) {
            // Failure - increment count
            const failures = (captchaFailureCache.get(userIP) || 0) + 1;
            captchaFailureCache.set(userIP, failures);
            
            // Audit.1: Log failure
            console.warn('CAPTCHA failure', {
              ip: userIP,
              form_type: 'registration',
              timestamp: new Date().toISOString(),
              failure_count: failures
            });
            
            // Check threshold
            if (failures >= 10) {
              // Flag for review and rate-limit
              console.error('CAPTCHA failure threshold exceeded', {
                ip: userIP,
                failures: failures,
                window: '30 minutes'
              });
              
              // Create AbuseAlert
              await base44.asServiceRole.entities.AbuseAlert.create({
                alert_type: 'rate_limit_breach',
                source_ip: userIP,
                description: \`CAPTCHA failures exceeded threshold: \${failures} in 30 min\`,
                severity: 'high'
              });
              
              // Apply rate limit (F-014)
              await applyTemporaryRateLimit(userIP, '30 minutes');
            }
            
            throw error;
          }
        }
        
        // Cleanup: Reset failure counts after 30 minutes
        setInterval(() => {
          const now = Date.now();
          for (const [ip, data] of captchaFailureCache.entries()) {
            if (now - data.timestamp > 30 * 60 * 1000) {
              captchaFailureCache.delete(ip);
            }
          }
        }, 60000); // Run every minute
      `
    },
    
    timing_optimization: {
      // Abuse.2: Do NOT show CAPTCHA on page load
      requirement: 'CAPTCHA shown only on form submission',
      rationale: 'Pre-emptive CAPTCHA degrades legitimate user experience',
      
      implementation: {
        v2: 'Checkbox widget rendered on page, but not required to interact until submit',
        v3: 'Invisible - token generated on form submit, challenge shown only if score low'
      },
      
      bad_practice: 'Showing CAPTCHA challenge before user attempts to submit',
      good_practice: 'CAPTCHA integrated into submit flow, minimal friction'
    }
  },
  
  /**
   * ERROR HANDLING (Errors.1-2, Edge.1-2)
   * Provider unavailability and accessibility
   */
  error_handling: {
    
    provider_unavailable: {
      // Errors.1: Fail closed when CAPTCHA API unavailable
      scenario: 'reCAPTCHA verification API times out or returns error',
      policy: 'FAIL CLOSED - reject the registration',
      no_bypass: 'Do NOT allow registrations to bypass CAPTCHA',
      operator_alert: 'Alert operators of CAPTCHA outage',
      
      rationale: 'Security over availability - brief downtime better than bot flood',
      
      implementation: `
        // Errors.1: Fail closed on provider unavailability
        async function validateCaptcha(token, userIP) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);  // Edge.2: 3-second timeout
            
            const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
              method: 'POST',
              signal: controller.signal,
              body: new URLSearchParams({
                secret: process.env.RECAPTCHA_SECRET_KEY,
                response: token,
                remoteip: userIP
              })
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              throw new Error('reCAPTCHA API returned error');
            }
            
            const result = await response.json();
            return result;
            
          } catch (error) {
            // Errors.1: CAPTCHA provider unavailable
            console.error('CAPTCHA provider unavailable', {
              error: error.message,
              ip: userIP,
              timestamp: new Date().toISOString()
            });
            
            // Alert operators
            await sendOperatorAlert({
              severity: 'critical',
              message: 'reCAPTCHA verification API unavailable',
              error: error.message
            });
            
            // FAIL CLOSED: Reject registration
            throw new Error('Security check unavailable. Please try again later.');
          }
        }
      `
    },
    
    accessibility: {
      // Errors.2: reCAPTCHA v2 audio challenge
      requirement: 'Audio challenge alternative for visually impaired users',
      version: 'v2 only (v3 is fully automated)',
      
      feature: 'reCAPTCHA v2 provides built-in audio challenge',
      action: 'Ensure audio challenge is NOT blocked by CSP or other policies',
      
      implementation: [
        'reCAPTCHA v2 automatically offers audio challenge',
        'User clicks audio icon on checkbox widget',
        'Plays spoken CAPTCHA challenge',
        'User types what they hear',
        'No additional implementation needed - built into reCAPTCHA'
      ],
      
      csp_configuration: `
        // Ensure Content Security Policy allows reCAPTCHA
        Content-Security-Policy: 
          script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/;
          frame-src https://www.google.com/recaptcha/;
          img-src 'self' https://www.gstatic.com/recaptcha/;
      `
    },
    
    token_replay: {
      // Edge.1: CAPTCHA token replay attack
      threat: 'Bot attempts to reuse valid CAPTCHA token from previous submission',
      protection: 'reCAPTCHA tokens are single-use and expire quickly',
      
      google_handles: [
        'Tokens automatically expire after 2 minutes',
        'Tokens can only be verified once',
        'Second verification attempt returns error'
      ],
      
      no_custom_implementation: 'Google\'s API handles replay prevention automatically'
    },
    
    server_timeout: {
      // Edge.2: Server-side timeout for CAPTCHA verification
      timeout: '3 seconds',
      action: 'Reject submission if verification exceeds 3 seconds',
      no_retry: 'Do NOT implement retry logic',
      
      rationale: 'Each form submission generates fresh token - user can resubmit',
      
      implementation: `
        // Edge.2: 3-second timeout for CAPTCHA verification
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        try {
          const response = await fetch(recaptchaUrl, {
            signal: controller.signal,
            // ...
          });
          
          clearTimeout(timeoutId);
          
        } catch (error) {
          if (error.name === 'AbortError') {
            throw new Error('CAPTCHA verification timeout');
          }
          throw error;
        }
      `
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-2)
   * CAPTCHA pass/fail tracking
   */
  logging_audit: {
    
    failure_logging: {
      // Audit.1: Log CAPTCHA failures
      log_level: 'WARN',
      fields: [
        'IP address',
        'form_type (registration / booking / password-reset)',
        'timestamp'
      ],
      
      do_not_log: 'CAPTCHA token itself',
      
      implementation: `
        // Audit.1: Log CAPTCHA failure
        console.warn('CAPTCHA validation failed', {
          ip: req.ip,
          form_type: 'registration',
          timestamp: new Date().toISOString(),
          user_agent: req.headers['user-agent']
        });
      `
    },
    
    pass_rate_monitoring: {
      // Audit.2: Monitor CAPTCHA pass rate as health metric
      metric: 'CAPTCHA pass rate',
      calculation: '(successful validations / total attempts) * 100',
      
      baseline: '90-95% pass rate is normal',
      alerts: {
        sudden_drop: 'May indicate bot attack or provider integration issue',
        sudden_spike: 'May indicate provider configuration change'
      },
      
      implementation: `
        // Audit.2: CAPTCHA pass rate monitoring
        let captchaAttempts = 0;
        let captchaSuccesses = 0;
        
        async function validateCaptchaWithMetrics(token, userIP) {
          captchaAttempts++;
          
          try {
            await validateCaptcha(token, userIP);
            captchaSuccesses++;
            
            // Calculate pass rate
            const passRate = (captchaSuccesses / captchaAttempts) * 100;
            
            // Alert if pass rate drops below 80%
            if (captchaAttempts > 100 && passRate < 80) {
              console.error('CAPTCHA pass rate abnormally low', {
                pass_rate: passRate.toFixed(2) + '%',
                attempts: captchaAttempts,
                successes: captchaSuccesses
              });
            }
            
          } catch (error) {
            throw error;
          }
        }
        
        // Reset metrics every hour
        setInterval(() => {
          console.info('CAPTCHA metrics', {
            window: '1 hour',
            attempts: captchaAttempts,
            successes: captchaSuccesses,
            pass_rate: ((captchaSuccesses / captchaAttempts) * 100).toFixed(2) + '%'
          });
          
          captchaAttempts = 0;
          captchaSuccesses = 0;
        }, 3600000);
      `
    }
  },
  
  /**
   * UI SPECIFICATIONS (UI.1-2)
   * Widget placement and error display
   */
  ui_specifications: {
    
    widget_placement: {
      // UI.1: CAPTCHA widget position in form
      location: 'Below all form fields, above submit button',
      
      v2_checkbox: {
        type: 'reCAPTCHA v2 checkbox',
        appearance: '"I\'m not a robot" checkbox with reCAPTCHA logo',
        visibility: 'Always visible',
        size: 'Normal (or compact for mobile)'
      },
      
      v3_invisible: {
        type: 'reCAPTCHA v3 invisible',
        appearance: 'No visible widget',
        badge: 'Small reCAPTCHA badge in bottom-right corner',
        challenge: 'Only shown if score is low'
      },
      
      form_structure: `
        <form>
          <Input name="full_name" />
          <Input name="email" />
          <Input name="password" />
          <Input name="confirm_password" />
          <Checkbox name="tos_accepted" />
          
          <!-- CAPTCHA WIDGET HERE -->
          <div className="captcha-container">
            {/* reCAPTCHA v2 checkbox or v3 invisible */}
          </div>
          
          <Button type="submit">Create account</Button>
        </form>
      `
    },
    
    error_display: {
      // UI.2: Failed CAPTCHA error handling
      error_message: 'Please complete the security check to continue.',
      display_location: 'Inline below the CAPTCHA widget',
      
      do_not_clear: 'Do NOT clear other form fields on CAPTCHA failure',
      
      user_experience: [
        'User submits form',
        'CAPTCHA validation fails',
        'Error shown below CAPTCHA widget',
        'All other form fields retain their values',
        'User completes CAPTCHA and resubmits'
      ],
      
      implementation: `
        // UI.2: CAPTCHA error display
        const [captchaError, setCaptchaError] = useState('');
        
        async function handleSubmit(e) {
          e.preventDefault();
          setCaptchaError('');
          
          try {
            // Get CAPTCHA token
            const token = await getCaptchaToken();
            
            // Submit form with token
            await registerUser({ ...formData, captcha_token: token });
            
          } catch (error) {
            if (error.message.includes('CAPTCHA') || error.message.includes('security')) {
              // UI.2: Show inline error, keep form data
              setCaptchaError('Please complete the security check to continue.');
            } else {
              setGeneralError(error.message);
            }
          }
        }
        
        return (
          <form onSubmit={handleSubmit}>
            {/* Form fields */}
            
            <div className="captcha-container">
              <ReCAPTCHA
                sitekey={RECAPTCHA_SITE_KEY}
                onChange={(token) => setCaptchaToken(token)}
              />
              
              {/* UI.2: Error below CAPTCHA */}
              {captchaError && (
                <p className="text-red-600 text-sm mt-2">
                  {captchaError}
                </p>
              )}
            </div>
            
            <Button type="submit">Create account</Button>
          </form>
        );
      `
    }
  }
};

/**
 * ============================================================================
 * PLATFORM CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F023_CONFIGURATION_CHECKLIST = [
  {
    category: 'reCAPTCHA Setup',
    tasks: [
      { task: 'Register at https://www.google.com/recaptcha/admin', status: 'pending' },
      { task: 'Create new site (choose v2 or v3)', status: 'pending' },
      { task: 'Add domain(s) to authorized list', status: 'pending' },
      { task: 'Copy Site Key (public key)', status: 'pending' },
      { task: 'Copy Secret Key (private key)', status: 'pending' },
      { task: 'Store RECAPTCHA_SITE_KEY in Base44 environment', status: 'pending' },
      { task: 'Store RECAPTCHA_SECRET_KEY in Base44 environment (NEVER in code)', status: 'pending' },
      { task: 'Store RECAPTCHA_VERSION ("v2" or "v3") in environment', status: 'pending' }
    ]
  },
  {
    category: 'Server-Side Validation',
    tasks: [
      { task: 'Implement validateCaptcha function (Access.1)', status: 'pending' },
      { task: 'Call reCAPTCHA verification API with secret key', status: 'pending' },
      { task: 'For v3: Check score threshold (≥ 0.5) (Triggers.2)', status: 'pending' },
      { task: 'Implement 3-second timeout (Edge.2)', status: 'pending' },
      { task: 'Fail closed on provider unavailable (Errors.1)', status: 'pending' }
    ]
  },
  {
    category: 'Registration Flow Integration',
    tasks: [
      { task: 'Add captcha_token to registration form payload', status: 'pending' },
      { task: 'Validate CAPTCHA BEFORE User creation (Logic.2)', status: 'pending' },
      { task: 'Reject entire form if CAPTCHA fails (Logic.1)', status: 'pending' },
      { task: 'Ensure no partial DB writes on CAPTCHA failure', status: 'pending' }
    ]
  },
  {
    category: 'Abuse Prevention',
    tasks: [
      { task: 'Implement CAPTCHA failure rate monitoring (Abuse.1)', status: 'pending' },
      { task: 'Track failures per IP (10 in 30 min threshold)', status: 'pending' },
      { task: 'Create AbuseAlert on threshold breach', status: 'pending' },
      { task: 'Apply temporary rate-limiting after threshold', status: 'pending' }
    ]
  },
  {
    category: 'Logging & Audit',
    tasks: [
      { task: 'Log CAPTCHA failures (Audit.1)', status: 'pending' },
      { task: 'Log IP, form_type, timestamp (NOT token)', status: 'pending' },
      { task: 'Monitor CAPTCHA pass rate (Audit.2)', status: 'pending' },
      { task: 'Alert on abnormal pass rate drops (<80%)', status: 'pending' }
    ]
  },
  {
    category: 'UI Implementation',
    tasks: [
      { task: 'Add reCAPTCHA widget to registration form (UI.1)', status: 'pending' },
      { task: 'Position below form fields, above submit button', status: 'pending' },
      { task: 'For v2: Render checkbox widget', status: 'pending' },
      { task: 'For v3: Implement invisible reCAPTCHA', status: 'pending' },
      { task: 'Show inline error on CAPTCHA failure (UI.2)', status: 'pending' },
      { task: 'Do NOT clear form fields on CAPTCHA error', status: 'pending' }
    ]
  },
  {
    category: 'Accessibility & CSP',
    tasks: [
      { task: 'Ensure reCAPTCHA v2 audio challenge not blocked (Errors.2)', status: 'pending' },
      { task: 'Configure CSP to allow reCAPTCHA scripts and frames', status: 'pending' },
      { task: 'Test audio challenge for visually impaired users', status: 'pending' }
    ]
  },
  {
    category: 'Future Integration Points',
    tasks: [
      { task: 'Add CAPTCHA to booking request form (Phase 6 - F-074)', status: 'future' },
      { task: 'Add CAPTCHA to password reset request (F-026)', status: 'future' }
    ]
  }
];

/**
 * ============================================================================
 * RECAPTCHA INTEGRATION EXAMPLES
 * ============================================================================
 */
const RECAPTCHA_EXAMPLES = {
  
  v2_client_side: `
    // reCAPTCHA v2 client-side (React)
    import ReCAPTCHA from 'react-google-recaptcha';
    
    function RegistrationForm() {
      const [captchaToken, setCaptchaToken] = useState(null);
      
      const handleCaptchaChange = (token) => {
        setCaptchaToken(token);
      };
      
      return (
        <form onSubmit={handleSubmit}>
          {/* Form fields */}
          
          <ReCAPTCHA
            sitekey={process.env.REACT_APP_RECAPTCHA_SITE_KEY}
            onChange={handleCaptchaChange}
          />
          
          <Button type="submit" disabled={!captchaToken}>
            Create account
          </Button>
        </form>
      );
    }
  `,
  
  v3_client_side: `
    // reCAPTCHA v3 client-side (invisible)
    import { useEffect } from 'react';
    
    function RegistrationForm() {
      useEffect(() => {
        // Load reCAPTCHA v3 script
        const script = document.createElement('script');
        script.src = \`https://www.google.com/recaptcha/api.js?render=\${SITE_KEY}\`;
        document.body.appendChild(script);
      }, []);
      
      const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Get token on submit
        const token = await window.grecaptcha.execute(SITE_KEY, {
          action: 'register'
        });
        
        // Submit with token
        await registerUser({ ...formData, captcha_token: token });
      };
      
      return (
        <form onSubmit={handleSubmit}>
          {/* Form fields - no visible CAPTCHA */}
          <Button type="submit">Create account</Button>
        </form>
      );
    }
  `,
  
  server_validation: `
    // Server-side validation (Backend function)
    async function validateCaptcha(token, remoteip) {
      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: token,
          remoteip: remoteip
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error('CAPTCHA validation failed');
      }
      
      // For v3: check score
      if (result.score && result.score < 0.5) {
        throw new Error('Bot detection score too low');
      }
      
      return true;
    }
  `
};

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * CRITICAL REQUIREMENTS:
 * - Access.1: Server-side validation ONLY - never trust client
 * - Logic.2: CAPTCHA validated BEFORE User creation (atomic)
 * - Errors.1: Fail closed when provider unavailable
 * - UI.2: Show error below widget, keep form data
 * 
 * RECAPTCHA VERSION SELECTION:
 * - v2: More explicit, always shows checkbox. Better for high-security forms.
 * - v3: Seamless UX, invisible unless suspicious. Better for user experience.
 * 
 * SECURITY PRINCIPLES:
 * - Server validates every token with Google's API
 * - Client-side widget generates token, server validates
 * - Tokens are single-use and expire quickly
 * - No trust in client-supplied validation status
 * 
 * ABUSE PREVENTION:
 * - Monitor failure rate per IP (10 in 30 min)
 * - Create AbuseAlert on threshold breach
 * - Apply temporary rate-limiting
 * - Track CAPTCHA pass rate as health metric
 * 
 * NEXT STEPS:
 * 1. Register at Google reCAPTCHA admin console
 * 2. Store Site Key and Secret Key in Base44 environment
 * 3. Add reCAPTCHA widget to registration form
 * 4. Implement server-side validation function
 * 5. Integrate into registration flow (before User creation)
 * 6. Implement failure rate monitoring
 * 7. Test both v2 and v3 flows
 * 8. Verify accessibility (audio challenge)
 * 9. Monitor CAPTCHA pass rate metrics
 * 10. Plan for future integration (booking, password reset)
 */

export default function F023CAPTCHADocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-023: CAPTCHA on Registration</h1>
      <p><strong>Phase 1 Status:</strong> Authentication & User Registration</p>
      <p><strong>Dependencies:</strong> Google reCAPTCHA v2/v3, Base44 environment variables</p>
      
      <h2>Critical Security Requirements</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ SERVER-SIDE VALIDATION MANDATORY</strong>
        <ul>
          <li><strong>Access.1:</strong> CAPTCHA validation MUST be server-side only</li>
          <li><strong>Logic.2:</strong> Validate BEFORE User creation (atomic)</li>
          <li><strong>Errors.1:</strong> Fail closed when provider unavailable</li>
          <li><strong>UI.2:</strong> Show error below widget, keep form data</li>
        </ul>
      </div>
      
      <h2>CAPTCHA Provider Configuration</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Version</th>
            <th>Type</th>
            <th>Visibility</th>
            <th>Use Case</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>reCAPTCHA v2</td>
            <td>Checkbox ("I'm not a robot")</td>
            <td>Always visible</td>
            <td>Explicit bot check, audio alternative</td>
          </tr>
          <tr>
            <td>reCAPTCHA v3</td>
            <td>Invisible, score-based</td>
            <td>No widget (badge only)</td>
            <td>Seamless UX, challenge only if suspicious</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Validation Flow</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`Step 1: Client Form Submission
User fills form + completes CAPTCHA
↓
Form payload: { email, password, full_name, role, captcha_token }

Step 2: Server Receives Request
Extract captcha_token from payload
↓
DO NOT TRUST client-supplied "captcha_valid" field

Step 3: Server-Side Validation (Access.1)
Call Google reCAPTCHA verification API
POST https://www.google.com/recaptcha/api/siteverify
Body: { secret: SECRET_KEY, response: captcha_token, remoteip: user_ip }
↓
Validate response signature, check success

Step 4: Score Check (v3 only, Triggers.2)
If score < 0.5 → Treat as bot → Reject
↓
Score ≥ 0.5 → Proceed

Step 5: Proceed or Reject (Logic.1)
CAPTCHA valid → Continue with User creation
CAPTCHA invalid → Reject form, return error
↓
NO partial database writes on failure (Logic.2)`}
      </pre>
      
      <h2>Data Model</h2>
      <ul>
        <li><strong>Data.1:</strong> No new collection - CAPTCHA is form-level validation</li>
        <li><strong>Data.2:</strong> captcha_token is transient - never stored</li>
        <li><strong>Data.3:</strong> Provider: Google reCAPTCHA v2 or v3</li>
      </ul>
      
      <h2>Environment Variables</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Variable</th>
            <th>Description</th>
            <th>Visibility</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>RECAPTCHA_SITE_KEY</td>
            <td>Public key for client-side widget</td>
            <td>Public (in client code)</td>
          </tr>
          <tr>
            <td>RECAPTCHA_SECRET_KEY</td>
            <td>Private key for server verification</td>
            <td>SERVER ONLY - NEVER expose</td>
          </tr>
          <tr>
            <td>RECAPTCHA_VERSION</td>
            <td>"v2" or "v3"</td>
            <td>Server configuration</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Validation Sequence (Logic.1)</h2>
      <ol>
        <li>Extract CAPTCHA token from form payload</li>
        <li>Call CAPTCHA provider verify API</li>
        <li><strong>If verification FAILS:</strong> Reject entire form, return error</li>
        <li><strong>If verification PASSES:</strong> Proceed with registration</li>
      </ol>
      
      <h2>Atomicity (Logic.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>CRITICAL: CAPTCHA BEFORE User Creation</strong>
        <ul>
          <li>CAPTCHA validated as first step (blocking)</li>
          <li>User creation only begins after CAPTCHA passes</li>
          <li>Failed CAPTCHA MUST NOT create partial records</li>
        </ul>
      </div>
      
      <h2>reCAPTCHA v3 Score Threshold (Triggers.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Score Range</th>
            <th>Interpretation</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>0.9 - 1.0</td>
            <td>Very likely human</td>
            <td>✅ Accept</td>
          </tr>
          <tr>
            <td>0.5 - 0.9</td>
            <td>Likely human</td>
            <td>✅ Accept</td>
          </tr>
          <tr>
            <td>0.0 - 0.5</td>
            <td>Likely bot</td>
            <td>❌ Reject</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Abuse Prevention (Abuse.1)</h2>
      <ul>
        <li><strong>Threshold:</strong> 10 CAPTCHA failures per IP in 30 minutes</li>
        <li><strong>Action:</strong> Create AbuseAlert + apply temporary rate-limiting</li>
        <li><strong>Monitoring:</strong> Track CAPTCHA pass rate as health metric</li>
      </ul>
      
      <h2>Error Handling</h2>
      <h3>Errors.1: Provider Unavailable</h3>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>FAIL CLOSED</strong>
        <ul>
          <li>If reCAPTCHA API times out or returns error: REJECT registration</li>
          <li>Do NOT allow bypass when provider is down</li>
          <li>Alert operators of outage</li>
          <li>Security over availability</li>
        </ul>
      </div>
      
      <h3>Errors.2: Accessibility</h3>
      <ul>
        <li>reCAPTCHA v2 provides built-in audio challenge</li>
        <li>Ensure audio challenge not blocked by CSP</li>
        <li>No additional implementation needed</li>
      </ul>
      
      <h3>Edge.1: Token Replay</h3>
      <ul>
        <li>reCAPTCHA tokens are single-use</li>
        <li>Tokens expire after 2 minutes</li>
        <li>Google's API rejects replayed tokens automatically</li>
      </ul>
      
      <h3>Edge.2: Server Timeout</h3>
      <ul>
        <li><strong>Timeout:</strong> 3 seconds</li>
        <li><strong>Action:</strong> Reject if verification exceeds 3 seconds</li>
        <li><strong>No Retry:</strong> Each submission generates fresh token</li>
      </ul>
      
      <h2>Logging & Audit</h2>
      <h3>Audit.1: CAPTCHA Failures</h3>
      <ul>
        <li><strong>Log:</strong> IP, form_type, timestamp</li>
        <li><strong>Do NOT Log:</strong> CAPTCHA token itself</li>
      </ul>
      
      <h3>Audit.2: Pass Rate Monitoring</h3>
      <ul>
        <li><strong>Metric:</strong> (successes / attempts) * 100</li>
        <li><strong>Normal:</strong> 90-95% pass rate</li>
        <li><strong>Alert:</strong> Drop below 80% indicates bot attack or integration issue</li>
      </ul>
      
      <h2>UI Specifications</h2>
      <h3>UI.1: Widget Placement</h3>
      <ul>
        <li><strong>Position:</strong> Below all form fields, above submit button</li>
        <li><strong>v2:</strong> Checkbox widget always visible</li>
        <li><strong>v3:</strong> Invisible badge, challenge only if suspicious</li>
      </ul>
      
      <h3>UI.2: Error Display</h3>
      <ul>
        <li><strong>Message:</strong> "Please complete the security check to continue."</li>
        <li><strong>Location:</strong> Inline below CAPTCHA widget</li>
        <li><strong>CRITICAL:</strong> Do NOT clear other form fields on error</li>
      </ul>
      
      <h2>Application Points (Access.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Form</th>
            <th>Feature</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Registration form</td>
            <td>F-023 (this feature)</td>
            <td>✅ MVP</td>
          </tr>
          <tr>
            <td>Booking request</td>
            <td>Phase 6 - F-074</td>
            <td>🔮 Future</td>
          </tr>
          <tr>
            <td>Password reset</td>
            <td>F-026</td>
            <td>🔮 Future</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Register at https://www.google.com/recaptcha/admin</li>
        <li>Create new site (choose v2 or v3)</li>
        <li>Store RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY in Base44</li>
        <li>Add reCAPTCHA widget to registration form (below fields, above button)</li>
        <li>Implement server-side validateCaptcha function</li>
        <li>Integrate CAPTCHA validation BEFORE User creation</li>
        <li>For v3: Check score threshold (≥ 0.5)</li>
        <li>Implement 3-second timeout</li>
        <li>Fail closed on provider unavailable</li>
        <li>Implement failure rate monitoring (10 in 30 min)</li>
        <li>Log CAPTCHA failures (IP, form_type, timestamp)</li>
        <li>Monitor CAPTCHA pass rate</li>
        <li>Show inline error on failure, keep form data</li>
        <li>Verify accessibility (audio challenge)</li>
        <li>Configure CSP to allow reCAPTCHA</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete validation flow, error handling, abuse prevention, and integration examples.</em></p>
    </div>
  );
}