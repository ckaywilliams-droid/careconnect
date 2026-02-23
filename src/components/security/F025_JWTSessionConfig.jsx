/**
 * F-025: JWT SESSION MANAGEMENT CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * STATUS: Phase 1 — Platform-Managed
 * 
 * ============================================================================
 * PLATFORM-MANAGED vs BUILD REQUIRED
 * ============================================================================
 * 
 * PLATFORM-MANAGED (No Build Required):
 * - JWT token generation, validation, and expiry
 * - Refresh token rotation and management
 * - Token storage and cookie configuration
 * - Token blacklisting and replay detection
 * - Session lifecycle management
 * 
 * BUILD REQUIRED:
 * - Session invalidation logic when User.is_suspended is set to true
 * - Backend functions that check user role via base44.auth.me() instead of JWT claims
 * - Remove RefreshToken and TokenBlacklist entities from data model (not needed)
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F025_JWT_SESSION_SPECIFICATION = {
  
  /**
   * PLATFORM SESSION MANAGEMENT
   * Base44 handles JWT lifecycle automatically
   */
  platform_session_management: {
    
    what_base44_handles: {
      jwt_generation: 'Base44 generates and validates JWT tokens automatically',
      token_rotation: 'Refresh tokens are rotated automatically on each use',
      token_storage: 'Base44 manages secure token storage (httpOnly cookies)',
      session_expiry: 'Access and refresh token expiry handled by platform',
      blacklisting: 'Platform handles token invalidation and blacklisting',
      no_entities_needed: 'Do NOT create RefreshToken or TokenBlacklist entities'
    },
    
    security_outcomes: {
      short_lived_access: 'Access tokens are short-lived (platform default)',
      rotation: 'Refresh tokens automatically rotate on use',
      suspension_invalidation: 'Sessions invalidated when user suspended (BUILD REQUIRED)',
      role_check: 'Role checked via live DB read, not JWT claim (BUILD REQUIRED)'
    },
    
    developer_action: {
      remove_entities: 'Remove RefreshToken and TokenBlacklist from data model',
      use_auth_me: 'Use base44.auth.me() to get current authenticated user',
      session_invalidation: 'Add logic to invalidate session when is_suspended=true'
    }
  },
  
  /**
   * ENTITIES TO REMOVE FROM DATA MODEL
   * These are NOT needed - Base44 handles internally
   */
  entities_to_remove: {
    RefreshToken: {
      status: 'REMOVE FROM DATA MODEL',
      reason: 'Base44 manages refresh tokens internally',
      action: 'Delete entities/RefreshToken.json if it exists'
    },
    
    TokenBlacklist: {
      status: 'REMOVE FROM DATA MODEL',
      reason: 'Base44 manages token blacklisting internally',
      action: 'Delete entities/TokenBlacklist.json if it exists'
    }
  },
  
  /**
   * USER AUTHENTICATION AND ROLE CHECKING
   * How to access current user in backend functions
   */
  user_authentication: {
    
    platform_managed_auth: {
      mechanism: 'Base44 handles authentication and session management',
      no_jwt_parsing: 'You do NOT parse or validate JWT tokens in your code',
      no_token_storage: 'You do NOT manage token storage or cookies',
      developer_action: 'Use base44.auth.me() to get current authenticated user'
    },
    
    accessing_current_user: {
      method: 'base44.auth.me()',
      returns: 'Current authenticated user object from session',
      
      example: `
        // Get current authenticated user in backend function
        export default async function handler(req, context) {
          const { base44 } = context;
          
          // Get current user from session
          const user = await base44.auth.me();
          
          // User object contains: id, email, full_name, role, created_date
          console.log('Current user:', user.id, user.role);
          
          // Check permissions
          if (user.role !== 'admin') {
            return { error: 'Unauthorized' };
          }
          
          // Proceed with authorized logic
          return { success: true };
        }
      `,
      
      unauthenticated: 'base44.auth.me() throws error if no session - catch if needed'
    },
    
    role_checking: {
      authoritative_source: 'User entity in database (via base44.auth.me())',
      not_jwt_claims: 'Do NOT rely on JWT claims for role checks',
      
      reason: 'User role may change after token issued (promotion, suspension)',
      implementation: 'Every backend function reads current user role from DB',
      
      example: `
        // Role check in backend function
        export default async function handler(req, context) {
          const { base44 } = context;
          const user = await base44.auth.me();
          
          // Read live role from DB (authoritative)
          if (user.role !== 'admin' && user.role !== 'trust_admin') {
            return { error: 'Insufficient permissions', status: 403 };
          }
          
          // Admin-only logic here
          const sensitiveData = await base44.asServiceRole.entities.SensitiveEntity.list();
          return { data: sensitiveData };
        }
      `
    },
    
    session_storage_info: {
      platform_handled: 'Base44 manages token storage in httpOnly, Secure, SameSite cookies',
      security: 'Tokens not accessible to JavaScript - XSS protection',
      developer_action: 'None - platform handles automatically'
    }
  },
  
  /**
   * SESSION LIFECYCLE
   * Platform-managed with one build requirement
   */
  session_lifecycle: {
    
    platform_managed_lifecycle: {
      token_rotation: 'Base44 automatically rotates refresh tokens on use',
      replay_detection: 'Base44 detects and blocks replay attacks',
      session_expiry: 'Base44 handles token expiry and renewal',
      logout: 'Base44 base44.auth.logout() invalidates session automatically',
      
      developer_action: 'None for standard login/logout flow'
    },
    
    session_states: {
      active: 'User has valid session - base44.auth.me() returns user',
      expired: 'Session expired - base44.auth.me() throws error',
      revoked: 'Session invalidated (logout, suspension) - base44.auth.me() throws error'
    },
    
    logout_implementation: {
      client_side: `
        import { base44 } from '@/api/base44Client';
        
        // Logout current user
        await base44.auth.logout();
        // Automatically redirects to login or reloads page
        
        // Or redirect to specific URL after logout
        await base44.auth.logout('/some-page');
      `,
      
      what_happens: [
        'Base44 invalidates the session',
        'Clears authentication cookies',
        'User redirected to login page or specified URL'
      ]
    }
  },
  
  /**
   * SESSION INVALIDATION ON SUSPENSION
   * BUILD REQUIRED - One actionable task from F-025
   */
  suspension_session_invalidation: {
    
    requirement: {
      trigger: 'When User.is_suspended is set to true',
      action: 'Immediately invalidate the user\'s active session',
      method: 'Call Base44 session revocation API or backend function'
    },
    
    implementation_approach: {
      backend_function: 'Create a backend function or automation that fires when is_suspended changes',
      session_revocation: 'Use Base44 user management API to revoke user sessions',
      
      prompt_for_ai: `
        When a user's is_suspended field is set to true, immediately invalidate their active session.
        Use Base44's session management to revoke the user's current authentication.
      `
    },
    
    example_implementation: `
      // Backend function triggered when User.is_suspended is updated
      export default async function onUserSuspension(req, context) {
        const { base44 } = context;
        const { user_id, is_suspended } = req.body;
        
        if (is_suspended === true) {
          // Invalidate user's active sessions
          // Option 1: If Base44 provides session revocation API
          // await base44.users.revokeSession(user_id);
          
          // Option 2: Use automation or webhook to trigger logout
          // The platform will handle session invalidation
          
          console.info('User suspended - session invalidated', {
            user_id: user_id,
            timestamp: new Date().toISOString()
          });
        }
        
        return { success: true };
      }
    `,
    
    note: 'This is the only custom logic needed from F-025. All other session management is platform-handled.'
  },
  
  /**
   * TOKEN REFRESH FLOW
   * Platform-managed - no custom implementation needed
   */
  token_refresh_flow: {
    
    platform_managed: {
      what_base44_handles: [
        'Client automatically detects 401 response',
        'Base44 SDK handles refresh token rotation',
        'New tokens issued and stored automatically',
        'Failed requests are retried with new token'
      ],
      
      developer_action: 'None - Base44 SDK handles token refresh automatically'
    },
      
    client_usage_example: `
      // Token refresh handled automatically by Base44 SDK
      import { base44 } from '@/api/base44Client';
      
      // Make API calls - refresh happens automatically if needed
      const data = await base44.entities.SomeEntity.list();
      
      // If token expired:
      // 1. Base44 SDK detects 401
      // 2. Automatically refreshes token
      // 3. Retries the request
      // 4. Returns data seamlessly
      
      // No manual token refresh logic needed
    `,
    
    session_expiry_handling: `
      // If refresh token also expired (user inactive for 30+ days)
      // Base44 SDK redirects to login automatically
      
      // Optional: Handle session expiry in UI
      import { base44 } from '@/api/base44Client';
      
      try {
        const user = await base44.auth.me();
      } catch (error) {
        // Session expired - redirect to login
        base44.auth.redirectToLogin();
      }
    `
  },
  
  /**
   * ABUSE PREVENTION
   * Platform-managed
   */
  abuse_prevention: {
    
    platform_managed: {
      rate_limiting: 'Base44 applies rate limiting to auth endpoints automatically',
      replay_detection: 'Base44 detects and blocks token replay attacks',
      concurrent_requests: 'Base44 handles concurrent refresh requests safely',
      
      developer_action: 'None - platform handles abuse prevention'
    },
    
    note: {
      no_blacklist: 'No TokenBlacklist entity needed - Base44 manages internally',
      no_performance_tuning: 'No database indexing required - platform-optimized',
      no_rate_limiters: 'No custom rate limiting code needed'
    }
  },
  
  /**
   * ERROR HANDLING
   * Platform-managed
   */
  error_handling: {
    
    platform_managed: {
      token_expiry: 'Base44 handles expired token responses automatically',
      invalid_tokens: 'Base44 validates JWT format and signature',
      refresh_failures: 'Base44 redirects to login when refresh fails',
      clock_skew: 'Base44 applies clock skew tolerance automatically',
      
      developer_action: 'None - platform handles token validation and errors'
    },
    
    client_side_handling: `
      // Optional: Catch session errors in UI
      import { base44 } from '@/api/base44Client';
      
      try {
        const data = await base44.entities.SomeEntity.list();
      } catch (error) {
        if (error.status === 401) {
          // Session invalid - Base44 SDK handles redirect
          // This block typically won't run as SDK handles it
        }
      }
    `
  },
  
  /**
   * LOGGING & AUDIT
   * Platform logs session events automatically
   */
  logging_audit: {
    
    platform_logging: {
      session_events: 'Base44 automatically logs login, logout, and session events',
      audit_trail: 'Platform maintains audit trail for compliance',
      developer_access: 'View session logs in Base44 dashboard',
      
      developer_action: 'None - platform handles session audit logging'
    },
    
    custom_logging: {
      when_needed: 'Only log suspension-related events in your code',
      example: `
        // Log when manually invalidating session on suspension
        console.info('User suspended - session invalidated', {
          user_id: userId,
          reason: suspensionReason,
          timestamp: new Date().toISOString()
        });
      `
    }
  }
};

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 */
export default function F025JWTSessionDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-025: JWT Session Management</h1>
      <p><strong>Status:</strong> Phase 1 - Authentication & User Registration</p>
      <p><strong>Priority:</strong> CRITICAL</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', margin: '1rem 0' }}>
        <strong>⚠️ CRITICAL SECURITY REQUIREMENTS</strong>
        <ul>
          <li><strong>Access.2:</strong> Access tokens NEVER in localStorage (XSS risk)</li>
          <li><strong>Access.3:</strong> Refresh tokens in httpOnly, Secure, SameSite cookies</li>
          <li><strong>States.2:</strong> Refresh token rotation on every use</li>
          <li><strong>Logic.3:</strong> Check TokenBlacklist on every request</li>
          <li><strong>Abuse.2:</strong> MUST index TokenBlacklist.jti (performance critical)</li>
        </ul>
      </div>
      
      <h2>Token Types</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', margin: '1rem 0' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Token Type</th>
            <th>TTL</th>
            <th>Storage</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Access Token</td>
            <td>15 minutes</td>
            <td>Memory or httpOnly cookie</td>
            <td>API requests</td>
          </tr>
          <tr>
            <td>Refresh Token</td>
            <td>30 days</td>
            <td>httpOnly, Secure, SameSite cookie</td>
            <td>Get new access tokens</td>
          </tr>
        </tbody>
      </table>
      
      <h2>See source code for:</h2>
      <ul>
        <li>Complete entity schemas (RefreshToken, TokenBlacklist)</li>
        <li>JWT payload structure and security requirements</li>
        <li>Refresh token rotation implementation</li>
        <li>Token blacklist checking on every request</li>
        <li>Account suspension and logout flows</li>
        <li>Concurrent refresh handling</li>
        <li>Rate limiting and performance optimization</li>
        <li>Audit logging requirements</li>
      </ul>
    </div>
  );
}