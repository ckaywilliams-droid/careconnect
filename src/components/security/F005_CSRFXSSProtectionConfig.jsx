/**
 * F-005: CSRF & XSS PROTECTION CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-005
 * CSRF and XSS protection. These protections must be enforced at the platform level
 * on every form submission and data write operation.
 * 
 * STATUS: Phase 0 - Logging entities created (CSRFValidationFailureLog, XSSAttemptLog)
 * NEXT STEP: Configure Base44 CSRF tokens + input sanitization middleware
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F005_CSRF_XSS_SPECIFICATION = {
  
  /**
   * CSRF PROTECTION (Cross-Site Request Forgery)
   * Logic.1-2: CSRF tokens required on ALL state-changing actions
   */
  csrf_protection: {
    
    requirement: {
      scope: 'ALL state-changing actions (POST, PUT, PATCH, DELETE)',
      applies_to: 'All roles without exception (Access.1)',
      actions_requiring_csrf: [
        'Booking submission',
        'Profile update (CaregiverProfile, ParentProfile)',
        'Message send',
        'Account settings changes',
        'Admin write actions',
        'Availability slot creation/update',
        'Certification upload',
        'Any custom API endpoint that modifies data'
      ]
    },
    
    token_lifecycle: {
      generation: {
        where: 'Server-side only (Logic.2)',
        when: 'On page load / form render',
        method: 'Cryptographically secure random token',
        storage: {
          server: 'Session-based (tied to user session)',
          client: 'Hidden form field OR custom header (X-CSRF-Token)'
        }
      },
      
      validation: {
        where: 'Server-side before ANY business logic executes (Logic.2)',
        timing: 'First check in middleware - before database queries, before automations',
        checks: [
          'Token exists in request (form data OR header)',
          'Token matches server-side session token',
          'Token has not expired (if using time-based tokens)',
          'Token has not been used before (if using single-use tokens)'
        ],
        on_failure: {
          http_status: 403,
          response: { error: 'Invalid security token. Please refresh and try again.' },
          action: [
            'Reject the request immediately',
            'Do NOT execute business logic',
            'Log to CSRFValidationFailureLog (Audit.1)',
            'Check for rate limit violation (Abuse.1)'
          ]
        }
      }
    },
    
    base44_native_implementation: {
      // Triggers.2: Verify Base44 handles CSRF tokens natively
      check_1: 'Verify Base44 form submissions include CSRF tokens automatically',
      check_2: 'Verify CSRF validation happens on ALL form types (not just default forms)',
      check_3: 'If Base44 does NOT handle CSRF natively, implement custom token middleware',
      
      custom_implementation_if_needed: {
        // Edge.1: Custom token header for Base44 API endpoints
        approach: 'Add X-CSRF-Token header to all API requests',
        client_side: `
          // On page load, fetch CSRF token from server
          const csrfToken = await fetch('/api/csrf-token').then(r => r.json());
          localStorage.setItem('csrf_token', csrfToken.token);
          
          // Include in all API requests
          const response = await fetch('/api/booking', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': localStorage.getItem('csrf_token')
            },
            body: JSON.stringify(bookingData)
          });
        `,
        server_side: `
          // Middleware to validate CSRF token
          function validateCSRF(request) {
            const sessionToken = request.session.csrf_token;
            const requestToken = request.headers['x-csrf-token'] || request.body._csrf;
            
            if (!requestToken || requestToken !== sessionToken) {
              await logCSRFFailure(request, 'token_invalid');
              await checkRateLimitAbuse(request.ip);
              return 403;
            }
          }
        `
      }
    },
    
    rate_limiting: {
      // Abuse.1: >50 CSRF failures from same IP in 5 min → alert + block
      threshold: 50,
      window: '5 minutes',
      action: [
        'Create IPBlocklist entry (from F-003)',
        'Log all failures with is_rate_limit_triggered = true',
        'Send admin alert',
        'Return 403 for subsequent requests from that IP'
      ],
      implementation: `
        // After each CSRF failure
        const recentFailures = await base44.entities.CSRFValidationFailureLog.filter({
          ip_address: request.ip,
          failure_timestamp: { $gte: fiveMinutesAgo }
        });
        
        if (recentFailures.length >= 50) {
          // Trigger IP block
          await base44.entities.IPBlocklist.create({
            ip_address: request.ip,
            block_reason: 'csrf_token_abuse',
            blocked_at: new Date().toISOString(),
            unblock_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),  // 1 hour
            invalid_attempt_count: recentFailures.length,
            alert_sent: true
          });
          
          // Flag all recent failures
          await base44.entities.CSRFValidationFailureLog.update(
            { ip_address: request.ip, failure_timestamp: { $gte: fiveMinutesAgo } },
            { is_rate_limit_triggered: true }
          );
          
          // Send admin alert
          await sendAdminAlert({
            type: 'csrf_abuse_detected',
            ip_address: request.ip,
            failure_count: recentFailures.length,
            window: '5 minutes'
          });
        }
      `
    }
  },
  
  /**
   * XSS PROTECTION (Cross-Site Scripting)
   * Data.2: Input sanitization with allowlist approach
   */
  xss_protection: {
    
    sanitization_strategy: {
      approach: 'Allowlist (safer than blocklist)',
      default: 'Strip ALL HTML tags',
      exception: 'If rich text needed, define EXPLICIT safe list (e.g., <b>, <i>, <p>, <a>)',
      rationale: 'Blocklist approach (blocking <script>, onerror=, etc.) is incomplete - attackers find new bypasses'
    },
    
    fields_requiring_sanitization: {
      // From F-002 + additional fields
      always_sanitize: [
        'CaregiverProfile.bio',
        'ParentProfile.special_needs_notes',
        'Message.content (and store body_original for admin)',
        'BookingRequest.parent_notes',
        'BookingRequest.cancellation_reason',
        'BookingRequest.decline_reason',
        'FlaggedContent.reason_detail',
        'AdminActionLog.reason',
        'Certification.rejection_reason',
        'All user-supplied text fields without exception'
      ],
      
      rich_text_fields: {
        // If any field needs to preserve formatting
        example: 'CaregiverProfile.bio (if we want to allow bold, italics, links)',
        safe_html_allowlist: [
          '<b>', '<i>', '<u>', '<strong>', '<em>',  // Text formatting
          '<p>', '<br>',  // Paragraphs and line breaks
          '<a href="https://...">',  // Links (https only)
          '<ul>', '<ol>', '<li>'  // Lists
        ],
        forbidden: [
          '<script>',  // JavaScript
          'onerror=', 'onclick=', 'onload=', // Event handlers
          'javascript:', 'data:', 'vbscript:',  // Protocol handlers
          '<iframe>', '<embed>', '<object>',  // Embedded content
          'eval(', 'Function(',  // Dynamic code execution
          '<style>',  // CSS injection vector
        ],
        recommended_library: 'DOMPurify (if Base44 supports) OR server-side sanitization'
      }
    },
    
    sanitization_timing: {
      // Triggers.1: Sanitize on EVERY write, including updates
      on_create: 'Sanitize before INSERT',
      on_update: 'Re-sanitize before UPDATE (do not assume old value is still safe)',
      rationale: 'Subsequent edits could introduce malicious content even if original was clean',
      implementation: `
        // Sanitization middleware - runs on every entity write
        function sanitizeUserInput(entityType, data) {
          const fieldsToSanitize = getTextFields(entityType);
          
          for (const field of fieldsToSanitize) {
            if (data[field]) {
              const original = data[field];
              const sanitized = stripHTMLTags(original);  // Or use allowlist
              
              // If sanitization changed the value, it may be an XSS attempt
              if (original !== sanitized) {
                // Abuse.2: Log XSS attempt
                await base44.entities.XSSAttemptLog.create({
                  user_id: currentUser.id,
                  ip_address: request.ip,
                  entity_type: entityType,
                  field_name: field,
                  attempted_payload: original.substring(0, 200),
                  detected_pattern: detectXSSPattern(original),
                  sanitized_value: sanitized,
                  action_taken: 'sanitized_and_saved',
                  attempt_timestamp: new Date().toISOString()
                });
                
                // Edge.2: Preserve text meaning without script tags
                data[field] = sanitized;
              }
            }
          }
          
          return data;
        }
      `
    },
    
    xss_detection_patterns: {
      'script_tag': /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      'event_handler': /on\w+\s*=/gi,  // onclick=, onerror=, etc.
      'javascript_protocol': /javascript:/gi,
      'data_uri': /data:text\/html/gi,
      'iframe_tag': /<iframe\b/gi,
      'object_tag': /<object\b/gi,
      'embed_tag': /<embed\b/gi,
      'vbscript': /vbscript:/gi,
      'expression': /expression\s*\(/gi,  // CSS expression()
      
      implementation: `
        function detectXSSPattern(input) {
          if (/<script\b/i.test(input)) return 'script_tag';
          if (/on\w+\s*=/i.test(input)) return 'event_handler';
          if (/javascript:/i.test(input)) return 'javascript_protocol';
          if (/<iframe\b/i.test(input)) return 'iframe_tag';
          if (/<object\b/i.test(input)) return 'object_tag';
          if (/<embed\b/i.test(input)) return 'embed_tag';
          if (/data:text\/html/i.test(input)) return 'data_uri';
          return 'other';
        }
      `
    },
    
    special_characters_handling: {
      // Errors.1: Do NOT reject input with special characters - sanitize and preserve meaning
      characters: ['<', '>', '&', '"', "'"],
      approach: 'HTML entity encoding',
      encoding: {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#x27;'
      },
      example: {
        input: 'I love working with children <3 years old',
        incorrect: 'REJECT - contains <',
        correct: 'SANITIZE - "I love working with children &lt;3 years old"'
      },
      implementation: `
        function sanitizeHTML(input) {
          return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
        }
      `
    },
    
    xss_attempt_logging: {
      // Audit.2: Log all XSS attempts for pattern detection
      on_detection: [
        'Create XSSAttemptLog entry',
        'Include: field_name, attempted_payload (truncated), user_id, ip_address, timestamp',
        'Detect patterns: check if user has multiple attempts (is_repeat_offender)',
        'If repeat offender: flag account for admin review'
      ],
      
      aggregate_detection: `
        // After logging each XSS attempt
        const userAttempts = await base44.entities.XSSAttemptLog.filter({
          user_id: user.id,
          attempt_timestamp: { $gte: last24Hours }
        });
        
        if (userAttempts.length >= 3) {
          // Mark as repeat offender
          await base44.entities.XSSAttemptLog.update(
            { user_id: user.id },
            { is_repeat_offender: true }
          );
          
          // Flag user account
          await base44.entities.User.update(user.id, {
            is_flagged_for_review: true
          });
          
          // Send admin alert
          await sendAdminAlert({
            type: 'xss_repeat_offender',
            user_id: user.id,
            attempt_count: userAttempts.length,
            window: '24 hours'
          });
        }
      `
    },
    
    error_handling: {
      // Abuse.2: XSS detected → log + reject (OR sanitize + save with warning)
      option_1_strict: {
        approach: 'Reject and return validation error',
        when: 'High-security scenarios or admin forms',
        response: {
          status: 400,
          error: 'Invalid characters detected in input. Please remove HTML tags and try again.'
        },
        implementation: `
          if (containsMaliciousPatterns(input)) {
            await logXSSAttempt(user, field, input, 'rejected');
            return { error: 'Invalid characters detected', status: 400 };
          }
        `
      },
      
      option_2_lenient: {
        approach: 'Sanitize and save with logging',
        when: 'User-facing forms where usability is priority',
        response: {
          status: 200,
          warning: 'Some characters were removed from your input for security reasons.'
        },
        implementation: `
          const sanitized = sanitizeHTML(input);
          if (input !== sanitized) {
            await logXSSAttempt(user, field, input, 'sanitized_and_saved');
            // Still save, but with sanitized value
          }
        `
      },
      
      recommended: 'Use option_2_lenient for user forms, option_1_strict for admin forms'
    }
  },
  
  /**
   * CONTENT SECURITY POLICY (CSP)
   * Logic.3: Restrict script execution to known CDN origins
   */
  csp_xss_prevention: {
    // Integrated with F-004 CSP header
    script_src_directive: {
      requirement: "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com",
      rationale: 'Only allow scripts from same origin and trusted CDNs',
      blocks: [
        'Inline scripts (except with nonce or hash)',
        'eval() and Function() constructors (unless unsafe-eval allowed)',
        'Scripts from untrusted domains'
      ]
    },
    
    remove_unsafe_inline: {
      challenge: 'React often uses inline scripts and styles',
      current: "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      target: "script-src 'self' https://cdn.jsdelivr.net",
      migration: [
        'Move all inline scripts to external .js files',
        'Use nonce-based CSP for unavoidable inline scripts',
        'Remove unsafe-eval by avoiding dynamic code execution'
      ],
      timeline: 'Phase 1 or 2 - not required for Phase 0 MVP'
    },
    
    frame_ancestors: {
      directive: "frame-ancestors 'none'",
      purpose: 'Prevent clickjacking (modern alternative to X-Frame-Options)',
      integration: 'Already included in F-004 CSP configuration'
    }
  },
  
  /**
   * EXISTING DATA SANITIZATION (Errors.2)
   * One-time cleanup before launch
   */
  data_migration: {
    problem: 'Records saved BEFORE sanitization was enabled may contain unsafe content',
    risk: 'Stored XSS - malicious content already in database will execute when displayed',
    solution: 'One-time sanitization pass on all existing records',
    
    migration_script: `
      // Run ONCE before launch
      async function sanitizeExistingData() {
        const entitiesToSanitize = [
          { entity: 'CaregiverProfile', fields: ['bio'] },
          { entity: 'ParentProfile', fields: ['special_needs_notes'] },
          { entity: 'Message', fields: ['content'] },
          { entity: 'BookingRequest', fields: ['parent_notes', 'cancellation_reason', 'decline_reason'] },
          { entity: 'FlaggedContent', fields: ['reason_detail'] },
          { entity: 'Certification', fields: ['rejection_reason'] }
        ];
        
        for (const { entity, fields } of entitiesToSanitize) {
          const records = await base44.entities[entity].list();
          
          for (const record of records) {
            let needsUpdate = false;
            const updates = {};
            
            for (const field of fields) {
              if (record[field]) {
                const sanitized = sanitizeHTML(record[field]);
                if (record[field] !== sanitized) {
                  updates[field] = sanitized;
                  needsUpdate = true;
                  
                  // Log the sanitization
                  console.log(\`Sanitized \${entity}.\${field} for record \${record.id}\`);
                }
              }
            }
            
            if (needsUpdate) {
              await base44.entities[entity].update(record.id, updates);
            }
          }
        }
        
        console.log('Data sanitization complete');
      }
    `,
    
    when_to_run: 'During Phase 8 pre-launch checklist, BEFORE public launch',
    backup_first: 'Take full database backup before running sanitization script'
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F005_CONFIGURATION_CHECKLIST = [
  {
    category: 'CSRF Protection',
    tasks: [
      { task: 'Verify Base44 includes CSRF tokens on all form submissions', status: 'pending' },
      { task: 'If Base44 does NOT handle CSRF: implement custom X-CSRF-Token header', status: 'pending' },
      { task: 'Configure CSRF validation middleware to run BEFORE business logic', status: 'pending' },
      { task: 'Test: Submit form without CSRF token → verify 403 response', status: 'pending' },
      { task: 'Test: Submit form with invalid CSRF token → verify 403 response', status: 'pending' },
      { task: 'Verify CSRFValidationFailureLog entry created on failure', status: 'pending' },
      { task: 'Configure rate limit: >50 failures in 5 min → IP block + alert', status: 'pending' }
    ]
  },
  {
    category: 'XSS Input Sanitization',
    tasks: [
      { task: 'Implement HTML sanitization function (strip all tags OR allowlist)', status: 'pending' },
      { task: 'Apply sanitization to all user-supplied text fields on write', status: 'pending' },
      { task: 'Configure sanitization to run on EVERY save (creates AND updates)', status: 'pending' },
      { task: 'Test: Submit <script>alert(1)</script> → verify stripped and logged', status: 'pending' },
      { task: 'Test: Submit onclick=alert(1) → verify stripped and logged', status: 'pending' },
      { task: 'Verify XSSAttemptLog entry created when malicious pattern detected', status: 'pending' },
      { task: 'Verify special chars (<, >, &) are encoded, not rejected', status: 'pending' }
    ]
  },
  {
    category: 'Content Security Policy (CSP)',
    tasks: [
      { task: 'Add script-src directive restricting to known CDNs only', status: 'pending' },
      { task: 'Verify frame-ancestors directive blocks iframe embedding', status: 'pending' },
      { task: 'Test in browser: check DevTools for CSP violations', status: 'pending' },
      { task: 'Add upgrade-insecure-requests to CSP (from F-004)', status: 'pending' },
      { task: 'Future: Remove unsafe-inline and unsafe-eval (Phase 1-2)', status: 'pending' }
    ]
  },
  {
    category: 'Logging & Monitoring',
    tasks: [
      { task: 'Verify CSRF failures log to CSRFValidationFailureLog', status: 'pending' },
      { task: 'Verify XSS attempts log to XSSAttemptLog', status: 'pending' },
      { task: 'Configure admin alerts for >50 CSRF failures (Abuse.1)', status: 'pending' },
      { task: 'Configure admin alerts for repeat XSS offenders (Audit.2)', status: 'pending' }
    ]
  },
  {
    category: 'Pre-Launch Data Sanitization (Errors.2)',
    tasks: [
      { task: 'Take full database backup', status: 'pending' },
      { task: 'Run one-time sanitization script on existing records', status: 'pending' },
      { task: 'Verify all text fields now contain only safe content', status: 'pending' },
      { task: 'Document sanitization results (how many records updated)', status: 'pending' }
    ]
  }
];

/**
 * ============================================================================
 * ACCEPTANCE CRITERIA (Phase 0 Gate)
 * ============================================================================
 */
const ACCEPTANCE_TESTS = [
  {
    test: 'CSRF Token Required',
    steps: [
      'Open booking form in browser',
      'Use browser DevTools to remove CSRF token from form',
      'Submit booking request',
      'Verify: 403 Forbidden response',
      'Verify: CSRFValidationFailureLog entry created with failure_reason=token_missing'
    ]
  },
  {
    test: 'CSRF Token Validation',
    steps: [
      'Open booking form in browser',
      'Use DevTools to modify CSRF token value to invalid string',
      'Submit booking request',
      'Verify: 403 Forbidden response',
      'Verify: CSRFValidationFailureLog entry created with failure_reason=token_invalid'
    ]
  },
  {
    test: 'CSRF Rate Limiting',
    steps: [
      'Send 51 POST requests with invalid CSRF tokens from same IP',
      'Verify: IPBlocklist entry created after 50th failure',
      'Verify: CSRFValidationFailureLog entries have is_rate_limit_triggered=true',
      'Verify: Admin alert sent',
      'Verify: Request 51 returns 403 (IP blocked)'
    ]
  },
  {
    test: 'XSS Script Tag Stripping',
    steps: [
      'Attempt to save CaregiverProfile.bio with value: "<script>alert(1)</script>Test bio"',
      'Verify: Script tag stripped, saved as "Test bio"',
      'Verify: XSSAttemptLog entry created with detected_pattern=script_tag',
      'Verify: No JavaScript executes when viewing profile'
    ]
  },
  {
    test: 'XSS Event Handler Stripping',
    steps: [
      'Attempt to save Message.content with value: "<img src=x onerror=alert(1)>"',
      'Verify: Event handler stripped',
      'Verify: XSSAttemptLog entry created with detected_pattern=event_handler',
      'Verify: Message displays without executing JavaScript'
    ]
  },
  {
    test: 'Special Characters Preserved',
    steps: [
      'Save ParentProfile.special_needs_notes with value: "Child is <3 years old & needs help"',
      'Verify: Saved as "Child is &lt;3 years old &amp; needs help"',
      'Verify: Displays correctly as "Child is <3 years old & needs help"',
      'Verify: NO XSSAttemptLog entry (this is legitimate content, not an attack)'
    ]
  },
  {
    test: 'XSS Repeat Offender Detection',
    steps: [
      'Submit 3 XSS attempts from same user within 24 hours',
      'Verify: XSSAttemptLog.is_repeat_offender = true',
      'Verify: User.is_flagged_for_review = true',
      'Verify: Admin alert sent'
    ]
  },
  {
    test: 'CSP Script Blocking',
    steps: [
      'Open app in browser with DevTools Console open',
      'Attempt to execute inline script in Console: eval("alert(1)")',
      'If CSP correctly configured: should see CSP violation error',
      'Verify: securityheaders.com scan shows CSP directive present'
    ]
  },
  {
    test: 'Existing Data Sanitization',
    steps: [
      'Manually insert record with unsanitized content (e.g., CaregiverProfile.bio = "<script>test</script>")',
      'Run one-time sanitization script',
      'Verify: Record updated with sanitized value',
      'Verify: Script tag removed from database'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * 1. CSRF token generation and validation middleware
 * 2. Input sanitization on all entity writes (create + update)
 * 3. XSS pattern detection and logging
 * 4. Rate limiting integration (IPBlocklist from F-003)
 * 5. CSP header configuration (integrated with F-004)
 * 
 * Supporting Entities Created:
 * - CSRFValidationFailureLog: Audit trail of CSRF token failures
 * - XSSAttemptLog: Audit trail of XSS injection attempts
 * 
 * Integration with Other Features:
 * - F-002: Field-level security (sanitization applies to same fields)
 * - F-003: Middleware (CSRF validation runs in middleware layer)
 * - F-004: CSP headers (part of TLS/HTTPS enforcement)
 * - IPBlocklist (F-003): Used for CSRF abuse rate limiting
 * 
 * CRITICAL WARNINGS:
 * - Errors.2: Run one-time sanitization on existing data BEFORE launch
 * - Triggers.1: Sanitize on EVERY save, including updates (not just creates)
 * - Abuse.2: XSS detection should log + reject OR log + sanitize (choose strategy)
 * - Edge.2: Sanitization must preserve text meaning (don't corrupt user intent)
 * 
 * NEXT STEPS:
 * 1. Implement CSRF token middleware (or verify Base44 native support)
 * 2. Implement HTML sanitization function (allowlist approach)
 * 3. Apply sanitization to all entity write operations
 * 4. Configure CSP headers (integrate with F-004)
 * 5. Run acceptance tests
 * 6. Before launch: Run one-time data sanitization script
 */

export default function F005CSRFXSSProtectionDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-005: CSRF & XSS Protection - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Logging entities created (CSRFValidationFailureLog, XSSAttemptLog)</p>
      <p><strong>Next Step:</strong> Configure Base44 CSRF tokens + input sanitization middleware</p>
      
      <h2>CSRF Protection Requirements (Logic.1-2)</h2>
      <ul>
        <li><strong>Scope:</strong> ALL state-changing actions (POST, PUT, DELETE, PATCH)</li>
        <li><strong>Applies To:</strong> All roles without exception (Access.1)</li>
        <li><strong>Token Generation:</strong> Server-side only, cryptographically secure</li>
        <li><strong>Token Validation:</strong> Server-side BEFORE business logic executes</li>
        <li><strong>On Failure:</strong> 403 + log to CSRFValidationFailureLog + check rate limit</li>
        <li><strong>Rate Limit:</strong> >50 failures in 5 min from same IP → block + alert (Abuse.1)</li>
      </ul>
      
      <h2>XSS Protection Requirements (Data.2)</h2>
      <ul>
        <li><strong>Strategy:</strong> Allowlist approach (strip ALL HTML OR allow explicit safe tags)</li>
        <li><strong>Timing:</strong> Sanitize on EVERY write (creates AND updates) - Triggers.1</li>
        <li><strong>Special Chars:</strong> Encode, don't reject: &lt; &gt; &amp; &quot; &#x27; (Errors.1)</li>
        <li><strong>On Detection:</strong> Log to XSSAttemptLog + sanitize/save OR reject (Abuse.2)</li>
        <li><strong>Repeat Offenders:</strong> >=3 attempts in 24h → flag account + alert (Audit.2)</li>
      </ul>
      
      <h2>Fields Requiring Sanitization</h2>
      <ul>
        <li>CaregiverProfile.bio</li>
        <li>ParentProfile.special_needs_notes</li>
        <li>Message.content (+ store body_original for admin)</li>
        <li>BookingRequest.parent_notes, cancellation_reason, decline_reason</li>
        <li>FlaggedContent.reason_detail</li>
        <li>AdminActionLog.reason</li>
        <li>Certification.rejection_reason</li>
        <li><strong>ALL user-supplied text fields</strong></li>
      </ul>
      
      <h2>XSS Detection Patterns</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Pattern</th>
            <th>Example</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>script_tag</td>
            <td>&lt;script&gt;alert(1)&lt;/script&gt;</td>
            <td>Strip tag + log</td>
          </tr>
          <tr>
            <td>event_handler</td>
            <td>onclick=alert(1)</td>
            <td>Strip attribute + log</td>
          </tr>
          <tr>
            <td>javascript_protocol</td>
            <td>javascript:alert(1)</td>
            <td>Strip protocol + log</td>
          </tr>
          <tr>
            <td>iframe_tag</td>
            <td>&lt;iframe src=...&gt;</td>
            <td>Strip tag + log</td>
          </tr>
          <tr>
            <td>data_uri</td>
            <td>data:text/html,...</td>
            <td>Strip URI + log</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Content Security Policy (Logic.3)</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`Content-Security-Policy: 
  default-src 'self'; 
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline';
  frame-ancestors 'none';
  upgrade-insecure-requests;`}
      </pre>
      <p><em>Note: Remove unsafe-inline/unsafe-eval in Phase 1-2 for stronger protection</em></p>
      
      <h2>Critical Pre-Launch Task (Errors.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ ONE-TIME DATA SANITIZATION REQUIRED</strong>
        <p>Run sanitization script on all existing records BEFORE public launch.</p>
        <p>Risk: Records saved before sanitization was enabled may contain stored XSS.</p>
        <ol>
          <li>Take full database backup</li>
          <li>Run sanitization script (see component source)</li>
          <li>Verify all text fields contain only safe content</li>
          <li>Document how many records were updated</li>
        </ol>
      </div>
      
      <h2>Acceptance Tests</h2>
      <ol>
        <li>Submit form without CSRF token → 403 + log entry</li>
        <li>51 CSRF failures from same IP → IP block + alert</li>
        <li>Submit &lt;script&gt;alert(1)&lt;/script&gt; → stripped + logged</li>
        <li>Submit &lt;img onerror=alert(1)&gt; → stripped + logged</li>
        <li>Submit "I &lt;3 caregiving" → encoded as "&lt;" not rejected</li>
        <li>3 XSS attempts from same user → flagged + alert</li>
        <li>Run one-time sanitization → existing malicious content removed</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete CSRF/XSS implementation specification, sanitization examples, and migration script.</em></p>
    </div>
  );
}