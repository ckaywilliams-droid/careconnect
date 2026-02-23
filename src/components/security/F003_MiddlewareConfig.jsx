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
   * SHARED authGuard BACKEND FUNCTION
   * BUILD REQUIRED: Create and call at start of every backend function
   */
  auth_guard_implementation: {
    
    purpose: 'Centralized Gates 1 & 2 enforcement',
    
    location: 'functions/authGuard.ts',
    
    implementation: `
      // functions/authGuard.ts
      export default async function authGuard(base44) {
        // Gate 1: Session validation (platform-managed)
        const user = await base44.auth.me();
        if (!user) {
          throw new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        // Gate 2: Suspension check (build required)
        if (user.is_suspended === true || user.data?.is_suspended === true) {
          throw new Response(
            JSON.stringify({ error: 'Account suspended — contact support' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        return user;
      }
    `,
    
    usage_in_backend_functions: `
      // Example: functions/updateProfile.ts
      import authGuard from './authGuard';
      
      export default async function updateProfile(req, context) {
        const { base44 } = context;
        
        // Call authGuard at start (Gates 1 & 2)
        const user = await authGuard(base44);
        
        // Gate 3: Role check (if needed for action-level enforcement)
        if (user.role !== 'admin' && user.role !== 'trust_admin') {
          return Response.json(
            { error: 'Permission denied' },
            { status: 403 }
          );
        }
        
        // Gate 4: RLS rules handle ownership automatically
        // Business logic proceeds - RLS enforces data access
        const { profileId, updates } = await req.json();
        await base44.asServiceRole.entities.CaregiverProfile.update(
          profileId,
          updates
        );
        
        return Response.json({ success: true });
      }
    `,
    
    error_handling: {
      '401': 'Thrown by authGuard if auth.me() returns null',
      '403': 'Thrown by authGuard if user is suspended',
      client_handling: 'Base44 SDK automatically redirects 401 to login'
    }
  },
  
  /**
   * SESSION INVALIDATION ON SUSPENSION
   * PLATFORM-MANAGED: See F-025 for session management
   */
  suspension_session_invalidation: {
    platform_managed: true,
    
    what_to_do: 'See F-025 for session invalidation when User.is_suspended is set',
    
    mechanism: 'Base44 session management API revokes active sessions',
    
    no_token_blacklist: 'Do NOT create TokenBlacklist entity - Base44 manages internally',
    
    note: 'authGuard checks is_suspended on every request - immediate effect'
  },
  
  /**
   * OPTIONAL: REJECTION LOGGING & ABUSE DETECTION
   */
  rejection_logging: {
    optional: true,
    
    entity: 'MiddlewareRejectionLog (optional)',
    
    purpose: 'Track authorization failures for security analysis',
    
    implementation: `
      // Optional: Log rejection in authGuard or backend functions
      async function logRejection(base44, user, gate, action) {
        await base44.asServiceRole.entities.MiddlewareRejectionLog.create({
          user_id: user?.id,
          user_role: user?.role,
          gate_failed: gate,
          action_attempted: action,
          ip_address: req.headers['x-forwarded-for'] || 'unknown',
          rejection_timestamp: new Date().toISOString()
        });
      }
    `,
    
    abuse_detection: {
      threshold: '>10 rejections in 10 minutes',
      action: 'Flag for admin review or auto-suspend',
      note: 'Implement if abuse patterns emerge - not required for MVP'
    }
  },
  
  /**
   * ERROR RESPONSES
   */
  error_responses: {
    '401_unauthorized': {
      scenario: 'Gate 1 failed - no valid session',
      response: { error: 'Authentication required' },
      ui_behavior: 'Base44 SDK redirects to login automatically'
    },
    
    '403_forbidden': {
      scenarios: ['Gate 2: User suspended', 'Gate 3: Insufficient role', 'Gate 4: RLS denied'],
      response: {
        suspended: { error: 'Account suspended — contact support' },
        other: { error: 'Permission denied' }
      },
      ui_behavior: 'Show generic permission denied message'
    },
    
    security_principle: 'Do not reveal which gate failed or whether record exists'
  }
};

/**
 * ============================================================================
 * ACCEPTANCE CRITERIA
 * ============================================================================
 */
const ACCEPTANCE_TESTS = [
  {
    test: 'authGuard Session Validation',
    steps: [
      'Call backend function without valid session',
      'Verify: authGuard throws 401 Unauthorized',
      'Verify: Base44 SDK redirects to login'
    ]
  },
  {
    test: 'authGuard Suspension Check',
    steps: [
      'Authenticate user with valid session',
      'Set User.is_suspended = true',
      'Call backend function (session still valid)',
      'Verify: authGuard throws 403 with "Account suspended" message'
    ]
  },
  {
    test: 'RLS Role Enforcement',
    steps: [
      'Authenticate as non-admin user',
      'Attempt to read entity with admin-only RLS rule',
      'Verify: 403 Forbidden returned by Base44 RLS'
    ]
  },
  {
    test: 'RLS Ownership Enforcement',
    steps: [
      'Authenticate as caregiver A',
      'Attempt to update CaregiverProfile belonging to caregiver B',
      'Verify: 403 Forbidden returned by Base44 RLS'
    ]
  },
  {
    test: 'Role Change Immediate Effect',
    steps: [
      'Authenticate as admin',
      'Downgrade user.role to regular user',
      'Call backend function requiring admin role',
      'Verify: authGuard returns user with new role, function checks role and denies'
    ]
  },
  {
    test: 'RLS Information Disclosure Prevention',
    steps: [
      'Attempt to access non-existent record',
      'Attempt to access existing record not owned by user',
      'Verify: Both return identical 403 response (no ID enumeration)'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION SUMMARY
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Code Required):
 * 1. Gate 1: JWT validation and session management (base44.auth.me())
 * 2. Session invalidation on suspension (see F-025)
 * 3. RLS query-level enforcement (automatic)
 * 
 * BUILD REQUIRED:
 * 1. Create shared authGuard backend function (functions/authGuard.ts)
 *    - Gate 1: Check base44.auth.me() !== null
 *    - Gate 2: Check user.is_suspended === false
 * 2. Configure RLS rules on each entity (Gates 3 & 4)
 *    - Gate 3: user_condition rules for role-based access
 *    - Gate 4: entity-user field comparison for ownership
 * 3. Call authGuard at start of every backend function
 * 4. Add explicit role checks in backend functions (action-level Gate 3)
 * 
 * ENTITIES TO REMOVE:
 * - entities/TokenBlacklist.json (if exists) - Base44 manages token blacklisting
 * 
 * INTEGRATION:
 * - F-001: Record-level access control (Gate 4 RLS rules)
 * - F-002: Field-level security (Gate 3 RLS rules + role checks)
 * - F-006: Encryption at rest (RLS field-level security config)
 * - F-008: Admin action logging (log admin actions in backend functions)
 * - F-025: Session management (suspension invalidation)
 */

export default function F003AuthorizationDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-003: API Authorization Middleware</h1>
      <p><strong>Status:</strong> Phase 0 — Revised — Partial Build Required</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#dbeafe', borderLeft: '4px solid #3b82f6', marginBottom: '2rem' }}>
        <strong>ℹ️ PLATFORM-MANAGED vs BUILD REQUIRED</strong>
        <p><strong>Platform-Managed (No Build Required):</strong></p>
        <ul>
          <li>Gate 1: JWT validation via base44.auth.me()</li>
          <li>RLS query enforcement (automatic)</li>
          <li>Session invalidation (see F-025)</li>
        </ul>
        <p><strong>Build Required:</strong></p>
        <ul>
          <li>Shared authGuard function (Gates 1 + 2)</li>
          <li>RLS rules on each entity (Gates 3 + 4)</li>
          <li>Call authGuard in every backend function</li>
          <li>Remove TokenBlacklist entity</li>
        </ul>
      </div>
      
      <h2>Four-Gate Authorization Model</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', margin: '1rem 0' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Gate</th>
            <th>Check</th>
            <th>Implementation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Gate 1</td>
            <td>Session valid</td>
            <td>Platform-managed: base44.auth.me()</td>
          </tr>
          <tr>
            <td>Gate 2</td>
            <td>User not suspended</td>
            <td>authGuard function: check is_suspended</td>
          </tr>
          <tr>
            <td>Gate 3</td>
            <td>Role permits action</td>
            <td>RLS user_condition + explicit role checks</td>
          </tr>
          <tr>
            <td>Gate 4</td>
            <td>User owns record</td>
            <td>RLS entity-user field comparison</td>
          </tr>
        </tbody>
      </table>
      
      <h2>authGuard Function (Build Required)</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`// functions/authGuard.ts
export default async function authGuard(base44) {
  // Gate 1: Session validation
  const user = await base44.auth.me();
  if (!user) {
    throw new Response(
      JSON.stringify({ error: 'Authentication required' }),
      { status: 401 }
    );
  }
  
  // Gate 2: Suspension check
  if (user.is_suspended === true) {
    throw new Response(
      JSON.stringify({ error: 'Account suspended' }),
      { status: 403 }
    );
  }
  
  return user;
}`}
      </pre>
      
      <h2>RLS Configuration Example</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`// entities/CaregiverProfile.json
{
  "rls": {
    "read": {
      "user_condition": {
        "$or": [
          {"is_published": true},
          {"data.user_id": "{{user.id}}"},
          {"role": {"$in": ["admin", "trust_admin"]}}
        ]
      }
    },
    "write": {
      "user_condition": {
        "$or": [
          {"data.user_id": "{{user.id}}"},
          {"role": {"$in": ["admin", "trust_admin"]}}
        ]
      }
    }
  }
}`}
      </pre>
      
      <h2>Backend Function Pattern</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
{`import authGuard from './authGuard';

export default async function updateProfile(req, context) {
  const { base44 } = context;
  
  // authGuard handles Gates 1 & 2
  const user = await authGuard(base44);
  
  // Gate 3: Explicit role check (if needed)
  if (user.role !== 'admin') {
    return Response.json({ error: 'Permission denied' }, { status: 403 });
  }
  
  // Gate 4: RLS handles ownership automatically
  // Business logic...
}`}
      </pre>
      
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', margin: '1rem 0' }}>
        <strong>⚠️ REMOVE TokenBlacklist Entity</strong>
        <p>Delete entities/TokenBlacklist.json if it exists. Base44 manages token blacklisting internally (see F-025).</p>
      </div>
      
      <p><em>See component source code for complete authorization specification and RLS examples.</em></p>
    </div>
  );
}