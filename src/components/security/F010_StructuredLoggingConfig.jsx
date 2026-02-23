/**
 * F-010: STRUCTURED ERROR & SYSTEM LOGGING CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-010
 * Structured Error & System Logging. External error tracking (e.g., Sentry) must
 * be configured before launch with proper PII scrubbing and alert thresholds.
 * 
 * STATUS: Phase 0 - Documentation complete
 * NEXT STEP: Configure external error tracking + implement PII scrubbing pipeline
 * 
 * ============================================================================
 * CRITICAL INFRASTRUCTURE REQUIREMENTS
 * ============================================================================
 */

const F010_STRUCTURED_LOGGING_SPECIFICATION = {
  
  /**
   * EXTERNAL ERROR TRACKING SERVICE (Data.1)
   * Sentry or equivalent configured before launch
   */
  external_error_tracking: {
    
    recommended_services: {
      sentry: {
        name: 'Sentry',
        url: 'https://sentry.io',
        features: [
          'Error tracking with stack traces',
          'Performance monitoring',
          'Release tracking',
          'User context (no PII)',
          'Alerting and integrations',
          'Source map support'
        ],
        pricing: 'Free tier available, paid plans scale with volume',
        why_recommended: 'Industry standard, excellent React/JavaScript support, Base44 integration-friendly'
      },
      
      alternatives: {
        rollbar: 'https://rollbar.com - Similar to Sentry',
        bugsnag: 'https://bugsnag.com - Mobile-first error tracking',
        datadog: 'https://datadoghq.com - Full observability platform'
      }
    },
    
    api_key_storage: {
      // Data.1: API key stored in environment variables
      where: 'Base44 environment variables',
      variable_name: 'SENTRY_DSN',  // Data Source Name
      format: 'https://<key>@<org>.ingest.sentry.io/<project>',
      
      configuration: `
        Base44 Dashboard → Settings → Environment Variables:
        
        Variable Name: SENTRY_DSN
        Variable Value: https://abc123def456@o123456.ingest.sentry.io/789012
        Environment: Production
        
        CRITICAL: Never commit DSN to Git
      `,
      
      verification: `
        // Test that Sentry is configured
        if (!process.env.SENTRY_DSN) {
          console.error('CRITICAL: Sentry DSN not configured');
        }
      `
    },
    
    initialization: {
      // Sentry SDK initialization example
      implementation: `
        // Initialize Sentry at app startup
        import * as Sentry from "@sentry/react";
        
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          environment: process.env.NODE_ENV,  // 'production', 'development'
          
          // Release tracking
          release: process.env.RELEASE_VERSION || 'unknown',
          
          // Performance monitoring (Triggers.2)
          tracesSampleRate: 0.1,  // Sample 10% of transactions for performance
          
          // PII scrubbing (Access.2, Edge.2)
          beforeSend(event, hint) {
            // Scrub PII before sending to Sentry
            event = scrubPII(event);
            return event;
          },
          
          // User context (NO PII - only user_id)
          beforeSendTransaction(event) {
            if (event.user) {
              // Remove email, phone, name - keep only ID
              event.user = {
                id: event.user.id,
                // Remove: email, username, name, phone
              };
            }
            return event;
          },
          
          // Ignore known non-critical errors
          ignoreErrors: [
            'Non-Error promise rejection',
            'ResizeObserver loop limit exceeded'
          ]
        });
      `
    }
  },
  
  /**
   * LOG LEVELS (Data.2)
   * info, warn, error, critical
   */
  log_levels: {
    
    info: {
      level: 'info',
      when: 'Normal operations - significant milestones only (Logic.2)',
      examples: [
        'Booking accepted',
        'User registered',
        'Payment processed',
        'Admin verified caregiver',
        'Scheduled job completed successfully'
      ],
      alerting: 'No alerts',
      retention: '30 days (optional - can be shorter)',
      
      usage: `
        // Info-level logging
        console.info('Booking accepted', {
          booking_id: booking.id,
          user_id: user.id,
          timestamp: new Date().toISOString()
        });
        
        // Or with Sentry breadcrumbs
        Sentry.addBreadcrumb({
          level: 'info',
          message: 'Booking accepted',
          data: { booking_id: booking.id }
        });
      `
    },
    
    warn: {
      level: 'warn',
      when: 'Unexpected but handled situations (Logic.2)',
      examples: [
        'API rate limit approaching',
        'Slow database query (>1 second)',
        'Deprecated feature used',
        'Soft-lock expired (booking timeout)',
        'Missing optional data (non-critical)'
      ],
      alerting: 'Aggregate alert if >100 warnings in 1 hour',
      retention: '90 days',
      
      usage: `
        // Warn-level logging
        console.warn('Slow query detected', {
          query: 'list_caregivers',
          duration_ms: 1500,
          threshold_ms: 1000
        });
        
        Sentry.captureMessage('Slow query detected', {
          level: 'warning',
          tags: { query_type: 'list_caregivers' },
          extra: { duration_ms: 1500 }
        });
      `
    },
    
    error: {
      level: 'error',
      when: 'Handled errors requiring investigation (Logic.2)',
      examples: [
        'API call failed (with retry)',
        'Validation error (user input rejected)',
        'Database constraint violation',
        'Third-party service timeout',
        'Expected error that was caught and handled'
      ],
      alerting: 'Alert if error rate >1% over 5 minutes (Triggers.2)',
      retention: '90 days minimum (Audit.2)',
      
      usage: `
        // Error-level logging
        try {
          await externalAPI.call();
        } catch (error) {
          console.error('API call failed', {
            api: 'stripe',
            error: error.message,
            user_id: user.id
          });
          
          Sentry.captureException(error, {
            level: 'error',
            tags: { api: 'stripe' },
            contexts: {
              user: { id: user.id }  // NO PII
            }
          });
          
          // Handle gracefully (retry, fallback, user message)
        }
      `
    },
    
    critical: {
      level: 'critical',
      when: 'Service degradation or data integrity risk (Logic.1)',
      examples: [
        'Unhandled exception (Logic.1)',
        'Database connection lost',
        'Encryption key unavailable (F-006)',
        'AdminActionLog or PIIAccessLog write failure',
        'Payment processing failure',
        'Data corruption detected'
      ],
      alerting: 'IMMEDIATE operator alert (email, SMS, Slack) (Logic.1)',
      retention: '12 months (Audit.2)',
      
      usage: `
        // Critical-level logging
        Sentry.captureException(error, {
          level: 'fatal',  // Sentry uses 'fatal' for critical
          tags: { 
            severity: 'critical',
            service: 'payment_processing'
          },
          contexts: {
            transaction: { id: transaction_id }
          }
        });
        
        // Also send immediate operator alert
        await sendOperatorAlert({
          severity: 'CRITICAL',
          title: 'Payment processing failure',
          details: { error: error.message }
        });
      `
    }
  },
  
  /**
   * LOG FIELDS (Data.3)
   * Required fields on every log entry
   */
  log_fields: {
    
    required_fields: {
      timestamp: {
        field: 'timestamp',
        type: 'ISO 8601 DateTime',
        auto: true,
        example: '2025-01-15T14:30:45.123Z',
        description: 'When the event occurred'
      },
      
      level: {
        field: 'level',
        type: 'Enum',
        values: ['info', 'warn', 'error', 'critical'],
        required: true,
        description: 'Severity level (Data.2)'
      },
      
      service_component: {
        field: 'service' or 'component',
        type: 'String',
        examples: [
          'booking_service',
          'payment_processing',
          'user_registration',
          'admin_verification',
          'email_automation'
        ],
        description: 'Which service/component generated the log',
        use_case: 'Filter logs by service for debugging'
      },
      
      message: {
        field: 'message',
        type: 'String',
        required: true,
        description: 'Human-readable description of the event',
        examples: [
          'Booking accepted',
          'API call failed',
          'Database query timeout'
        ]
      },
      
      user_id: {
        field: 'user_id',
        type: 'String (UUID)',
        nullable: true,
        description: 'User ID if authenticated (NO email, phone, name - Access.2)',
        when: 'Include if action was user-initiated'
      },
      
      session_id: {
        field: 'session_id',
        type: 'String',
        nullable: true,
        description: 'Session identifier for request correlation',
        use_case: 'Trace all logs for a single user session'
      },
      
      stack_trace: {
        field: 'stack_trace' or 'error.stack',
        type: 'String',
        required_for: 'error and critical levels',
        description: 'Full stack trace for debugging',
        scrubbing: 'Remove file paths containing PII (e.g., /Users/john.doe/...)'
      },
      
      record_ids: {
        field: 'booking_id', 'profile_id', 'message_id', etc.,
        type: 'Context-specific',
        description: 'IDs of relevant records',
        examples: {
          booking_error: 'booking_id, parent_profile_id, caregiver_profile_id',
          payment_failure: 'transaction_id, booking_id, user_id'
        }
      }
    },
    
    example_log_entry: {
      timestamp: '2025-01-15T14:30:45.123Z',
      level: 'error',
      service: 'booking_service',
      message: 'Failed to send booking acceptance email',
      user_id: 'user_abc123',
      session_id: 'sess_xyz789',
      error: {
        message: 'SMTP connection timeout',
        stack: 'Error: SMTP timeout\n  at sendEmail (email.js:42)\n  ...'
      },
      context: {
        booking_id: 'booking_def456',
        parent_user_id: 'user_abc123',
        caregiver_user_id: 'user_ghi789'
      }
    }
  },
  
  /**
   * PII SCRUBBING (Access.2, Edge.2)
   * Logs must not contain PII
   */
  pii_scrubbing: {
    
    prohibition: {
      // Access.2: No PII in logs
      forbidden: [
        'Email addresses',
        'Phone numbers',
        'Home addresses',
        'Full names',
        'Government IDs',
        'Bank account numbers',
        'Credit card numbers'
      ],
      allowed: [
        'User IDs (UUIDs)',
        'Record IDs',
        'Session IDs',
        'IP addresses (debatable - allowed for security analysis)'
      ]
    },
    
    scrubbing_pipeline: {
      // Edge.2: PII scrubbing pipeline
      when: 'Before log entries are sent to external service',
      where: 'Sentry beforeSend hook OR dedicated log processor',
      
      implementation: `
        function scrubPII(logEvent) {
          // Email regex
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          
          // Phone regex (various formats)
          const phoneRegex = /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
          
          // SSN regex
          const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
          
          // Credit card regex (simple - 13-16 digits with optional separators)
          const ccRegex = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{3,4}\b/g;
          
          // Scrub message
          if (logEvent.message) {
            logEvent.message = logEvent.message
              .replace(emailRegex, '[EMAIL_REDACTED]')
              .replace(phoneRegex, '[PHONE_REDACTED]')
              .replace(ssnRegex, '[SSN_REDACTED]')
              .replace(ccRegex, '[CC_REDACTED]');
          }
          
          // Scrub exception values
          if (logEvent.exception) {
            logEvent.exception.values = logEvent.exception.values.map(ex => {
              if (ex.value) {
                ex.value = ex.value
                  .replace(emailRegex, '[EMAIL_REDACTED]')
                  .replace(phoneRegex, '[PHONE_REDACTED]');
              }
              return ex;
            });
          }
          
          // Scrub breadcrumbs
          if (logEvent.breadcrumbs) {
            logEvent.breadcrumbs = logEvent.breadcrumbs.map(crumb => {
              if (crumb.message) {
                crumb.message = crumb.message
                  .replace(emailRegex, '[EMAIL_REDACTED]')
                  .replace(phoneRegex, '[PHONE_REDACTED]');
              }
              return crumb;
            });
          }
          
          // Remove user PII (keep only ID)
          if (logEvent.user) {
            logEvent.user = {
              id: logEvent.user.id
              // Remove: email, username, name, phone, ip_address
            };
          }
          
          return logEvent;
        }
        
        // Integrate with Sentry
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          beforeSend(event, hint) {
            return scrubPII(event);
          }
        });
      `
    },
    
    compliance_incident: {
      // Edge.2: PII accidentally included in log
      scenario: 'PII detected in log entry after initial scrubbing failed',
      classification: 'COMPLIANCE INCIDENT',
      response: [
        'Alert compliance officer immediately',
        'Manually redact PII from log entry in Sentry',
        'Investigate how PII bypassed scrubbing',
        'Update scrubbing regex patterns',
        'Document incident in security incident log'
      ]
    }
  },
  
  /**
   * UNHANDLED EXCEPTION HANDLING (Logic.1)
   * Critical logs + immediate alerts
   */
  unhandled_exceptions: {
    
    requirement: 'Every unhandled exception → critical log + operator alert (Logic.1)',
    
    global_error_handler: {
      client_side: `
        // React error boundary
        import React from 'react';
        import * as Sentry from '@sentry/react';
        
        class ErrorBoundary extends React.Component {
          componentDidCatch(error, errorInfo) {
            // Capture to Sentry as critical
            Sentry.captureException(error, {
              level: 'fatal',
              contexts: {
                react: { componentStack: errorInfo.componentStack }
              }
            });
            
            // Send operator alert
            fetch('/api/operator-alert', {
              method: 'POST',
              body: JSON.stringify({
                severity: 'CRITICAL',
                title: 'Unhandled React error',
                error: error.message,
                stack: error.stack
              })
            });
          }
          
          render() {
            if (this.state?.hasError) {
              return <ErrorFallbackUI />;
            }
            return this.props.children;
          }
        }
        
        // Wrap app in error boundary
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      `,
      
      server_side: `
        // Backend global error handler
        process.on('unhandledRejection', (reason, promise) => {
          console.error('Unhandled Promise Rejection', reason);
          
          Sentry.captureException(reason, {
            level: 'fatal',
            tags: { type: 'unhandled_rejection' }
          });
          
          sendOperatorAlert({
            severity: 'CRITICAL',
            title: 'Unhandled promise rejection',
            details: { reason: reason.message, stack: reason.stack }
          });
        });
        
        process.on('uncaughtException', (error) => {
          console.error('Uncaught Exception', error);
          
          Sentry.captureException(error, {
            level: 'fatal',
            tags: { type: 'uncaught_exception' }
          });
          
          sendOperatorAlert({
            severity: 'CRITICAL',
            title: 'Uncaught exception',
            details: { error: error.message, stack: error.stack }
          });
          
          // Graceful shutdown
          process.exit(1);
        });
      `
    }
  },
  
  /**
   * PERFORMANCE MONITORING (Triggers.2)
   * Response time and error rate alerts
   */
  performance_monitoring: {
    
    response_time_threshold: {
      // Triggers.2: Alert if response time exceeds 2 seconds p95
      metric: 'p95 response time',
      threshold: '2 seconds',
      window: '5 minutes',
      alert: 'Operator alert if threshold exceeded',
      
      sentry_configuration: `
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          
          // Performance monitoring
          tracesSampleRate: 0.1,  // Sample 10% of requests
          
          // Performance thresholds
          beforeSendTransaction(transaction) {
            // Flag slow transactions
            if (transaction.contexts?.trace?.duration > 2000) {
              transaction.tags = {
                ...transaction.tags,
                slow_transaction: 'true'
              };
            }
            return transaction;
          }
        });
        
        // Alert rule in Sentry dashboard:
        // "Alert when p95 response time > 2000ms over 5 minutes"
      `
    },
    
    error_rate_threshold: {
      // Triggers.2: Alert if error rate exceeds 1% over 5 minutes
      metric: 'Error rate',
      threshold: '1%',
      window: '5 minutes',
      alert: 'Operator alert if threshold exceeded',
      
      calculation: 'error_count / total_requests over 5-minute window',
      
      sentry_alert_rule: `
        // Configure in Sentry dashboard:
        // Metric: error_rate
        // Condition: error_rate > 1% for 5 minutes
        // Action: Send email/SMS/Slack to operators
      `
    }
  },
  
  /**
   * ABUSE DETECTION (Abuse.1)
   * Error spike detection
   */
  abuse_detection: {
    
    error_spike_threshold: {
      // Abuse.1: Alert if error rate increases >5x baseline in 10 minutes
      metric: 'Error rate vs baseline',
      threshold: '5x baseline',
      window: '10 minutes',
      alert: 'Critical operator alert',
      
      rationale: 'May indicate bug loop, scraping attack, or misconfigured automation',
      
      implementation: `
        // Monitor error rate over time
        const currentErrorRate = errorsInLast10Min / requestsInLast10Min;
        const baselineErrorRate = calculateBaseline();  // Historical average
        
        if (currentErrorRate > (baselineErrorRate * 5)) {
          // Trigger critical alert
          await sendOperatorAlert({
            severity: 'CRITICAL',
            title: 'Error spike detected',
            details: {
              current_rate: currentErrorRate,
              baseline_rate: baselineErrorRate,
              spike_multiplier: currentErrorRate / baselineErrorRate,
              window: '10 minutes'
            },
            actions: [
              'Check recent code deployments',
              'Review error logs for patterns',
              'Check for external service outages',
              'Consider rolling back recent changes'
            ]
          });
        }
      `,
      
      sentry_alert_rule: `
        // Configure in Sentry dashboard:
        // Metric: error_count
        // Condition: error_count > (5 * moving_average) for 10 minutes
        // Action: Critical alert to operators
      `
    },
    
    log_volume_spike: {
      // Errors.2: Alert if log volume increases 10x over baseline
      metric: 'Log volume',
      threshold: '10x baseline',
      alert: 'Warning alert to operators',
      
      causes: [
        'Bug loop (e.g., infinite retry)',
        'Scraping attack (many 404 errors)',
        'Misconfigured automation (logging too verbosely)',
        'DDoS attempt'
      ],
      
      implementation: 'Similar to error spike detection, but monitors total log volume'
    }
  },
  
  /**
   * DEGRADED LOGGING (Errors.1)
   * Fail open if error tracking unavailable
   */
  degraded_logging: {
    
    principle: 'Fail open - do not block users if logging is down (Errors.1)',
    
    detection: `
      // Detect if Sentry is unavailable
      let sentryAvailable = true;
      
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        beforeSend(event, hint) {
          // Test Sentry connectivity
          sentryAvailable = true;
          return event;
        }
      });
      
      // Monitor Sentry health
      setInterval(async () => {
        try {
          await Sentry.captureMessage('Health check', { level: 'info' });
          sentryAvailable = true;
        } catch (error) {
          sentryAvailable = false;
          console.error('Sentry unavailable - degraded logging mode');
          
          // Alert operators
          await sendOperatorAlert({
            severity: 'WARNING',
            title: 'Error tracking service unavailable',
            details: 'Sentry is unreachable - logging degraded'
          });
        }
      }, 60000);  // Check every minute
    `,
    
    fallback_behavior: {
      user_operations: 'Continue normally - do NOT block users',
      logging: 'Fall back to console.log + local file logging (if available)',
      alerting: 'Send operator alert immediately',
      recovery: 'Retry Sentry connection periodically'
    }
  },
  
  /**
   * CIRCULAR REFERENCE HANDLING (Edge.1)
   * Catch secondary exceptions in logging
   */
  circular_reference_handling: {
    
    problem: 'Log payload contains circular reference → JSON.stringify fails → logging itself throws error',
    
    solution: `
      function safeStringify(obj) {
        const seen = new WeakSet();
        
        return JSON.stringify(obj, (key, value) => {
          // Handle circular references
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular Reference]';
            }
            seen.add(value);
          }
          
          // Remove functions (not serializable)
          if (typeof value === 'function') {
            return '[Function]';
          }
          
          return value;
        });
      }
      
      // Wrap all logging in try-catch
      function safeLog(level, message, context) {
        try {
          const serialized = safeStringify(context);
          console[level](message, serialized);
          Sentry.captureMessage(message, { level, extra: context });
        } catch (error) {
          // Edge.1: Logging itself failed - simplified fallback
          console.error('Logging failed', {
            original_message: message,
            serialization_error: error.message
          });
          
          // Alert operators
          sendOperatorAlert({
            severity: 'WARNING',
            title: 'Logging serialization failure',
            details: { message, error: error.message }
          });
        }
      }
    `
  },
  
  /**
   * LOG RETENTION (Audit.2)
   * Minimum retention periods
   */
  log_retention: {
    
    retention_periods: {
      info_logs: {
        level: 'info',
        retention: '30 days',
        rationale: 'Normal operations - short retention acceptable'
      },
      
      warn_logs: {
        level: 'warn',
        retention: '90 days',
        rationale: 'May be useful for pattern detection'
      },
      
      error_logs: {
        level: 'error',
        retention: '90 days minimum (Audit.2)',
        rationale: 'Debugging and compliance investigation'
      },
      
      critical_logs: {
        level: 'critical',
        retention: '12 months (Audit.2)',
        rationale: 'Compliance and incident investigation'
      },
      
      audit_logs: {
        logs: 'AdminActionLog, PIIAccessLog',
        retention: '12 months minimum',
        rationale: 'Compliance requirement (F-008, F-009)'
      }
    },
    
    sentry_configuration: `
      // Configure retention in Sentry dashboard:
      // Settings → Data Management → Event Retention:
      // - info: 30 days
      // - warning: 90 days
      // - error: 90 days
      // - fatal: 365 days (12 months)
    `
  }
};

/**
 * ============================================================================
 * PRE-LAUNCH VERIFICATION (UI.2)
 * Test error tracking before go-live
 * ============================================================================
 */
const PRE_LAUNCH_VERIFICATION = {
  
  requirement: 'Send test error from each major automation and verify in Sentry (UI.2)',
  
  test_checklist: [
    {
      automation: 'User registration',
      test: 'Trigger validation error (e.g., duplicate email)',
      verify: 'Error appears in Sentry with user_id, level=error'
    },
    {
      automation: 'Booking acceptance',
      test: 'Simulate email send failure',
      verify: 'Error appears in Sentry with booking_id, level=error'
    },
    {
      automation: 'Payment processing',
      test: 'Simulate Stripe API timeout',
      verify: 'Critical error appears in Sentry + operator alert sent'
    },
    {
      automation: 'Admin verification',
      test: 'Simulate AdminActionLog write failure',
      verify: 'Critical error appears in Sentry + operator alert sent'
    },
    {
      automation: 'Scheduled job',
      test: 'Simulate unhandled exception in scheduled task',
      verify: 'Fatal error appears in Sentry + operator alert sent'
    }
  ],
  
  test_script: `
    // Pre-launch verification script
    async function verifyErrorTracking() {
      console.log('Starting error tracking verification...');
      
      // Test 1: Info log
      console.info('Test info log');
      Sentry.captureMessage('Test info message', { level: 'info' });
      
      // Test 2: Warning log
      console.warn('Test warning log');
      Sentry.captureMessage('Test warning message', { level: 'warning' });
      
      // Test 3: Error log
      try {
        throw new Error('Test error');
      } catch (error) {
        console.error('Test error log', error);
        Sentry.captureException(error, { level: 'error' });
      }
      
      // Test 4: Critical log + alert
      const testError = new Error('Test critical error');
      Sentry.captureException(testError, { level: 'fatal' });
      await sendOperatorAlert({
        severity: 'CRITICAL',
        title: 'TEST ALERT - Error tracking verification',
        details: 'This is a test alert. If you see this, alerting works!'
      });
      
      console.log('Verification complete. Check Sentry dashboard for entries.');
    }
  `
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F010_CONFIGURATION_CHECKLIST = [
  {
    category: 'Error Tracking Service Setup',
    tasks: [
      { task: 'Sign up for Sentry (or alternative)', status: 'pending' },
      { task: 'Create new Sentry project for caregiver marketplace', status: 'pending' },
      { task: 'Copy Sentry DSN', status: 'pending' },
      { task: 'Add SENTRY_DSN to Base44 environment variables', status: 'pending' },
      { task: 'Verify SENTRY_DSN is accessible in code', status: 'pending' }
    ]
  },
  {
    category: 'Sentry SDK Integration',
    tasks: [
      { task: 'Install @sentry/react package', status: 'pending' },
      { task: 'Initialize Sentry at app startup', status: 'pending' },
      { task: 'Configure release tracking', status: 'pending' },
      { task: 'Configure performance monitoring (10% sample rate)', status: 'pending' },
      { task: 'Implement React error boundary', status: 'pending' }
    ]
  },
  {
    category: 'PII Scrubbing',
    tasks: [
      { task: 'Implement scrubPII() function', status: 'pending' },
      { task: 'Add beforeSend hook to Sentry init', status: 'pending' },
      { task: 'Test email scrubbing: log entry with email → verify [EMAIL_REDACTED]', status: 'pending' },
      { task: 'Test phone scrubbing: log entry with phone → verify [PHONE_REDACTED]', status: 'pending' },
      { task: 'Test SSN scrubbing: log entry with SSN → verify [SSN_REDACTED]', status: 'pending' },
      { task: 'Remove user PII in beforeSendTransaction (keep only user.id)', status: 'pending' }
    ]
  },
  {
    category: 'Log Levels Implementation',
    tasks: [
      { task: 'Standardize console.info for milestone events', status: 'pending' },
      { task: 'Standardize console.warn for unexpected-but-handled', status: 'pending' },
      { task: 'Standardize console.error for handled errors', status: 'pending' },
      { task: 'Configure unhandled exception → fatal level', status: 'pending' }
    ]
  },
  {
    category: 'Unhandled Exception Handling',
    tasks: [
      { task: 'Implement React error boundary', status: 'pending' },
      { task: 'Add process.on("unhandledRejection") handler (backend)', status: 'pending' },
      { task: 'Add process.on("uncaughtException") handler (backend)', status: 'pending' },
      { task: 'Test: Unhandled exception → Sentry fatal + operator alert', status: 'pending' }
    ]
  },
  {
    category: 'Performance Monitoring',
    tasks: [
      { task: 'Configure Sentry performance monitoring (Triggers.2)', status: 'pending' },
      { task: 'Set alert: p95 response time > 2s for 5 min', status: 'pending' },
      { task: 'Set alert: error rate > 1% for 5 min', status: 'pending' }
    ]
  },
  {
    category: 'Abuse Detection',
    tasks: [
      { task: 'Configure alert: error rate > 5x baseline for 10 min (Abuse.1)', status: 'pending' },
      { task: 'Configure alert: log volume > 10x baseline (Errors.2)', status: 'pending' }
    ]
  },
  {
    category: 'Edge Cases',
    tasks: [
      { task: 'Implement safeStringify for circular references (Edge.1)', status: 'pending' },
      { task: 'Implement degraded logging fallback (Errors.1)', status: 'pending' },
      { task: 'Test: Sentry unavailable → users not blocked + alert sent', status: 'pending' },
      { task: 'Test: Circular reference in log → simplified fallback log', status: 'pending' }
    ]
  },
  {
    category: 'Log Retention',
    tasks: [
      { task: 'Configure Sentry retention: info=30d, warn=90d, error=90d, fatal=365d', status: 'pending' },
      { task: 'Verify AdminActionLog retention: 12 months (F-008)', status: 'pending' },
      { task: 'Verify PIIAccessLog retention: 12 months (F-009)', status: 'pending' }
    ]
  },
  {
    category: 'Pre-Launch Verification (UI.2)',
    tasks: [
      { task: 'Run verification script (test all log levels)', status: 'pending' },
      { task: 'Verify test logs appear in Sentry dashboard', status: 'pending' },
      { task: 'Test operator alert delivery (email, SMS, Slack)', status: 'pending' },
      { task: 'Test from each major automation (see checklist above)', status: 'pending' },
      { task: 'Document Sentry dashboard access for operators', status: 'pending' }
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
    test: 'Sentry Integration',
    steps: [
      'Initialize Sentry with DSN from environment variables',
      'Trigger test error: throw new Error("Test")',
      'Verify: Error appears in Sentry dashboard within 1 minute',
      'Verify: Stack trace is present'
    ]
  },
  {
    test: 'PII Scrubbing - Email',
    steps: [
      'Log message containing email: "Contact user@example.com"',
      'Check Sentry dashboard',
      'Verify: Message shows "Contact [EMAIL_REDACTED]"'
    ]
  },
  {
    test: 'PII Scrubbing - Phone',
    steps: [
      'Log message containing phone: "Call (555) 123-4567"',
      'Check Sentry dashboard',
      'Verify: Message shows "Call [PHONE_REDACTED]"'
    ]
  },
  {
    test: 'PII Scrubbing - User Context',
    steps: [
      'Log error with user context: { id, email, phone }',
      'Check Sentry event in dashboard',
      'Verify: user.id present',
      'Verify: user.email NOT present',
      'Verify: user.phone NOT present'
    ]
  },
  {
    test: 'Log Levels',
    steps: [
      'Log info: console.info("Booking accepted")',
      'Log warn: console.warn("Slow query")',
      'Log error: Sentry.captureException(error, {level: "error"})',
      'Log critical: Sentry.captureException(error, {level: "fatal"})',
      'Verify: All appear in Sentry with correct levels'
    ]
  },
  {
    test: 'Unhandled Exception',
    steps: [
      'Trigger unhandled promise rejection',
      'Verify: Fatal error in Sentry',
      'Verify: Operator alert sent (email/SMS/Slack)'
    ]
  },
  {
    test: 'Performance Monitoring',
    steps: [
      'Simulate slow request (>2 seconds)',
      'Check Sentry Performance dashboard',
      'Verify: Transaction recorded',
      'Verify: Flagged as slow (if p95 > 2s over 5 min)'
    ]
  },
  {
    test: 'Error Rate Alert',
    steps: [
      'Trigger multiple errors rapidly (>1% error rate)',
      'Wait 5 minutes',
      'Verify: Operator alert triggered'
    ]
  },
  {
    test: 'Error Spike Detection',
    steps: [
      'Establish baseline error rate',
      'Trigger error spike (>5x baseline in 10 min)',
      'Verify: Critical operator alert triggered'
    ]
  },
  {
    test: 'Degraded Logging',
    steps: [
      'Disconnect from Sentry (invalid DSN)',
      'Trigger user action (e.g., login)',
      'Verify: User action succeeds (fail open)',
      'Verify: Operator alert sent about logging degradation',
      'Verify: Fallback to console.log'
    ]
  },
  {
    test: 'Circular Reference Handling',
    steps: [
      'Create object with circular reference',
      'Attempt to log it: console.error("Error", circularObj)',
      'Verify: Simplified fallback log created',
      'Verify: No secondary exception thrown'
    ]
  },
  {
    test: 'Pre-Launch Verification',
    steps: [
      'Run verification script for all major automations',
      'Verify: All test errors appear in Sentry',
      'Verify: Operator test alert received',
      'Document: Screenshot of Sentry dashboard showing test errors'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * External Services:
 * - Sentry (or equivalent) for error tracking and performance monitoring
 * - Email/SMS/Slack for operator alerts
 * 
 * Base44 Platform Requirements:
 * - Environment variable support (SENTRY_DSN)
 * - React app initialization hook (Sentry.init)
 * - Global error handlers (error boundary, unhandled rejection)
 * 
 * Integration with Other Features:
 * - F-006: Log encryption key unavailability as critical
 * - F-008: Log AdminActionLog write failures as critical
 * - F-009: Log PIIAccessLog write failures as critical
 * - All features: Structured logging for debugging
 * 
 * CRITICAL WARNINGS:
 * - Access.2: NO PII in logs - implement scrubbing pipeline
 * - Logic.1: Unhandled exceptions → critical log + immediate alert
 * - Triggers.2: Performance monitoring alerts configured
 * - Errors.1: Fail open if logging unavailable - do not block users
 * - Edge.2: PII scrubbing MUST run before logs sent to external service
 * - UI.2: Pre-launch verification REQUIRED - test all automations
 * 
 * NEXT STEPS:
 * 1. Sign up for Sentry and create project
 * 2. Add SENTRY_DSN to Base44 environment variables
 * 3. Install @sentry/react package
 * 4. Initialize Sentry with PII scrubbing hooks
 * 5. Implement React error boundary
 * 6. Configure performance monitoring and alerts
 * 7. Run pre-launch verification script
 * 8. Document Sentry dashboard access for operators
 */

export default function F010StructuredLoggingDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-010: Structured Error & System Logging - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Documentation complete</p>
      <p><strong>Next Step:</strong> Configure Sentry + implement PII scrubbing pipeline</p>
      
      <h2>External Error Tracking (Data.1)</h2>
      <ul>
        <li><strong>Service:</strong> Sentry (recommended) or equivalent</li>
        <li><strong>API Key:</strong> Store SENTRY_DSN in Base44 environment variables</li>
        <li><strong>Features:</strong> Error tracking, performance monitoring, alerting</li>
        <li><strong>Sign up:</strong> https://sentry.io</li>
      </ul>
      
      <h2>Log Levels (Data.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Level</th>
            <th>When</th>
            <th>Examples</th>
            <th>Alerting</th>
            <th>Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>info</td>
            <td>Normal operations</td>
            <td>Booking accepted, User registered</td>
            <td>None</td>
            <td>30 days</td>
          </tr>
          <tr>
            <td>warn</td>
            <td>Unexpected but handled</td>
            <td>Slow query, Soft-lock expired</td>
            <td>Aggregate (&gt;100/hr)</td>
            <td>90 days</td>
          </tr>
          <tr>
            <td>error</td>
            <td>Handled errors</td>
            <td>API failure, Validation error</td>
            <td>If &gt;1% rate</td>
            <td>90 days</td>
          </tr>
          <tr>
            <td>critical</td>
            <td>Service degradation</td>
            <td>Unhandled exception, DB lost</td>
            <td>IMMEDIATE</td>
            <td>12 months</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Required Log Fields (Data.3)</h2>
      <ul>
        <li><strong>timestamp:</strong> ISO 8601 DateTime (auto)</li>
        <li><strong>level:</strong> info, warn, error, critical</li>
        <li><strong>service:</strong> Which component (e.g., booking_service)</li>
        <li><strong>message:</strong> Human-readable description</li>
        <li><strong>user_id:</strong> User ID if authenticated (NO email, phone)</li>
        <li><strong>session_id:</strong> Session identifier</li>
        <li><strong>stack_trace:</strong> For error/critical levels</li>
        <li><strong>record_ids:</strong> booking_id, profile_id, etc.</li>
      </ul>
      
      <h2>PII Scrubbing (Access.2, Edge.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Logs MUST NOT contain PII</strong>
        <ul>
          <li><strong>Forbidden:</strong> Email, phone, address, full name, SSN, bank account</li>
          <li><strong>Allowed:</strong> User IDs, record IDs, session IDs</li>
          <li><strong>Implementation:</strong> Scrubbing pipeline before logs sent to Sentry</li>
          <li><strong>Regex patterns:</strong> Email, phone, SSN, credit card</li>
        </ul>
      </div>
      
      <h2>Unhandled Exceptions (Logic.1)</h2>
      <ul>
        <li>Every unhandled exception → <strong>critical</strong> log</li>
        <li>Immediate operator alert (email, SMS, Slack)</li>
        <li>React error boundary captures UI errors</li>
        <li>Backend: process.on('unhandledRejection'), process.on('uncaughtException')</li>
      </ul>
      
      <h2>Performance Monitoring (Triggers.2)</h2>
      <ul>
        <li><strong>Response time:</strong> Alert if p95 &gt; 2 seconds for 5 minutes</li>
        <li><strong>Error rate:</strong> Alert if &gt; 1% for 5 minutes</li>
        <li><strong>Sample rate:</strong> 10% of transactions monitored</li>
      </ul>
      
      <h2>Abuse Detection (Abuse.1)</h2>
      <ul>
        <li><strong>Error spike:</strong> Alert if error rate &gt; 5x baseline in 10 min</li>
        <li><strong>Log volume spike:</strong> Alert if volume &gt; 10x baseline</li>
        <li><strong>Causes:</strong> Bug loop, scraping attack, misconfigured automation</li>
      </ul>
      
      <h2>Edge Cases</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Scenario</th>
            <th>Response</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Sentry unavailable (Errors.1)</td>
            <td>Fail open - users not blocked + operator alert</td>
          </tr>
          <tr>
            <td>Circular reference (Edge.1)</td>
            <td>Catch error, create simplified fallback log</td>
          </tr>
          <tr>
            <td>PII in log (Edge.2)</td>
            <td>Compliance incident - manual redaction + update scrubbing</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Pre-Launch Verification (UI.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>REQUIRED: Test error tracking before launch</strong>
        <ol>
          <li>Run verification script (test all log levels)</li>
          <li>Test from each major automation (registration, booking, payment, etc.)</li>
          <li>Verify all test errors appear in Sentry dashboard</li>
          <li>Test operator alert delivery</li>
          <li>Document Sentry dashboard access for operators</li>
        </ol>
      </div>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Sign up for Sentry and create project</li>
        <li>Add SENTRY_DSN to Base44 environment variables</li>
        <li>Install @sentry/react package</li>
        <li>Initialize Sentry with PII scrubbing (beforeSend hook)</li>
        <li>Implement React error boundary</li>
        <li>Add unhandled exception handlers</li>
        <li>Configure performance monitoring</li>
        <li>Set up alerts: p95 &gt; 2s, error rate &gt; 1%, error spike &gt; 5x</li>
        <li>Configure log retention (info=30d, warn=90d, error=90d, fatal=365d)</li>
        <li>Run pre-launch verification script</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete Sentry configuration, PII scrubbing implementation, and verification procedures.</em></p>
    </div>
  );
}