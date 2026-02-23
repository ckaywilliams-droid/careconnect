/**
 * F-003: API AUTHORIZATION MIDDLEWARE CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * STATUS: Phase 0 — Revised — Partial Build Required
 * 
 * ============================================================================
 * PLATFORM-MANAGED vs BUILD REQUIRED
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Build Required):
 * - Gate 1: JWT validation and session management
 * 
 * BUILD REQUIRED:
 * - Shared authGuard backend function (Gates 1 + 2)
 * - RLS rules on each entity (Gates 3 + 4)
 * - Call authGuard at start of every backend function
 * - Remove TokenBlacklist entity (Base44 manages internally)
 * 
 * ENTITIES TO REMOVE:
 * - entities/TokenBlacklist.json (if exists) - Base44 manages token blacklisting
 * 
 * ============================================================================
 * REVISED ARCHITECTURE: authGuard + RLS Rules
 * ============================================================================
 */

const F003_AUTHORIZATION_SPECIFICATION = {
  
  /**
   * BASE44 IMPLEMENTATION PATTERN
   * No single middleware layer - use authGuard function + RLS rules instead
   */
  implementation_pattern: {
    approach: 'Shared authGuard backend function + RLS entity rules',
    platform_vs_build: {
      'Gate 1 (JWT validation)': 'Platform-managed via base44.auth.me()',
      'Gate 2 (Suspension check)': 'Build authGuard function',
      'Gate 3 (Role check)': 'RLS user_condition rules + explicit role checks',
      'Gate 4 (Ownership)': 'RLS entity-user field comparison rules'
    },
    execution_order: 'authGuard → RLS rules → business logic'
  },
  
  /**
   * FOUR-GATE AUTHORIZATION MODEL
   * Implemented via authGuard function + RLS rules
   */
  authorization_gates: {
    
    /**
     * GATE 1: JWT Validity & Session Check
     * PLATFORM-MANAGED: Base44 validates JWT automatically
     */
    gate_1_jwt_validation: {
      platform_managed: true,
      
      what_base44_handles: [
        'JWT signature validation (cryptographic verification)',
        'JWT expiry check (exp claim)',
        'Token blacklisting (platform-managed internally)',
        'Session validity'
      ],
      
      implementation: `
        // Gate 1: Platform-managed session validation
        // In authGuard function:
        const user = await base44.auth.me();
        if (!user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          );
        }
      `,
      
      on_failure: {
        http_status: 401,
        response: { error: 'Authentication required' },
        action: 'Base44 SDK redirects to login automatically',
        developer_action: 'Return 401 from authGuard - SDK handles redirect'
      },
      
      no_token_blacklist_entity: {
        note: 'Do NOT create TokenBlacklist entity',
        reason: 'Base44 manages token invalidation internally (see F-025)',
        action: 'Delete entities/TokenBlacklist.json if it exists'
      }
    },
    
    /**
     * GATE 2: User Suspension Check (LIVE DB READ)
     * BUILD REQUIRED: Implement in authGuard function
     */
    gate_2_suspension_check: {
      build_required: true,
      
      checks: [
        'LIVE database read of User.is_suspended (NOT from JWT/session)',
        'User.is_suspended === false OR User.data.is_suspended === false'
      ],
      
      rationale: 'Suspension must take effect immediately on next request',
      
      implementation: `
        // Gate 2: Suspension check in authGuard
        // After base44.auth.me() succeeds:
        
        // Check if is_suspended is on User entity directly
        if (user.is_suspended === true) {
          return Response.json(
            { error: 'Account suspended — contact support' },
            { status: 403 }
          );
        }
        
        // Or if stored in user.data:
        if (user.data?.is_suspended === true) {
          return Response.json(
            { error: 'Account suspended — contact support' },
            { status: 403 }
          );
        }
      `,
      
      on_failure: {
        http_status: 403,
        response: { error: 'Account suspended — contact support' },
        action: 'Show generic permission denied message',
        log_to: 'MiddlewareRejectionLog (optional)'
      },
      
      note: 'RLS rules cannot check User.is_suspended - implement in authGuard'
    },
    
    /**
     * GATE 3: Role-Based Action Permission
     * BUILD REQUIRED: RLS user_condition rules + explicit role checks
     */
    gate_3_role_permission: {
      build_required: true,
      
      implementation_approach: {
        data_level: 'RLS user_condition rules in entity schemas',
        action_level: 'Explicit role checks in backend functions'
      },
      
      rls_user_condition_example: `
        // In entity schema (e.g., entities/CaregiverProfile.json)
        {
          "rls": {
            "read": {
              "user_condition": {
                "$or": [
                  {"is_published": true},  // Public profiles
                  {"data.user_id": "{{user.id}}"},  // Own profile
                  {"role": "admin"},  // Admin access
                  {"role": "trust_admin"}
                ]
              }
            },
            "write": {
              "user_condition": {
                "$or": [
                  {"data.user_id": "{{user.id}}"},  // Own profile
                  {"role": {"$in": ["admin", "trust_admin"]}}
                ]
              }
            }
          }
        }
      `,
      
      backend_function_role_check: `
        // Gate 3: Explicit role check in backend function
        // After authGuard returns user:
        
        export default async function updateCaregiverVerification(req, context) {
          const { base44 } = context;
          
          // authGuard handles Gates 1 & 2
          const user = await authGuard(base44);
          
          // Gate 3: Role check for admin-only actions
          if (user.role !== 'admin' && user.role !== 'trust_admin') {
            return Response.json(
              { error: 'Permission denied' },
              { status: 403 }
            );
          }
          
          // Authorized - proceed with business logic
          const { profileId, is_verified } = await req.json();
          await base44.asServiceRole.entities.CaregiverProfile.update(
            profileId,
            { is_verified }
          );
          
          return Response.json({ success: true });
        }
      `,
      
      role_source: {
        authoritative: 'User entity in database (via base44.auth.me())',
        not_jwt_claims: 'Do NOT rely on JWT payload - role may have changed',
        live_read: 'Every request reads current role from DB via auth.me()'
      },
      
      on_failure: {
        http_status: 403,
        response: { error: 'Permission denied' },
        action: 'Generic error - do not reveal which permission failed',
        log_to: 'MiddlewareRejectionLog (optional)'
      }
    },
    
    /**
     * GATE 4: Record Ownership or Admin Override
     * BUILD REQUIRED: RLS entity-user field comparison rules
     */
    gate_4_record_ownership: {
      build_required: true,
      
      implementation: 'RLS entity-user field comparison in entity schemas',
      
      rls_ownership_examples: {
        
        caregiver_profile: `
          // entities/CaregiverProfile.json
          {
            "rls": {
              "read": {
                "user_condition": {
                  "$or": [
                    {"is_published": true},  // Public profiles
                    {"data.user_id": "{{user.id}}"},  // Own profile
                    {"role": {"$in": ["admin", "trust_admin"]}}
                  ]
                }
              },
              "write": {
                "user_condition": {
                  "$or": [
                    {"data.user_id": "{{user.id}}"},  // Own profile
                    {"role": {"$in": ["admin", "trust_admin"]}}
                  ]
                }
              }
            }
          }
        `,
        
        booking_request: `
          // entities/BookingRequest.json
          {
            "rls": {
              "read": {
                "user_condition": {
                  "$or": [
                    {"data.parent_id": "{{user.id}}"},  // Parent's booking
                    {"data.caregiver_id": "{{user.id}}"},  // Caregiver's booking
                    {"role": {"$in": ["admin", "trust_admin"]}}
                  ]
                }
              },
              "write": {
                "user_condition": {
                  "$or": [
                    {"data.parent_id": "{{user.id}}"},
                    {"data.caregiver_id": "{{user.id}}"},
                    {"role": {"$in": ["admin", "trust_admin"]}}
                  ]
                }
              }
            }
          }
        `,
        
        message: `
          // entities/Message.json
          {
            "rls": {
              "read": {
                "user_condition": {
                  "$or": [
                    {"data.sender_user_id": "{{user.id}}"},
                    {"data.recipient_user_id": "{{user.id}}"},
                    {"role": {"$in": ["admin", "trust_admin"]}}
                  ]
                }
              },
              "write": {
                "user_condition": {
                  "$or": [
                    {"data.sender_user_id": "{{user.id}}"},
                    {"role": {"$in": ["admin", "trust_admin"]}}
                  ]
                }
              }
            }
          }
        `
      },
      
      security_principle: {
        same_response: 'RLS rules return 403 for both non-existent and unauthorized records',
        no_information_leak: 'Attacker cannot determine if record exists or not',
        rationale: 'Prevents ID enumeration attacks'
      },
      
      on_failure: {
        http_status: 403,
        response: { error: 'Permission denied' },
        action: 'Generic error - same for "not exists" and "not authorized"',
        log_to: 'MiddlewareRejectionLog (optional)'
      }
    }
  },
  
  /**
   * SPECIAL CASE: Webhook Authorization (Edge.2)
   * Webhooks (e.g., Stripe) must also validate authorization before executing business logic
   */
  webhook_authorization: {
    challenge: 'External webhook payloads bypass standard JWT authentication',
    solution: [
      'Verify webhook signature (e.g., Stripe signature verification)',
      'Webhook handler must validate that the webhook event relates to a valid, non-suspended user',
      'If webhook triggers admin action (e.g., subscription cancellation), log to AdminActionLog',
      'Webhook-triggered automations must respect same four-gate model where applicable'
    ],
    implementation_note: `
      // Pseudocode for Stripe webhook handler
      const webhookEvent = verifyStripeSignature(request.body, request.headers['stripe-signature']);
      
      // Extract user context from webhook payload
      const userId = webhookEvent.metadata.user_id;
      const user = await base44.entities.User.read(userId);
      
      // Apply Gate 2 & 3 even though it's a webhook
      if (user.is_suspended) {
        await logRejection('gate_2_user_suspended', { endpoint: 'webhook/stripe', user_id: userId });
        return 403;  // Don't process webhook for suspended users
      }
      
      // Execute webhook business logic
      // Log any admin actions to AdminActionLog
    `
  },
  
  /**
   * REJECTION LOGGING & ABUSE DETECTION (Audit.1, Audit.2)
   */
  rejection_logging: {
    log_every_rejection: {
      entity: 'MiddlewareRejectionLog',
      required_fields: [
        'user_id (if extractable from JWT)',
        'user_role (from live DB if available)',
        'action_attempted (endpoint + method + entity)',
        'gate_failed (gate_1/2/3/4)',
        'ip_address',
        'rejection_timestamp'
      ]
    },
    
    abuse_detection: {
      // Audit.2: Flag account if >10 rejections in 10 minutes
      threshold: 10,
      window: '10 minutes',
      action: [
        'Set MiddlewareRejectionLog.is_flagged_for_review = true for all rejections in window',
        'Create entry in moderation queue (Phase 2)',
        'Send admin alert with user_id, rejection count, time window',
        'Consider temporary suspension if pattern indicates malicious activity'
      ],
      implementation_note: `
        // After logging each rejection, check for abuse pattern
        const recentRejections = await base44.entities.MiddlewareRejectionLog.filter({
          user_id: user.id,
          rejection_timestamp: { $gte: tenMinutesAgo }
        });
        
        if (recentRejections.length > 10) {
          // Flag all rejections and alert admin
          await base44.entities.MiddlewareRejectionLog.update(
            { user_id: user.id, rejection_timestamp: { $gte: tenMinutesAgo } },
            { is_flagged_for_review: true }
          );
          
          // Send admin notification
          await sendAdminAlert({
            type: 'excessive_rejections',
            user_id: user.id,
            count: recentRejections.length,
            window: '10 minutes'
          });
        }
      `
    }
  },
  
  /**
   * TOKEN INVALIDATION ON SUSPENSION (Logic.2)
   * When user is suspended, all active JWTs must be blacklisted immediately
   */
  suspension_token_invalidation: {
    trigger: 'User.is_suspended set to true',
    action: [
      'Create TokenBlacklist entries for all active JWTs for this user_id',
      'If JWT uses jti claim: blacklist by jti',
      'If JWT does not use jti: reduce JWT TTL to seconds OR implement token version field'
    ],
    implementation_note: `
      // Automation trigger on User.is_suspended UPDATE to true
      async function onUserSuspended(user) {
        // Option 1: If JWTs include jti claim, blacklist all tokens issued before now
        // (Future tokens will be rejected by Gate 2 suspension check anyway)
        await base44.entities.TokenBlacklist.create({
          user_id: user.id,
          token_jti: '*',  // Wildcard - all tokens for this user
          reason: 'user_suspended',
          blacklisted_at: new Date().toISOString()
        });
        
        // Option 2: If using token version approach
        await base44.entities.User.update(user.id, {
          token_version: user.token_version + 1
        });
        // JWTs check if token_version in payload matches DB - mismatch = invalid
      }
    `,
    performance_optimization: {
      problem: 'Checking TokenBlacklist on every request adds latency',
      solutions: [
        'Use in-memory cache (Redis) for TokenBlacklist with TTL = JWT expiry',
        'Implement token version field in User entity (faster single DB read)',
        'Reduce JWT TTL to 15 minutes for high-security scenarios'
      ]
    }
  },
  
  /**
   * ERROR RESPONSES & UI BEHAVIOR (UI.1, Abuse.1)
   */
  error_responses: {
    '401_unauthorized': {
      scenario: 'Gate 1 failed - invalid/expired JWT',
      response: { error: 'Authentication required' },
      ui_behavior: [
        'Redirect to login page',
        'Preserve in-progress form data if Base44 supports it (Errors.1)',
        'After successful re-login, restore form data and retry request'
      ]
    },
    
    '403_forbidden': {
      scenarios: [
        'Gate 2 failed - user suspended',
        'Gate 3 failed - insufficient role',
        'Gate 4 failed - record not owned'
      ],
      response: {
        suspended: { error: 'Account suspended — contact support' },
        other: { error: 'Permission denied' }  // Generic - don't reveal which gate failed
      },
      ui_behavior: [
        'Show generic permission denied page',
        'Do NOT reveal which gate failed or why (UI.1)',
        'Do NOT reveal whether record exists or not (Abuse.2)'
      ]
    },
    
    security_principle: 'Error messages must not leak information about system internals, permission structure, or data existence'
  }
};

/**
 * ============================================================================
 * ACCEPTANCE CRITERIA (Phase 0 Gate)
 * ============================================================================
 */
const ACCEPTANCE_TESTS = [
  {
    test: 'JWT Blacklist Enforcement',
    steps: [
      'Authenticate user and obtain JWT',
      'Add JWT jti to TokenBlacklist',
      'Attempt API request with blacklisted JWT',
      'Verify: 401 Unauthorized + MiddlewareRejectionLog entry created'
    ]
  },
  {
    test: 'Live Suspension Check',
    steps: [
      'Authenticate user with valid JWT',
      'Set User.is_suspended = true (do not re-issue JWT)',
      'Attempt API request with still-valid JWT',
      'Verify: 403 Forbidden with "Account suspended" message + MiddlewareRejectionLog entry'
    ]
  },
  {
    test: 'Role Change Immediate Effect',
    steps: [
      'Authenticate as super_admin',
      'Downgrade user.role to support_admin (do not log out)',
      'Attempt admin-only action with existing JWT',
      'Verify: 403 Forbidden + MiddlewareRejectionLog entry with gate_3_insufficient_role'
    ]
  },
  {
    test: 'Record Ownership Enforcement',
    steps: [
      'Authenticate as caregiver A',
      'Attempt to update CaregiverProfile belonging to caregiver B',
      'Verify: 403 Forbidden + MiddlewareRejectionLog entry with gate_4_record_not_owned'
    ]
  },
  {
    test: 'Brute Force JWT Detection',
    steps: [
      'Send 51 requests with invalid JWTs from same IP within 5 minutes',
      'Verify: IPBlocklist entry created with block_reason=brute_force_jwt',
      'Verify: Admin alert sent',
      'Verify: Request 52 returns 403 (IP blocked) instead of 401'
    ]
  },
  {
    test: 'Excessive Rejection Flagging',
    steps: [
      'Generate 11 middleware rejections for same user in 10 minutes',
      'Verify: MiddlewareRejectionLog.is_flagged_for_review = true for all entries',
      'Verify: Admin alert sent',
      'Verify: User appears in moderation queue (Phase 2)'
    ]
  },
  {
    test: 'Webhook Authorization',
    steps: [
      'Trigger Stripe webhook for suspended user',
      'Verify: Webhook handler checks User.is_suspended',
      'Verify: Webhook business logic does not execute',
      'Verify: MiddlewareRejectionLog entry created'
    ]
  },
  {
    test: 'Error Message Information Disclosure',
    steps: [
      'Attempt to access record that does not exist',
      'Attempt to access record that exists but user does not own',
      'Verify: Both return identical 403 response (no information leak)'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * 1. Middleware hook that runs BEFORE all business logic
 * 2. Access to JWT payload and ability to validate signature
 * 3. Ability to perform live DB reads during middleware execution
 * 4. Custom error response configuration (401/403 with custom messages)
 * 5. Request context access (IP address, user agent, endpoint, method)
 * 
 * Supporting Entities Created:
 * - TokenBlacklist: Invalidated JWTs (suspension, logout, security incident)
 * - MiddlewareRejectionLog: Audit trail of all authorization failures
 * - IPBlocklist: Brute-force protection and admin IP blocking
 * 
 * Integration with Other Features:
 * - F-001: Record-level access control (Gate 4 ownership checks)
 * - F-002: Field-level security (Gate 3 field permission checks)
 * - F-008: Admin action logging (AdminActionLog for role changes, suspensions)
 * - F-009: PII access logging (Integration with middleware rejection logging)
 * - F-012: Login brute-force protection (IPBlocklist integration)
 * 
 * NEXT STEPS:
 * - Configure Base44 middleware hooks per specification above
 * - Implement four-gate authorization model
 * - Create error pages for 401/403 responses
 * - Set up admin alerts for brute-force and excessive rejections
 * - Test all acceptance criteria before Phase 1
 */

export default function F003MiddlewareDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>F-003: API Authorization Middleware - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Supporting entities created (TokenBlacklist, MiddlewareRejectionLog, IPBlocklist)</p>
      <p><strong>Next Step:</strong> Configure Base44 middleware to implement four-gate authorization model</p>
      
      <h2>Four-Gate Authorization Model</h2>
      <ol>
        <li><strong>Gate 1:</strong> JWT Validity & Expiration Check</li>
        <li><strong>Gate 2:</strong> User Suspension Check (LIVE DB READ)</li>
        <li><strong>Gate 3:</strong> Role-Based Action Permission</li>
        <li><strong>Gate 4:</strong> Record Ownership or Admin Override</li>
      </ol>
      
      <h2>Critical Requirements</h2>
      <ul>
        <li>Middleware runs BEFORE all business logic (including automations, webhooks)</li>
        <li>Gate 2 suspension check MUST be live DB read every request</li>
        <li>Token blacklist checked on every request (Gate 1)</li>
        <li>Role changes take effect immediately without re-login (Gate 3)</li>
        <li>Same 403 response for "not exists" and "not owned" (information disclosure prevention)</li>
      </ul>
      
      <h2>Abuse Detection</h2>
      <ul>
        <li>Brute-force JWT testing: >50 invalid attempts in 5 min → IP block + admin alert</li>
        <li>Excessive rejections: >10 rejections in 10 min → flag account + admin review</li>
      </ul>
      
      <h2>Token Invalidation</h2>
      <ul>
        <li>On user suspension: blacklist all active JWTs immediately</li>
        <li>On role downgrade: next request reads new role from DB (no re-login needed)</li>
      </ul>
      
      <p><em>See component source code for complete middleware specification and pseudocode implementation.</em></p>
    </div>
  );
}