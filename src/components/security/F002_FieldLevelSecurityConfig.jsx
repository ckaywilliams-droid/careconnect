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
    
    'ParentProfile.address_line_1': {
      visibility: 'admin_only',
      caregiver_access: '403_FORBIDDEN',
      search_results: 'EXCLUDED',
      audit: 'Log to PIIAccessLog on admin access',
      platform_config: 'Add explicit rejection rule for caregiver role'
    },
    
    'ParentProfile.address_line_2': {
      visibility: 'admin_only',
      caregiver_access: '403_FORBIDDEN',
      search_results: 'EXCLUDED',
      platform_config: 'Same as address_line_1'
    },
    
    'ParentProfile.zip_code': {
      visibility: 'admin_only',
      internal_use: 'Proximity calculations only',
      caregiver_exposure: 'Approximate area only (e.g., "within 5 miles")',
      raw_value: 'NEVER exposed to non-admin',
      platform_config: 'Use for distance calc but exclude from caregiver query responses'
    },
    
    'Message.body_original': {
      visibility: 'admin_only',
      purpose: 'Moderation and abuse investigation',
      parent_caregiver_access: 'EXCLUDED_FROM_RESPONSES',
      public_field: 'Message.content (sanitized version)',
      platform_config: 'Create separate admin-only field, exclude from standard queries'
    },
    
    'Certification.cert_file_url': {
      storage: 'PRIVATE',  // Not publicly accessible
      access_method: 'SIGNED_URL_ONLY',
      expiry: '900 seconds (15 minutes)',
      error_handling: 'If CreateFileSignedUrl fails, return 500 - NO public URL fallback',
      audit: 'Log to PIIAccessLog when signed URL generated',
      platform_config: 'Configure private file storage + signed URL generation',
      implementation: `
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
          file_uri: certification.cert_file_url,
          expires_in: 900
        });
        // Log access to PIIAccessLog
        await base44.entities.PIIAccessLog.create({
          accessor_user_id: user.id,
          target_entity_type: 'Certification',
          target_entity_id: certification.id,
          field_accessed: 'cert_file_url',
          access_timestamp: new Date().toISOString(),
          access_context: 'cert_verification'
        });
      `
    }
  },
  
  /**
   * 2. ADMIN-ONLY WRITABLE FIELDS
   * Configure in: Base44 Dashboard → Entities → Write Permissions
   */
  admin_only_write: {
    
    'CaregiverProfile.is_verified': {
      read_access: 'public',  // Visible in search results
      write_access: ['trust_admin', 'super_admin'],
      rejection_behavior: {
        non_admin_write_attempt: {
          http_status: 403,
          log_to: 'AdminActionLog',
          log_fields: ['actor_user_id', 'actor_role', 'target_caregiver_id', 'attempted_value', 'timestamp']
        }
      },
      platform_config: 'Add EXPLICIT rejection rule - deny-by-default is insufficient',
      verification: 'Test write attempt as caregiver role - must return 403 and log to AdminActionLog'
    },
    
    'Certification.verification_status': {
      read_access: 'public_own_records',  // Caregiver sees own, parents see verified
      write_access: ['trust_admin', 'super_admin'],
      state_transitions: 'pending → verified/rejected (admin action triggers state change)',
      audit: 'Log all status changes to AdminActionLog',
      platform_config: 'Restrict write permission + log state transitions'
    }
  },
  
  /**
   * 3. INPUT SANITIZATION (XSS Prevention - F-005)
   * Configure in: Base44 Dashboard → Security Settings
   */
  sanitization: {
    fields_requiring_sanitization: [
      'CaregiverProfile.bio',
      'ParentProfile.special_needs_notes',
      'Message.content',
      'BookingRequest.parent_notes',
      'FlaggedContent.reason_detail',
      'AdminActionLog.reason'
    ],
    rules: {
      strip_html_tags: true,
      strip_script_tags: true,
      remove_event_handlers: true,
      encode_special_chars: true,
      apply_on_write: true,
      re_sanitize_on_update: true  // Do not assume previously saved value is still safe
    },
    platform_config: 'Enable Base44 input sanitization + configure CSP headers (F-005)'
  },
  
  /**
   * 4. SESSION INVALIDATION ON ROLE CHANGE (Edge Case Handling)
   * Configure in: Base44 Dashboard → Triggers → User.role UPDATE
   */
  session_management: {
    trigger: 'User.role field UPDATE',
    actions: [
      'Invalidate all active session tokens for user_id',
      'Force re-authentication to receive new token with updated permissions',
      'Log role change to AdminActionLog (previous_value, new_value, reason)',
      'Send email notification to user of role change'
    ],
    risk_mitigation: 'Prevents downgraded admin from accessing cached responses with old permission level',
    platform_config: 'Create automation trigger on User.role UPDATE event',
    edge_case_example: 'super_admin downgraded to support_admin mid-session - cached API responses may contain fields they can no longer access'
  },
  
  /**
   * 5. ANTI-PATTERNS TO AVOID
   */
  anti_patterns: {
    css_hidden_fields: {
      incorrect: '<div style={{display: "none"}}>{user.password_hash}</div>',
      correct: 'Exclude field from Base44 query response - never fetch sensitive data to client',
      rule: 'Do NOT hide sensitive fields with CSS. They remain in DOM and are readable via browser dev tools.'
    },
    
    client_side_permission_checks: {
      incorrect: 'if (user.role === "admin") { show sensitive data }',
      correct: 'Configure field visibility at Base44 query layer - client never receives unauthorized data',
      rule: 'Permissions enforced at API/database layer, not in UI rendering logic'
    },
    
    permanent_file_urls: {
      incorrect: 'cert_file_url: "https://public-bucket.s3.amazonaws.com/cert123.pdf"',
      correct: 'Use CreateFileSignedUrl with 15-min expiry for private files',
      rule: 'NEVER expose permanent public URLs for PII documents (F-002, F-006)'
    }
  },
  
  /**
   * 6. ACCEPTANCE CRITERIA (Phase 0 Gate)
   * Verify before proceeding to Phase 1
   */
  acceptance_tests: [
    {
      test: 'Password Hash Exclusion',
      method: 'Open browser Network tab → inspect User entity API response',
      expected: 'password_hash field does NOT appear in response payload',
      fail_if: 'password_hash visible in any response (even if null)'
    },
    {
      test: 'Parent Address Protection',
      method: 'Authenticate as caregiver role → attempt to read ParentProfile.address_line_1',
      expected: 'HTTP 403 Forbidden + field excluded from response',
      fail_if: 'Address field returned (even if empty) or 200 OK with partial data'
    },
    {
      test: 'is_verified Write Rejection',
      method: 'Authenticate as caregiver → attempt to update own CaregiverProfile.is_verified',
      expected: '403 Forbidden + AdminActionLog entry created with rejection details',
      fail_if: 'Write succeeds or no AdminActionLog entry'
    },
    {
      test: 'Signed URL Expiry',
      method: 'Generate signed URL for cert_file → wait 16 minutes → attempt access',
      expected: 'Signed URL returns 403/404 after expiry (15 min)',
      fail_if: 'Signed URL still accessible after 15 minutes'
    },
    {
      test: 'Phone Number UI Absence',
      method: 'Inspect all UI pages (parent, caregiver, admin) for User.phone rendering',
      expected: 'Phone never visible in UI, even after booking acceptance (email delivery only)',
      fail_if: 'Phone number appears in any rendered page or component'
    },
    {
      test: 'Role Change Session Invalidation',
      method: 'Authenticate as super_admin → downgrade to support_admin → attempt to access admin-only field without re-login',
      expected: 'Session invalidated, forced to re-authenticate, new token lacks admin permissions',
      fail_if: 'Old session token still works after role change'
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
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * This configuration CANNOT be implemented through entity schemas alone.
 * The Base44 platform must provide:
 * 
 * 1. Field-level permission rules (per role, per field)
 * 2. API response field exclusion (password_hash, PII fields)
 * 3. Signed URL generation for private files
 * 4. Session token invalidation triggers
 * 5. Input sanitization middleware
 * 6. Audit logging hooks (PIIAccessLog, AdminActionLog)
 * 
 * NEXT STEPS:
 * - Review entity schemas (all contain F-002 security annotations)
 * - Configure Base44 dashboard per checklist above
 * - Run acceptance tests before Phase 1
 * 
 * PHASE 0 STATUS: Data model layer complete ✓
 * PLATFORM CONFIG: Required - see checklist above
 */

export default function F002DocumentationComponent() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>F-002: Field-Level Security - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Entity schemas updated with security annotations</p>
      <p><strong>Next Step:</strong> Configure Base44 platform per checklist in component source code</p>
      
      <h2>Critical Platform Configuration Checklist</h2>
      <ol>
        <li>PII Field Access Restrictions (User.phone, ParentProfile.address_*, etc.)</li>
        <li>Admin-Only Writable Fields (CaregiverProfile.is_verified, etc.)</li>
        <li>Input Sanitization (XSS prevention on all user-supplied text)</li>
        <li>Session Invalidation on Role Change (Edge case handling)</li>
        <li>Signed URL Generation for Private Files (Certification.cert_file_url)</li>
        <li>Audit Logging Integration (PIIAccessLog, AdminActionLog)</li>
      </ol>
      
      <h2>Acceptance Tests</h2>
      <ul>
        <li>User.password_hash NOT in API responses (check Network tab)</li>
        <li>ParentProfile.address_line_1 returns 403 for caregiver role</li>
        <li>CaregiverProfile.is_verified write by non-admin logs rejection</li>
        <li>Certification signed URLs expire after 15 minutes</li>
        <li>User.phone NEVER visible in UI (email delivery only)</li>
        <li>Session tokens invalidated on User.role change</li>
      </ul>
      
      <p><em>See component source code for complete configuration specification.</em></p>
    </div>
  );
}