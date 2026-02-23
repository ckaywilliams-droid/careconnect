/**
 * F-002: FIELD-LEVEL SECURITY CONFIGURATION DOCUMENTATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * STATUS: Phase 0 — Confirmed — Implementation Clarified
 * 
 * ============================================================================
 * PLATFORM-MANAGED vs BUILD REQUIRED
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Build Required):
 * - password_hash field (do NOT define in User entity)
 * - Basic field exclusion (automatic when field not in schema)
 * 
 * BUILD REQUIRED:
 * - Add rls blocks to individual fields in entity schema JSON files
 * - Phone reveal logic (backend function - context-dependent)
 * - Remove password_hash from User entity schema (if exists)
 * 
 * CRITICAL: Do NOT define password_hash in User.json
 * - Base44 manages password_hash internally
 * - Defining it causes a schema validation error
 * 
 * ============================================================================
 * FIELD-LEVEL SECURITY IMPLEMENTATION: rls BLOCKS IN SCHEMA
 * ============================================================================
 */

const F002_FIELD_LEVEL_SECURITY_SPECIFICATION = {
  
  /**
   * IMPLEMENTATION MECHANISM: rls BLOCKS IN ENTITY SCHEMA
   * Add directly to field definitions in entity JSON files
   */
  implementation_pattern: {
    where: 'Add rls block to individual field definitions in entities/*.json',
    not_separate_panel: 'NOT a separate configuration panel',
    
    basic_syntax: `
      // In entity schema JSON file
      {
        "properties": {
          "field_name": {
            "type": "string",
            "rls": {
              "read": <rule>,
              "write": <rule>
            }
          }
        }
      }
    `,
    
    rule_types: {
      boolean: 'true (allow all) or false (deny all)',
      user_condition: '{"user_condition": {"role": "admin"}}',
      or_conditions: '{"$or": [{"user_condition": {"role": "admin"}}, {"created_by_id": "{{user.id}}"}]}'
    }
  },
  
  /**
   * 1. ADMIN-ONLY FIELDS (Role-Based FLS)
   */
  admin_only_fields: {
    
    'CaregiverProfile.is_verified': {
      implementation: `
        // entities/CaregiverProfile.json
        "is_verified": {
          "type": "boolean",
          "default": false,
          "rls": {
            "read": true,  // Public - visible in search results
            "write": {
              "$or": [
                {"user_condition": {"role": "trust_admin"}},
                {"user_condition": {"role": "super_admin"}}
              ]
            }
          }
        }
      `,
      read_access: 'Public (visible in search results)',
      write_access: 'trust_admin and super_admin only',
      rejection: 'Base44 returns 403 for non-admin write attempts',
      audit: 'Optional: Log write attempts to AdminActionLog in backend function'
    },
    
    'Message.body_original': {
      implementation: `
        // entities/Message.json
        "body_original": {
          "type": "string",
          "rls": {
            "read": {
              "$or": [
                {"user_condition": {"role": "admin"}},
                {"user_condition": {"role": "trust_admin"}}
              ]
            },
            "write": {
              "$or": [
                {"user_condition": {"role": "admin"}},
                {"user_condition": {"role": "trust_admin"}}
              ]
            }
          }
        }
      `,
      visibility: 'Admin-only (trust_admin, super_admin)',
      purpose: 'Moderation and abuse investigation',
      parent_caregiver_access: 'Excluded (403 Forbidden)',
      public_field: 'Message.content (sanitized version)'
    },
    
    'FlaggedContent.resolution_note': {
      implementation: `
        // entities/FlaggedContent.json
        "resolution_note": {
          "type": "string",
          "rls": {
            "read": {"user_condition": {"role": {"$in": ["admin", "trust_admin"]}}},
            "write": {"user_condition": {"role": {"$in": ["admin", "trust_admin"]}}}
          }
        }
      `,
      visibility: 'Admin-only',
      purpose: 'Admin notes on moderation resolution'
    }
  },
  
  /**
   * 2. OWNER-RESTRICTED FIELDS (Ownership-Based FLS)
   */
  owner_restricted_fields: {
    
    'ParentProfile.address_line_1': {
      implementation: `
        // entities/ParentProfile.json
        "address_line_1": {
          "type": "string",
          "rls": {
            "read": {
              "$or": [
                {"data.user_id": "{{user.id}}"},  // Owner
                {"user_condition": {"role": {"$in": ["admin", "trust_admin"]}}}
              ]
            },
            "write": {
              "$or": [
                {"data.user_id": "{{user.id}}"},
                {"user_condition": {"role": {"$in": ["admin", "trust_admin"]}}}
              ]
            }
          }
        }
      `,
      read_access: 'Owner and admin only',
      caregiver_access: '403 Forbidden',
      search_results: 'Excluded (RLS enforces at query level)',
      audit: 'Optional: Log admin access to PIIAccessLog'
    },
    
    'ParentProfile.address_line_2': {
      implementation: 'Same rls block as address_line_1',
      visibility: 'Owner and admin only'
    },
    
    'ParentProfile.zip_code': {
      implementation: `
        // entities/ParentProfile.json
        "zip_code": {
          "type": "string",
          "rls": {
            "read": {
              "$or": [
                {"data.user_id": "{{user.id}}"},
                {"user_condition": {"role": {"$in": ["admin", "trust_admin"]}}}
              ]
            },
            "write": {
              "$or": [
                {"data.user_id": "{{user.id}}"},
                {"user_condition": {"role": {"$in": ["admin", "trust_admin"]}}}
              ]
            }
          }
        }
      `,
      visibility: 'Owner and admin only',
      internal_use: 'Proximity calculations (backend function)',
      caregiver_exposure: 'Approximate area only (e.g., "within 5 miles")',
      raw_value: 'Never exposed to caregivers (RLS enforces)'
    }
  },
  
  /**
   * 3. CONTEXT-DEPENDENT FIELD (Backend Function Required)
   */
  context_dependent_fields: {
    
    'User.phone': {
      challenge: 'Cannot be expressed as static FLS rule',
      reason: 'Access depends on BookingRequest state between two users',
      
      implementation_approach: 'Backend function with manual check',
      
      backend_function_logic: `
        // functions/revealPhoneNumber.ts
        export default async function revealPhoneNumber(req, context) {
          const { base44 } = context;
          const user = await base44.auth.me();
          
          const { caregiver_id } = await req.json();
          
          // Check if accepted booking exists between parent and caregiver
          const bookings = await base44.entities.BookingRequest.filter({
            parent_id: user.id,
            caregiver_id: caregiver_id,
            status: 'accepted'
          });
          
          if (bookings.length === 0) {
            return Response.json({ error: 'No accepted booking' }, { status: 403 });
          }
          
          // Fetch caregiver's phone number
          const caregiver = await base44.asServiceRole.entities.User.read(caregiver_id);
          
          // Log PII access
          await base44.entities.PIIAccessLog.create({
            accessor_user_id: user.id,
            accessor_role: user.role,
            target_entity_type: 'User',
            target_entity_id: caregiver_id,
            field_accessed: 'phone',
            access_timestamp: new Date().toISOString(),
            access_context: 'booking_accepted',
            booking_context_id: bookings[0].id
          });
          
          return Response.json({ phone: caregiver.phone });
        }
      `,
      
      default_visibility: 'Excluded from User entity queries',
      conditional_access: 'Backend function checks BookingRequest.status',
      ui_visibility: 'Never shown in UI - email delivery only',
      audit: 'Log to PIIAccessLog on access'
    }
  },
  
  /**
   * 4. PLATFORM-MANAGED FIELDS (Do NOT Define)
   */
  platform_managed_fields: {
    
    'User.password_hash': {
      status: 'REMOVE FROM SCHEMA',
      platform_managed: true,
      
      critical_warning: 'Do NOT define password_hash in User.json',
      reason: 'Base44 manages password_hash internally',
      error: 'Defining it causes a schema validation error',
      
      action_required: 'Delete password_hash field from entities/User.json if it exists',
      
      security: [
        'Base44 never returns password_hash in API responses',
        'Base44 handles password hashing with bcrypt (see F-026)',
        'No configuration needed - automatic exclusion'
      ]
    }
  },
  
  /**
   * 5. SIGNED URL PRIVATE FILES
   */
  signed_url_fields: {
    
    'Certification.cert_file_url': {
      storage: 'PRIVATE (not publicly accessible)',
      access_method: 'Signed URL with 15-minute expiry',
      
      implementation: `
        // Backend function to generate signed URL
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
          file_uri: certification.cert_file_url,
          expires_in: 900  // 15 minutes
        });
        
        // Log PII access
        await base44.entities.PIIAccessLog.create({
          accessor_user_id: user.id,
          accessor_role: user.role,
          target_entity_type: 'Certification',
          target_entity_id: certification.id,
          field_accessed: 'cert_file_url',
          access_timestamp: new Date().toISOString(),
          access_context: 'cert_verification'
        });
        
        return Response.json({ signed_url });
      `,
      
      error_handling: 'If CreateFileSignedUrl fails, return 500 - NO public URL fallback',
      audit: 'Log to PIIAccessLog when signed URL generated',
      rls_note: 'No FLS rule needed - access controlled by backend function'
    }
  },
  
  /**
   * 6. INPUT SANITIZATION (See F-005)
   */
  sanitization: {
    reference: 'See F-005 for XSS prevention and input sanitization',
    fields_requiring_sanitization: [
      'CaregiverProfile.bio',
      'ParentProfile.special_needs_notes',
      'Message.content',
      'BookingRequest.parent_notes',
      'FlaggedContent.reason_detail'
    ],
    note: 'Sanitization is separate from FLS - handled by F-005'
  },
  
  /**
   * 7. RLS DEPLOYMENT
   */
  deployment: {
    where: 'Entity schema JSON files (entities/*.json)',
    how: 'Add rls blocks to field definitions',
    deploy: 'Changes take effect when entities are deployed',
    
    testing: [
      'Test read/write attempts as different roles',
      'Verify 403 responses for unauthorized access',
      'Check that authorized users can access fields'
    ]
  },
  
  /**
   * 8. ANTI-PATTERNS TO AVOID
   */
  anti_patterns: {
    separate_config_panel: {
      incorrect: 'Looking for FLS settings in Base44 dashboard',
      correct: 'Add rls blocks directly to entity schema JSON files',
      rule: 'FLS is part of the entity schema, not a separate configuration'
    },
    
    defining_password_hash: {
      incorrect: 'Adding password_hash field to entities/User.json',
      correct: 'Do NOT define password_hash - Base44 manages it',
      rule: 'Defining password_hash causes schema validation error'
    },
    
    css_hidden_fields: {
      incorrect: '<div style={{display: "none"}}>{user.sensitive_field}</div>',
      correct: 'Use RLS rules - never fetch unauthorized data to client',
      rule: 'Hidden fields remain in DOM - readable via dev tools'
    },
    
    client_side_permission_checks: {
      incorrect: 'if (user.role === "admin") { show sensitive data }',
      correct: 'RLS enforces at query layer - client never receives unauthorized data',
      rule: 'Permissions enforced at database layer via RLS'
    },
    
    permanent_file_urls: {
      incorrect: 'cert_file_url: "https://public-bucket.s3.amazonaws.com/cert.pdf"',
      correct: 'Use CreateFileSignedUrl with 15-min expiry',
      rule: 'Private files require signed URLs (F-002, F-006)'
    }
  },
  
  /**
   * 9. ACCEPTANCE CRITERIA
   */
  acceptance_tests: [
    {
      test: 'RLS Admin-Only Field Read',
      method: 'Authenticate as non-admin → attempt to read Message.body_original',
      expected: '403 Forbidden or field excluded from response',
      fail_if: 'body_original visible in response'
    },
    {
      test: 'RLS Admin-Only Field Write',
      method: 'Authenticate as caregiver → attempt to update CaregiverProfile.is_verified',
      expected: '403 Forbidden',
      fail_if: 'Write succeeds'
    },
    {
      test: 'RLS Owner-Restricted Field',
      method: 'Authenticate as caregiver → attempt to read another parent\'s ParentProfile.address_line_1',
      expected: '403 Forbidden or field excluded from response',
      fail_if: 'Address field returned'
    },
    {
      test: 'Password Hash Exclusion',
      method: 'Open browser Network tab → inspect User entity API response',
      expected: 'password_hash field does NOT appear (not defined in schema)',
      fail_if: 'password_hash visible or schema validation error'
    },
    {
      test: 'Phone Context-Dependent Access',
      method: 'Call backend function without accepted booking',
      expected: '403 Forbidden',
      fail_if: 'Phone number returned'
    },
    {
      test: 'Signed URL Expiry',
      method: 'Generate signed URL → wait 16 minutes → attempt access',
      expected: 'Signed URL returns 403/404 after expiry (15 min)',
      fail_if: 'Signed URL still accessible after 15 minutes'
    }
  ]
};

/**
 * ============================================================================
 * AUDIT LOGGING REQUIREMENTS (F-008, F-009 Integration)
 * ============================================================================
 */
const AUDIT_LOGGING_MATRIX = {
  
  PIIAccessLog_entries: [
    {
      trigger: 'User.phone accessed',
      context: 'Email automation reveals phone to parent after booking acceptance',
      required_fields: {
        accessor_user_id: 'parent_user.id',
        accessor_role: 'parent',
        target_entity_type: 'User',
        target_entity_id: 'caregiver_user.id',
        field_accessed: 'phone',
        access_timestamp: 'ISO 8601 datetime',
        access_context: 'booking_accepted',
        ip_address: 'request IP'
      }
    },
    {
      trigger: 'ParentProfile.address_* accessed by admin',
      context: 'Admin views parent profile for support/moderation',
      required_fields: {
        accessor_user_id: 'admin_user.id',
        accessor_role: 'trust_admin or super_admin',
        target_entity_type: 'ParentProfile',
        target_entity_id: 'parent_profile.id',
        field_accessed: 'address_line_1 (or other address field)',
        access_timestamp: 'ISO 8601 datetime',
        access_context: 'admin_review',
        ip_address: 'request IP'
      }
    },
    {
      trigger: 'Certification.cert_file_url signed URL generated',
      context: 'Admin or caregiver downloads certification document',
      required_fields: {
        accessor_user_id: 'user.id',
        accessor_role: 'user.role',
        target_entity_type: 'Certification',
        target_entity_id: 'certification.id',
        field_accessed: 'cert_file_url',
        access_timestamp: 'ISO 8601 datetime',
        access_context: 'cert_verification or cert_download',
        ip_address: 'request IP'
      }
    }
  ],
  
  AdminActionLog_entries: [
    {
      trigger: 'is_verified write attempt (any user)',
      context: 'Admin verifies caregiver OR non-admin attempts unauthorized write',
      required_fields: {
        admin_user_id: 'actor_user.id',
        admin_role: 'actor_user.role',
        action_type: 'verify_caregiver or unauthorized_write_attempt',
        target_entity_type: 'CaregiverProfile',
        target_entity_id: 'caregiver_profile.id',
        reason: 'Mandatory reason (e.g., "Background check passed" or "Unauthorized attempt")',
        previous_value: JSON.stringify({ is_verified: false }),
        new_value: JSON.stringify({ is_verified: true }),
        ip_address: 'request IP',
        action_timestamp: 'ISO 8601 datetime'
      }
    },
    {
      trigger: 'User.role updated',
      context: 'Admin changes user role (upgrade or downgrade)',
      required_fields: {
        admin_user_id: 'admin_user.id',
        admin_role: 'super_admin (only role with permission to change roles)',
        action_type: 'update_user_role',
        target_entity_type: 'User',
        target_entity_id: 'target_user.id',
        reason: 'Mandatory reason for role change',
        previous_value: JSON.stringify({ role: 'support_admin' }),
        new_value: JSON.stringify({ role: 'trust_admin' }),
        ip_address: 'request IP',
        action_timestamp: 'ISO 8601 datetime'
      }
    }
  ]
};

/**
 * ============================================================================
 * IMPLEMENTATION SUMMARY
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Code Required):
 * 1. password_hash field (do NOT define in User entity)
 * 2. Basic field exclusion (automatic when not in schema)
 * 
 * BUILD REQUIRED:
 * 1. Add rls blocks to individual fields in entity schema JSON files
 *    - Admin-only fields: is_verified, body_original, resolution_note
 *    - Owner-restricted fields: address_line_1, address_line_2, zip_code
 * 2. Phone reveal backend function (context-dependent on BookingRequest)
 * 3. Signed URL generation for Certification.cert_file_url
 * 4. Remove password_hash from User entity schema (if exists)
 * 
 * CRITICAL: Do NOT define password_hash in User.json
 * - Base44 manages password_hash internally
 * - Defining it causes a schema validation error
 * 
 * INTEGRATION:
 * - F-003: RLS rules work with authGuard and ownership checks
 * - F-005: Input sanitization (separate from FLS)
 * - F-006: Encryption at rest (platform-managed)
 * - F-009: PII access logging (optional)
 * - F-025: Session management (role changes)
 */

export default function F002FieldLevelSecurityDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-002: Field-Level Security</h1>
      <p><strong>Status:</strong> Phase 0 — Confirmed — Implementation Clarified</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#dbeafe', borderLeft: '4px solid #3b82f6', marginBottom: '2rem' }}>
        <strong>ℹ️ IMPLEMENTATION: rls BLOCKS IN ENTITY SCHEMA</strong>
        <p>Add rls blocks directly to individual field definitions in entity JSON files.</p>
        <p><strong>NOT</strong> a separate configuration panel.</p>
      </div>
      
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', margin: '1rem 0' }}>
        <strong>⚠️ CRITICAL: Do NOT define password_hash in User.json</strong>
        <p>Base44 manages password_hash internally. Defining it causes a schema validation error.</p>
      </div>
      
      <h2>RLS Block Syntax</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`// entities/SomeEntity.json
{
  "properties": {
    "field_name": {
      "type": "string",
      "rls": {
        "read": <rule>,
        "write": <rule>
      }
    }
  }
}`}
      </pre>
      
      <h2>Example: Admin-Only Field</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`// entities/CaregiverProfile.json
"is_verified": {
  "type": "boolean",
  "rls": {
    "read": true,  // Public
    "write": {
      "$or": [
        {"user_condition": {"role": "trust_admin"}},
        {"user_condition": {"role": "super_admin"}}
      ]
    }
  }
}`}
      </pre>
      
      <h2>Example: Owner-Restricted Field</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`// entities/ParentProfile.json
"address_line_1": {
  "type": "string",
  "rls": {
    "read": {
      "$or": [
        {"data.user_id": "{{user.id}}"},  // Owner
        {"user_condition": {"role": {"$in": ["admin", "trust_admin"]}}}
      ]
    },
    "write": {
      "$or": [
        {"data.user_id": "{{user.id}}"},
        {"user_condition": {"role": {"$in": ["admin", "trust_admin"]}}}
      ]
    }
  }
}`}
      </pre>
      
      <h2>Context-Dependent Field (Backend Function)</h2>
      <p>User.phone requires backend function (cannot be static RLS rule):</p>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`// Phone reveal depends on BookingRequest state
export default async function revealPhoneNumber(req, context) {
  const { base44 } = context;
  const user = await base44.auth.me();
  const { caregiver_id } = await req.json();
  
  // Check for accepted booking
  const bookings = await base44.entities.BookingRequest.filter({
    parent_id: user.id,
    caregiver_id: caregiver_id,
    status: 'accepted'
  });
  
  if (bookings.length === 0) {
    return Response.json({ error: 'No accepted booking' }, { status: 403 });
  }
  
  // Authorized - return phone number
  const caregiver = await base44.asServiceRole.entities.User.read(caregiver_id);
  return Response.json({ phone: caregiver.phone });
}`}
      </pre>
      
      <h2>Fields Requiring RLS</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', margin: '1rem 0' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Field</th>
            <th>Access Rule</th>
            <th>Implementation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CaregiverProfile.is_verified</td>
            <td>Write: admin only</td>
            <td>RLS write rule</td>
          </tr>
          <tr>
            <td>Message.body_original</td>
            <td>Read/Write: admin only</td>
            <td>RLS read+write rule</td>
          </tr>
          <tr>
            <td>ParentProfile.address_line_1</td>
            <td>Read/Write: owner + admin</td>
            <td>RLS owner rule</td>
          </tr>
          <tr>
            <td>User.phone</td>
            <td>Context-dependent</td>
            <td>Backend function</td>
          </tr>
          <tr>
            <td>User.password_hash</td>
            <td>Never accessible</td>
            <td>Platform-managed (do NOT define)</td>
          </tr>
        </tbody>
      </table>
      
      <p><em>See component source code for complete FLS specification and examples.</em></p>
    </div>
  );
}