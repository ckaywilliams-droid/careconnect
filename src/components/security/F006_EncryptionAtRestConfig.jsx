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
   * ACCESS CONTROL (Access.1-2)
   * Decryption server-side only
   */
  access_control: {
    
    server_side_only: {
      // Access.1: Never decrypt client-side
      rule: 'Decryption accessible only to server-side automations',
      forbidden: [
        'Client-side JavaScript (encryption key would be exposed)',
        'UI components (React components cannot decrypt)',
        'Direct database queries from client',
        'Public API endpoints returning encrypted values'
      ],
      correct_patterns: [
        'Backend function decrypts → processes → returns masked/redacted value to client',
        'Server-side automation decrypts → uses for API call → discards decrypted value',
        'Admin endpoint decrypts for display, but only accessible to super_admin role'
      ]
    },
    
    in_memory_only: {
      // Logic.2: Decrypt-on-server rule
      rule: 'Decrypted value exists in memory only for duration of operation',
      do: [
        'Decrypt → use for API call → immediately discard decrypted value',
        'Decrypt → display masked version to user → discard plaintext',
        'Decrypt → validate → re-encrypt with new key (rotation) → discard plaintext'
      ],
      dont: [
        'Store decrypted value in another database field',
        'Cache decrypted value in Redis/memcache',
        'Write decrypted value to log file (Triggers.1)',
        'Return decrypted value in API response to client',
        'Store decrypted value in browser localStorage/sessionStorage'
      ]
    },
    
    masked_display: {
      // UI.1: Users see masked values, not plaintext or encrypted bytes
      integration: 'F-007 Data Masking & Redaction (next feature)',
      examples: {
        oauth_token: 'ghp_****...****abc123 (show first 4 + last 6)',
        ssn: '***-**-1234 (show last 4)',
        bank_account: '****1234 (show last 4)',
        never: 'Do NOT show raw encrypted base64 string to users'
      }
    }
  },
  
  /**
   * NO LOGGING OF DECRYPTED VALUES (Triggers.1)
   * Critical security requirement
   */
  logging_restrictions: {
    
    prohibition: 'No automation may log decrypted values',
    applies_to: [
      'Application logs',
      'Error traces',
      'Debug logs',
      'Audit logs',
      'Performance monitoring',
      'Secondary collections/databases'
    ],
    
    safe_logging: {
      do: [
        'Log that encryption/decryption occurred (without the value)',
        'Log field name and operation type',
        'Log key version used',
        'Log masked/redacted version of value'
      ],
      dont: [
        'Log plaintext sensitive value',
        'Log encrypted value (still sensitive metadata)',
        'Include sensitive values in error messages',
        'Log partial values that could be reconstructed'
      ]
    },
    
    example_safe_logging: `
      // CORRECT: Log operation without sensitive data
      console.log('Decrypted access_token for OAuth request', {
        field: 'access_token',
        key_version: 1,
        operation: 'google_calendar_api_call',
        timestamp: new Date().toISOString()
      });
      
      // WRONG: Log decrypted value
      console.log('Access token:', decryptedToken);  // NEVER DO THIS
    `,
    
    error_handling: {
      problem: 'Error stack traces may include variable values',
      solution: 'Catch errors before they bubble to logging layer',
      implementation: `
        try {
          const decrypted = decryptField(encrypted);
          // Use decrypted value
          await makeAPICall(decrypted);
        } catch (error) {
          // Log error WITHOUT including decrypted value
          console.error('API call failed', {
            error: error.message,
            field: 'access_token',
            // DO NOT LOG: decrypted value
          });
          // Do not re-throw if it would include sensitive data in stack trace
        }
      `
    }
  },
  
  /**
   * ENCRYPTION FAILURE HANDLING (Errors.1, Edge.1, Audit.1)
   * Block operation + alert
   */
  error_handling: {
    
    encryption_failures: {
      // Edge.1: Block write if encryption fails
      causes: [
        'Encryption key unavailable (Errors.1)',
        'Algorithm failure (corrupted crypto library)',
        'Invalid key format',
        'Out of memory during encryption'
      ],
      response: {
        immediate: [
          'Block the write operation entirely',
          'Do NOT store unencrypted value',
          'Do NOT store partially encrypted value',
          'Return 500 error to client'
        ],
        logging: [
          'Log as critical system error (Audit.1)',
          'Include: timestamp, field name, operation attempted, error message',
          'DO NOT include the plaintext value that failed to encrypt'
        ],
        alerting: [
          'Send immediate operator alert (email, SMS, Slack)',
          'Alert severity: CRITICAL',
          'Alert content: field name, error type, timestamp'
        ]
      },
      implementation: `
        async function saveOAuthToken(token) {
          try {
            const encrypted = encryptField(token);
            await base44.entities.OAuthIntegration.create({
              access_token: encrypted,
              ...otherFields
            });
          } catch (error) {
            // Audit.1: Log critical error
            await base44.entities.SystemErrorLog.create({
              severity: 'CRITICAL',
              error_type: 'encryption_failure',
              field: 'access_token',
              operation: 'create_oauth_integration',
              error_message: error.message,
              timestamp: new Date().toISOString()
            });
            
            // Send operator alert
            await sendOperatorAlert({
              severity: 'CRITICAL',
              title: 'Encryption failure - data write blocked',
              details: {
                field: 'access_token',
                error: error.message,
                timestamp: new Date().toISOString()
              }
            });
            
            // Fail the operation
            throw new Error('Unable to securely store sensitive data - operation blocked');
          }
        }
      `
    },
    
    decryption_failures: {
      causes: [
        'Encrypted data corrupted',
        'Wrong encryption key (after rotation)',
        'Invalid IV or auth tag',
        'Database corruption'
      ],
      response: {
        immediate: [
          'Return error to calling function',
          'Do NOT return partial/corrupted decrypted value',
          'Log error (without sensitive data)'
        ],
        recovery: [
          'If key rotation issue: try previous key version',
          'If data corruption: flag record for admin review',
          'If unrecoverable: notify operator'
        ]
      }
    }
  },
  
  /**
   * KEY ROTATION PROCEDURE (Errors.2, Access.2)
   * Planned maintenance operation
   */
  key_rotation: {
    
    why_rotate: {
      security: 'Limit exposure if key is compromised',
      compliance: 'PCI-DSS, HIPAA, SOC2 require periodic key rotation',
      best_practice: 'Industry standard is annual rotation'
    },
    
    rotation_strategy: {
      approach: 'Gradual migration (not big-bang re-encryption)',
      timeline: '30-90 days for full migration',
      process: [
        'Generate new encryption key (version 2)',
        'Add new key to environment variables (ENCRYPTION_KEY_V2)',
        'Update encryption function to use new key for new writes',
        'Leave old key (version 1) for decrypting existing records',
        'Background job re-encrypts old records over time',
        'After all records re-encrypted, retire old key'
      ]
    },
    
    runbook: {
      title: 'F-006 Encryption Key Rotation Runbook',
      owner: 'Senior Engineer + DevOps Lead',
      frequency: 'Annually',
      duration: '2-3 months',
      
      steps: [
        {
          step: 1,
          title: 'Pre-Rotation Audit',
          actions: [
            'Take full database backup',
            'Verify current encryption is working (test encrypt/decrypt)',
            'Count total encrypted records by entity',
            'Verify ENCRYPTION_KEY environment variable is set',
            'Document current key version (should be 1)'
          ],
          estimated_time: '1 hour'
        },
        {
          step: 2,
          title: 'Generate New Key',
          actions: [
            'Generate new 256-bit key: crypto.randomBytes(32).toString("hex")',
            'Store new key in password manager',
            'Label as "Encryption Key V2"',
            'DO NOT commit to Git or share via email'
          ],
          estimated_time: '15 minutes'
        },
        {
          step: 3,
          title: 'Deploy New Key (Zero Downtime)',
          actions: [
            'Add ENCRYPTION_KEY_V2 environment variable in Base44',
            'Update getKeyForVersion() to support version 2',
            'Update encryptField() to use version 2 for new encryptions',
            'Keep ENCRYPTION_KEY_V1 for decrypting old records',
            'Deploy updated code',
            'Test: new records use key v2, old records still decrypt with v1'
          ],
          estimated_time: '2 hours'
        },
        {
          step: 4,
          title: 'Gradual Re-Encryption',
          actions: [
            'Create background job to re-encrypt old records',
            'Rate limit: 100 records per minute (avoid DB load spike)',
            'For each encrypted field: decrypt with v1, re-encrypt with v2',
            'Update record with new encrypted value',
            'Track progress: records_re_encrypted / total_records',
            'Run daily until all records migrated'
          ],
          estimated_time: '30-90 days (depending on record count)'
        },
        {
          step: 5,
          title: 'Verify Migration Complete',
          actions: [
            'Query database: count records with key_version=1 (should be 0)',
            'Query database: count records with key_version=2 (should be total)',
            'Test: randomly sample 50 records and verify they decrypt',
            'Document migration completion date'
          ],
          estimated_time: '1 hour'
        },
        {
          step: 6,
          title: 'Retire Old Key',
          actions: [
            'Remove ENCRYPTION_KEY_V1 from environment variables',
            'Update code to only support version 2',
            'Update ENCRYPTION_KEY (primary) to point to V2 value',
            'Archive old key in password manager (labeled "RETIRED - V1")',
            'Deploy updated code',
            'Monitor for decryption errors (should be none)'
          ],
          estimated_time: '1 hour'
        },
        {
          step: 7,
          title: 'Post-Rotation Audit',
          actions: [
            'Verify all encrypted fields use key version 2',
            'Test encrypt/decrypt operations',
            'Review logs for any decryption errors',
            'Document rotation completion in security audit log',
            'Schedule next rotation (12 months from now)'
          ],
          estimated_time: '1 hour'
        }
      ],
      
      rollback_plan: {
        scenario: 'New key causes decryption errors',
        actions: [
          'Revert code to use ENCRYPTION_KEY_V1 for new encryptions',
          'Stop background re-encryption job',
          'Investigate root cause',
          'Fix issue before retrying rotation'
        ]
      }
    },
    
    background_job_pseudocode: `
      // Background job for gradual re-encryption
      async function reEncryptOldRecords() {
        const batchSize = 100;
        const delayBetweenBatches = 60000;  // 1 minute (rate limiting)
        
        // Find records encrypted with old key (version 1)
        const oldRecords = await base44.entities.OAuthIntegration.filter({
          // Assuming we can query encrypted field prefix
          access_token: { $regex: '^AQ' }  // Base64 starts with 'AQ' for version 1
        }, null, batchSize);
        
        for (const record of oldRecords) {
          try {
            // Decrypt with old key
            const decrypted = decryptFieldWithVersion(record.access_token, 1);
            
            // Re-encrypt with new key (version 2)
            const reEncrypted = encryptFieldWithVersion(decrypted, 2);
            
            // Update record
            await base44.entities.OAuthIntegration.update(record.id, {
              access_token: reEncrypted
            });
            
            console.log(\`Re-encrypted record \${record.id}\`);
          } catch (error) {
            console.error(\`Failed to re-encrypt record \${record.id}\`, error);
            // Continue with next record, log failure for review
          }
        }
        
        // Wait before next batch (rate limiting)
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        
        // Check if more records remain
        const remaining = await countRecordsWithKeyVersion(1);
        console.log(\`Re-encryption progress: \${remaining} records remaining\`);
        
        if (remaining > 0) {
          // Schedule next batch
          setTimeout(reEncryptOldRecords, delayBetweenBatches);
        } else {
          console.log('Re-encryption complete!');
          await sendOperatorAlert({
            severity: 'INFO',
            message: 'Encryption key rotation complete - all records migrated to new key'
          });
        }
      }
    `
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