/**
 * F-003: API AUTHORIZATION MIDDLEWARE CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform authorization middleware requirements.
 * These rules must be enforced at the Base44 platform level BEFORE any business logic executes.
 * 
 * STATUS: Phase 0 - Supporting entities created (TokenBlacklist, MiddlewareRejectionLog, IPBlocklist)
 * NEXT STEP: Configure Base44 middleware hooks to implement four-gate authorization
 * 
 * ============================================================================
 * CRITICAL MIDDLEWARE ARCHITECTURE
 * ============================================================================
 */

const F003_MIDDLEWARE_SPECIFICATION = {
  
  /**
   * EXECUTION ORDER: Middleware runs BEFORE ALL business logic
   * Any automation or action that bypasses middleware is a SECURITY VULNERABILITY
   */
  execution_context: {
    trigger_point: 'EVERY server-side action (read, write, delete)',
    runs_before: [
      'Business logic',
      'Database queries',
      'Automations',
      'Event triggers',
      'Webhook handlers'
    ],
    stateless: true,  // No state maintained between requests
    performance: 'Must complete in <50ms to avoid UX degradation'
  },
  
  /**
   * FOUR-GATE AUTHORIZATION MODEL
   * All four gates must pass OR request is rejected with appropriate error code
   */
  authorization_gates: {
    
    /**
     * GATE 1: JWT Validity & Expiration Check
     * Access.2: Is the JWT valid and not expired?
     */
    gate_1_jwt_validation: {
      checks: [
        'JWT signature is valid (cryptographic verification)',
        'JWT has not expired (exp claim < current time)',
        'JWT is not on the TokenBlacklist (check token_jti or hash)',
        'JWT contains required claims: user_id, role, iat, exp'
      ],
      on_failure: {
        http_status: 401,
        response: { error: 'Authentication required' },
        action: 'Redirect to login page',
        preserve_form_data: true,  // Errors.1
        log_to: 'MiddlewareRejectionLog',
        log_fields: {
          gate_failed: 'gate_1_jwt_invalid',
          action_attempted: 'request.endpoint',
          ip_address: 'request.ip'
        }
      },
      brute_force_protection: {
        // Errors.2: >50 invalid JWT attempts from same IP in 5 min
        threshold: 50,
        window: '5 minutes',
        action: [
          'Create IPBlocklist entry with block_reason=brute_force_jwt',
          'Set unblock_at to current_time + 1 hour',
          'Send admin alert',
          'Return 403 instead of 401 after block'
        ]
      },
      implementation_note: `
        // Pseudocode - Base44 middleware hook
        const jwtPayload = verifyJWT(request.headers.authorization);
        if (!jwtPayload) {
          await logRejection('gate_1_jwt_invalid', request);
          await checkBruteForce(request.ip);  // May trigger IPBlocklist
          return 401;
        }
        
        // Check TokenBlacklist
        const isBlacklisted = await base44.entities.TokenBlacklist.filter({
          token_jti: jwtPayload.jti,
          blacklisted_at: { $gte: jwtPayload.iat }  // Only check tokens blacklisted after issuance
        });
        if (isBlacklisted.length > 0) {
          await logRejection('gate_1_jwt_invalid', request);
          return 401;
        }
      `
    },
    
    /**
     * GATE 2: User Suspension Check (LIVE DB READ)
     * Access.3: Is User.is_suspended = false?
     * States.2: MUST be live DB read - JWT payload cannot be trusted
     */
    gate_2_suspension_check: {
      checks: [
        'LIVE database read of User.is_suspended (NOT from JWT payload)',
        'User.is_suspended === false'
      ],
      rationale: 'JWT issued before suspension cannot be trusted. Suspension must take effect immediately.',
      on_failure: {
        http_status: 403,
        response: { error: 'Account suspended — contact support' },  // Abuse.1
        action: 'Show generic permission denied page',
        log_to: 'MiddlewareRejectionLog',
        log_fields: {
          user_id: 'jwtPayload.user_id',
          gate_failed: 'gate_2_user_suspended',
          action_attempted: 'request.endpoint',
          ip_address: 'request.ip'
        }
      },
      implementation_note: `
        // Pseudocode - CRITICAL: This MUST be a live DB read every request
        const user = await base44.entities.User.read(jwtPayload.user_id);
        if (user.is_suspended) {
          await logRejection('gate_2_user_suspended', request, user);
          return 403;
        }
        
        // Logic.1: Suspension takes effect on next request - no re-login required
        // Logic.2: All JWTs for suspended user should be blacklisted when suspension occurs
      `
    },
    
    /**
     * GATE 3: Role-Based Action Permission
     * Access.4: Does User.role permit this specific action?
     */
    gate_3_role_permission: {
      checks: [
        'LIVE database read of User.role (NOT from JWT payload - role may have changed)',
        'User.role has permission for requested action (CRUD on specific entity/field)'
      ],
      permission_matrix: {
        // Example permission rules - expand based on F-001, F-002
        parent: {
          BookingRequest: { create: true, read: 'own', update: 'own', delete: false },
          CaregiverProfile: { create: false, read: 'public', update: false, delete: false },
          ParentProfile: { create: false, read: 'own', update: 'own', delete: false },
          Message: { create: 'own_thread', read: 'own_thread', update: false, delete: false }
        },
        caregiver: {
          BookingRequest: { create: false, read: 'own', update: 'own', delete: false },
          CaregiverProfile: { create: false, read: 'public_or_own', update: 'own', delete: false },
          AvailabilitySlot: { create: 'own', read: 'own', update: 'own', delete: 'own' },
          Message: { create: 'own_thread', read: 'own_thread', update: false, delete: false }
        },
        trust_admin: {
          '*': { create: true, read: true, update: true, delete: false }  // All entities, no delete
        },
        super_admin: {
          '*': { create: true, read: true, update: true, delete: true }  // Full access
        }
      },
      field_level_exceptions: {
        // F-002 field-level security overrides
        'CaregiverProfile.is_verified': {
          write: ['trust_admin', 'super_admin'],  // Only these roles
          read: 'public'
        },
        'User.password_hash': {
          write: 'system_only',  // Never writable via API
          read: 'NEVER'  // Never readable by any role
        },
        'ParentProfile.address_line_1': {
          write: 'own_or_admin',
          read: ['trust_admin', 'super_admin']  // Never readable by caregivers
        }
      },
      on_failure: {
        http_status: 403,
        response: { error: 'Permission denied' },  // Generic - don't reveal which permission failed
        action: 'Show generic permission denied page',
        log_to: 'MiddlewareRejectionLog',
        log_fields: {
          user_id: 'user.id',
          user_role: 'user.role',
          gate_failed: 'gate_3_insufficient_role',
          action_attempted: 'request.method + " " + request.entity + "." + request.field',
          target_entity_type: 'request.entity',
          ip_address: 'request.ip'
        }
      },
      implementation_note: `
        // Pseudocode
        const user = await base44.entities.User.read(jwtPayload.user_id);
        const hasPermission = checkRolePermission(user.role, request.entity, request.action, request.field);
        if (!hasPermission) {
          await logRejection('gate_3_insufficient_role', request, user);
          return 403;
        }
        
        // Edge.1: Role changes take effect immediately on next request
        // If user.role changed from super_admin to support_admin mid-session,
        // they immediately lose admin permissions without needing to log out
      `
    },
    
    /**
     * GATE 4: Record Ownership or Admin Override
     * Access.5: Does user own this record, OR have explicit admin override?
     */
    gate_4_record_ownership: {
      checks: [
        'If action is on a specific record (not list/search):',
        '  - User owns the record (record.created_by === user.email OR record.user_id === user.id), OR',
        '  - User has admin role (trust_admin, super_admin) with explicit override permission'
      ],
      ownership_rules: {
        CaregiverProfile: 'user_id === current_user.id OR admin',
        ParentProfile: 'user_id === current_user.id OR admin',
        BookingRequest: 'parent_profile.user_id === current_user.id OR caregiver_profile.user_id === current_user.id OR admin',
        Message: 'thread.parent_user_id === current_user.id OR thread.caregiver_user_id === current_user.id OR admin',
        AvailabilitySlot: 'caregiver_profile.user_id === current_user.id OR admin',
        Certification: 'caregiver_profile.user_id === current_user.id OR admin'
      },
      on_failure: {
        http_status: 403,
        response: { error: 'Permission denied' },  // Abuse.2: Don't distinguish between "not exists" and "not owned"
        action: 'Show generic permission denied page',
        log_to: 'MiddlewareRejectionLog',
        log_fields: {
          user_id: 'user.id',
          user_role: 'user.role',
          gate_failed: 'gate_4_record_not_owned',
          action_attempted: 'request.method + " " + request.entity',
          target_entity_type: 'request.entity',
          target_entity_id: 'request.recordId',
          ip_address: 'request.ip'
        }
      },
      security_principle: {
        // Abuse.2: Information disclosure prevention
        same_response_for: [
          'Record does not exist',
          'Record exists but user cannot access it'
        ],
        rationale: 'Prevents attackers from enumerating valid record IDs by testing access patterns'
      },
      implementation_note: `
        // Pseudocode
        if (request.recordId) {
          const record = await base44.entities[request.entity].read(request.recordId);
          if (!record) {
            // Don't reveal whether record exists or not - return same 403
            await logRejection('gate_4_record_not_owned', request, user);
            return 403;
          }
          
          const ownsRecord = checkOwnership(record, user, request.entity);
          const hasAdminOverride = ['trust_admin', 'super_admin'].includes(user.role);
          
          if (!ownsRecord && !hasAdminOverride) {
            // Same 403 response whether record doesn't exist or user doesn't own it
            await logRejection('gate_4_record_not_owned', request, user);
            return 403;
          }
        }
      `
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