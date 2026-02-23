/**
 * F-011: API RATE LIMITING CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-011
 * API Rate Limiting. Rate limits protect against abuse and ensure fair resource
 * allocation across all users. Configured at platform layer with in-memory counters.
 * 
 * STATUS: Phase 0 - Documentation complete
 * NEXT STEP: Configure Base44 rate limiting middleware + implement in-memory counter store
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F011_RATE_LIMITING_SPECIFICATION = {
  
  /**
   * RATE LIMIT THRESHOLDS (Data.2)
   * Per-endpoint limits
   */
  rate_limit_thresholds: {
    
    login: {
      endpoint: 'POST /auth/login',
      limit: '10 requests per minute',
      scope: 'per IP address',
      rationale: 'Prevent brute-force password attacks (Access.2)',
      response_on_exceed: '429 Too Many Requests + Retry-After header',
      
      example_request: `
        POST /auth/login
        Body: { email: "user@example.com", password: "***" }
      `,
      
      implementation: `
        // Rate limit: 10 requests/min per IP
        const loginRateLimit = {
          key: (req) => \`login:\${req.ip}\`,
          max: 10,
          window: 60 * 1000,  // 1 minute in milliseconds
          message: 'Too many login attempts. Please wait and try again.'
        };
      `
    },
    
    registration: {
      endpoint: 'POST /auth/register',
      limit: 'CAPTCHA required (no numeric limit)',
      scope: 'per IP address',
      rationale: 'Bot prevention - CAPTCHA is primary defense, not rate limiting',
      integration: 'F-023: CAPTCHA integration',
      note: 'Numeric rate limit not enforced since CAPTCHA prevents automated abuse',
      
      implementation: `
        // No numeric rate limit - CAPTCHA required (F-023)
        // Optional: Light rate limit (e.g., 5/min) as defense-in-depth
        const registrationRateLimit = {
          key: (req) => \`register:\${req.ip}\`,
          max: 5,
          window: 60 * 1000,
          message: 'Too many registration attempts. Please complete the CAPTCHA and try again.'
        };
      `
    },
    
    booking_submission: {
      endpoint: 'POST /api/booking',
      limit: '20 requests per minute',
      scope: 'per authenticated user (user_id from session)',
      rationale: 'Prevent spam booking requests (Access.2)',
      response_on_exceed: '429 + Retry-After',
      
      example_request: `
        POST /api/booking
        Headers: { Authorization: "Bearer <token>" }
        Body: { 
          caregiver_profile_id: "...",
          requested_date: "2025-01-15",
          ...
        }
      `,
      
      implementation: `
        // Rate limit: 20 requests/min per user
        const bookingRateLimit = {
          key: (req) => \`booking:\${req.user.id}\`,
          max: 20,
          window: 60 * 1000,
          message: 'Too many booking requests. Please wait a moment and try again.'
        };
      `
    },
    
    message_send: {
      endpoint: 'POST /api/messages',
      limit: '30 messages per minute',
      scope: 'per authenticated user (user_id from session)',
      rationale: 'Prevent spam messaging and harassment (Access.2)',
      response_on_exceed: '429 + Retry-After',
      
      example_request: `
        POST /api/messages
        Headers: { Authorization: "Bearer <token>" }
        Body: {
          thread_id: "...",
          content: "Message text"
        }
      `,
      
      implementation: `
        // Rate limit: 30 messages/min per user
        const messageRateLimit = {
          key: (req) => \`message:\${req.user.id}\`,
          max: 30,
          window: 60 * 1000,
          message: 'You are sending messages too quickly. Please wait a moment.'
        };
      `
    },
    
    search: {
      endpoint: 'GET /api/search/caregivers',
      limit: '60 requests per minute',
      scope: 'per session (session_id)',
      rationale: 'Prevent scraping of caregiver profiles (Access.2)',
      response_on_exceed: '429 + Retry-After',
      
      example_request: `
        GET /api/search/caregivers?city=Seattle&specialization=infant
        Headers: { Session-ID: "<session_id>" }
      `,
      
      implementation: `
        // Rate limit: 60 requests/min per session
        const searchRateLimit = {
          key: (req) => \`search:\${req.session.id}\`,
          max: 60,
          window: 60 * 1000,
          message: 'Search limit exceeded. Please wait a moment and try again.'
        };
      `
    },
    
    summary_table: `
      Endpoint                | Limit       | Scope        | Purpose
      ------------------------|-------------|--------------|-------------------
      POST /auth/login        | 10/min      | per IP       | Brute-force prevention
      POST /auth/register     | CAPTCHA     | per IP       | Bot prevention
      POST /api/booking       | 20/min      | per user_id  | Spam prevention
      POST /api/messages      | 30/min      | per user_id  | Harassment prevention
      GET /api/search         | 60/min      | per session  | Scraping prevention
    `
  },
  
  /**
   * RATE LIMIT SCOPE (Access.1-2)
   * Who gets rate limited and how
   */
  rate_limit_scope: {
    
    all_roles_subject: {
      // Access.1: Rate limits apply to ALL roles (no exemptions)
      rule: 'ALL users subject to rate limits - no role is exempt',
      applies_to: ['parent', 'caregiver', 'support_admin', 'trust_admin', 'super_admin'],
      
      rationale: 'Even admin accounts can be compromised - rate limits prevent abuse',
      
      exception: {
        // Edge.1: Admin elevated limits on admin-specific endpoints
        scenario: 'Admin bulk operations (e.g., verify 50 caregivers)',
        solution: 'Separate elevated-limit tier for admin roles on admin-specific endpoints ONLY',
        examples: [
          'Admin verifying caregivers: elevated from 20/min → 100/min',
          'Admin reviewing flagged content: elevated from 30/min → 150/min'
        ],
        critical_rule: 'User-facing endpoints (login, booking, messages) have SAME limits for admins'
      }
    },
    
    unauthenticated_endpoints: {
      // Access.2: Unauthenticated endpoints limited by IP
      endpoints: ['POST /auth/login', 'POST /auth/register', 'GET /api/search'],
      scope: 'per IP address',
      key_format: '"{endpoint}:{ip_address}"',
      
      example: `
        // Login attempts from IP 203.0.113.42
        Key: "login:203.0.113.42"
        Count: 10 requests in last 60 seconds
        Result: Next request returns 429
      `
    },
    
    authenticated_endpoints: {
      // Access.2: Authenticated endpoints limited by user_id
      endpoints: ['POST /api/booking', 'POST /api/messages', 'PUT /api/profile'],
      scope: 'per user_id from session',
      key_format: '"{endpoint}:{user_id}"',
      
      example: `
        // Booking requests from user_abc123
        Key: "booking:user_abc123"
        Count: 20 requests in last 60 seconds
        Result: Next request returns 429
      `
    }
  },
  
  /**
   * ROLLING WINDOWS (Logic.2)
   * Time-based rate limit calculation
   */
  rolling_windows: {
    
    principle: 'Rate limit windows are rolling, not fixed clock minutes (Logic.2)',
    
    rolling_vs_fixed: {
      fixed_window: {
        definition: 'Counter resets at fixed intervals (e.g., top of each minute)',
        problem: 'Allows bursts at window boundaries',
        example: `
          12:00:50 - User makes 10 requests (OK, limit is 10/min)
          12:01:00 - Counter resets
          12:01:05 - User makes 10 more requests (OK, limit is 10/min)
          
          Result: 20 requests in 15 seconds - defeats rate limiting
        `
      },
      
      rolling_window: {
        definition: 'Counter tracks requests in the last N seconds from current time',
        advantage: 'Prevents window boundary exploitation',
        example: `
          12:00:50 - User makes 10 requests
          12:01:05 - User tries 11th request
          System checks: How many requests in last 60 seconds?
          Answer: 10 (all from 12:00:50)
          Result: 11th request DENIED (429)
          
          12:01:51 - User tries again
          System checks: How many requests in last 60 seconds?
          Answer: 0 (12:00:50 requests are now >60 seconds old)
          Result: Request ALLOWED
        `
      }
    },
    
    implementation: {
      // Logic.2: Rolling window implementation
      approach: 'Sliding log or fixed window counter with TTL',
      
      sliding_log: `
        // Store timestamps of each request
        const requestLog = [
          { timestamp: 1641070850000, endpoint: 'login', ip: '203.0.113.42' },
          { timestamp: 1641070851000, endpoint: 'login', ip: '203.0.113.42' },
          ...
        ];
        
        // On new request
        const now = Date.now();
        const windowStart = now - (60 * 1000);  // 60 seconds ago
        
        // Count requests in window
        const recentRequests = requestLog.filter(req => 
          req.endpoint === 'login' &&
          req.ip === '203.0.113.42' &&
          req.timestamp >= windowStart
        );
        
        if (recentRequests.length >= 10) {
          return 429;  // Too Many Requests
        }
        
        // Add new request to log
        requestLog.push({ timestamp: now, endpoint: 'login', ip: '203.0.113.42' });
      `,
      
      fixed_window_with_ttl: `
        // Simpler: Increment counter with 60-second TTL
        // Trade-off: Allows small bursts at window boundaries, but simpler
        
        const key = \`login:\${ip}\`;
        const count = await redis.incr(key);
        
        if (count === 1) {
          // First request in window - set TTL
          await redis.expire(key, 60);
        }
        
        if (count > 10) {
          return 429;
        }
      `,
      
      recommended: 'Fixed window with TTL (simpler, good enough for most cases)'
    }
  },
  
  /**
   * RESPONSE ON LIMIT EXCEEDED (Logic.1)
   * 429 status + Retry-After header
   */
  response_on_limit_exceeded: {
    
    http_status: 429,
    http_status_name: 'Too Many Requests',
    
    required_headers: {
      'Retry-After': {
        description: 'Seconds until limit resets',
        format: 'Integer (seconds)',
        example: 'Retry-After: 42',
        rationale: 'Tells client when to retry (Edge.2 - mobile client retry logic)'
      }
    },
    
    response_body: {
      // UI.1: Friendly user-facing message
      user_facing: {
        error: 'Too many attempts. Please wait and try again.',
        retry_after: 42  // seconds
      },
      
      internal_details_excluded: {
        // UI.1: Do not expose internal implementation
        forbidden: [
          'Rate limit: 10 requests per minute per IP',
          'Key: login:203.0.113.42',
          'Current count: 11',
          'Redis error'
        ],
        allowed: [
          'Too many requests',
          'Please wait X seconds',
          'Try again later'
        ]
      }
    },
    
    example_response: `
      HTTP/1.1 429 Too Many Requests
      Retry-After: 42
      Content-Type: application/json
      
      {
        "error": "Too many login attempts. Please wait 42 seconds and try again.",
        "retry_after": 42
      }
    `,
    
    implementation: `
      // Rate limiting middleware
      async function rateLimitMiddleware(req, res, next) {
        const key = getRateLimitKey(req);  // e.g., "login:203.0.113.42"
        const limit = getRateLimitConfig(req.path);  // e.g., { max: 10, window: 60000 }
        
        const count = await incrementCounter(key, limit.window);
        
        if (count > limit.max) {
          // Limit exceeded
          const ttl = await getCounterTTL(key);  // Time until window resets
          
          // Abuse.1: Log rate limit breach
          await logRateLimitBreach({
            endpoint: req.path,
            ip: req.ip,
            user_id: req.user?.id,
            count: count,
            limit: limit.max,
            timestamp: new Date().toISOString()
          });
          
          // Return 429 with Retry-After
          return res.status(429)
            .header('Retry-After', Math.ceil(ttl / 1000))
            .json({
              error: limit.message || 'Too many requests. Please try again later.',
              retry_after: Math.ceil(ttl / 1000)
            });
        }
        
        // Under limit - proceed
        next();
      }
    `
  },
  
  /**
   * IN-MEMORY COUNTER STORE (Triggers.1)
   * Redis or Base44 platform cache
   */
  counter_store: {
    
    requirement: {
      // Triggers.1: Fast in-memory store (not main database)
      storage: 'In-memory cache (Redis, Memcached, or Base44 platform cache)',
      forbidden: 'Base44 main database (excessive write load)',
      rationale: 'Rate limit counters increment on every request - too high write volume for main DB'
    },
    
    redis_recommended: {
      service: 'Redis',
      why: [
        'Extremely fast (in-memory)',
        'Built-in TTL (automatic expiry)',
        'Atomic increment operations',
        'Distributed (works across multiple servers)'
      ],
      commands: [
        'INCR key - Increment counter',
        'EXPIRE key seconds - Set TTL',
        'TTL key - Get remaining time'
      ]
    },
    
    base44_platform_cache: {
      option: 'Base44 built-in cache',
      when: 'If Base44 provides in-memory cache API',
      verification: 'Check Base44 documentation for cache API availability'
    },
    
    implementation_redis: `
      // Redis-based rate limiting
      const redis = require('redis');
      const client = redis.createClient({ url: process.env.REDIS_URL });
      
      async function incrementCounter(key, windowMs) {
        const count = await client.incr(key);
        
        if (count === 1) {
          // First request in window - set TTL
          await client.pExpire(key, windowMs);
        }
        
        return count;
      }
      
      async function getCounterTTL(key) {
        const ttl = await client.pTTL(key);  // TTL in milliseconds
        return ttl;
      }
    `,
    
    implementation_base44_cache: `
      // Base44 platform cache (if available)
      import { base44 } from '@/api/base44Client';
      
      async function incrementCounter(key, windowMs) {
        // Check if Base44 provides cache API
        const count = await base44.cache.increment(key);
        
        if (count === 1) {
          await base44.cache.expire(key, windowMs);
        }
        
        return count;
      }
    `
  },
  
  /**
   * FAIL OPEN BEHAVIOR (Errors.1)
   * Allow requests if rate limit store unavailable
   */
  fail_open: {
    
    principle: {
      // Errors.1: Fail open, not closed
      rule: 'If rate limit counter store unavailable → allow requests',
      rationale: 'Brief window of unthrottled traffic is acceptable; complete platform outage is not',
      trade_off: 'Security degradation vs availability - availability wins'
    },
    
    implementation: `
      async function rateLimitMiddleware(req, res, next) {
        try {
          const key = getRateLimitKey(req);
          const limit = getRateLimitConfig(req.path);
          
          const count = await incrementCounter(key, limit.window);
          
          if (count > limit.max) {
            return res.status(429).json({ error: 'Too many requests' });
          }
          
          next();
        } catch (error) {
          // Errors.1: Redis/cache unavailable - fail open
          console.error('Rate limiting error - failing open', {
            error: error.message,
            endpoint: req.path,
            ip: req.ip
          });
          
          // Alert operators immediately
          await sendOperatorAlert({
            severity: 'CRITICAL',
            title: 'Rate limiting unavailable',
            details: {
              error: error.message,
              impact: 'Rate limits NOT enforced - fail open mode'
            }
          });
          
          // Allow request to proceed (fail open)
          next();
        }
      }
    `,
    
    monitoring: {
      alert: 'Immediate operator alert when rate limit store unavailable',
      recovery: 'Automatic retry connection to Redis/cache',
      fallback: 'All requests allowed until store restored'
    }
  },
  
  /**
   * ABUSE ESCALATION (Abuse.1-2)
   * Log breaches and escalate repeat offenders
   */
  abuse_escalation: {
    
    logging: {
      // Audit.1: Every rate limit breach logged
      requirement: 'Log every 429 response',
      fields: [
        'endpoint',
        'ip_address',
        'user_id (if authenticated)',
        'request_count (at time of breach)',
        'limit_threshold',
        'timestamp'
      ],
      
      implementation: `
        async function logRateLimitBreach(breach) {
          // Option 1: Log to external service (Sentry - F-010)
          Sentry.captureMessage('Rate limit breach', {
            level: 'warning',
            tags: {
              endpoint: breach.endpoint,
              breach_type: 'rate_limit'
            },
            extra: {
              ip: breach.ip,
              user_id: breach.user_id,
              count: breach.count,
              limit: breach.limit
            }
          });
          
          // Option 2: Log to database (for daily report - Audit.2)
          await base44.entities.RateLimitLog.create({
            endpoint: breach.endpoint,
            ip_address: breach.ip,
            user_id: breach.user_id,
            request_count: breach.count,
            limit_threshold: breach.limit,
            breach_timestamp: breach.timestamp
          });
        }
      `
    },
    
    escalation: {
      // Abuse.2: Repeated breaches → flag for IP blocking
      threshold: '3 limit breaches within 1 hour',
      action: 'Flag for IP blocking review (F-014)',
      
      implementation: `
        async function checkRateLimitAbuse(ip, user_id) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          
          // Count recent breaches from this source
          const recentBreaches = await base44.entities.RateLimitLog.filter({
            ip_address: ip,
            breach_timestamp: { $gte: oneHourAgo.toISOString() }
          });
          
          if (recentBreaches.length >= 3) {
            // Abuse.2: Flag for IP blocking review
            await base44.entities.IPBlocklist.create({
              ip_address: ip,
              block_reason: 'repeated_rate_limit_breach',
              blocked_at: new Date().toISOString(),
              blocked_by_admin_id: 'SYSTEM',
              unblock_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),  // 24 hour block
              is_permanent: false,
              invalid_attempt_count: recentBreaches.length
            });
            
            // Alert admins
            await sendAdminAlert({
              severity: 'WARNING',
              title: 'IP blocked due to repeated rate limit breaches',
              details: {
                ip_address: ip,
                breach_count: recentBreaches.length,
                time_window: '1 hour'
              }
            });
          }
        }
      `
    }
  },
  
  /**
   * ADMIN ELEVATED LIMITS (Edge.1)
   * Higher limits for legitimate admin bulk operations
   */
  admin_elevated_limits: {
    
    scenario: 'Admin needs to verify 50 caregivers - triggers rate limits',
    
    solution: {
      // Edge.1: Separate elevated-limit tier for admin roles
      rule: 'Admin-specific endpoints have elevated limits for admin roles',
      critical_constraint: 'User-facing endpoints (login, booking, messages) have SAME limits for admins',
      
      elevated_endpoints: [
        'POST /api/admin/verify-caregiver → 100/min (elevated from 20/min)',
        'PUT /api/admin/review-content → 150/min (elevated from 30/min)',
        'POST /api/admin/bulk-action → 200/min (admin-only endpoint)'
      ],
      
      normal_endpoints: [
        'POST /auth/login → 10/min (same for admins)',
        'POST /api/booking → 20/min (same for admins)',
        'POST /api/messages → 30/min (same for admins)'
      ]
    },
    
    implementation: `
      function getRateLimitConfig(path, user) {
        const baseConfig = {
          '/auth/login': { max: 10, window: 60000 },
          '/api/booking': { max: 20, window: 60000 },
          '/api/messages': { max: 30, window: 60000 },
          '/api/search': { max: 60, window: 60000 }
        };
        
        // Edge.1: Admin elevated limits on admin endpoints only
        const adminConfig = {
          '/api/admin/verify-caregiver': { max: 100, window: 60000 },
          '/api/admin/review-content': { max: 150, window: 60000 },
          '/api/admin/bulk-action': { max: 200, window: 60000 }
        };
        
        // Admin elevated limits ONLY on admin endpoints
        if (user?.role === 'trust_admin' || user?.role === 'super_admin') {
          if (adminConfig[path]) {
            return adminConfig[path];
          }
        }
        
        return baseConfig[path] || { max: 100, window: 60000 };  // Default
      }
    `,
    
    rationale: 'Legitimate admin bulk operations should not be blocked, but admin accounts can still be compromised - keep limits on user-facing endpoints'
  },
  
  /**
   * MOBILE CLIENT RETRY LOGIC (Edge.2)
   * Clear Retry-After headers for client-side retry
   */
  mobile_client_retry: {
    
    problem: {
      // Edge.2: Mobile clients with poor connectivity
      scenario: 'User on poor mobile connection - request fails - app retries automatically',
      issue: 'Client retry logic may trigger rate limits',
      example: `
        User clicks "Submit Booking" button
        Request times out (poor connectivity)
        App retries 3 times in quick succession
        4 requests in 5 seconds
        User clicks button again (frustrated)
        Total: 8 requests in 10 seconds
        Result: Rate limit triggered
      `
    },
    
    solution: {
      // Edge.2: Clear Retry-After headers
      server_side: 'Always include Retry-After header in 429 responses',
      client_side: 'Mobile app should respect Retry-After header and disable retry button',
      
      client_implementation: `
        // Mobile app retry logic
        async function submitBooking(data) {
          try {
            const response = await fetch('/api/booking', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            
            if (response.status === 429) {
              // Rate limit exceeded
              const retryAfter = parseInt(response.headers.get('Retry-After'));
              
              // Disable submit button
              setButtonDisabled(true);
              
              // Show countdown to user
              showMessage(\`Too many requests. Please wait \${retryAfter} seconds.\`);
              
              // Re-enable after countdown
              setTimeout(() => {
                setButtonDisabled(false);
              }, retryAfter * 1000);
              
              return;
            }
            
            // Handle other responses
          } catch (error) {
            // Network error - do NOT retry automatically if rate limited
            console.error('Request failed', error);
          }
        }
      `
    }
  },
  
  /**
   * DISTRIBUTED ATTACK DEFENSE (Errors.2)
   * Rate limiting + CAPTCHA + behavioral detection
   */
  distributed_attack: {
    
    problem: {
      // Errors.2: Rate limits per-IP can be circumvented by botnet
      scenario: 'Attacker uses botnet with 1000 IPs - each IP makes 9 login attempts (under 10/min limit)',
      result: '9000 login attempts per minute - rate limiting ineffective'
    },
    
    defense_in_depth: {
      layer_1: {
        name: 'Rate Limiting (F-011)',
        defense: 'Per-IP limits prevent single-source attacks',
        limitation: 'Ineffective against distributed botnets'
      },
      
      layer_2: {
        name: 'CAPTCHA (F-023)',
        defense: 'Bot detection - requires human interaction',
        limitation: 'User friction - only use on sensitive endpoints'
      },
      
      layer_3: {
        name: 'Behavioral Detection (F-014)',
        defense: 'Pattern analysis - detect coordinated attacks',
        examples: [
          'Many IPs attempting same username',
          'Requests from datacenter IPs',
          'Unusual request patterns'
        ]
      },
      
      combined: 'All three layers together provide robust defense'
    }
  },
  
  /**
   * DAILY AGGREGATE REPORT (Audit.2)
   * Top rate-limited IPs and users
   */
  daily_report: {
    
    requirement: {
      // Audit.2: Daily aggregate report in admin dashboard
      frequency: 'Daily',
      content: [
        'Top 10 rate-limited IP addresses',
        'Top 10 rate-limited users',
        'Most rate-limited endpoints',
        'Total breach count per endpoint'
      ]
    },
    
    implementation: `
      // Daily scheduled job
      async function generateRateLimitReport() {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const breaches = await base44.entities.RateLimitLog.filter({
          breach_timestamp: { $gte: yesterday.toISOString() }
        });
        
        // Aggregate by IP
        const byIP = {};
        breaches.forEach(breach => {
          byIP[breach.ip_address] = (byIP[breach.ip_address] || 0) + 1;
        });
        
        // Aggregate by user
        const byUser = {};
        breaches.forEach(breach => {
          if (breach.user_id) {
            byUser[breach.user_id] = (byUser[breach.user_id] || 0) + 1;
          }
        });
        
        // Aggregate by endpoint
        const byEndpoint = {};
        breaches.forEach(breach => {
          byEndpoint[breach.endpoint] = (byEndpoint[breach.endpoint] || 0) + 1;
        });
        
        // Generate report
        const report = {
          date: yesterday.toISOString().split('T')[0],
          top_ips: Object.entries(byIP)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10),
          top_users: Object.entries(byUser)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10),
          by_endpoint: byEndpoint,
          total_breaches: breaches.length
        };
        
        // Store report or send to admins
        await base44.entities.DailyRateLimitReport.create(report);
        
        return report;
      }
    `
  }
};

/**
 * ============================================================================
 * OPTIONAL: RATE LIMIT LOG ENTITY
 * For tracking breaches and generating daily reports
 * ============================================================================
 */
const OPTIONAL_ENTITY = {
  
  entity_name: 'RateLimitLog',
  purpose: 'Track rate limit breaches for abuse escalation and daily reports',
  note: 'Optional - can use external logging (Sentry) instead',
  
  schema: {
    endpoint: 'Text - The endpoint that was rate limited',
    ip_address: 'Text - IP address of requester',
    user_id: 'Relation:User - User ID if authenticated (nullable)',
    request_count: 'Number - How many requests at time of breach',
    limit_threshold: 'Number - The rate limit threshold',
    breach_timestamp: 'DateTime - When the breach occurred'
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F011_CONFIGURATION_CHECKLIST = [
  {
    category: 'Counter Store Setup',
    tasks: [
      { task: 'Determine if Base44 provides in-memory cache API', status: 'pending' },
      { task: 'If no native cache: Set up Redis instance', status: 'pending' },
      { task: 'Add REDIS_URL to Base44 environment variables (if using Redis)', status: 'pending' },
      { task: 'Test counter increment and TTL operations', status: 'pending' }
    ]
  },
  {
    category: 'Rate Limiting Middleware',
    tasks: [
      { task: 'Implement rateLimitMiddleware function', status: 'pending' },
      { task: 'Implement incrementCounter with rolling window logic', status: 'pending' },
      { task: 'Implement getRateLimitKey (IP for unauth, user_id for auth)', status: 'pending' },
      { task: 'Configure rate limits per endpoint (Data.2)', status: 'pending' }
    ]
  },
  {
    category: 'Endpoint Configuration',
    tasks: [
      { task: 'Login: 10 requests/min per IP', status: 'pending' },
      { task: 'Registration: CAPTCHA required (light rate limit optional)', status: 'pending' },
      { task: 'Booking: 20 requests/min per user_id', status: 'pending' },
      { task: 'Messages: 30 messages/min per user_id', status: 'pending' },
      { task: 'Search: 60 requests/min per session_id', status: 'pending' }
    ]
  },
  {
    category: '429 Response Implementation',
    tasks: [
      { task: 'Return 429 status on limit exceeded', status: 'pending' },
      { task: 'Include Retry-After header with seconds until reset', status: 'pending' },
      { task: 'User-friendly error message (UI.1)', status: 'pending' },
      { task: 'Do NOT expose internal rate limit details', status: 'pending' }
    ]
  },
  {
    category: 'Fail Open Behavior',
    tasks: [
      { task: 'Wrap rate limiting in try-catch (Errors.1)', status: 'pending' },
      { task: 'On error: allow request to proceed (fail open)', status: 'pending' },
      { task: 'Send operator alert when rate limiting unavailable', status: 'pending' },
      { task: 'Test: Redis down → requests allowed + alert sent', status: 'pending' }
    ]
  },
  {
    category: 'Abuse Escalation',
    tasks: [
      { task: 'Log every rate limit breach (Audit.1)', status: 'pending' },
      { task: 'Implement checkRateLimitAbuse function', status: 'pending' },
      { task: 'After 3 breaches in 1 hour → flag for IP blocking (Abuse.2)', status: 'pending' },
      { task: 'Create IPBlocklist entry (F-014 integration)', status: 'pending' }
    ]
  },
  {
    category: 'Admin Elevated Limits',
    tasks: [
      { task: 'Define admin-specific endpoints needing elevated limits', status: 'pending' },
      { task: 'Implement getRateLimitConfig with role-based logic', status: 'pending' },
      { task: 'Verify: Admin endpoints have elevated limits', status: 'pending' },
      { task: 'Verify: User-facing endpoints have SAME limits for admins', status: 'pending' }
    ]
  },
  {
    category: 'Daily Report',
    tasks: [
      { task: 'Implement generateRateLimitReport scheduled job', status: 'pending' },
      { task: 'Aggregate by IP, user, endpoint', status: 'pending' },
      { task: 'Create DailyRateLimitReport entity (or send email)', status: 'pending' },
      { task: 'Schedule daily at 2 AM', status: 'pending' }
    ]
  },
  {
    category: 'Testing',
    tasks: [
      { task: 'Test: 11 login attempts from same IP → 11th returns 429', status: 'pending' },
      { task: 'Test: 21 booking requests from same user → 21st returns 429', status: 'pending' },
      { task: 'Test: Retry-After header present in 429 response', status: 'pending' },
      { task: 'Test: Rolling window (not fixed) - burst at boundary still limited', status: 'pending' },
      { task: 'Test: 3 breaches in 1 hour → IP blocked (Abuse.2)', status: 'pending' },
      { task: 'Test: Redis down → requests allowed (fail open) + alert', status: 'pending' }
    ]
  }
];

/**
 * ============================================================================
 * ACCEPTANCE CRITERIA
 * ============================================================================
 */
const ACCEPTANCE_TESTS = [
  {
    test: 'Login Rate Limit',
    steps: [
      'Make 10 POST /auth/login requests from same IP within 60 seconds',
      'Verify: All 10 succeed',
      'Make 11th request from same IP',
      'Verify: Returns 429 with Retry-After header',
      'Wait for Retry-After seconds',
      'Make 12th request',
      'Verify: Succeeds (window reset)'
    ]
  },
  {
    test: 'Booking Rate Limit',
    steps: [
      'Login as user',
      'Make 20 POST /api/booking requests within 60 seconds',
      'Verify: All 20 succeed',
      'Make 21st request',
      'Verify: Returns 429 with Retry-After header',
      'Verify: user_id used as rate limit key (not IP)'
    ]
  },
  {
    test: 'Message Rate Limit',
    steps: [
      'Login as user',
      'Send 30 messages within 60 seconds',
      'Verify: All 30 succeed',
      'Send 31st message',
      'Verify: Returns 429'
    ]
  },
  {
    test: 'Search Rate Limit',
    steps: [
      'Make 60 GET /api/search requests with same session_id',
      'Verify: All 60 succeed',
      'Make 61st request',
      'Verify: Returns 429'
    ]
  },
  {
    test: 'Rolling Window',
    steps: [
      'At 12:00:00 - Make 10 login attempts',
      'At 12:00:30 - Make 11th attempt',
      'Verify: Returns 429 (still within 60-second window)',
      'At 12:01:01 - Make 12th attempt',
      'Verify: Succeeds (first 10 are now >60 seconds old)'
    ]
  },
  {
    test: 'Retry-After Header',
    steps: [
      'Trigger rate limit (11th login attempt)',
      'Check response headers',
      'Verify: Retry-After header present',
      'Verify: Value is integer (seconds until reset)',
      'Verify: Response body includes retry_after field'
    ]
  },
  {
    test: 'User-Friendly Message',
    steps: [
      'Trigger rate limit',
      'Check response body',
      'Verify: Message is user-friendly (UI.1)',
      'Verify: No internal details exposed (e.g., "Redis key", "counter")'
    ]
  },
  {
    test: 'Abuse Escalation',
    steps: [
      'Trigger rate limit breach 3 times from same IP within 1 hour',
      'Verify: IPBlocklist entry created (Abuse.2)',
      'Verify: Admin alert sent',
      'Verify: 4th request returns 403 (IP blocked, not 429)'
    ]
  },
  {
    test: 'Admin Elevated Limits',
    steps: [
      'Login as trust_admin',
      'Make 21 requests to admin-specific endpoint (e.g., /api/admin/verify-caregiver)',
      'Verify: All succeed (elevated limit of 100/min)',
      'Make 11 login attempts (user-facing endpoint)',
      'Verify: 11th returns 429 (SAME limit as normal users)'
    ]
  },
  {
    test: 'Fail Open',
    steps: [
      'Disconnect Redis/cache (simulate unavailability)',
      'Make login request',
      'Verify: Request succeeds (fail open)',
      'Verify: Operator alert sent',
      'Verify: Error logged to Sentry'
    ]
  },
  {
    test: 'Rate Limit Logging',
    steps: [
      'Trigger rate limit breach',
      'Check RateLimitLog entity (or Sentry)',
      'Verify: Entry created with endpoint, IP, user_id, count, threshold, timestamp'
    ]
  },
  {
    test: 'Daily Report',
    steps: [
      'Trigger multiple rate limit breaches',
      'Run generateRateLimitReport job',
      'Verify: Report shows top IPs, users, endpoints',
      'Verify: Total breach count accurate'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - In-memory cache API (or Redis integration)
 * - Middleware hooks for rate limiting (pre-request validation)
 * - Environment variable support (REDIS_URL)
 * 
 * Supporting Entities (Optional):
 * - RateLimitLog: Track breaches for abuse escalation and reports
 * - DailyRateLimitReport: Store daily aggregates
 * 
 * Integration with Other Features:
 * - F-003: IPBlocklist (abuse escalation - Abuse.2)
 * - F-010: Structured logging (log breaches to Sentry)
 * - F-014: Behavioral detection (defense in depth - Errors.2)
 * - F-023: CAPTCHA (registration bot prevention)
 * 
 * CRITICAL WARNINGS:
 * - Access.1: Rate limits apply to ALL roles (no admin exemption on user-facing endpoints)
 * - Logic.2: Rolling windows required (not fixed)
 * - Triggers.1: Use in-memory store (NOT main database)
 * - Errors.1: Fail open if rate limiting unavailable
 * - Errors.2: Per-IP limits insufficient against botnets - combine with CAPTCHA and behavioral detection
 * - Edge.1: Admin elevated limits ONLY on admin endpoints
 * - Edge.2: Clear Retry-After headers for mobile client retry logic
 * 
 * NEXT STEPS:
 * 1. Set up Redis (or verify Base44 cache API)
 * 2. Implement rate limiting middleware
 * 3. Configure rate limits per endpoint
 * 4. Implement fail open behavior
 * 5. Implement abuse escalation (3 breaches → IP block)
 * 6. Implement daily report generation
 * 7. Test all acceptance criteria
 */

export default function F011RateLimitingDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-011: API Rate Limiting - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Documentation complete</p>
      <p><strong>Next Step:</strong> Configure Redis/cache + implement rate limiting middleware</p>
      
      <h2>Rate Limit Thresholds (Data.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Endpoint</th>
            <th>Limit</th>
            <th>Scope</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>POST /auth/login</td>
            <td>10/min</td>
            <td>per IP</td>
            <td>Brute-force prevention</td>
          </tr>
          <tr>
            <td>POST /auth/register</td>
            <td>CAPTCHA</td>
            <td>per IP</td>
            <td>Bot prevention</td>
          </tr>
          <tr>
            <td>POST /api/booking</td>
            <td>20/min</td>
            <td>per user_id</td>
            <td>Spam prevention</td>
          </tr>
          <tr>
            <td>POST /api/messages</td>
            <td>30/min</td>
            <td>per user_id</td>
            <td>Harassment prevention</td>
          </tr>
          <tr>
            <td>GET /api/search</td>
            <td>60/min</td>
            <td>per session</td>
            <td>Scraping prevention</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Critical Requirements</h2>
      <ul>
        <li><strong>Rolling Windows (Logic.2):</strong> Rate limits use rolling 60-second windows, not fixed clock minutes</li>
        <li><strong>In-Memory Store (Triggers.1):</strong> Redis or Base44 cache - NOT main database</li>
        <li><strong>Fail Open (Errors.1):</strong> If rate limiting unavailable → allow requests + alert operators</li>
        <li><strong>429 Response (Logic.1):</strong> Return 429 with Retry-After header (seconds until reset)</li>
        <li><strong>All Roles Subject (Access.1):</strong> Rate limits apply to everyone - no admin exemption</li>
      </ul>
      
      <h2>Response on Limit Exceeded (Logic.1)</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`HTTP/1.1 429 Too Many Requests
Retry-After: 42

{
  "error": "Too many login attempts. Please wait 42 seconds and try again.",
  "retry_after": 42
}`}
      </pre>
      
      <h2>Abuse Escalation (Abuse.2)</h2>
      <ul>
        <li><strong>Threshold:</strong> 3 rate limit breaches within 1 hour from same source</li>
        <li><strong>Action:</strong> Flag for IP blocking review (create IPBlocklist entry)</li>
        <li><strong>Integration:</strong> F-014 IP blocking</li>
      </ul>
      
      <h2>Admin Elevated Limits (Edge.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Endpoint Type</th>
            <th>Admin Limit</th>
            <th>Normal Limit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Admin-specific (e.g., verify caregiver)</td>
            <td>100/min</td>
            <td>N/A (admin-only)</td>
          </tr>
          <tr>
            <td>User-facing (login, booking, messages)</td>
            <td><strong>SAME</strong></td>
            <td>10/20/30 per min</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Fail Open Behavior (Errors.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>CRITICAL: Availability over security degradation</strong>
        <ul>
          <li>If Redis/cache unavailable → allow ALL requests (fail open)</li>
          <li>Send immediate operator alert</li>
          <li>Brief window of unthrottled traffic is acceptable</li>
          <li>Complete platform outage is NOT acceptable</li>
        </ul>
      </div>
      
      <h2>Defense in Depth (Errors.2)</h2>
      <ul>
        <li><strong>Layer 1:</strong> Rate Limiting (F-011) - per-IP/user limits</li>
        <li><strong>Layer 2:</strong> CAPTCHA (F-023) - bot detection</li>
        <li><strong>Layer 3:</strong> Behavioral Detection (F-014) - pattern analysis</li>
        <li><strong>Note:</strong> Per-IP rate limits alone ineffective against botnets</li>
      </ul>
      
      <h2>Daily Report (Audit.2)</h2>
      <ul>
        <li>Top 10 rate-limited IPs</li>
        <li>Top 10 rate-limited users</li>
        <li>Most rate-limited endpoints</li>
        <li>Total breach count per endpoint</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Set up Redis (or verify Base44 cache API)</li>
        <li>Implement rate limiting middleware with rolling windows</li>
        <li>Configure limits per endpoint (Data.2)</li>
        <li>Implement 429 responses with Retry-After headers</li>
        <li>Implement fail open behavior (Errors.1)</li>
        <li>Implement abuse escalation (3 breaches → IP block)</li>
        <li>Implement admin elevated limits (Edge.1)</li>
        <li>Implement daily report generation (Audit.2)</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete implementation examples, Redis configuration, and testing procedures.</em></p>
    </div>
  );
}