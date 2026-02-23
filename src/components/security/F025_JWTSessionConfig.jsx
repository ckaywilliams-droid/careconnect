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
   * ACCESS CONTROL & PERMISSIONS (Access.1-4)
   * JWT payload and token storage
   */
  access_control: {
    
    jwt_payload: {
      // Access.1: JWT contents
      claims: {
        user_id: 'User identifier',
        role: 'Snapshot at issuance (NOT authoritative)',
        jti: 'Unique token ID for blacklist',
        iat: 'Issued at timestamp',
        exp: 'Expiry timestamp'
      },
      
      no_pii: 'NEVER include PII in JWT payload (email, phone, address)',
      
      example: `
        {
          "user_id": "550e8400-e29b-41d4-a716-446655440000",
          "role": "caregiver",
          "jti": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "iat": 1709683200,
          "exp": 1709684100
        }
      `,
      
      role_note: 'Access.4: Role is for reference only. Live DB read is authoritative (F-003).'
    },
    
    access_token_storage: {
      // Access.2: Access token storage
      type: 'Short-lived (15 minutes)',
      usage: 'API requests',
      
      storage_options: [
        {
          method: 'Memory (JavaScript variable)',
          security: 'Lost on page refresh - requires refresh token',
          recommended: true
        },
        {
          method: 'httpOnly cookie',
          security: 'Secure, not accessible to JS',
          recommended: true
        }
      ],
      
      never_use: 'localStorage or sessionStorage (XSS vulnerable)',
      
      implementation: `
        // Access.2: Access token in memory
        let accessToken = null;
        
        function setAccessToken(token) {
          accessToken = token;
        }
        
        function getAccessToken() {
          return accessToken;
        }
        
        // Lost on page refresh - use refresh token to get new one
      `
    },
    
    refresh_token_storage: {
      // Access.3: Refresh token storage
      type: 'Long-lived (30 days)',
      usage: 'Obtain new access tokens only',
      
      storage: 'httpOnly, Secure, SameSite=Strict cookie',
      security: [
        'httpOnly: Not accessible to JavaScript',
        'Secure: Only sent over HTTPS',
        'SameSite=Strict: CSRF protection'
      ],
      
      never_use: 'localStorage (accessible to XSS attacks)',
      
      cookie_configuration: `
        // Access.3: Set refresh token as httpOnly cookie
        res.cookie('refresh_token', refreshTokenHash, {
          httpOnly: true,       // Not accessible to JavaScript
          secure: true,         // HTTPS only
          sameSite: 'strict',   // CSRF protection
          maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
          path: '/auth/refresh' // Only sent to refresh endpoint
        });
      `
    },
    
    role_authority: {
      // Access.4: Role in JWT vs database
      jwt_role: 'Snapshot at token issuance',
      authoritative: 'Live database read (F-003 middleware)',
      
      reason: 'User role may change after token issued (promotion, demotion)',
      enforcement: 'F-003 middleware reads role from DB on every request',
      
      implementation: `
        // Access.4: JWT role is NOT authoritative
        async function checkPermission(req) {
          const jwtPayload = decodeJWT(req.headers.authorization);
          
          // DO NOT use jwtPayload.role for permission decisions
          // Read from database (F-003)
          const user = await base44.asServiceRole.entities.User.read(jwtPayload.user_id);
          
          // Use user.role from DB (authoritative)
          if (user.role !== 'admin') {
            throw new Error('Insufficient permissions');
          }
        }
      `
    }
  },
  
  /**
   * STATE MACHINE & LIFECYCLE (States.1-2)
   * Session states and refresh token rotation
   */
  state_machine: {
    
    session_lifecycle: {
      // States.1: Session states
      states: {
        active: {
          condition: 'Valid access token',
          user_can: 'Make API requests',
          duration: '15 minutes from issuance'
        },
        expired: {
          condition: 'Access token expired, refresh token valid',
          action: 'Client automatically attempts refresh',
          result: 'New access token issued'
        },
        refreshed: {
          condition: 'New access token issued via refresh',
          user_can: 'Continue using application',
          token_rotation: 'New refresh token also issued (States.2)'
        },
        revoked: {
          condition: 'All tokens invalidated',
          causes: ['User logout', 'Account suspension', 'Admin action'],
          recovery: 'User must re-authenticate'
        }
      },
      
      state_diagram: `
        Login
        ↓
        ACTIVE (15-min access token)
        ↓ (after 15 minutes)
        EXPIRED (access token invalid)
        ↓
        Client detects 401
        ↓
        Send refresh token to /auth/refresh
        ↓
        REFRESHED (new access + refresh tokens)
        ↓
        Continue using app
        
        At any time:
        → User logout → REVOKED
        → Account suspended → REVOKED
        → Admin force logout → REVOKED
      `
    },
    
    refresh_token_rotation: {
      // States.2: Automatic rotation on each use
      behavior: 'Each refresh issues new access + new refresh token',
      old_token: 'Revoked immediately (revoked_at set)',
      purpose: 'Prevent stolen refresh token reuse',
      
      rotation_flow: `
        Client sends refresh token
        ↓
        Server validates token (not expired, not revoked)
        ↓
        Generate new access token (15-min TTL)
        Generate new refresh token (30-day TTL)
        ↓
        Mark old refresh token as revoked
        ↓
        Return new tokens to client
        ↓
        Client stores new tokens
      `,
      
      replay_detection: {
        // States.2: If refresh token used twice (replay attack)
        scenario: 'Attacker steals refresh token and uses it',
        detection: 'Refresh token already marked as revoked',
        action: 'Revoke ALL refresh tokens for that user immediately',
        user_impact: 'User forced to re-authenticate on all devices',
        
        implementation: `
          // States.2: Detect refresh token replay
          async function refreshAccessToken(refreshToken) {
            const tokenRecord = await findRefreshToken(refreshToken);
            
            // Check if already revoked
            if (tokenRecord.revoked_at) {
              // Possible replay attack - revoke all user tokens
              console.error('Refresh token replay detected', {
                user_id: tokenRecord.user_id,
                token_id: tokenRecord.id
              });
              
              // Revoke all refresh tokens for this user
              await revokeAllUserRefreshTokens(tokenRecord.user_id);
              
              throw new Error('Token already used - possible replay attack');
            }
            
            // Token valid - proceed with rotation
            const newAccessToken = generateAccessToken(tokenRecord.user_id);
            const newRefreshToken = generateRefreshToken(tokenRecord.user_id);
            
            // Mark old token as revoked
            await base44.asServiceRole.entities.RefreshToken.update(tokenRecord.id, {
              revoked_at: new Date().toISOString()
            });
            
            return { newAccessToken, newRefreshToken };
          }
        `
      }
    }
  },
  
  /**
   * BUSINESS LOGIC & CROSS-ENTITY RULES (Logic.1-3)
   * Suspension, logout, and blacklist checks
   */
  business_logic: {
    
    account_suspension: {
      // Logic.1: Immediate lockout on suspension
      trigger: 'User.is_suspended set to true',
      actions: [
        '1. Add all active access tokens to TokenBlacklist (by jti)',
        '2. Set revoked_at on all RefreshToken records',
        '3. User locked out immediately (not at next token expiry)'
      ],
      
      implementation: `
        // Logic.1: Suspend user and invalidate all sessions
        async function suspendUser(userId, reason) {
          // Set is_suspended flag
          await base44.asServiceRole.entities.User.update(userId, {
            is_suspended: true,
            suspension_reason: reason
          });
          
          // Revoke all refresh tokens
          await base44.asServiceRole.entities.RefreshToken.update_many(
            { user_id: userId, revoked_at: null },
            { revoked_at: new Date().toISOString() }
          );
          
          // Find all active JWTs and blacklist them
          // (In practice, JTIs would be tracked or we accept 15-min grace period)
          // For immediate effect, blacklist known JTIs
          
          console.info('User suspended - all sessions invalidated', {
            user_id: userId,
            reason: reason
          });
        }
      `
    },
    
    logout_all_devices: {
      // Logic.2: Revoke all refresh tokens
      user_action: 'Sign out of all devices',
      
      approach_1: {
        method: 'Revoke refresh tokens only',
        effect: 'User locked out when access token expires (≤15 min)',
        tradeoff: 'Acceptable security/UX balance'
      },
      
      approach_2: {
        method: 'Revoke refresh tokens + blacklist active JTIs',
        effect: 'Immediate lockout',
        requirement: 'Track active JTIs (additional complexity)'
      },
      
      implementation: `
        // Logic.2: Logout from all devices
        async function logoutAllDevices(userId) {
          // Revoke all refresh tokens
          await base44.asServiceRole.entities.RefreshToken.update_many(
            { user_id: userId, revoked_at: null },
            { revoked_at: new Date().toISOString() }
          );
          
          // Optional: Blacklist active access tokens for immediate effect
          // (Requires tracking active JTIs)
          
          // Audit.2: Log revocation
          console.info('User logged out from all devices', {
            user_id: userId,
            reason: 'user_initiated',
            timestamp: new Date().toISOString()
          });
        }
      `
    },
    
    blacklist_check: {
      // Logic.3: Check jti on every request
      requirement: 'Every API request checks TokenBlacklist',
      timing: 'BEFORE processing request',
      action: 'If jti found in blacklist: return 401 immediately',
      
      performance: 'MUST be fast (<10ms) - requires jti index (Abuse.2)',
      
      implementation: `
        // Logic.3: Middleware to check token blacklist
        async function checkTokenBlacklist(req, res, next) {
          const token = req.headers.authorization?.replace('Bearer ', '');
          
          if (!token) {
            return res.status(401).json({ error: 'No token provided' });
          }
          
          // Decode JWT to get jti
          const payload = decodeJWT(token);
          
          // Logic.3: Check if jti is blacklisted
          const blacklisted = await base44.asServiceRole.entities.TokenBlacklist.filter({
            jti: payload.jti
          });
          
          if (blacklisted.length > 0) {
            // Token blacklisted - reject immediately
            console.warn('Blacklisted token used', {
              jti: payload.jti.substring(0, 8),
              user_id: payload.user_id
            });
            
            return res.status(401).json({ 
              error: 'Token revoked',
              code: 'TOKEN_REVOKED'
            });
          }
          
          // Token valid - continue
          next();
        }
        
        // Apply to all authenticated routes
        app.use('/api/*', checkTokenBlacklist);
      `
    }
  },
  
  /**
   * EVENT TRIGGERS & AUTOMATION (Triggers.1-2)
   * Token refresh flow and concurrent requests
   */
  event_triggers: {
    
    refresh_flow: {
      // Triggers.1: Access token refresh sequence
      steps: [
        '1. Client detects 401 response (token expired)',
        '2. Client sends refresh token to /auth/refresh',
        '3. Server validates refresh token',
        '4. Server issues new access + refresh tokens',
        '5. Client stores new tokens',
        '6. Client retries original request with new access token'
      ],
      
      client_implementation: `
        // Triggers.1: Client-side refresh flow
        async function apiRequest(url, options = {}) {
          let accessToken = getAccessToken();
          
          // Add token to request
          options.headers = {
            ...options.headers,
            'Authorization': \`Bearer \${accessToken}\`
          };
          
          let response = await fetch(url, options);
          
          // Check if token expired
          if (response.status === 401) {
            const errorData = await response.json();
            
            if (errorData.code === 'token_expired') {
              // Triggers.1: Attempt refresh
              const refreshed = await refreshAccessToken();
              
              if (refreshed) {
                // Retry original request with new token
                options.headers['Authorization'] = \`Bearer \${getAccessToken()}\`;
                response = await fetch(url, options);
              } else {
                // Refresh failed - redirect to login
                window.location.href = '/login';
                return;
              }
            }
          }
          
          return response;
        }
        
        async function refreshAccessToken() {
          try {
            // Refresh token sent automatically via httpOnly cookie
            const response = await fetch('/auth/refresh', {
              method: 'POST',
              credentials: 'include'  // Include cookies
            });
            
            if (!response.ok) {
              throw new Error('Refresh failed');
            }
            
            const { access_token } = await response.json();
            setAccessToken(access_token);
            
            return true;
          } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
          }
        }
      `,
      
      server_implementation: `
        // Triggers.1: Server-side refresh endpoint
        app.post('/auth/refresh', async (req, res) => {
          const refreshToken = req.cookies.refresh_token;
          
          if (!refreshToken) {
            return res.status(401).json({ error: 'No refresh token' });
          }
          
          try {
            // Validate refresh token
            const tokenRecord = await validateRefreshToken(refreshToken);
            
            // Generate new tokens
            const newAccessToken = generateAccessToken(tokenRecord.user_id);
            const newRefreshToken = generateRefreshToken(tokenRecord.user_id);
            
            // Rotate refresh token (States.2)
            await revokeRefreshToken(tokenRecord.id);
            await storeRefreshToken(newRefreshToken, tokenRecord.user_id);
            
            // Set new refresh token cookie
            res.cookie('refresh_token', newRefreshToken, {
              httpOnly: true,
              secure: true,
              sameSite: 'strict',
              maxAge: 30 * 24 * 60 * 60 * 1000
            });
            
            // Return new access token
            res.json({ access_token: newAccessToken });
            
          } catch (error) {
            console.error('Refresh token validation failed:', error);
            res.status(401).json({ error: 'Invalid refresh token' });
          }
        });
      `
    },
    
    concurrent_refresh: {
      // Triggers.2: Handle concurrent refresh requests
      scenario: 'Two tabs simultaneously refresh with same token',
      expected: 'First request succeeds, second fails',
      reason: 'First request marks token as revoked',
      user_impact: 'User must re-authenticate',
      
      mitigation: 'Client should coordinate refresh across tabs (single refresh)',
      
      implementation: `
        // Triggers.2: Server detects concurrent refresh
        async function validateRefreshToken(token) {
          const tokenRecord = await findRefreshTokenByHash(token);
          
          if (!tokenRecord) {
            throw new Error('Token not found');
          }
          
          // Triggers.2: Check if already revoked (concurrent request)
          if (tokenRecord.revoked_at) {
            // Second request using already-revoked token
            console.warn('Concurrent refresh detected', {
              user_id: tokenRecord.user_id,
              token_id: tokenRecord.id
            });
            
            throw new Error('Token already used');
          }
          
          // Check expiry
          if (new Date(tokenRecord.expires_at) < new Date()) {
            throw new Error('Token expired');
          }
          
          return tokenRecord;
        }
      `
    }
  },
  
  /**
   * ABUSE PREVENTION & RATE LIMITS (Abuse.1-2)
   * Refresh endpoint and blacklist performance
   */
  abuse_prevention: {
    
    refresh_rate_limit: {
      // Abuse.1: Rate limit refresh endpoint
      limit: '10 requests per IP per minute',
      reason: 'High refresh rate suggests stolen token replay',
      
      implementation: `
        // Abuse.1: Rate limit /auth/refresh
        const refreshRateLimiter = rateLimit({
          windowMs: 60 * 1000,  // 1 minute
          max: 10,  // 10 requests
          message: 'Too many refresh attempts. Please try again later.',
          
          handler: (req, res) => {
            console.warn('Refresh rate limit exceeded', {
              ip: req.ip,
              timestamp: new Date().toISOString()
            });
            
            res.status(429).json({
              error: 'Too many refresh attempts',
              retry_after: 60
            });
          }
        });
        
        app.post('/auth/refresh', refreshRateLimiter, handleRefresh);
      `
    },
    
    blacklist_performance: {
      // Abuse.2: CRITICAL - Index jti field
      requirement: 'Index TokenBlacklist on jti',
      reason: 'Every API request checks blacklist',
      target_latency: '<10ms per check',
      
      without_index: 'Full table scan on every request = catastrophic',
      
      database_index: `
        // Abuse.2: Create index on jti field
        CREATE INDEX idx_token_blacklist_jti ON TokenBlacklist(jti);
        
        // Verify index usage
        EXPLAIN SELECT * FROM TokenBlacklist WHERE jti = 'abc123...';
        // Should show "Using index"
      `,
      
      monitoring: `
        // Monitor blacklist check performance
        const start = Date.now();
        const blacklisted = await checkBlacklist(jti);
        const duration = Date.now() - start;
        
        if (duration > 10) {
          console.warn('Slow blacklist check', {
            duration_ms: duration,
            jti_prefix: jti.substring(0, 8)
          });
        }
      `
    }
  },
  
  /**
   * ERROR HANDLING (Errors.1-3, Edge.1-2)
   * Token validation and edge cases
   */
  error_handling: {
    
    expired_access_token: {
      // Errors.1: Access token expired
      http_code: 401,
      error_code: 'token_expired',
      message: 'Access token expired',
      
      client_action: 'Automatically attempt refresh',
      fallback: 'If refresh fails: redirect to login',
      
      response: `
        {
          "error": "Access token expired",
          "code": "token_expired"
        }
      `
    },
    
    malformed_jwt: {
      // Errors.2: Invalid JWT
      scenarios: ['Tampered signature', 'Invalid format', 'Missing claims'],
      action: 'Return 401 immediately',
      no_parsing: 'Do NOT attempt to parse or use payload',
      
      implementation: `
        // Errors.2: Validate JWT format and signature
        function validateJWT(token) {
          try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return decoded;
          } catch (error) {
            // Errors.2: Malformed or tampered JWT
            console.warn('Invalid JWT', {
              error: error.message,
              token_prefix: token.substring(0, 20)
            });
            
            throw new Error('Invalid token');
          }
        }
      `
    },
    
    clock_skew: {
      // Errors.3: Allow clock skew tolerance
      tolerance: '30 seconds',
      reason: 'Account for client/server time differences',
      
      implementation: `
        // Errors.3: Clock skew tolerance
        const decoded = jwt.verify(token, JWT_SECRET, {
          clockTolerance: 30  // 30-second tolerance
        });
      `
    },
    
    refresh_token_theft: {
      // Edge.1: Detect stolen refresh tokens
      detection: 'Refresh token used from different IP/device',
      action: 'Flag event and notify user via email',
      no_auto_block: 'Do NOT block automatically at MVP',
      
      implementation: `
        // Edge.1: Detect anomalous refresh token usage
        async function detectRefreshTokenTheft(tokenRecord, currentIP) {
          const originalIP = tokenRecord.ip_address;
          
          // Check if IP significantly different (simplified)
          if (originalIP && currentIP !== originalIP) {
            // Flag suspicious activity
            console.warn('Refresh token used from different IP', {
              user_id: tokenRecord.user_id,
              original_ip: originalIP,
              current_ip: currentIP
            });
            
            // Edge.1: Notify user via email
            await base44.integrations.Core.SendEmail({
              to: tokenRecord.user.email,
              subject: 'New sign-in detected',
              body: \`A sign-in was detected from a new location. 
                     If this wasn't you, please secure your account.\`
            });
            
            // Do NOT block - just flag for user awareness
          }
        }
      `
    },
    
    blacklist_cleanup: {
      // Edge.2: Scheduled cleanup of old blacklist entries
      schedule: 'Daily at 3 AM',
      condition: 'revoked_at > access token TTL (15 minutes)',
      reason: 'Entries older than 15 min are no longer needed',
      
      implementation: `
        // Edge.2: Cleanup old TokenBlacklist entries
        async function cleanupTokenBlacklist() {
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
          
          const deleted = await base44.asServiceRole.entities.TokenBlacklist.delete_many({
            revoked_at: { $lt: fifteenMinutesAgo.toISOString() }
          });
          
          console.info('TokenBlacklist cleanup complete', {
            entries_deleted: deleted.count,
            timestamp: new Date().toISOString()
          });
        }
        
        // Run daily via scheduled automation
        // Cron: 0 3 * * * (3 AM daily)
      `
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-3)
   * Session tracking and token operations
   */
  logging_audit: {
    
    session_creation: {
      // Audit.1: Log every session creation
      log_level: 'INFO',
      fields: [
        'user_id',
        'login_method (password / sso)',
        'ip_address',
        'device_hint (truncated user agent)',
        'issued_at'
      ],
      
      implementation: `
        // Audit.1: Log session creation
        console.info('Session created', {
          user_id: user.id,
          login_method: 'password',
          ip: req.ip,
          device_hint: req.headers['user-agent']?.substring(0, 100),
          issued_at: new Date().toISOString()
        });
      `
    },
    
    session_revocation: {
      // Audit.2: Log every session revocation
      log_level: 'INFO',
      fields: [
        'user_id',
        'reason (logout / suspension / admin-forced / suspicious-replay)',
        'revoked_at'
      ],
      
      implementation: `
        // Audit.2: Log session revocation
        console.info('Session revoked', {
          user_id: userId,
          reason: 'logout',
          revoked_at: new Date().toISOString()
        });
      `
    },
    
    blacklist_additions: {
      // Audit.3: Log token blacklist additions
      log_level: 'INFO',
      fields: [
        'jti_prefix (first 8 chars)',
        'user_id',
        'reason',
        'timestamp'
      ],
      
      implementation: `
        // Audit.3: Log token blacklist addition
        console.info('Token blacklisted', {
          jti_prefix: jti.substring(0, 8),
          user_id: userId,
          reason: 'account_suspension',
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