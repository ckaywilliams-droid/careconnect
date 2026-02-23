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
    category: 'Encryption Key Setup',
    tasks: [
      { task: 'Generate 256-bit encryption key: crypto.randomBytes(32).toString("hex")', status: 'pending' },
      { task: 'Store key in secure password manager (backup)', status: 'pending' },
      { task: 'Add ENCRYPTION_KEY environment variable in Base44', status: 'pending' },
      { task: 'Verify environment variable is accessible in code', status: 'pending' },
      { task: 'Test: Encryption fails if ENCRYPTION_KEY not set (fail-closed)', status: 'pending' }
    ]
  },
  {
    category: 'Encryption Implementation',
    tasks: [
      { task: 'Implement encryptField() function (AES-256-GCM)', status: 'pending' },
      { task: 'Implement decryptField() function', status: 'pending' },
      { task: 'Add key version prefix to encrypted values', status: 'pending' },
      { task: 'Test: Encrypt a value and verify it decrypts correctly', status: 'pending' },
      { task: 'Test: Encrypted value stored as base64 string in database', status: 'pending' }
    ]
  },
  {
    category: 'Field-Level Encryption',
    tasks: [
      { task: 'Identify all fields requiring encryption (currently: none in Phase 0)', status: 'pending' },
      { task: 'When OAuth added: Encrypt access_token before storage', status: 'pending' },
      { task: 'When OAuth added: Encrypt refresh_token before storage', status: 'pending' },
      { task: 'Apply encrypt-before-write rule to all sensitive fields', status: 'pending' }
    ]
  },
  {
    category: 'Access Control',
    tasks: [
      { task: 'Verify decryption only happens server-side (never client-side)', status: 'pending' },
      { task: 'Implement in-memory-only rule for decrypted values', status: 'pending' },
      { task: 'Verify encrypted values never returned in API responses to client', status: 'pending' },
      { task: 'Test: Client cannot decrypt encrypted values', status: 'pending' }
    ]
  },
  {
    category: 'Logging & Error Handling',
    tasks: [
      { task: 'Verify no decrypted values written to logs (Triggers.1)', status: 'pending' },
      { task: 'Implement fail-closed behavior if key unavailable', status: 'pending' },
      { task: 'Configure critical alerts for encryption failures (Audit.1)', status: 'pending' },
      { task: 'Test: Encryption failure blocks write + sends alert', status: 'pending' }
    ]
  },
  {
    category: 'Key Rotation Preparation',
    tasks: [
      { task: 'Document key rotation runbook (see above)', status: 'pending' },
      { task: 'Implement getKeyForVersion() for multi-key support', status: 'pending' },
      { task: 'Create background job for gradual re-encryption', status: 'pending' },
      { task: 'Schedule first key rotation (12 months from launch)', status: 'pending' }
    ]
  },
  {
    category: 'Pre-Launch Verification (Phase 8)',
    tasks: [
      { task: 'Inspect raw database record to verify encryption active (UI.2)', status: 'pending' },
      { task: 'Verify sensitive field value is base64, not plaintext', status: 'pending' },
      { task: 'Test encrypt/decrypt round-trip', status: 'pending' },
      { task: 'Verify key stored in environment variables only (not code/DB)', status: 'pending' },
      { task: 'Document encryption key backup location', status: 'pending' }
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
    test: 'Encryption Round-Trip',
    steps: [
      'Encrypt a plaintext value: "test_token_12345"',
      'Verify encrypted value is base64 string (not plaintext)',
      'Decrypt the encrypted value',
      'Verify decrypted value equals original: "test_token_12345"'
    ]
  },
  {
    test: 'Key Version Tracking',
    steps: [
      'Encrypt a value with key version 1',
      'Verify first byte of encrypted data is 0x01',
      'Decrypt using getKeyForVersion(1)',
      'Verify correct decryption'
    ]
  },
  {
    test: 'Fail Closed - Missing Key',
    steps: [
      'Temporarily remove ENCRYPTION_KEY environment variable',
      'Attempt to encrypt a value',
      'Verify: Operation throws error and blocks',
      'Verify: Critical error logged (Audit.1)',
      'Verify: Operator alert sent',
      'Verify: No data written to database'
    ]
  },
  {
    test: 'Server-Side Only Decryption',
    steps: [
      'Encrypt a value server-side',
      'Store encrypted value in database',
      'Query database from client',
      'Verify: Client receives encrypted base64 string (cannot decrypt)',
      'Verify: Client cannot access ENCRYPTION_KEY environment variable'
    ]
  },
  {
    test: 'No Logging of Decrypted Values',
    steps: [
      'Decrypt a value in a function',
      'Check application logs',
      'Verify: Decrypted plaintext value NOT in logs',
      'Verify: Only operation metadata logged (field name, timestamp)'
    ]
  },
  {
    test: 'Database Inspection (UI.2)',
    steps: [
      'Create a record with encrypted field (e.g., OAuth token)',
      'Open Base44 database dashboard',
      'View raw database record',
      'Verify: Field value is base64 string starting with key version prefix',
      'Verify: Field value is NOT plaintext'
    ]
  },
  {
    test: 'Encryption Failure Blocks Write',
    steps: [
      'Simulate encryption failure (e.g., invalid key format)',
      'Attempt to write sensitive field',
      'Verify: Write operation blocked',
      'Verify: Error logged as CRITICAL',
      'Verify: Operator alert sent',
      'Verify: No partial/unencrypted data in database'
    ]
  },
  {
    test: 'Key Rotation Simulation',
    steps: [
      'Encrypt value with key version 1',
      'Add ENCRYPTION_KEY_V2 environment variable',
      'Update encryptField() to use version 2 for new writes',
      'Encrypt new value (should use version 2)',
      'Decrypt old value (should still work with version 1)',
      'Verify: Both old and new values decrypt correctly'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - Environment variable support (secure storage)
 * - Server-side encryption/decryption functions
 * - No client-side access to encrypted values
 * - Critical error alerting system
 * 
 * Supporting Entities:
 * - NO new entities - encryption applies to existing fields
 * - Future: OAuth integration entity will have encrypted access_token/refresh_token
 * 
 * Integration with Other Features:
 * - F-007: Data Masking & Redaction (displays masked versions of encrypted fields)
 * - F-002: Field-level security (some fields are both access-restricted AND encrypted)
 * - Future OAuth integrations (primary use case for encryption)
 * 
 * CRITICAL WARNINGS:
 * - Data.4: NEVER store encryption key in code, DB, or logs
 * - Triggers.1: NEVER log decrypted values
 * - Errors.1: ALWAYS fail closed if key unavailable
 * - Edge.2: NEVER fall back to hardcoded key
 * 
 * CURRENT STATUS (Phase 0):
 * - No encrypted fields yet (OAuth not implemented)
 * - Encryption infrastructure must be ready BEFORE OAuth integration
 * - Document runbooks and procedures now, implement when needed
 * 
 * NEXT STEPS:
 * 1. Generate encryption key and store in environment variables
 * 2. Implement encryptField() and decryptField() functions
 * 3. Document key rotation runbook
 * 4. When OAuth is added: Apply encryption to access_token/refresh_token
 * 5. Test all acceptance criteria
 * 6. Schedule annual key rotation
 */

export default function F006EncryptionAtRestDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-006: Encryption at Rest - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Documentation complete - no encrypted fields yet</p>
      <p><strong>Next Step:</strong> Implement encryption infrastructure before OAuth integration</p>
      
      <h2>Algorithm: AES-256-GCM (Data.3)</h2>
      <ul>
        <li><strong>Key Size:</strong> 256 bits (32 bytes, 64-character hex string)</li>
        <li><strong>Mode:</strong> GCM (Galois/Counter Mode) - provides authentication</li>
        <li><strong>Storage Format:</strong> [key_version:1B][IV:12B][encrypted_data][auth_tag:16B] (base64 encoded)</li>
        <li><strong>IV:</strong> Random 12-byte Initialization Vector (unique per encryption)</li>
      </ul>
      
      <h2>Fields Requiring Encryption (Data.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Field</th>
            <th>Entity</th>
            <th>Phase</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>access_token</td>
            <td>OAuthIntegration (future)</td>
            <td>Phase 1-2</td>
          </tr>
          <tr>
            <td>refresh_token</td>
            <td>OAuthIntegration (future)</td>
            <td>Phase 1-2</td>
          </tr>
          <tr>
            <td>ssn, government_id</td>
            <td>User/CaregiverProfile (future)</td>
            <td>Post-MVP (if needed)</td>
          </tr>
          <tr>
            <td>bank_account_number</td>
            <td>StripeConnect (future)</td>
            <td>Post-MVP</td>
          </tr>
        </tbody>
      </table>
      <p><em>Note: No encrypted fields exist in Phase 0. Encryption infrastructure must be ready for future OAuth integration.</em></p>
      
      <h2>Encryption Key Management (Data.4)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Key Storage Rules</strong>
        <ul>
          <li><strong>✓ CORRECT:</strong> Base44 environment variables only</li>
          <li><strong>✗ FORBIDDEN:</strong> Source code, database, logs, config files, client-side</li>
        </ul>
      </div>
      
      <h3>Generate Key</h3>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`const crypto = require('crypto');
const key = crypto.randomBytes(32).toString('hex');
console.log(key);  // 64-character hex string

Example: a1b2c3d4e5f6...64 characters total`}
      </pre>
      
      <h3>Store in Base44</h3>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`Base44 Dashboard → Settings → Environment Variables:

Variable Name: ENCRYPTION_KEY
Variable Value: [64-character hex from above]
Environment: Production

BACKUP: Store in secure password manager`}
      </pre>
      
      <h2>Access Control (Access.1-2, Logic.2)</h2>
      <ul>
        <li><strong>Decryption:</strong> Server-side only - never client-side</li>
        <li><strong>Usage:</strong> In-memory only for duration of operation</li>
        <li><strong>Display:</strong> Masked/redacted (F-007), never plaintext or encrypted bytes</li>
        <li><strong>Logging:</strong> NEVER log decrypted values (Triggers.1)</li>
      </ul>
      
      <h2>Fail-Closed Behavior (Errors.1, Edge.1-2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>If encryption key unavailable:</strong>
        <ol>
          <li>Refuse to store unencrypted data</li>
          <li>Block write operation</li>
          <li>Log critical error (Audit.1)</li>
          <li>Send operator alert</li>
          <li>Return 500 error to client</li>
          <li><strong>NEVER</strong> fall back to plaintext or hardcoded key</li>
        </ol>
      </div>
      
      <h2>Key Rotation (Errors.2, Access.2)</h2>
      <ul>
        <li><strong>Frequency:</strong> Annually (every 12 months)</li>
        <li><strong>Strategy:</strong> Gradual migration (not big-bang re-encryption)</li>
        <li><strong>Timeline:</strong> 30-90 days for full migration</li>
        <li><strong>Key Versions:</strong> Old records use v1, new records use v2</li>
        <li><strong>Runbook:</strong> See component source for detailed 7-step procedure</li>
      </ul>
      
      <h2>Pre-Launch Verification (UI.2)</h2>
      <ol>
        <li>Generate encryption key and store in environment variables</li>
        <li>Implement encryptField() and decryptField() functions</li>
        <li>Test encrypt/decrypt round-trip</li>
        <li>Verify fail-closed behavior (key unavailable → block write)</li>
        <li>Inspect raw database record to verify encryption active</li>
        <li>Verify no decrypted values in logs</li>
        <li>Document key backup location</li>
      </ol>
      
      <h2>Acceptance Tests</h2>
      <ol>
        <li>Encrypt → Decrypt → Verify plaintext matches</li>
        <li>Key version 1 prefix present in encrypted data</li>
        <li>Missing key → operation blocked + alert sent</li>
        <li>Client cannot decrypt values (server-side only)</li>
        <li>No decrypted values in logs</li>
        <li>Database inspection shows base64, not plaintext</li>
        <li>Encryption failure → write blocked + critical error</li>
        <li>Key rotation: v1 and v2 values both decrypt correctly</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete encryption specification, pseudocode implementation, and key rotation runbook.</em></p>
    </div>
  );
}