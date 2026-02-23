/**
 * F-014: IP BLOCKING & ABUSE DETECTION CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-014
 * IP Blocking & Abuse Detection. Automatically blocks abusive IPs and alerts admins
 * when patterns indicate coordinated attacks or individual abuse.
 * 
 * STATUS: Phase 0 - Entities created (BlockedIP, AbuseAlert)
 * NEXT STEP: Implement IP block middleware + automatic blocking triggers
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F014_IP_BLOCKING_SPECIFICATION = {
  
  /**
   * ENTITY SCHEMAS (Data.1-2)
   * BlockedIP and AbuseAlert collections
   */
  entity_schemas: {
    
    blocked_ip: {
      entity: 'BlockedIP',
      purpose: 'Track blocked IP addresses with expiry',
      
      fields: {
        id: 'UUID (auto)',
        ip_address: 'Text (required) - IP to block',
        blocked_by_admin_id: 'Relation:User - Admin who blocked (or SYSTEM)',
        reason: 'Select - Why IP was blocked',
        reason_detail: 'Text - Additional detail',
        blocked_at: 'DateTime (auto) - When block created',
        expires_at: 'DateTime (nullable) - When block expires (null = permanent)',
        is_permanent: 'Boolean - True if permanent block'
      },
      
      access_control: {
        // Access.1
        read: ['auth_middleware', 'support_admin', 'trust_admin', 'super_admin'],
        write: ['support_admin', 'trust_admin', 'super_admin', 'system_automation'],
        
        critical: 'Auth middleware MUST be able to read BlockedIP on every request'
      }
    },
    
    abuse_alert: {
      entity: 'AbuseAlert',
      purpose: 'Track detected abuse patterns for admin review',
      
      fields: {
        id: 'UUID (auto)',
        alert_type: 'Select - Type of abuse detected',
        source_ip: 'Text (nullable) - IP that triggered alert',
        source_user_id: 'Relation:User (nullable) - User that triggered alert',
        description: 'Text (required) - Human-readable description',
        severity: 'Select - low, medium, high, critical',
        triggered_at: 'DateTime (auto) - When alert was triggered',
        reviewed: 'Boolean (default false) - Whether admin reviewed',
        reviewed_by_admin_id: 'Relation:User - Admin who reviewed',
        reviewed_at: 'DateTime - When reviewed',
        action_taken: 'Text - What action was taken',
        metadata: 'Text JSON - Additional context'
      },
      
      access_control: {
        // Access.2
        read: ['support_admin', 'trust_admin', 'super_admin'],
        write: ['system_automation'],
        user_visibility: 'Admins only - users cannot see abuse alerts'
      }
    }
  },
  
  /**
   * IP BLOCK CHECK MIDDLEWARE (Logic.1-2)
   * Check every request against BlockedIP
   */
  ip_block_middleware: {
    
    requirement: {
      // Logic.1: Check on every request
      when: 'First check in request pipeline - before authentication, before rate limiting',
      check: 'Query BlockedIP for active block on request IP',
      on_blocked: 'Return 403 immediately - do not execute business logic',
      on_not_blocked: 'Continue to next middleware'
    },
    
    performance: {
      // Logic.2: Must be fast - indexed lookup
      requirement: 'BlockedIP query must complete in <10ms',
      index: 'ip_address field must be indexed',
      rationale: 'This check runs on EVERY request - slow query degrades entire platform',
      
      base44_configuration: `
        BlockedIP entity → Indexes:
        - Index 1: ip_address (unique)
        
        Expected query time: <10ms
        Without index: >500ms for large collections
      `
    },
    
    implementation: `
      // IP block check middleware
      async function checkIPBlock(req, res, next) {
        try {
          const clientIP = getClientIP(req);  // Edge.2: Get real IP
          
          // Logic.1: Query BlockedIP
          const now = new Date();
          const blocks = await base44.entities.BlockedIP.filter({
            ip_address: clientIP
          });
          
          // States.1: Check if block is active
          for (const block of blocks) {
            const isActive = !block.expires_at || new Date(block.expires_at) > now;
            
            if (isActive) {
              // IP is blocked - return 403 immediately
              console.warn('Blocked IP attempted access', {
                ip: clientIP,
                block_id: block.id,
                reason: block.reason
              });
              
              // UI.2: Generic 403 page
              return res.status(403).send('Access Forbidden');
            }
          }
          
          // No active block - continue
          next();
        } catch (error) {
          // Edge.1: BlockedIP query failed - fail open
          console.error('BlockedIP check failed - failing open', {
            error: error.message,
            ip: req.ip
          });
          
          await sendOperatorAlert({
            severity: 'CRITICAL',
            title: 'IP block check unavailable',
            details: 'BlockedIP query failed - blocking NOT enforced'
          });
          
          // Allow request (fail open)
          next();
        }
      }
      
      // Apply to all routes
      app.use(checkIPBlock);
    `,
    
    real_ip_detection: {
      // Edge.2: Get real client IP (not spoofed)
      challenge: 'Client can spoof X-Forwarded-For header',
      solution: 'Use platform-provided real IP (Base44 hosting should provide this)',
      
      implementation: `
        function getClientIP(req) {
          // Edge.2: Read from trusted source only
          
          // Option 1: Base44 provides real IP (preferred)
          if (req.realIP) {
            return req.realIP;  // Trusted platform-provided IP
          }
          
          // Option 2: Behind trusted proxy (CloudFlare, AWS ALB)
          // Only trust X-Forwarded-For if behind known proxy
          if (req.headers['cf-connecting-ip']) {
            return req.headers['cf-connecting-ip'];  // CloudFlare
          }
          
          // Option 3: Direct connection
          return req.connection.remoteAddress;
          
          // NEVER trust X-Forwarded-For from untrusted sources:
          // const spoofedIP = req.headers['x-forwarded-for'];  // WRONG - client can set this
        }
      `,
      
      verification: 'Test: Set X-Forwarded-For header in request → verify not used for blocking'
    }
  },
  
  /**
   * AUTOMATIC BLOCKING TRIGGERS (Triggers.1-2)
   * When to auto-block IPs
   */
  automatic_blocking_triggers: {
    
    scraping_detection: {
      // Triggers.1: >100 requests/minute from same IP
      trigger: 'Same IP generates >100 requests/minute across ANY endpoints',
      block_duration: '24 hours (Triggers.2)',
      
      implementation: `
        // Monitor request volume per IP
        async function checkScrapingAbuse(ip) {
          const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
          
          // Count requests from this IP in last minute
          const requestCount = await getRequestCount(ip, oneMinuteAgo);
          
          if (requestCount >= 100) {
            // Triggers.1: Scraping detected - auto-block
            
            // Create BlockedIP entry
            await base44.asServiceRole.entities.BlockedIP.create({
              ip_address: ip,
              blocked_by_admin_id: 'SYSTEM',
              reason: 'scraping_detected',
              reason_detail: \`\${requestCount} requests in 1 minute\`,
              blocked_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),  // 24h
              is_permanent: false
            });
            
            // Create AbuseAlert
            await createAbuseAlert({
              alert_type: 'scraping_detected',
              source_ip: ip,
              description: \`Scraping detected: \${requestCount} requests/minute\`,
              severity: 'high',
              metadata: { request_count: requestCount }
            });
            
            // Audit.1: Log to AdminActionLog
            await base44.entities.AdminActionLog.create({
              admin_user_id: 'SYSTEM',
              admin_role: 'system',
              action_type: 'block_ip',
              target_entity_type: 'BlockedIP',
              target_entity_id: ip,
              reason: \`AUTOMATED: Scraping detected - \${requestCount} requests/minute\`,
              action_timestamp: new Date().toISOString()
            });
          }
        }
      `
    },
    
    credential_stuffing: {
      // Triggers.1: >20 failed logins across any accounts in 10 minutes
      trigger: '>20 failed login attempts across multiple accounts in 10 minutes',
      block_duration: '24 hours',
      integration: 'F-012 login brute-force protection',
      
      implementation: `
        // From F-012: After each failed login
        async function checkCredentialStuffingFromIP(ip) {
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          
          const failedLogins = await base44.entities.LoginFailureLog.filter({
            ip_address: ip,
            attempt_timestamp: { $gte: tenMinutesAgo.toISOString() }
          });
          
          // Count unique accounts targeted
          const uniqueAccounts = new Set(failedLogins.map(f => f.email_attempted));
          
          if (failedLogins.length >= 20 && uniqueAccounts.size >= 5) {
            // Credential stuffing detected - auto-block
            
            await base44.asServiceRole.entities.BlockedIP.create({
              ip_address: ip,
              blocked_by_admin_id: 'SYSTEM',
              reason: 'credential_stuffing',
              reason_detail: \`\${failedLogins.length} failed logins across \${uniqueAccounts.size} accounts in 10 minutes\`,
              blocked_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              is_permanent: false
            });
            
            await createAbuseAlert({
              alert_type: 'credential_stuffing',
              source_ip: ip,
              description: \`\${failedLogins.length} failed logins across \${uniqueAccounts.size} accounts\`,
              severity: 'high',
              metadata: {
                failed_login_count: failedLogins.length,
                unique_accounts: uniqueAccounts.size
              }
            });
          }
        }
      `
    },
    
    multiple_abuse_alerts: {
      // Triggers.1: IP flagged by 3 separate abuse alerts
      trigger: 'Same IP appears in 3+ different AbuseAlerts',
      block_duration: '24 hours',
      
      implementation: `
        // After creating each AbuseAlert
        async function checkMultipleAbuseAlerts(ip) {
          const alerts = await base44.entities.AbuseAlert.filter({
            source_ip: ip,
            reviewed: false
          });
          
          if (alerts.length >= 3) {
            // Multiple abuse patterns - auto-block
            
            await base44.asServiceRole.entities.BlockedIP.create({
              ip_address: ip,
              blocked_by_admin_id: 'SYSTEM',
              reason: 'multiple_abuse_alerts',
              reason_detail: \`Flagged by \${alerts.length} abuse alerts\`,
              blocked_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              is_permanent: false
            });
            
            await createAbuseAlert({
              alert_type: 'other',
              source_ip: ip,
              description: \`Multiple abuse patterns detected: \${alerts.length} alerts\`,
              severity: 'critical'
            });
          }
        }
      `
    },
    
    auto_block_summary: {
      triggers: [
        '>100 requests/minute → scraping',
        '>20 failed logins across accounts in 10 min → credential stuffing',
        '3+ abuse alerts from same IP → multiple patterns'
      ],
      duration: '24 hours (Triggers.2)',
      permanent_blocks: 'Require manual admin action'
    }
  },
  
  /**
   * ABUSE ALERT CREATION (Abuse.1-2)
   * Automatic alert generation
   */
  abuse_alert_creation: {
    
    triggers: {
      // Abuse.1: Automatic AbuseAlert creation
      rate_limit_breach: {
        trigger: 'Rate limit breached 3+ times from same source in 1 hour',
        integration: 'F-011 rate limiting',
        implementation: `
          // From F-011: After logging 3rd breach
          if (recentBreaches.length === 3) {
            await createAbuseAlert({
              alert_type: 'rate_limit_breach',
              source_ip: ip,
              source_user_id: user?.id,
              description: \`Rate limit breached 3 times in 1 hour\`,
              severity: 'medium',
              metadata: {
                breach_count: 3,
                endpoints: recentBreaches.map(b => b.endpoint)
              }
            });
          }
        `
      },
      
      login_flood: {
        trigger: 'Login flood detected (F-012 credential stuffing)',
        severity: 'high',
        integration: 'F-012 login brute-force'
      },
      
      message_flood: {
        trigger: 'Message flood detected (F-013)',
        severity: 'medium',
        integration: 'F-013 spam prevention'
      },
      
      permission_denial_spike: {
        trigger: 'Permission denial spike (F-003 MiddlewareRejectionLog)',
        definition: '>10 rejections in 10 minutes from same user',
        severity: 'medium',
        integration: 'F-003 middleware'
      }
    },
    
    email_notification: {
      // Abuse.2: Email on high severity alerts
      trigger: 'AbuseAlert created with severity = high or critical',
      
      implementation: `
        async function createAbuseAlert(alertData) {
          // Create alert
          const alert = await base44.asServiceRole.entities.AbuseAlert.create({
            ...alertData,
            triggered_at: new Date().toISOString(),
            reviewed: false
          });
          
          // Abuse.2: Email notification for high severity
          if (alertData.severity === 'high' || alertData.severity === 'critical') {
            await base44.integrations.Core.SendEmail({
              to: process.env.ADMIN_EMAIL,
              subject: \`[\${alertData.severity.toUpperCase()}] Abuse Alert: \${alertData.alert_type}\`,
              body: \`
                An abuse alert has been triggered:
                
                Type: \${alertData.alert_type}
                Severity: \${alertData.severity}
                Source IP: \${alertData.source_ip || 'N/A'}
                Source User: \${alertData.source_user_id || 'N/A'}
                
                Description: \${alertData.description}
                
                Review in admin dashboard: {{moderation_url}}
              \`
            });
          }
          
          return alert;
        }
      `
    }
  },
  
  /**
   * BLOCKED IP LIFECYCLE (States.1)
   * Active → Expired
   */
  blocked_ip_lifecycle: {
    
    states: {
      active: {
        state: 'Active',
        conditions: [
          'expires_at = null (permanent)',
          'OR expires_at > now (temporary, not yet expired)'
        ],
        behavior: 'IP is blocked - requests return 403'
      },
      
      expired: {
        state: 'Expired',
        conditions: ['expires_at <= now'],
        behavior: 'IP is NOT blocked - requests allowed'
      }
    },
    
    manual_removal: {
      // States.1: Admin can remove block at any time
      action: 'Admin clicks "Unblock" button in admin panel',
      method: 'DELETE BlockedIP record',
      logging: 'Logged to AdminActionLog (Audit.1)',
      
      implementation: `
        async function unblockIP(adminUser, blockId, reason) {
          // Get block record
          const block = await base44.entities.BlockedIP.read(blockId);
          
          // Delete block
          await base44.entities.BlockedIP.delete(blockId);
          
          // Audit.1: Log to AdminActionLog
          await base44.entities.AdminActionLog.create({
            admin_user_id: adminUser.id,
            admin_role: adminUser.role,
            action_type: 'unblock_ip',
            target_entity_type: 'BlockedIP',
            target_entity_id: block.ip_address,
            reason: reason,
            payload: JSON.stringify({
              previous_block: block
            }),
            action_timestamp: new Date().toISOString()
          });
          
          return { success: true };
        }
      `
    },
    
    automatic_expiry: {
      // States.1: Auto-blocks expire after 24 hours
      mechanism: 'Middleware checks expires_at on every request',
      no_cleanup_job: 'Expired blocks can remain in DB - checked on lookup',
      optional_cleanup: 'Scheduled job to delete expired blocks (keeps DB small)'
    }
  },
  
  /**
   * SHARED IP HANDLING (Errors.1)
   * Whitelist for legitimate users behind blocked IP
   */
  shared_ip_handling: {
    
    problem: {
      // Errors.1: Legitimate users behind shared IP
      scenario: 'Corporate office or university with shared NAT - one malicious user triggers IP block',
      impact: 'ALL users behind that IP are blocked',
      examples: [
        'Corporate NAT: 100 employees share 1 public IP',
        'University network: 5000 students share IP range',
        'Public WiFi: Coffee shop customers share IP'
      ]
    },
    
    solution: {
      approach: 'User-level whitelist - bypass IP block for specific user_id',
      
      implementation: `
        // Enhanced IP block middleware
        async function checkIPBlock(req, res, next) {
          const clientIP = getClientIP(req);
          const user = req.user;  // From auth middleware (if authenticated)
          
          // Check if IP is blocked
          const block = await getActiveBlock(clientIP);
          
          if (block) {
            // Errors.1: Check if user is whitelisted
            if (user && await isUserWhitelisted(user.id, clientIP)) {
              // User whitelisted - bypass IP block
              console.info('User whitelisted from blocked IP', {
                user_id: user.id,
                ip: clientIP,
                block_id: block.id
              });
              
              return next();
            }
            
            // IP blocked and user not whitelisted
            return res.status(403).send('Access Forbidden');
          }
          
          next();
        }
        
        // Admin action: Whitelist user from blocked IP
        async function whitelistUserFromBlockedIP(adminUser, userId, ip, reason) {
          // Create whitelist entry
          await base44.entities.IPBlockWhitelist.create({
            user_id: userId,
            ip_address: ip,
            whitelisted_by_admin_id: adminUser.id,
            reason: reason,
            whitelisted_at: new Date().toISOString()
          });
          
          // Log to AdminActionLog
          await base44.entities.AdminActionLog.create({
            admin_user_id: adminUser.id,
            admin_role: adminUser.role,
            action_type: 'manual_override',
            target_entity_type: 'User',
            target_entity_id: userId,
            reason: reason,
            payload: JSON.stringify({
              action: 'whitelist_from_blocked_ip',
              ip_address: ip
            }),
            action_timestamp: new Date().toISOString()
          });
        }
      `,
      
      optional_entity: {
        entity_name: 'IPBlockWhitelist',
        purpose: 'Allow specific users through blocked IPs',
        schema: {
          user_id: 'Relation:User',
          ip_address: 'Text',
          whitelisted_by_admin_id: 'Relation:User',
          reason: 'Text',
          whitelisted_at: 'DateTime'
        }
      }
    }
  },
  
  /**
   * FAIL OPEN BEHAVIOR (Edge.1)
   * Allow requests if BlockedIP check fails
   */
  fail_open: {
    
    principle: {
      // Edge.1: Availability over security degradation
      rule: 'If BlockedIP query fails → allow request (fail open)',
      rationale: 'Brief window of unblocked abusive IPs acceptable; total platform outage is not',
      alert: 'Immediate operator alert when IP block check fails'
    },
    
    implementation: `
      // IP block middleware with fail-open
      async function checkIPBlock(req, res, next) {
        try {
          const block = await getActiveBlock(getClientIP(req));
          if (block) {
            return res.status(403).send('Access Forbidden');
          }
          next();
        } catch (error) {
          // Edge.1: BlockedIP check failed - fail open
          console.error('IP block check failed', error);
          
          await sendOperatorAlert({
            severity: 'CRITICAL',
            title: 'IP blocking unavailable',
            details: {
              error: error.message,
              impact: 'IP blocks NOT enforced - malicious IPs may access platform'
            }
          });
          
          // Allow request (fail open)
          next();
        }
      }
    `
  },
  
  /**
   * ADMIN UI (UI.1)
   * BlockedIP management + AbuseAlert queue
   */
  admin_ui: {
    
    blocked_ip_table: {
      // UI.1: BlockedIP management table
      features: [
        'List all blocked IPs',
        'Filter by: reason, blocked_by, active/expired',
        'Sort by: blocked_at (newest first)',
        'Show: IP, reason, blocked_by, expiry, unblock button'
      ],
      
      columns: [
        'IP Address',
        'Reason',
        'Blocked By',
        'Blocked At',
        'Expires At',
        'Status (Active/Expired)',
        'Actions (Unblock button)'
      ],
      
      unblock_action: {
        button: 'Unblock',
        requires_reason: true,
        confirmation: 'Are you sure you want to unblock this IP?',
        logging: 'Logged to AdminActionLog (Audit.1)'
      }
    },
    
    abuse_alert_queue: {
      // UI.1: AbuseAlert queue
      features: [
        'List all abuse alerts',
        'Filter by: reviewed/unreviewed, severity, alert_type',
        'Sort by: triggered_at (newest first)',
        'Mark as reviewed action',
        'Show: type, severity, source, description, timestamp'
      ],
      
      columns: [
        'Alert Type',
        'Severity',
        'Source IP',
        'Source User',
        'Description',
        'Triggered At',
        'Reviewed (checkbox)',
        'Actions (Review, Block IP, Block User)'
      ],
      
      review_action: {
        button: 'Mark Reviewed',
        updates: {
          reviewed: true,
          reviewed_by_admin_id: 'admin.id',
          reviewed_at: 'now',
          action_taken: 'Admin input (e.g., "IP blocked", "false positive")'
        },
        logging: 'Audit.2: Reviewed flag updated'
      }
    }
  },
  
  /**
   * USER-FACING UI (UI.2)
   * Generic 403 page for blocked IPs
   */
  user_facing_ui: {
    
    blocked_user_experience: {
      // UI.2: Generic 403 page
      http_status: 403,
      page: 'Generic 403 Forbidden page',
      
      message: 'Access Forbidden',
      
      forbidden_information: [
        'Why you are blocked',
        'When block expires',
        'Your IP address',
        'Block reason',
        'How to appeal'
      ],
      
      allowed_information: [
        'Generic "Access Forbidden" message',
        'Contact support link (optional)'
      ],
      
      rationale: 'Do not reveal security details to potential attackers'
    }
  }
};

/**
 * ============================================================================
 * OPTIONAL SUPPORTING ENTITY
 * ============================================================================
 */
const OPTIONAL_ENTITY = {
  
  ip_block_whitelist: {
    entity_name: 'IPBlockWhitelist',
    purpose: 'Allow specific users through blocked IPs (Errors.1)',
    
    schema: {
      user_id: 'Relation:User - User to whitelist',
      ip_address: 'Text - Blocked IP they should bypass',
      whitelisted_by_admin_id: 'Relation:User - Admin who whitelisted',
      reason: 'Text - Why user was whitelisted',
      whitelisted_at: 'DateTime - When whitelist created'
    },
    
    use_case: 'Legitimate user behind shared IP (corporate NAT, university)'
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F014_CONFIGURATION_CHECKLIST = [
  {
    category: 'Entity Configuration',
    tasks: [
      { task: 'BlockedIP entity created with all required fields', status: 'complete' },
      { task: 'AbuseAlert entity created with all required fields', status: 'complete' },
      { task: 'Add index: BlockedIP(ip_address) for fast lookup', status: 'pending' },
      { task: 'Configure permissions: BlockedIP writable by admin (Access.1)', status: 'pending' },
      { task: 'Configure permissions: AbuseAlert writable by system only (Access.2)', status: 'pending' }
    ]
  },
  {
    category: 'IP Block Middleware',
    tasks: [
      { task: 'Implement checkIPBlock middleware (Logic.1)', status: 'pending' },
      { task: 'Query BlockedIP on every request', status: 'pending' },
      { task: 'Check active status (expires_at > now or null)', status: 'pending' },
      { task: 'Return 403 if IP blocked', status: 'pending' },
      { task: 'Apply middleware BEFORE all routes', status: 'pending' }
    ]
  },
  {
    category: 'Real IP Detection',
    tasks: [
      { task: 'Implement getClientIP function (Edge.2)', status: 'pending' },
      { task: 'Use trusted platform-provided IP', status: 'pending' },
      { task: 'Do NOT trust X-Forwarded-For from client', status: 'pending' },
      { task: 'Test: Spoofed X-Forwarded-For ignored', status: 'pending' }
    ]
  },
  {
    category: 'Automatic Blocking',
    tasks: [
      { task: 'Implement scraping detection (>100 req/min)', status: 'pending' },
      { task: 'Implement credential stuffing detection (>20 fails in 10 min)', status: 'pending' },
      { task: 'Implement multiple alerts detection (3+ alerts)', status: 'pending' },
      { task: 'Auto-blocks expire after 24 hours (Triggers.2)', status: 'pending' },
      { task: 'Create BlockedIP entry on trigger', status: 'pending' },
      { task: 'Create AbuseAlert on trigger', status: 'pending' }
    ]
  },
  {
    category: 'Abuse Alert Creation',
    tasks: [
      { task: 'Implement createAbuseAlert function', status: 'pending' },
      { task: 'Trigger on: rate limit breach (3x in 1h)', status: 'pending' },
      { task: 'Trigger on: login flood (F-012)', status: 'pending' },
      { task: 'Trigger on: message flood (F-013)', status: 'pending' },
      { task: 'Trigger on: permission denial spike (>10 in 10 min)', status: 'pending' },
      { task: 'Email notification for high/critical severity (Abuse.2)', status: 'pending' }
    ]
  },
  {
    category: 'Fail Open Behavior',
    tasks: [
      { task: 'Wrap BlockedIP check in try-catch (Edge.1)', status: 'pending' },
      { task: 'On error: allow request (fail open)', status: 'pending' },
      { task: 'Send operator alert when check fails', status: 'pending' },
      { task: 'Test: Database down → requests allowed + alert sent', status: 'pending' }
    ]
  },
  {
    category: 'Shared IP Handling',
    tasks: [
      { task: 'Create IPBlockWhitelist entity (optional - Errors.1)', status: 'pending' },
      { task: 'Implement isUserWhitelisted function', status: 'pending' },
      { task: 'Admin action: Whitelist user from blocked IP', status: 'pending' },
      { task: 'Test: Whitelisted user can access from blocked IP', status: 'pending' }
    ]
  },
  {
    category: 'Admin UI',
    tasks: [
      { task: 'Create BlockedIPTable component (UI.1)', status: 'pending' },
      { task: 'Show: IP, reason, blocked_by, expiry, unblock button', status: 'pending' },
      { task: 'Create AbuseAlertQueue component (UI.1)', status: 'pending' },
      { task: 'Show: type, severity, source, description, review checkbox', status: 'pending' },
      { task: 'Filter: reviewed/unreviewed, severity', status: 'pending' }
    ]
  },
  {
    category: 'Logging & Audit',
    tasks: [
      { task: 'Log IP block creation to AdminActionLog (Audit.1)', status: 'pending' },
      { task: 'Log IP unblock to AdminActionLog (Audit.1)', status: 'pending' },
      { task: 'Log user whitelist to AdminActionLog', status: 'pending' },
      { task: 'AbuseAlert.reviewed flag tracks admin review (Audit.2)', status: 'pending' }
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
    test: 'IP Block Creation',
    steps: [
      'Admin creates IP block (IP: 203.0.113.42, reason: manual, expires: 24h)',
      'Verify: BlockedIP entry created',
      'Verify: expires_at = now + 24 hours',
      'Verify: AdminActionLog entry created'
    ]
  },
  {
    test: 'IP Block Enforcement',
    steps: [
      'Block IP 203.0.113.42',
      'Make request from that IP',
      'Verify: Returns 403 Forbidden',
      'Verify: Generic message (UI.2 - no details)',
      'Verify: Request blocked BEFORE authentication, rate limiting'
    ]
  },
  {
    test: 'IP Block Expiry',
    steps: [
      'Create IP block with expires_at = now + 1 minute',
      'Verify: Requests blocked for 1 minute',
      'Wait 1 minute',
      'Make request from same IP',
      'Verify: Request allowed (auto-expired - States.1)'
    ]
  },
  {
    test: 'Permanent Block',
    steps: [
      'Admin creates permanent block (expires_at = null)',
      'Verify: BlockedIP.is_permanent = true',
      'Wait 48 hours',
      'Make request from blocked IP',
      'Verify: Still blocked (permanent)'
    ]
  },
  {
    test: 'Manual Unblock',
    steps: [
      'Block IP',
      'Admin clicks "Unblock" button',
      'Verify: BlockedIP record deleted',
      'Verify: AdminActionLog entry created with action_type=unblock_ip',
      'Make request from unblocked IP',
      'Verify: Request allowed'
    ]
  },
  {
    test: 'Automatic Block - Scraping',
    steps: [
      'Send 101 requests in 1 minute from same IP',
      'Verify: After 100th request, BlockedIP created (Triggers.1)',
      'Verify: blocked_by_admin_id = SYSTEM',
      'Verify: reason = scraping_detected',
      'Verify: expires_at = now + 24 hours (Triggers.2)',
      'Verify: AbuseAlert created with severity=high',
      'Verify: Admin email notification sent (Abuse.2)'
    ]
  },
  {
    test: 'Automatic Block - Credential Stuffing',
    steps: [
      'Make 25 failed login attempts across 10 different accounts from same IP',
      'Verify: After 20th attempt, BlockedIP created',
      'Verify: reason = credential_stuffing',
      'Verify: AbuseAlert created'
    ]
  },
  {
    test: 'Automatic Block - Multiple Alerts',
    steps: [
      'Trigger 3 different abuse alerts from same IP',
      'Verify: After 3rd alert, BlockedIP created',
      'Verify: reason = multiple_abuse_alerts'
    ]
  },
  {
    test: 'Abuse Alert Creation',
    steps: [
      'Trigger rate limit 3 times from same IP in 1 hour',
      'Verify: AbuseAlert created with alert_type=rate_limit_breach',
      'Verify: severity set appropriately',
      'Verify: reviewed = false',
      'If severity=high, verify: Email sent to admin (Abuse.2)'
    ]
  },
  {
    test: 'Abuse Alert Review',
    steps: [
      'Admin opens AbuseAlert queue',
      'Admin clicks "Mark Reviewed" on alert',
      'Verify: reviewed = true',
      'Verify: reviewed_by_admin_id = admin.id',
      'Verify: reviewed_at = now'
    ]
  },
  {
    test: 'Shared IP Whitelist',
    steps: [
      'Block IP 203.0.113.42',
      'Admin whitelists user_abc123 for that IP',
      'Login as user_abc123 from 203.0.113.42',
      'Verify: Request allowed (Errors.1 whitelist bypass)',
      'Login as different user from same IP',
      'Verify: Request blocked (only whitelisted user bypasses)'
    ]
  },
  {
    test: 'Fail Open',
    steps: [
      'Simulate BlockedIP database unavailable',
      'Make request',
      'Verify: Request allowed (Edge.1)',
      'Verify: Operator alert sent',
      'Verify: Error logged to Sentry'
    ]
  },
  {
    test: 'Real IP Detection',
    steps: [
      'Make request with spoofed X-Forwarded-For header',
      'Verify: Real IP used for blocking, not spoofed header (Edge.2)',
      'Block real IP',
      'Make request with spoofed header',
      'Verify: Still blocked (spoofing ineffective)'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - Middleware hooks for IP blocking (pre-authentication)
 * - Database indexing on ip_address for performance
 * - Email integration for admin notifications
 * 
 * Supporting Entities:
 * - BlockedIP: Track blocked IPs with expiry
 * - AbuseAlert: Track detected abuse patterns
 * - IPBlockWhitelist (optional): Allow users through blocked IPs
 * 
 * Integration with Other Features:
 * - F-003: IPBlocklist (referenced by MiddlewareRejectionLog)
 * - F-010: Structured logging for IP blocks and alerts
 * - F-011: Rate limiting triggers abuse alerts
 * - F-012: Credential stuffing triggers IP blocks
 * - F-013: Spam detection triggers abuse alerts
 * 
 * CRITICAL WARNINGS:
 * - Logic.1: IP check runs on EVERY request - must be fast (<10ms)
 * - Logic.2: Database index REQUIRED on ip_address
 * - Triggers.1: Auto-blocks have specific trigger criteria
 * - Triggers.2: Auto-blocks expire after 24 hours (not permanent)
 * - Edge.1: Fail open if BlockedIP check fails
 * - Edge.2: Real IP detection - prevent header spoofing
 * - Errors.1: Shared IP handling - user whitelist solution
 * - Abuse.2: Email notification for high/critical alerts
 * 
 * NEXT STEPS:
 * 1. Add index to BlockedIP(ip_address)
 * 2. Implement IP block check middleware
 * 3. Implement automatic blocking triggers
 * 4. Implement AbuseAlert creation logic
 * 5. Implement fail open behavior
 * 6. Implement real IP detection
 * 7. Create admin UI components (BlockedIPTable, AbuseAlertQueue)
 * 8. Implement user whitelist for shared IPs
 * 9. Test all acceptance criteria
 */

export default function F014IPBlockingDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-014: IP Blocking & Abuse Detection - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Entities created (BlockedIP, AbuseAlert)</p>
      <p><strong>Next Step:</strong> Implement IP block middleware + automatic blocking triggers</p>
      
      <h2>Critical Requirements</h2>
      <ul>
        <li><strong>IP Check (Logic.1):</strong> Check BlockedIP on EVERY request (before auth, before business logic)</li>
        <li><strong>Performance (Logic.2):</strong> BlockedIP query must complete in &lt;10ms - index required</li>
        <li><strong>Fail Open (Edge.1):</strong> If BlockedIP check fails → allow request + alert operators</li>
        <li><strong>Real IP (Edge.2):</strong> Use platform-provided IP - prevent X-Forwarded-For spoofing</li>
        <li><strong>Auto-Block Duration (Triggers.2):</strong> 24 hours for automated blocks</li>
      </ul>
      
      <h2>Automatic Blocking Triggers (Triggers.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Trigger</th>
            <th>Threshold</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Scraping</td>
            <td>&gt;100 requests/minute from same IP</td>
            <td>24 hours</td>
          </tr>
          <tr>
            <td>Credential Stuffing</td>
            <td>&gt;20 failed logins across accounts in 10 min</td>
            <td>24 hours</td>
          </tr>
          <tr>
            <td>Multiple Abuse Alerts</td>
            <td>3+ AbuseAlerts from same IP</td>
            <td>24 hours</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Abuse Alert Triggers (Abuse.1)</h2>
      <ul>
        <li>Rate limit breached 3+ times from same source in 1 hour</li>
        <li>Login flood detected (F-012 credential stuffing)</li>
        <li>Message flood detected (F-013 spam prevention)</li>
        <li>Permission denial spike (&gt;10 rejections in 10 min)</li>
      </ul>
      
      <h2>Email Notifications (Abuse.2)</h2>
      <ul>
        <li><strong>Trigger:</strong> AbuseAlert created with severity = high or critical</li>
        <li><strong>Recipient:</strong> Admin email (from environment variables)</li>
        <li><strong>Content:</strong> Alert type, severity, source IP/user, description</li>
      </ul>
      
      <h2>BlockedIP Lifecycle (States.1)</h2>
      <ul>
        <li><strong>Active:</strong> expires_at = null OR expires_at &gt; now → IP blocked</li>
        <li><strong>Expired:</strong> expires_at &lt;= now → IP NOT blocked</li>
        <li><strong>Manual Removal:</strong> Admin can unblock at any time (logged to AdminActionLog)</li>
      </ul>
      
      <h2>Shared IP Handling (Errors.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>IMPORTANT: Corporate/University Shared IPs</strong>
        <ul>
          <li><strong>Problem:</strong> One malicious user → entire organization blocked</li>
          <li><strong>Solution:</strong> User-level whitelist (IPBlockWhitelist entity)</li>
          <li><strong>Process:</strong> Legitimate user contacts support → admin whitelists user_id</li>
          <li><strong>Result:</strong> Whitelisted user bypasses IP block, others remain blocked</li>
        </ul>
      </div>
      
      <h2>Real IP Detection (Edge.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Prevent IP spoofing</strong>
        <ul>
          <li>Use platform-provided real IP (req.realIP or trusted proxy)</li>
          <li>Do NOT trust X-Forwarded-For from untrusted sources</li>
          <li>Verify Base44 IP detection behavior</li>
          <li>Test: Spoofed header ignored</li>
        </ul>
      </div>
      
      <h2>Database Indexing (Logic.2)</h2>
      <ul>
        <li><strong>Index Required:</strong> BlockedIP(ip_address)</li>
        <li><strong>Reason:</strong> Query runs on EVERY request - must be fast</li>
        <li><strong>Target:</strong> &lt;10ms query time</li>
        <li><strong>Without Index:</strong> &gt;500ms - platform-wide slowdown</li>
      </ul>
      
      <h2>User-Facing UI (UI.2)</h2>
      <ul>
        <li><strong>Blocked Users See:</strong> Generic "Access Forbidden" page</li>
        <li><strong>Do NOT Show:</strong> Block reason, expiry time, IP address, how to appeal</li>
        <li><strong>Rationale:</strong> Do not reveal security details to attackers</li>
      </ul>
      
      <h2>Admin UI (UI.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Component</th>
            <th>Features</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>BlockedIP Table</td>
            <td>List all blocks, filter by reason, show expiry, unblock button</td>
          </tr>
          <tr>
            <td>AbuseAlert Queue</td>
            <td>List all alerts, filter by reviewed/severity, mark reviewed action</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Logging & Audit (Audit.1-2)</h2>
      <ul>
        <li><strong>IP Block (Audit.1):</strong> Logged to AdminActionLog (admin, IP, reason, duration)</li>
        <li><strong>IP Unblock (Audit.1):</strong> Logged to AdminActionLog</li>
        <li><strong>AbuseAlert (Audit.2):</strong> Reviewed flag tracks admin acknowledgment</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Add index: BlockedIP(ip_address)</li>
        <li>Implement checkIPBlock middleware</li>
        <li>Implement getClientIP with spoofing prevention</li>
        <li>Apply middleware to all routes (first check)</li>
        <li>Implement automatic blocking triggers (scraping, credential stuffing, multiple alerts)</li>
        <li>Implement createAbuseAlert function</li>
        <li>Implement email notifications for high/critical alerts</li>
        <li>Implement fail open behavior (Edge.1)</li>
        <li>Create IPBlockWhitelist entity for shared IPs (Errors.1)</li>
        <li>Create admin UI components (BlockedIPTable, AbuseAlertQueue)</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete implementation examples, automatic blocking logic, and shared IP handling.</em></p>
    </div>
  );
}