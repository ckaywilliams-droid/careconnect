/**
 * F-006: ENCRYPTION AT REST CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * STATUS: Phase 0 — Platform-Managed
 * 
 * ============================================================================
 * PLATFORM-MANAGED vs BUILD REQUIRED
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Build Required):
 * - Encryption at rest: Base44 encrypts all entity data automatically at infrastructure level
 * - Encryption key management: Base44 manages keys, versioning, and rotation
 * - No AES-256 encryption automation to build
 * 
 * BUILD REQUIRED:
 * - Field-Level Security (FLS) rls rules on sensitive fields in entity schemas
 * - Configure read/write access restrictions using the rls block in entity JSON
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F006_ENCRYPTION_AT_REST_SPECIFICATION = {
  
  /**
   * PLATFORM ENCRYPTION (Automatic)
   * Base44 encrypts ALL entity data at rest automatically
   */
  platform_encryption: {
    what_base44_handles: {
      encryption_at_rest: 'All entity data encrypted automatically at storage layer',
      key_management: 'Base44 manages encryption keys, versioning, and rotation',
      no_code_required: 'You do not write AES-256 encryption/decryption logic',
      developer_action: 'None — platform handles storage encryption automatically'
    },
    
    security_goal_achieved: {
      original_goal: 'Protect sensitive fields from unauthorized access if database compromised',
      how_achieved: 'Platform encryption (automatic) + Field-Level Security rls rules (your responsibility)',
      implementation: 'Configure FLS rls blocks on sensitive fields in entity schema JSON'
    }
  },
  
  /**
   * FIELDS REQUIRING ACCESS RESTRICTION (Build Required)
   * Use FLS rls rules to restrict who can read/write these fields
   */
  fields_requiring_fls_rules: {
    
    current_phase_0_fields: {
      message_body_original: {
        entity: 'Message',
        field: 'body_original',
        fls_rule: {
          read: { user_condition: { role: 'admin' } },
          write: { user_condition: { role: 'admin' } }
        },
        rationale: 'Unedited message content for moderation — admin-only access'
      },
      
      admin_resolution_notes: {
        entity: 'FlaggedContent',
        field: 'resolution_note',
        fls_rule: {
          read: { user_condition: { role: 'admin' } },
          write: { user_condition: { role: 'admin' } }
        },
        rationale: 'Admin internal notes — not visible to regular users'
      }
    },
    
    future_oauth_tokens: {
      entity: 'Future OAuth integration entity (not yet created)',
      fields: ['access_token', 'refresh_token'],
      fls_rule: {
        read: false,  // No client-side read
        write: false  // Backend functions only
      },
      rationale: 'OAuth tokens should only be accessible via backend functions using base44.asServiceRole',
      note: 'Phase 1-2 when OAuth integrations are built'
    },
    
    future_stripe_fields: {
      entity: 'Future StripeConnect or payment entity',
      field: 'stripe_account_id',
      fls_rule: {
        read: { user_condition: { role: 'admin' } },
        write: { user_condition: { role: 'admin' } }
      },
      rationale: 'Stripe account IDs admin-only',
      note: 'Post-MVP — not required for Phase 0'
    },
    
    important_note: `
      MINIMIZE DATA COLLECTION: The best security is not needing the data at all.
      - OAuth tokens: Use short-lived tokens when possible (1 hour TTL)
      - SSN: Only collect if legally required for background checks
      - Banking: Use Stripe Connect tokens instead of raw account numbers
      - Apply principle of least privilege: collect only what's absolutely necessary
    `
  },
  
  /**
   * FIELD-LEVEL SECURITY (FLS) IMPLEMENTATION
   * Configure rls blocks in entity schema JSON
   */
  fls_implementation: {
    
    what_is_fls: {
      purpose: 'Restrict which roles can read/write specific entity fields',
      mechanism: 'Add rls block directly on field definition in entity schema JSON',
      base44_enforces: 'Platform automatically enforces these rules on all queries',
      no_middleware_needed: 'You do not write access control middleware — Base44 handles it'
    },
    
    fls_syntax: {
      location: 'Entity schema JSON file (entities/EntityName.json)',
      field_definition: `
        "field_name": {
          "type": "string",
          "rls": {
            "read": {"user_condition": {"role": "admin"}},
            "write": {"user_condition": {"role": "admin"}}
          }
        }
      `,
      explanation: {
        read_rule: 'Defines who can read this field value',
        write_rule: 'Defines who can write/update this field value',
        user_condition: 'Matches current user role against specified role',
        role_examples: '"admin", "super_admin", "trust_admin", "caregiver", "parent"'
      }
    },
    
    fls_examples: {
      admin_only_read_write: {
        description: 'Field only accessible to admin roles',
        example: `
          "body_original": {
            "type": "string",
            "rls": {
              "read": {"user_condition": {"role": "admin"}},
              "write": {"user_condition": {"role": "admin"}}
            }
          }
        `,
        use_case: 'Message.body_original (admin moderation only)'
      },
      
      backend_functions_only: {
        description: 'Field not accessible to any client-side user, only backend functions',
        example: `
          "access_token": {
            "type": "string",
            "rls": {
              "read": false,
              "write": false
            }
          }
        `,
        backend_access: 'Use base44.asServiceRole.entities.EntityName to read/write',
        use_case: 'OAuth tokens that should never be exposed client-side'
      },
      
      owner_only: {
        description: 'Field only accessible to the record owner',
        example: `
          "stripe_account_id": {
            "type": "string",
            "rls": {
              "read": {"entity_user_field": "user_id"},
              "write": {"user_condition": {"role": "admin"}}
            }
          }
        `,
        use_case: 'User can read their own Stripe ID, only admin can write'
      }
    }
  },
  
  /**
   * ENCRYPTION KEY MANAGEMENT
   * STATUS: PLATFORM-MANAGED — No build required
   */
  key_management_platform_managed: {
    what_base44_handles: {
      key_storage: 'Base44 manages encryption keys at infrastructure level',
      key_rotation: 'Base44 handles key rotation and versioning automatically',
      no_environment_variables: 'You do not set ENCRYPTION_KEY environment variables',
      no_key_generation: 'You do not generate or manage encryption keys',
      developer_action: 'None — Base44 handles all key management'
    },
    
    implementation_note: {
      superseded: 'Original spec required AES-256-GCM implementation and key management',
      correction: 'Base44 encrypts all data at rest automatically — no code required',
      focus_instead: 'Configure FLS rls rules to restrict field access (see above)'
    }
  },
  
  /**
   * ACCESS CONTROL VIA FLS
   * Configure field access using rls blocks
   */
  access_control_via_fls: {
    
    how_fls_enforces_access: {
      mechanism: 'Base44 automatically filters query results based on rls rules',
      server_side: 'Enforced at the database query level — cannot be bypassed',
      client_protection: 'Client-side code never receives restricted field values',
      backend_functions: 'Use base44.asServiceRole to bypass FLS when needed'
    },
    
    backend_function_access: {
      when_needed: 'OAuth token access, admin operations, system automations',
      how_to: `
        // Backend function bypasses FLS to read restricted field
        export default async function handler(req, context) {
          const { base44 } = context;
          
          // Use asServiceRole to bypass FLS
          const oauthRecord = await base44.asServiceRole.entities.OAuthIntegration.filter({
            user_id: req.user.id
          });
          
          const accessToken = oauthRecord[0].access_token;
          
          // Use token for API call
          const response = await fetch('https://api.service.com/data', {
            headers: { Authorization: \`Bearer \${accessToken}\` }
          });
          
          // Return processed result (not the raw token)
          return { data: await response.json() };
        }
      `,
      important: 'Backend functions should apply their own role checks when using asServiceRole'
    },
    
    masked_display: {
      integration: 'F-007 Data Masking & Redaction (for partial display)',
      examples: {
        oauth_token: 'ghp_****...****abc123 (show first 4 + last 6)',
        ssn: '***-**-1234 (show last 4)',
        bank_account: '****1234 (show last 4)'
      },
      note: 'Masking is UI-level display logic, FLS is database-level access control'
    }
  },
  
  /**
   * LOGGING RESTRICTIONS
   * Never log sensitive field values
   */
  logging_restrictions: {
    
    prohibition: 'No backend function or automation may log sensitive field values',
    applies_to: [
      'Application logs',
      'Error traces',
      'Debug logs',
      'Audit logs (unless specifically designed for PII with admin-only access)',
      'Performance monitoring',
      'Console.log statements'
    ],
    
    safe_logging: {
      do: [
        'Log that a sensitive field was accessed (without the value)',
        'Log field name and operation type',
        'Log user ID who accessed the field',
        'Log masked/redacted version of value if needed'
      ],
      dont: [
        'Log plaintext sensitive value',
        'Include sensitive values in error messages',
        'Log partial values that could be reconstructed',
        'Log values in exception stack traces'
      ]
    },
    
    example_safe_logging: `
      // CORRECT: Log operation without sensitive data
      console.log('Accessed OAuth token for API request', {
        field: 'access_token',
        user_id: user.id,
        operation: 'google_calendar_api_call',
        timestamp: new Date().toISOString()
      });
      
      // WRONG: Log sensitive value
      console.log('Access token:', accessToken);  // NEVER DO THIS
    `,
    
    error_handling: {
      problem: 'Error stack traces may include variable values',
      solution: 'Catch errors and sanitize before logging',
      implementation: `
        try {
          const accessToken = await base44.asServiceRole.entities.OAuthIntegration.get(id);
          await makeAPICall(accessToken.access_token);
        } catch (error) {
          // Log error WITHOUT including sensitive value
          console.error('API call failed', {
            error: error.message,
            field: 'access_token',
            user_id: user.id
            // DO NOT LOG: actual token value
          });
        }
      `
    }
  },
  
  /**
   * ERROR HANDLING FOR FLS VIOLATIONS
   * Base44 handles access control violations automatically
   */
  fls_error_handling: {
    
    what_base44_handles: {
      fls_violations: 'Base44 automatically blocks unauthorized field access',
      client_side: 'Restricted fields excluded from query results — no error thrown',
      write_violations: 'Write attempts to restricted fields return permission denied error',
      no_code_required: 'You do not write access control error handling logic'
    },
    
    backend_function_errors: {
      scenario: 'Backend function attempts invalid operation on sensitive field',
      example_error: {
        status: 403,
        message: 'Permission denied: Cannot access field [field_name]'
      },
      solution: 'Use base44.asServiceRole to bypass FLS when legitimately needed'
    },
    
    implementation_note: {
      superseded: 'Original spec required encryption failure handling and alerts',
      correction: 'Base44 handles storage encryption — no encryption errors to handle',
      focus_instead: 'Handle FLS permission errors in backend functions if needed'
    }
  },
  
  /**
   * KEY ROTATION
   * STATUS: PLATFORM-MANAGED — No build required
   */
  key_rotation_platform_managed: {
    
    what_base44_handles: {
      key_rotation: 'Base44 rotates encryption keys automatically at infrastructure level',
      no_manual_rotation: 'You do not plan or execute key rotation procedures',
      no_re_encryption_jobs: 'You do not write background jobs to re-encrypt data',
      developer_action: 'None — Base44 handles key rotation lifecycle'
    },
    
    implementation_note: {
      superseded: 'Original spec included detailed 7-step key rotation runbook',
      correction: 'Base44 manages encryption keys — no rotation procedure needed',
      focus_instead: 'Monitor Base44 platform updates for encryption key rotation notifications (if any)'
    }
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F006_CONFIGURATION_CHECKLIST = [
  {
    category: 'Field-Level Security Configuration (BUILD REQUIRED)',
    tasks: [
      { task: 'Identify fields requiring access restriction (body_original, resolution_note, future OAuth tokens)', status: 'pending' },
      { task: 'Add rls block to Message.body_original: admin-only read/write', status: 'pending' },
      { task: 'Add rls block to FlaggedContent.resolution_note: admin-only read/write', status: 'pending' },
      { task: 'Test: Non-admin users cannot read restricted fields', status: 'pending' },
      { task: 'Test: Backend functions can access restricted fields via asServiceRole', status: 'pending' }
    ]
  },
  {
    category: 'Future OAuth Fields (Phase 1-2)',
    tasks: [
      { task: 'When OAuth entity created: Add rls rules to access_token and refresh_token', status: 'pending' },
      { task: 'Set rls read/write to false for OAuth tokens (backend functions only)', status: 'pending' },
      { task: 'Implement backend function using asServiceRole to access OAuth tokens', status: 'pending' },
      { task: 'Test: Client-side code cannot access OAuth tokens', status: 'pending' }
    ]
  },
  {
    category: 'Logging Best Practices',
    tasks: [
      { task: 'Verify no sensitive field values written to logs', status: 'pending' },
      { task: 'Log field access operations without logging actual values', status: 'pending' },
      { task: 'Sanitize error messages to prevent sensitive data leakage', status: 'pending' }
    ]
  },
  {
    category: 'Platform-Managed (NO ACTION REQUIRED)',
    tasks: [
      { task: 'Encryption at rest: Base44 handles automatically', status: 'platform-managed' },
      { task: 'Encryption key management: Base44 manages keys', status: 'platform-managed' },
      { task: 'Key rotation: Base44 handles automatically', status: 'platform-managed' }
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
    test: 'FLS Rules Block Unauthorized Read',
    steps: [
      'Log in as non-admin user (caregiver or parent)',
      'Query Message entity',
      'Verify: body_original field NOT included in query results',
      'Verify: User receives sanitized content field only'
    ]
  },
  {
    test: 'FLS Rules Allow Admin Read',
    steps: [
      'Log in as admin user',
      'Query Message entity',
      'Verify: body_original field IS included in query results',
      'Verify: Admin can view both content and body_original'
    ]
  },
  {
    test: 'Backend Function Bypasses FLS',
    steps: [
      'Create backend function using base44.asServiceRole',
      'Query restricted field (e.g., OAuth access_token)',
      'Verify: Backend function can read restricted field',
      'Verify: Backend function applies own role check before returning data'
    ]
  },
  {
    test: 'No Sensitive Values in Logs',
    steps: [
      'Backend function accesses sensitive field',
      'Check application logs',
      'Verify: Field name and operation logged',
      'Verify: Actual field value NOT in logs'
    ]
  },
  {
    test: 'Platform Encryption Active (No Test Required)',
    note: 'Base44 encrypts all data at rest automatically. No acceptance test required from developer.'
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Code Required):
 * 1. Encryption at rest — Base44 encrypts all entity data automatically
 * 2. Encryption key management — Base44 manages keys, versioning, rotation
 * 3. No AES-256 encryption automation to build
 * 
 * BUILD REQUIRED:
 * 1. Configure FLS rls rules on sensitive fields in entity schema JSON
 * 2. Use rls block to restrict read/write access by role
 * 3. Backend functions use base44.asServiceRole to bypass FLS when needed
 * 4. Never log sensitive field values in backend functions or error handlers
 * 
 * Supporting Entities:
 * - Message (body_original field): admin-only via FLS
 * - FlaggedContent (resolution_note field): admin-only via FLS
 * - Future OAuth entity: access_token/refresh_token with read=false, write=false
 * 
 * Integration with Other Features:
 * - F-002: Field-level security (this is F-006's primary mechanism)
 * - F-007: Data Masking & Redaction (UI-level display of sensitive fields)
 * - Future OAuth integrations (primary use case for read=false fields)
 * 
 * CRITICAL WARNINGS:
 * - NEVER log sensitive field values in application logs
 * - Use rls block directly on field in entity schema JSON (not a separate config panel)
 * - Backend functions should apply own role checks when using asServiceRole
 * 
 * CURRENT STATUS (Phase 0):
 * - Configure FLS rls rules on Message.body_original and FlaggedContent.resolution_note
 * - Platform encryption already active (no action needed)
 * - Future OAuth fields will use read=false, write=false FLS rules
 * 
 * NEXT STEPS:
 * 1. Add rls blocks to existing sensitive fields (body_original, resolution_note)
 * 2. Test FLS access restrictions for admin vs non-admin users
 * 3. When OAuth is added: Configure read=false, write=false on token fields
 * 4. Implement backend functions using asServiceRole for token access
 * 5. Test all FLS acceptance criteria
 */

export default function F006EncryptionAtRestDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-006: Encryption at Rest</h1>
      <p><strong>Phase 0 Status:</strong> Platform-Managed</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#dbeafe', borderLeft: '4px solid #3b82f6', marginBottom: '2rem' }}>
        <strong>ℹ️ PLATFORM-MANAGED vs BUILD REQUIRED</strong>
        <p><strong>Platform-Managed (No Build Required):</strong></p>
        <ul>
          <li>Encryption at rest — Base44 encrypts ALL entity data automatically at infrastructure level</li>
          <li>Encryption key management — Base44 manages keys, versioning, and rotation</li>
        </ul>
        <p><strong>Build Required:</strong></p>
        <ul>
          <li>Field-Level Security (FLS) rls rules on sensitive fields in entity schema JSON</li>
          <li>Configure read/write access restrictions using the rls block</li>
        </ul>
      </div>
      
      <h2>Platform Encryption (Automatic)</h2>
      <ul>
        <li><strong>Status:</strong> Base44 encrypts all entity data at rest automatically</li>
        <li><strong>Scope:</strong> ALL entity data stored in the database</li>
        <li><strong>Developer Action:</strong> None — Base44 handles storage encryption</li>
        <li><strong>Key Management:</strong> Base44 manages encryption keys, versioning, and rotation</li>
      </ul>
      
      <h2>Field-Level Security (FLS) Implementation</h2>
      <p><strong>How to restrict access to sensitive fields:</strong></p>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`// Entity schema JSON (entities/Message.json)
"body_original": {
  "type": "string",
  "rls": {
    "read": {"user_condition": {"role": "admin"}},
    "write": {"user_condition": {"role": "admin"}}
  }
}

// Backend functions only (no client-side access)
"access_token": {
  "type": "string",
  "rls": {
    "read": false,
    "write": false
  }
}

// Access in backend function using asServiceRole
export default async function handler(req, context) {
  const { base44 } = context;
  
  // Bypass FLS to read restricted field
  const record = await base44.asServiceRole.entities.OAuthIntegration.get(id);
  const token = record.access_token;
  
  // Apply own role check
  if (req.user.role !== 'admin') {
    return { error: 'Unauthorized' };
  }
  
  // Use token for operation
  return { success: true };
}`}
      </pre>
      
      <h2>Fields Requiring FLS Rules</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Field</th>
            <th>Entity</th>
            <th>FLS Rule</th>
            <th>Phase</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>body_original</td>
            <td>Message</td>
            <td>admin-only read/write</td>
            <td>Phase 0</td>
          </tr>
          <tr>
            <td>resolution_note</td>
            <td>FlaggedContent</td>
            <td>admin-only read/write</td>
            <td>Phase 0</td>
          </tr>
          <tr>
            <td>access_token</td>
            <td>OAuthIntegration (future)</td>
            <td>read=false, write=false</td>
            <td>Phase 1-2</td>
          </tr>
          <tr>
            <td>refresh_token</td>
            <td>OAuthIntegration (future)</td>
            <td>read=false, write=false</td>
            <td>Phase 1-2</td>
          </tr>
          <tr>
            <td>stripe_account_id</td>
            <td>Future Stripe entity</td>
            <td>admin-only read/write</td>
            <td>Post-MVP</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Logging Best Practices</h2>
      <ul>
        <li><strong>Do NOT log:</strong> Sensitive field values (OAuth tokens, admin notes, etc.)</li>
        <li><strong>DO log:</strong> Field access operations (field name, user ID, timestamp)</li>
        <li><strong>DO log:</strong> Masked/redacted versions if needed for debugging</li>
      </ul>
      
      <h2>Acceptance Tests (FLS Only)</h2>
      <ol>
        <li>Non-admin user queries Message → body_original NOT in results</li>
        <li>Admin user queries Message → body_original IS in results</li>
        <li>Backend function uses asServiceRole → can read restricted fields</li>
        <li>Logs contain operation metadata, NOT sensitive field values</li>
      </ol>
      
      <p><em>Encryption at rest and key management acceptance tests not required — Base44 handles automatically.</em></p>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete FLS specification and examples.</em></p>
    </div>
  );
}