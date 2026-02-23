/**
 * F-005: CSRF & XSS PROTECTION CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * STATUS: Phase 0 — Platform-Managed (partial)
 * 
 * ============================================================================
 * PLATFORM-MANAGED vs BUILD REQUIRED
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Build Required):
 * - CSRF token generation and validation (handled automatically by Base44)
 * - Content Security Policy (CSP) headers (applied at infrastructure level)
 * 
 * BUILD REQUIRED:
 * - XSS input sanitization in backend functions (strip/encode malicious HTML)
 * - XSSAttemptLog entity for audit trail (already created)
 * 
 * SUPERSEDED ENTITIES:
 * - CSRFValidationFailureLog: Not needed (Base44 handles CSRF natively)
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F005_CSRF_XSS_SPECIFICATION = {
  
  /**
   * CSRF PROTECTION (Cross-Site Request Forgery)
   * STATUS: PLATFORM-MANAGED — No build required
   * 
   * Base44 handles CSRF token generation and validation automatically.
   * You do NOT need to generate, validate, or manage CSRF tokens in your code.
   */
  csrf_protection_platform_managed: {
    
    what_base44_handles: {
      scope: 'ALL state-changing actions (POST, PUT, PATCH, DELETE)',
      automatic_protection: [
        'CSRF token generation on every request',
        'CSRF token validation before executing business logic',
        'Automatic rejection of requests with missing/invalid tokens',
        'Rate limiting on CSRF validation failures'
      ],
      developer_action_required: 'None — Base44 request layer handles this automatically'
    },
    
    implementation_note: {
      base44_mechanism: 'Base44 request layer handles CSRF automatically',
      no_code_required: 'You do not write CSRF token generation, validation, or rate limiting logic',
      csrf_validation_failurelog_entity: 'Not needed — Base44 logs CSRF failures in platform logs',
      testing: 'Base44 already tested and validated — no CSRF acceptance tests required from you'
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
   * STATUS: PLATFORM-MANAGED — No build required
   * 
   * Base44 applies CSP headers at the infrastructure level.
   * You do NOT configure Content Security Policy headers.
   */
  csp_platform_managed: {
    what_base44_handles: {
      csp_headers: 'Applied automatically at Base44 infrastructure level',
      script_restrictions: 'Base44 sets script-src directives to prevent XSS',
      frame_protection: 'Base44 includes frame-ancestors to prevent clickjacking',
      developer_action_required: 'None — CSP headers are platform-managed'
    },
    
    implementation_note: {
      no_configuration_needed: 'You do not set CSP headers in code',
      integrated_with_f004: 'CSP is part of Base44 TLS/HTTPS enforcement (F-004)',
      testing: 'Base44 already applies secure CSP headers — no tests required from you'
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
    category: 'XSS Input Sanitization (BUILD REQUIRED)',
    tasks: [
      { task: 'Implement HTML sanitization function in backend functions (strip all tags OR allowlist)', status: 'pending' },
      { task: 'Apply sanitization to all user-supplied text fields before entity writes', status: 'pending' },
      { task: 'Configure sanitization to run on EVERY save (creates AND updates)', status: 'pending' },
      { task: 'Test: Submit <script>alert(1)</script> → verify stripped and logged', status: 'pending' },
      { task: 'Test: Submit onclick=alert(1) → verify stripped and logged', status: 'pending' },
      { task: 'Verify XSSAttemptLog entry created when malicious pattern detected', status: 'pending' },
      { task: 'Verify special chars (<, >, &) are encoded, not rejected', status: 'pending' }
    ]
  },
  {
    category: 'Logging & Monitoring',
    tasks: [
      { task: 'Verify XSS attempts log to XSSAttemptLog', status: 'pending' },
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
  },
  {
    category: 'Platform-Managed (NO ACTION REQUIRED)',
    tasks: [
      { task: 'CSRF protection: Base44 handles automatically', status: 'platform-managed' },
      { task: 'CSP headers: Base44 applies at infrastructure level', status: 'platform-managed' }
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
    test: 'XSS Script Tag Stripping',
    steps: [
      'Attempt to save CaregiverProfile.bio with value: "<script>alert(1)</script>Test bio"',
      'Verify: Backend function strips script tag, saves as "Test bio"',
      'Verify: XSSAttemptLog entry created with detected_pattern=script_tag',
      'Verify: No JavaScript executes when viewing profile'
    ]
  },
  {
    test: 'XSS Event Handler Stripping',
    steps: [
      'Attempt to save Message.content with value: "<img src=x onerror=alert(1)>"',
      'Verify: Backend function strips event handler',
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
    test: 'Existing Data Sanitization',
    steps: [
      'Manually insert record with unsanitized content (e.g., CaregiverProfile.bio = "<script>test</script>")',
      'Run one-time sanitization script in backend function',
      'Verify: Record updated with sanitized value',
      'Verify: Script tag removed from database'
    ]
  },
  {
    test: 'CSRF Protection (Platform-Managed — No Test Required)',
    note: 'Base44 handles CSRF automatically. No acceptance test required from developer.'
  },
  {
    test: 'CSP Headers (Platform-Managed — No Test Required)',
    note: 'Base44 applies CSP at infrastructure level. No acceptance test required from developer.'
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Code Required):
 * 1. CSRF token generation and validation — Base44 request layer handles this
 * 2. CSP header configuration — Base44 infrastructure applies these headers
 * 
 * BUILD REQUIRED:
 * 1. XSS input sanitization in backend functions (strip/encode malicious HTML)
 * 2. XSS pattern detection and logging to XSSAttemptLog entity
 * 3. One-time data sanitization script before launch
 * 
 * Supporting Entities:
 * - XSSAttemptLog: Audit trail of XSS injection attempts (already created)
 * - CSRFValidationFailureLog: Not needed (Base44 logs CSRF failures in platform logs)
 * 
 * Integration with Other Features:
 * - F-002: Field-level security (sanitization applies to same fields)
 * - F-003: Middleware (Base44 handles CSRF at middleware layer)
 * - F-004: CSP headers (Base44 applies as part of TLS/HTTPS enforcement)
 * 
 * CRITICAL WARNINGS:
 * - Errors.2: Run one-time sanitization on existing data BEFORE launch
 * - Triggers.1: Sanitize on EVERY save, including updates (not just creates)
 * - Abuse.2: XSS detection should log + reject OR log + sanitize (choose strategy)
 * - Edge.2: Sanitization must preserve text meaning (don't corrupt user intent)
 * 
 * NEXT STEPS:
 * 1. Implement HTML sanitization function in backend functions (allowlist approach)
 * 2. Apply sanitization to all entity write operations in backend functions
 * 3. Run acceptance tests for XSS sanitization
 * 4. Before launch: Run one-time data sanitization script
 */

export default function F005CSRFXSSProtectionDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-005: CSRF & XSS Protection</h1>
      <p><strong>Phase 0 Status:</strong> Platform-Managed (partial)</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#dbeafe', borderLeft: '4px solid #3b82f6', marginBottom: '2rem' }}>
        <strong>ℹ️ PLATFORM-MANAGED vs BUILD REQUIRED</strong>
        <p><strong>Platform-Managed (No Build Required):</strong></p>
        <ul>
          <li>CSRF token generation and validation — Base44 handles automatically</li>
          <li>Content Security Policy (CSP) headers — Base44 applies at infrastructure level</li>
        </ul>
        <p><strong>Build Required:</strong></p>
        <ul>
          <li>XSS input sanitization in backend functions (strip/encode malicious HTML)</li>
          <li>XSSAttemptLog entity for audit trail (already created)</li>
        </ul>
      </div>
      
      <h2>CSRF Protection (PLATFORM-MANAGED)</h2>
      <ul>
        <li><strong>Status:</strong> Base44 request layer handles CSRF automatically</li>
        <li><strong>Scope:</strong> ALL state-changing actions (POST, PUT, DELETE, PATCH)</li>
        <li><strong>Developer Action:</strong> None — Base44 generates, validates, and enforces CSRF tokens</li>
        <li><strong>CSRFValidationFailureLog:</strong> Not needed — Base44 logs failures in platform logs</li>
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
      
      <h2>Content Security Policy (PLATFORM-MANAGED)</h2>
      <ul>
        <li><strong>Status:</strong> Base44 applies CSP headers at infrastructure level</li>
        <li><strong>Developer Action:</strong> None — Base44 configures CSP headers automatically</li>
        <li><strong>Integration:</strong> Part of Base44 TLS/HTTPS enforcement (F-004)</li>
      </ul>
      
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
      
      <h2>Acceptance Tests (XSS Sanitization Only)</h2>
      <ol>
        <li>Submit &lt;script&gt;alert(1)&lt;/script&gt; → backend function strips + logged</li>
        <li>Submit &lt;img onerror=alert(1)&gt; → backend function strips + logged</li>
        <li>Submit "I &lt;3 caregiving" → encoded as "&lt;" not rejected</li>
        <li>3 XSS attempts from same user → flagged + alert</li>
        <li>Run one-time sanitization → existing malicious content removed</li>
      </ol>
      
      <p><em>CSRF and CSP tests not required — Base44 handles these automatically.</em></p>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete CSRF/XSS implementation specification, sanitization examples, and migration script.</em></p>
    </div>
  );
}