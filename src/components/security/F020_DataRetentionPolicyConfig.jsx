/**
 * F-020: CONSENT & DATA RETENTION POLICY CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Data Retention Policy requirements for the platform.
 * At MVP, this is a DOCUMENTED POLICY with MANUAL enforcement via admin queries.
 * Automated deletion (scheduled jobs) is POST-MVP.
 * 
 * STATUS: Phase 0 - Policy documentation
 * NEXT STEP: Create Privacy Policy document + manual admin retention queries
 * 
 * ============================================================================
 * CRITICAL LEGAL COMPLIANCE REQUIREMENTS
 * ============================================================================
 */

const F020_DATA_RETENTION_POLICY_SPECIFICATION = {
  
  /**
   * RETENTION SCHEDULE (Data.2)
   * What data is kept, for how long, and what happens after
   */
  retention_schedule: {
    
    overview: {
      // Data.2: Documented retention periods
      purpose: 'Define how long each data type is retained before deletion/anonymisation',
      enforcement: 'Manual at MVP (admin queries), automated post-MVP (scheduled jobs)',
      compliance: 'GDPR Article 5(1)(e) - storage limitation principle'
    },
    
    data_types: {
      
      messages: {
        entity: 'Message',
        retention_period: '12 months post-booking completion',
        trigger: 'BookingRequest.status = completed, BookingRequest.completed_at',
        action_after: 'Anonymise content (set is_deleted=true, content="[Deleted]")',
        rationale: 'Support dispute resolution, then remove for privacy',
        
        calculation: `
          // Retention eligibility for Messages
          const bookingCompletedAt = bookingRequest.completed_at;  // e.g., 2025-01-15
          const retentionPeriod = 12 * 30 * 24 * 60 * 60 * 1000;  // 12 months in ms
          const retentionEligibleAt = new Date(bookingCompletedAt.getTime() + retentionPeriod);
          
          // Message is eligible for deletion if:
          const now = new Date();
          const isEligible = now >= retentionEligibleAt;
          
          // Example: Booking completed 2025-01-15
          // retentionEligibleAt = 2026-01-15
          // If now = 2026-02-01, isEligible = true
        `
      },
      
      booking_requests: {
        entity: 'BookingRequest',
        retention_period: 'Indefinite',
        action_after: 'Never delete - anonymise user reference when User deleted (F-017 Triggers.2)',
        rationale: 'Audit trail, payment history, caregiver earnings records',
        
        anonymisation: `
          // When User is deleted (F-017)
          // BookingRequest record retained but user reference anonymised
          {
            id: 'booking_123',
            parent_profile_id: 'profile_deleted_user',  // Anonymised
            caregiver_profile_id: 'profile_abc',
            status: 'completed',
            // All booking details retained for audit
          }
        `
      },
      
      pii_fields: {
        data: 'User.email, User.full_name, User.phone, ParentProfile.address_line_1, etc.',
        retention_period: '30 days post-erasure request',
        trigger: 'User requests GDPR/CCPA erasure via support',
        action_after: 'Anonymise PII (F-017 hard delete procedure)',
        rationale: 'Legal requirement - right to erasure',
        
        anonymisation_example: `
          // After 30 days from erasure request
          User:
          {
            id: 'user_123',  // Retained for referential integrity
            email: 'deleted_user_123@anon.local',  // Anonymised
            full_name: 'Deleted User',  // Anonymised
            phone: null,  // Removed
            created_date: '2025-01-01',  // Retained for analytics
            is_deleted: true
          }
        `
      },
      
      admin_action_log: {
        entity: 'AdminActionLog',
        retention_period: 'Indefinite',
        action_after: 'Never delete',
        rationale: 'Compliance requirement - audit trail of all admin actions',
        
        note: `
          // F-008: AdminActionLog is INSERT-only, never deleted
          // Even for GDPR erasure, admin action records retained
          // User references may be anonymised but action record stays
        `
      },
      
      pii_access_log: {
        entity: 'PIIAccessLog',
        retention_period: '24 months',
        trigger: 'Log entry created_date',
        action_after: 'Hard delete (no soft delete - just remove record)',
        rationale: 'Security analysis, compliance audit, then purge to reduce storage',
        
        calculation: `
          // Retention eligibility for PIIAccessLog
          const logCreatedAt = piiAccessLog.access_timestamp;  // e.g., 2024-01-01
          const retentionPeriod = 24 * 30 * 24 * 60 * 60 * 1000;  // 24 months
          const retentionEligibleAt = new Date(logCreatedAt.getTime() + retentionPeriod);
          
          const now = new Date();
          const isEligible = now >= retentionEligibleAt;
          
          // If eligible, hard delete (no anonymisation needed)
        `
      },
      
      policy_acceptance: {
        entity: 'PolicyAcceptance',
        retention_period: 'Indefinite',
        action_after: 'Never delete (F-018 Audit.1)',
        rationale: 'Legal requirement - proof of user consent',
        
        note: `
          // F-018 Audit.1: PolicyAcceptance never deleted, even for GDPR
          // User record may be anonymised but acceptance fact retained
        `
      },
      
      policy_change_log: {
        entity: 'PolicyChangeLog',
        retention_period: 'Indefinite',
        action_after: 'Never delete (F-019 Audit.1)',
        rationale: 'Compliance audit trail of policy changes'
      },
      
      flagged_content: {
        entity: 'FlaggedContent',
        retention_period: 'Indefinite',
        action_after: 'Never delete (F-016 Logic.2)',
        rationale: 'Pattern analysis, moderation history'
      }
    },
    
    summary_table: `
      ┌─────────────────────┬────────────────────┬─────────────────────────┐
      │ Data Type           │ Retention Period   │ Action After            │
      ├─────────────────────┼────────────────────┼─────────────────────────┤
      │ Messages            │ 12 months          │ Anonymise content       │
      │ BookingRequests     │ Indefinite         │ Anonymise user ref      │
      │ PII (on erasure)    │ 30 days            │ Anonymise fields        │
      │ AdminActionLog      │ Indefinite         │ Never delete            │
      │ PIIAccessLog        │ 24 months          │ Hard delete             │
      │ PolicyAcceptance    │ Indefinite         │ Never delete            │
      │ PolicyChangeLog     │ Indefinite         │ Never delete            │
      │ FlaggedContent      │ Indefinite         │ Never delete            │
      └─────────────────────┴────────────────────┴─────────────────────────┘
    `
  },
  
  /**
   * DATA MODEL REQUIREMENTS (Data.1)
   * Soft delete fields already exist from F-017
   */
  data_model: {
    
    existing_fields: {
      // Data.1: Fields already exist from F-017
      note: 'F-017 already added is_deleted and deleted_at to User, CaregiverProfile, Message',
      
      entities_with_soft_delete: [
        'User (is_deleted, deleted_at, deletion_reason)',
        'CaregiverProfile (is_deleted, deleted_at, deletion_reason)',
        'Message (is_deleted, deleted_at, deletion_reason)',
        'ParentProfile (is_deleted, deleted_at, deletion_reason)',
        'MessageThread (is_deleted)',
        'BookingRequest (is_deleted)',
        'Certification (is_deleted)',
        'AvailabilitySlot (is_deleted)'
      ]
    },
    
    retention_eligible_at: {
      // Data.1: Computed field for automated deletion (post-MVP)
      approach: 'Compute at query time (no stored field at MVP)',
      
      computation_example: `
        // For Messages: retention_eligible_at = booking.completed_at + 12 months
        async function getRetentionEligibleMessages() {
          const allMessages = await base44.asServiceRole.entities.Message.list();
          
          const eligible = [];
          
          for (const message of allMessages) {
            // Get associated booking
            const thread = await base44.asServiceRole.entities.MessageThread.read(message.thread_id);
            const booking = await base44.asServiceRole.entities.BookingRequest.read(thread.booking_id);
            
            if (booking.status === 'completed' && booking.completed_at) {
              const completedDate = new Date(booking.completed_at);
              const retentionPeriod = 12 * 30 * 24 * 60 * 60 * 1000;  // 12 months
              const eligibleDate = new Date(completedDate.getTime() + retentionPeriod);
              
              const now = new Date();
              if (now >= eligibleDate) {
                eligible.push({
                  message_id: message.id,
                  booking_id: booking.id,
                  completed_at: booking.completed_at,
                  retention_eligible_at: eligibleDate,
                  days_overdue: Math.floor((now - eligibleDate) / (1000 * 60 * 60 * 24))
                });
              }
            }
          }
          
          return eligible;
        }
      `,
      
      post_mvp: {
        option: 'Add stored field retention_eligible_at (DateTime)',
        update_trigger: 'When BookingRequest.status → completed, set Message.retention_eligible_at',
        benefit: 'Faster queries for automated deletion jobs'
      }
    }
  },
  
  /**
   * CONSENT CAPTURE (Logic.2)
   * Via ToS acceptance (F-018)
   */
  consent_capture: {
    
    mechanism: {
      // Logic.2: Consent via ToS acceptance
      how: 'User accepts Privacy Policy during registration (F-018)',
      where: 'Privacy Policy includes data retention schedule',
      enforcement: 'Cannot register without accepting Privacy Policy'
    },
    
    privacy_policy_requirements: {
      // Logic.1: Privacy Policy must exist before data collection
      must_include: [
        'Data retention schedule (12 months for messages, etc.)',
        'User rights (erasure, access, portability)',
        'Contact method for erasure requests',
        'Legal basis for data processing'
      ],
      
      location: '/legal/privacy-policy',
      reference: 'F-018: Privacy Policy acceptance captured at registration'
    },
    
    pre_launch_verification: {
      // Logic.1: Before launch
      checklist: [
        'Data retention policy document created',
        'Retention policy approved by platform operator (Access.2)',
        'Privacy Policy includes retention schedule',
        'Privacy Policy live at public URL',
        'PolicyVersion record created with is_current=true',
        'Registration form links to Privacy Policy (F-018)'
      ]
    }
  },
  
  /**
   * MANUAL ENFORCEMENT AT MVP (Triggers.1)
   * Admin queries to identify retention-eligible records
   */
  manual_enforcement: {
    
    approach: {
      // Triggers.1: Manual admin queries at MVP
      why: 'Automated deletion is complex - validate retention logic manually first',
      process: 'Admin runs monthly query, reviews results, executes deletion manually',
      post_mvp: 'Build scheduled automation (weekly cron job)'
    },
    
    admin_queries: {
      
      messages_retention_eligible: {
        query_name: 'Messages Eligible for Deletion (12 months post-booking)',
        
        implementation: `
          // Admin query: Messages retention-eligible
          async function getMessagesRetentionEligible() {
            console.log('Running retention eligibility check for Messages...');
            
            const eligibleMessages = [];
            
            // Get all messages
            const messages = await base44.asServiceRole.entities.Message.filter({
              is_deleted: false  // Only active messages
            });
            
            for (const message of messages) {
              try {
                // Get message thread
                const thread = await base44.asServiceRole.entities.MessageThread.read(message.thread_id);
                
                // Get associated booking
                const booking = await base44.asServiceRole.entities.BookingRequest.read(thread.booking_id);
                
                // Check if booking completed and retention period passed
                if (booking.status === 'completed' && booking.completed_at) {
                  const completedDate = new Date(booking.completed_at);
                  const retentionPeriod = 12 * 30 * 24 * 60 * 60 * 1000;  // 12 months
                  const eligibleDate = new Date(completedDate.getTime() + retentionPeriod);
                  
                  const now = new Date();
                  if (now >= eligibleDate) {
                    eligibleMessages.push({
                      message_id: message.id,
                      thread_id: thread.id,
                      booking_id: booking.id,
                      completed_at: booking.completed_at,
                      retention_eligible_at: eligibleDate.toISOString(),
                      days_overdue: Math.floor((now - eligibleDate) / (1000 * 60 * 60 * 24)),
                      content_preview: message.content.substring(0, 50)
                    });
                  }
                }
              } catch (error) {
                console.warn('Error processing message', message.id, error);
              }
            }
            
            console.log(\`Found \${eligibleMessages.length} messages eligible for deletion\`);
            return eligibleMessages;
          }
        `,
        
        manual_deletion: `
          // Admin manually executes deletion for eligible messages
          async function deleteRetentionEligibleMessages(messageIds) {
            for (const messageId of messageIds) {
              await base44.asServiceRole.entities.Message.update(messageId, {
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deletion_reason: 'Retention policy - 12 months post-booking completion',
                content: '[Deleted]',  // Anonymise content
                body_original: null  // Remove admin-only field
              });
            }
            
            console.log(\`Deleted \${messageIds.length} messages per retention policy\`);
          }
        `
      },
      
      pii_access_log_retention_eligible: {
        query_name: 'PIIAccessLog Eligible for Deletion (24 months)',
        
        implementation: `
          // Admin query: PIIAccessLog retention-eligible
          async function getPIIAccessLogsRetentionEligible() {
            console.log('Running retention eligibility check for PIIAccessLog...');
            
            const retentionPeriod = 24 * 30 * 24 * 60 * 60 * 1000;  // 24 months
            const cutoffDate = new Date(Date.now() - retentionPeriod);
            
            // Get logs older than 24 months
            const eligibleLogs = await base44.asServiceRole.entities.PIIAccessLog.filter({
              access_timestamp: { $lt: cutoffDate.toISOString() }
            });
            
            console.log(\`Found \${eligibleLogs.length} PIIAccessLog records eligible for deletion\`);
            return eligibleLogs;
          }
        `,
        
        manual_deletion: `
          // Admin manually executes hard delete for PIIAccessLog
          async function deletePIIAccessLogs(logIds) {
            for (const logId of logIds) {
              // Hard delete (no soft delete for logs)
              await base44.asServiceRole.entities.PIIAccessLog.delete(logId);
            }
            
            console.log(\`Hard deleted \${logIds.length} PIIAccessLog records per retention policy\`);
          }
        `
      }
    }
  },
  
  /**
   * MONTHLY COMPLIANCE AUDIT (Audit.2)
   * Admin reviews retention-eligible records
   */
  monthly_compliance_audit: {
    
    requirement: {
      // Audit.2: Monthly admin review
      frequency: 'Monthly',
      scope: 'Review records eligible for deletion under current policy',
      action: 'Execute deletion OR defer with documented reason'
    },
    
    audit_procedure: {
      steps: [
        '1. Run retention eligibility queries (Messages, PIIAccessLog)',
        '2. Review results for accuracy',
        '3. Check for legal holds (Errors.2)',
        '4. Execute deletion for eligible records',
        '5. Document any deferrals with reason',
        '6. Log audit completion to AdminActionLog'
      ],
      
      implementation: `
        // Monthly retention compliance audit
        async function monthlyRetentionComplianceAudit() {
          console.log('Starting monthly retention compliance audit...');
          
          const auditResults = {
            messages_eligible: 0,
            messages_deleted: 0,
            messages_deferred: 0,
            pii_logs_eligible: 0,
            pii_logs_deleted: 0,
            pii_logs_deferred: 0,
            legal_holds_detected: 0
          };
          
          // Step 1: Check Messages
          const eligibleMessages = await getMessagesRetentionEligible();
          auditResults.messages_eligible = eligibleMessages.length;
          
          // Step 2: Filter out legal holds (Errors.2)
          const messagesWithoutHold = eligibleMessages.filter(m => !isUnderLegalHold(m.booking_id));
          const messagesWithHold = eligibleMessages.length - messagesWithoutHold.length;
          auditResults.legal_holds_detected += messagesWithHold;
          
          // Step 3: Delete eligible messages
          if (messagesWithoutHold.length > 0) {
            const messageIds = messagesWithoutHold.map(m => m.message_id);
            await deleteRetentionEligibleMessages(messageIds);
            auditResults.messages_deleted = messageIds.length;
          }
          
          // Step 4: Check PIIAccessLog
          const eligibleLogs = await getPIIAccessLogsRetentionEligible();
          auditResults.pii_logs_eligible = eligibleLogs.length;
          
          // Step 5: Delete eligible logs
          if (eligibleLogs.length > 0) {
            const logIds = eligibleLogs.map(l => l.id);
            await deletePIIAccessLogs(logIds);
            auditResults.pii_logs_deleted = logIds.length;
          }
          
          // Step 6: Log audit completion
          await base44.asServiceRole.entities.AdminActionLog.create({
            admin_user_id: 'SYSTEM',
            admin_role: 'system',
            action_type: 'manual_override',
            target_entity_type: 'RetentionAudit',
            target_entity_id: 'monthly_audit',
            reason: \`Monthly retention audit: \${auditResults.messages_deleted} messages deleted, \${auditResults.pii_logs_deleted} logs deleted\`,
            payload: JSON.stringify(auditResults),
            action_timestamp: new Date().toISOString()
          });
          
          console.log('Monthly retention compliance audit complete', auditResults);
          return auditResults;
        }
      `
    }
  },
  
  /**
   * LEGAL HOLD PROCEDURE (Errors.2)
   * Exempt records from automated deletion
   */
  legal_hold_procedure: {
    
    scenario: {
      // Errors.2: Under-retention risk
      problem: 'Deleting data needed for ongoing dispute or legal investigation',
      solution: 'Legal hold flag exempts record from deletion',
      process: 'Admin flags record, deletion skipped, hold released when resolved'
    },
    
    implementation_approach: {
      option_1: 'Add legal_hold boolean field to entities',
      option_2: 'Create separate LegalHold entity with references',
      recommended: 'Option 2 - cleaner separation of concerns'
    },
    
    legal_hold_entity: {
      entity: 'LegalHold (post-MVP)',
      
      fields: {
        id: 'UUID',
        target_entity_type: 'Type of record under hold (e.g., BookingRequest, Message)',
        target_entity_id: 'ID of specific record',
        reason: 'Why hold was placed (e.g., "Active dispute case #123")',
        placed_by_admin_id: 'Admin who placed hold',
        placed_at: 'DateTime when hold was placed',
        released_at: 'DateTime when hold was released (nullable)',
        notes: 'Additional context'
      },
      
      example: `
        // LegalHold record
        {
          id: 'hold_123',
          target_entity_type: 'BookingRequest',
          target_entity_id: 'booking_abc',
          reason: 'Active dispute - payment chargeback case #456',
          placed_by_admin_id: 'admin_xyz',
          placed_at: '2025-12-01T10:00:00Z',
          released_at: null,  // Still active
          notes: 'Do not delete until chargeback resolved'
        }
      `
    },
    
    check_legal_hold: `
      // Check if record is under legal hold
      async function isUnderLegalHold(entityType, entityId) {
        const holds = await base44.asServiceRole.entities.LegalHold.filter({
          target_entity_type: entityType,
          target_entity_id: entityId,
          released_at: null  // Active holds only
        });
        
        return holds.length > 0;
      }
      
      // Use in retention query
      const eligibleMessages = await getMessagesRetentionEligible();
      const messagesWithoutHold = [];
      
      for (const msg of eligibleMessages) {
        const hasHold = await isUnderLegalHold('Message', msg.message_id);
        if (!hasHold) {
          messagesWithoutHold.push(msg);
        }
      }
    `
  },
  
  /**
   * ERASURE REQUEST HANDLING (Abuse.2)
   * User requests GDPR/CCPA deletion
   */
  erasure_request_handling: {
    
    process: {
      // Abuse.2: GDPR/CCPA erasure at MVP
      how: 'User contacts support (email, contact form)',
      verification: 'Support verifies user identity',
      timeline: '30 days to complete erasure (Data.2)',
      procedure: 'F-017 hard delete - PII anonymisation'
    },
    
    erasure_workflow: {
      steps: [
        '1. User submits erasure request via support contact',
        '2. Support admin verifies user identity',
        '3. Admin checks for legal holds (Edge.1)',
        '4. If legal hold: inform user, document pending request',
        '5. If no hold: execute F-017 hard delete procedure',
        '6. Anonymise PII within 30 days (Data.2)',
        '7. Notify user of completion'
      ],
      
      implementation: `
        // Handle GDPR/CCPA erasure request
        async function handleErasureRequest(userId, requestingAdmin) {
          console.log('Processing erasure request for user', userId);
          
          // Step 1: Check for legal holds (Edge.1)
          const userHasHold = await isUnderLegalHold('User', userId);
          
          if (userHasHold) {
            // Edge.1: Defer until hold released
            await createPendingErasureRequest(userId, 'Legal hold active');
            
            return {
              status: 'deferred',
              message: 'User has active legal hold - erasure deferred until hold released'
            };
          }
          
          // Step 2: Execute F-017 hard delete procedure
          await anonymiseUserPII(userId, requestingAdmin);
          
          // Step 3: Log completion
          await base44.asServiceRole.entities.AdminActionLog.create({
            admin_user_id: requestingAdmin.id,
            admin_role: requestingAdmin.role,
            action_type: 'manual_override',
            target_entity_type: 'User',
            target_entity_id: userId,
            reason: 'GDPR/CCPA erasure request - PII anonymised',
            action_timestamp: new Date().toISOString()
          });
          
          console.log('Erasure request completed', userId);
          
          return {
            status: 'completed',
            message: 'User PII anonymised per GDPR/CCPA request'
          };
        }
        
        // F-017 hard delete procedure
        async function anonymiseUserPII(userId, adminUser) {
          // See F-017 for full implementation
          await base44.asServiceRole.entities.User.update(userId, {
            email: \`deleted_user_\${userId}@anon.local\`,
            full_name: 'Deleted User',
            phone: null,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deletion_reason: 'GDPR/CCPA erasure request'
          });
          
          // Anonymise related entities
          // ParentProfile, CaregiverProfile, etc.
        }
      `
    },
    
    pending_erasure_requests: {
      // Edge.1: Track deferred erasure requests
      entity: 'PendingErasureRequest (optional)',
      
      fields: {
        user_id: 'User who requested erasure',
        requested_at: 'When request was submitted',
        deferred_reason: 'Why erasure was deferred (e.g., "Legal hold")',
        legal_hold_id: 'Reference to LegalHold record',
        status: 'pending / completed / cancelled'
      },
      
      process: 'When legal hold released, admin processes pending erasure requests'
    }
  },
  
  /**
   * RETENTION POLICY CHANGES (Abuse.1, Edge.2)
   * Versioning and retroactive application
   */
  retention_policy_changes: {
    
    policy_versioning: {
      // Abuse.1: Changes require new policy version
      mechanism: 'F-019 PolicyChangeLog tracks retention policy changes',
      requirement: 'Change to retention period → new Privacy Policy version',
      user_action: 'All users must re-accept updated Privacy Policy (F-018/F-019)'
    },
    
    retroactive_application: {
      // Edge.2: Old vs new retention terms
      rule: 'Old terms apply to data collected before policy change',
      example: `
        Old Policy (v1.0): Messages retained 6 months
        User registered: 2025-01-01
        Messages created: 2025-01-01 to 2025-06-01
        
        New Policy (v2.0): Messages retained 12 months
        Policy effective: 2025-07-01
        
        Messages created before 2025-07-01:
        → Retain 6 months (old policy)
        
        Messages created after 2025-07-01:
        → Retain 12 months (new policy)
      `,
      
      implementation: {
        approach: 'Track policy_version on data records (complex)',
        alternative: 'Apply most permissive retention (simpler at MVP)',
        recommended: 'MVP: Apply longest retention to avoid compliance risk'
      }
    },
    
    policy_change_log_entry: {
      example: `
        // PolicyChangeLog for retention policy change
        {
          policy_type: 'privacy_policy',
          old_version: 'v1.0',
          new_version: 'v2.0',
          change_summary: 'Updated message retention from 6 months to 12 months',
          changed_by: 'admin_abc',
          effective_date: '2025-07-01'
        }
      `
    }
  },
  
  /**
   * OVER-RETENTION RISK (Errors.1)
   * Retaining data longer than stated
   */
  over_retention_prevention: {
    
    risk: {
      // Errors.1: Compliance violation
      problem: 'Retaining data longer than stated in Privacy Policy',
      consequence: 'GDPR violation, user trust erosion, regulatory fines'
    },
    
    mitigation: {
      // Errors.1: Monthly admin review
      process: 'Monthly compliance audit (Audit.2)',
      schedule: 'First Monday of each month',
      documentation: 'Admin logs audit completion to AdminActionLog',
      escalation: 'If >100 overdue records, alert super_admin'
    },
    
    monitoring: {
      metric: 'Days overdue for deletion',
      
      calculation: `
        // For each retention-eligible record
        const eligibleDate = calculateRetentionEligibleDate(record);
        const now = new Date();
        const daysOverdue = Math.floor((now - eligibleDate) / (1000 * 60 * 60 * 24));
        
        if (daysOverdue > 30) {
          // Escalate - significant over-retention
          console.warn('Over-retention detected', {
            record_id: record.id,
            days_overdue: daysOverdue
          });
        }
      `
    }
  },
  
  /**
   * PRIVACY POLICY REQUIREMENTS (Access.2, Logic.1)
   * Document must exist and be approved
   */
  privacy_policy_requirements: {
    
    pre_launch: {
      // Access.2: Policy approved before launch
      requirement: 'Privacy Policy document reviewed and approved by platform operator',
      approver: 'Platform operator (legal team or owner)',
      
      checklist: [
        'Data retention schedule documented',
        'User rights clearly stated (access, erasure, portability)',
        'Legal basis for processing disclosed',
        'Contact method for erasure requests provided',
        'Policy reviewed by legal counsel (recommended)',
        'Policy approved by platform operator',
        'Policy published at /legal/privacy-policy',
        'PolicyVersion record created with is_current=true'
      ]
    },
    
    public_reference: {
      // Access.2: Referenced in Privacy Policy
      location: '/legal/privacy-policy',
      must_include: 'Link to data retention schedule section',
      visibility: 'Publicly accessible (no login required)'
    },
    
    privacy_policy_content: {
      data_retention_section: `
        # Data Retention
        
        We retain your personal information only for as long as necessary to provide our services and comply with legal obligations.
        
        ## Retention Schedule
        
        - **Messages**: Retained for 12 months after booking completion, then anonymised
        - **Booking Records**: Retained indefinitely for audit purposes (user references anonymised upon account deletion)
        - **Personal Information**: Deleted within 30 days of erasure request
        - **Admin Action Logs**: Retained indefinitely for compliance
        - **PII Access Logs**: Retained for 24 months for security analysis
        
        ## Your Rights
        
        You have the right to:
        - Request access to your personal data
        - Request correction of your personal data
        - Request deletion of your personal data (right to erasure)
        - Request data portability
        
        To exercise these rights, contact us at privacy@example.com
        
        ## Legal Holds
        
        In some cases, we may be required to retain your data for legal reasons (e.g., ongoing dispute). We will inform you if this applies to your erasure request.
      `
    }
  },
  
  /**
   * POST-MVP AUTOMATION (Triggers.2)
   * Scheduled deletion jobs
   */
  post_mvp_automation: {
    
    overview: {
      // Triggers.2: Weekly scheduled jobs
      when: 'Post-MVP feature',
      frequency: 'Weekly cron job',
      scope: 'Automatically delete retention-eligible records',
      monitoring: 'Email summary to super_admin after each run'
    },
    
    scheduled_job_example: {
      job_name: 'weekly-retention-enforcement',
      schedule: '0 2 * * 1',  // 2 AM every Monday
      
      implementation: `
        // Post-MVP: Scheduled retention enforcement
        async function weeklyRetentionEnforcement() {
          console.log('Starting weekly retention enforcement...');
          
          const results = {
            messages_deleted: 0,
            pii_logs_deleted: 0,
            errors: []
          };
          
          try {
            // Delete retention-eligible Messages
            const eligibleMessages = await getMessagesRetentionEligible();
            const messagesWithoutHold = eligibleMessages.filter(m => !isUnderLegalHold('Message', m.message_id));
            
            if (messagesWithoutHold.length > 0) {
              const messageIds = messagesWithoutHold.map(m => m.message_id);
              await deleteRetentionEligibleMessages(messageIds);
              results.messages_deleted = messageIds.length;
            }
            
            // Delete retention-eligible PIIAccessLog
            const eligibleLogs = await getPIIAccessLogsRetentionEligible();
            
            if (eligibleLogs.length > 0) {
              const logIds = eligibleLogs.map(l => l.id);
              await deletePIIAccessLogs(logIds);
              results.pii_logs_deleted = logIds.length;
            }
            
            // Log completion
            await base44.asServiceRole.entities.AdminActionLog.create({
              admin_user_id: 'SYSTEM',
              admin_role: 'system',
              action_type: 'manual_override',
              target_entity_type: 'RetentionEnforcement',
              target_entity_id: 'weekly_job',
              reason: \`Weekly retention enforcement: \${results.messages_deleted} messages, \${results.pii_logs_deleted} logs deleted\`,
              payload: JSON.stringify(results),
              action_timestamp: new Date().toISOString()
            });
            
            // Email summary to super_admin
            await sendRetentionSummaryEmail(results);
            
            console.log('Weekly retention enforcement complete', results);
            
          } catch (error) {
            console.error('Weekly retention enforcement failed', error);
            results.errors.push(error.message);
            
            // Alert super_admin of failure
            await alertSuperAdmin('Retention enforcement job failed', error);
          }
        }
      `
    }
  },
  
  /**
   * USER-FACING UI (UI.1)
   * Erasure request contact
   */
  user_ui: {
    
    requirements: {
      // UI.1: No retention management UI at MVP
      location: 'Account settings page',
      action: 'Link to support contact for erasure requests',
      alternative: 'Email privacy@example.com for data deletion'
    },
    
    implementation_example: `
      // Account settings page
      export default function AccountSettings() {
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Account Settings</h1>
            
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Privacy & Data</h2>
              
              <p className="text-sm text-gray-600 mb-4">
                You have the right to request deletion of your personal data. 
                We will process your request within 30 days.
              </p>
              
              <div className="space-y-2">
                <p className="text-sm">
                  To request data deletion:
                </p>
                <ul className="list-disc ml-6 text-sm text-gray-600">
                  <li>
                    Email us at{' '}
                    <a href="mailto:privacy@example.com" className="text-blue-600 underline">
                      privacy@example.com
                    </a>
                  </li>
                  <li>
                    Or contact support via our{' '}
                    <a href="/support" className="text-blue-600 underline">
                      contact form
                    </a>
                  </li>
                </ul>
              </div>
              
              <p className="text-xs text-gray-500 mt-4">
                For more information, see our{' '}
                <a href="/legal/privacy-policy" target="_blank" className="text-blue-600 underline">
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>
        );
      }
    `
  },
  
  /**
   * ADMIN UI (UI.2 - POST-MVP)
   * Data Retention dashboard
   */
  admin_ui_post_mvp: {
    
    requirements: {
      // UI.2: Post-MVP feature
      location: 'Admin dashboard → Legal → Data Retention',
      visibility: 'super_admin only',
      
      features: [
        'View retention-eligible records by type',
        'Batch deletion action',
        'Legal hold management',
        'Retention audit history',
        'Overdue records alert'
      ]
    }
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F020_CONFIGURATION_CHECKLIST = [
  {
    category: 'Privacy Policy Document',
    tasks: [
      { task: 'Draft data retention policy document', status: 'pending' },
      { task: 'Include retention schedule (12 months messages, 24 months logs, etc.)', status: 'pending' },
      { task: 'Include user rights (access, erasure, portability)', status: 'pending' },
      { task: 'Include contact method for erasure requests', status: 'pending' },
      { task: 'Review by legal counsel (recommended)', status: 'pending' },
      { task: 'Approve by platform operator (Access.2)', status: 'pending' },
      { task: 'Publish at /legal/privacy-policy', status: 'pending' },
      { task: 'Create PolicyVersion record with is_current=true', status: 'pending' }
    ]
  },
  {
    category: 'Manual Admin Queries',
    tasks: [
      { task: 'Implement getMessagesRetentionEligible query (Triggers.1)', status: 'pending' },
      { task: 'Implement deleteRetentionEligibleMessages function', status: 'pending' },
      { task: 'Implement getPIIAccessLogsRetentionEligible query', status: 'pending' },
      { task: 'Implement deletePIIAccessLogs function', status: 'pending' },
      { task: 'Test: Run queries, verify eligible records identified', status: 'pending' }
    ]
  },
  {
    category: 'Monthly Compliance Audit',
    tasks: [
      { task: 'Document audit procedure (Audit.2)', status: 'pending' },
      { task: 'Schedule monthly audit (first Monday of month)', status: 'pending' },
      { task: 'Implement monthlyRetentionComplianceAudit function', status: 'pending' },
      { task: 'Log audit completion to AdminActionLog', status: 'pending' },
      { task: 'Create admin reminder system (email/calendar)', status: 'pending' }
    ]
  },
  {
    category: 'Legal Hold Procedure',
    tasks: [
      { task: 'Document legal hold procedure (Errors.2)', status: 'pending' },
      { task: 'Create LegalHold entity (post-MVP)', status: 'pending' },
      { task: 'Implement isUnderLegalHold check', status: 'pending' },
      { task: 'Filter retention-eligible records by legal hold', status: 'pending' },
      { task: 'Document legal hold release process', status: 'pending' }
    ]
  },
  {
    category: 'Erasure Request Handling',
    tasks: [
      { task: 'Document erasure request procedure (Abuse.2)', status: 'pending' },
      { task: 'Set up privacy@example.com email', status: 'pending' },
      { task: 'Implement handleErasureRequest function', status: 'pending' },
      { task: 'Integrate with F-017 hard delete procedure', status: 'pending' },
      { task: 'Handle legal hold deferrals (Edge.1)', status: 'pending' },
      { task: 'Create PendingErasureRequest entity (optional)', status: 'pending' }
    ]
  },
  {
    category: 'User-Facing UI',
    tasks: [
      { task: 'Add erasure request link to account settings (UI.1)', status: 'pending' },
      { task: 'Link to Privacy Policy', status: 'pending' },
      { task: 'Provide support contact methods', status: 'pending' }
    ]
  },
  {
    category: 'Policy Versioning',
    tasks: [
      { task: 'Document retroactive application rules (Edge.2)', status: 'pending' },
      { task: 'Retention policy change → new PolicyVersion (Abuse.1)', status: 'pending' },
      { task: 'Create PolicyChangeLog entry for retention changes', status: 'pending' },
      { task: 'Trigger re-acceptance (F-019)', status: 'pending' }
    ]
  },
  {
    category: 'Over-Retention Prevention',
    tasks: [
      { task: 'Document over-retention risk (Errors.1)', status: 'pending' },
      { task: 'Implement days_overdue metric', status: 'pending' },
      { task: 'Alert if >100 overdue records', status: 'pending' },
      { task: 'Monthly audit addresses over-retention', status: 'pending' }
    ]
  },
  {
    category: 'Post-MVP Automation',
    tasks: [
      { task: 'Design scheduled deletion job (Triggers.2)', status: 'pending' },
      { task: 'Implement weeklyRetentionEnforcement function', status: 'pending' },
      { task: 'Schedule cron job (2 AM every Monday)', status: 'pending' },
      { task: 'Send email summary to super_admin', status: 'pending' },
      { task: 'Build Data Retention admin UI (UI.2)', status: 'pending' }
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
    test: 'Privacy Policy Published',
    steps: [
      'Privacy Policy document created',
      'Includes data retention schedule (Logic.1)',
      'Includes user rights and contact method',
      'Reviewed and approved by platform operator (Access.2)',
      'Published at /legal/privacy-policy',
      'GET /legal/privacy-policy → 200 OK',
      'PolicyVersion record created with is_current=true'
    ]
  },
  {
    test: 'Messages Retention Query',
    steps: [
      'Booking completed 2025-01-15',
      'Messages in booking thread created',
      'Run getMessagesRetentionEligible() on 2026-02-01',
      'Verify: Messages from booking_abc eligible (12+ months past completion)',
      'Verify: Days overdue calculated correctly',
      'Admin reviews results',
      'Admin executes deletion manually'
    ]
  },
  {
    test: 'PIIAccessLog Retention Query',
    steps: [
      'PIIAccessLog entry created 2024-01-01',
      'Run getPIIAccessLogsRetentionEligible() on 2026-02-01',
      'Verify: Log eligible (24+ months old)',
      'Admin executes hard deletion',
      'Verify: Log record removed from database'
    ]
  },
  {
    test: 'Monthly Compliance Audit',
    steps: [
      '10 messages retention-eligible, 2 under legal hold',
      'Run monthlyRetentionComplianceAudit()',
      'Verify: 8 messages deleted (10 - 2 legal hold)',
      'Verify: 2 messages deferred (legal hold)',
      'Verify: AdminActionLog entry created',
      'Verify: Audit results logged with counts'
    ]
  },
  {
    test: 'Legal Hold - Prevent Deletion',
    steps: [
      'Message is retention-eligible',
      'Admin places legal hold on associated booking',
      'Run retention audit',
      'Verify: Message NOT deleted (legal hold active)',
      'Admin releases legal hold',
      'Run retention audit again',
      'Verify: Message NOW deleted'
    ]
  },
  {
    test: 'Erasure Request - No Legal Hold',
    steps: [
      'User submits erasure request via support',
      'Admin verifies user identity',
      'Admin checks legal hold → none',
      'Admin executes handleErasureRequest(userId)',
      'Verify: User PII anonymised (F-017 hard delete)',
      'Verify: AdminActionLog entry created',
      'Admin notifies user of completion'
    ]
  },
  {
    test: 'Erasure Request - With Legal Hold',
    steps: [
      'User submits erasure request',
      'Admin checks legal hold → active dispute',
      'Admin executes handleErasureRequest(userId)',
      'Verify: Status = "deferred" (Edge.1)',
      'Verify: User informed of deferral',
      'Verify: PendingErasureRequest created',
      'Legal hold released',
      'Admin processes pending request',
      'Verify: User PII anonymised'
    ]
  },
  {
    test: 'Retention Policy Change',
    steps: [
      'Old policy: Messages retained 6 months',
      'Admin creates new Privacy Policy v2.0',
      'New policy: Messages retained 12 months',
      'Admin publishes v2.0 (F-019)',
      'Verify: PolicyChangeLog entry created (Abuse.1)',
      'Verify: change_summary includes retention change',
      'Verify: All users require re-acceptance (F-019)'
    ]
  },
  {
    test: 'Retroactive Application',
    steps: [
      'Message created under old policy (6 months)',
      'Policy changes to 12 months',
      'Run retention query',
      'Verify: Message retention calculated per old policy (Edge.2)',
      'Or: Apply longest retention to avoid compliance risk'
    ]
  },
  {
    test: 'Over-Retention Monitoring',
    steps: [
      'Message retention-eligible 45 days ago',
      'Run retention audit',
      'Verify: days_overdue = 45 (Errors.1)',
      'Verify: Warning logged if >30 days overdue',
      'Verify: Alert sent to super_admin if >100 overdue records'
    ]
  },
  {
    test: 'User-Facing Erasure Link',
    steps: [
      'User navigates to account settings',
      'Verify: Link to erasure request visible (UI.1)',
      'Verify: Email privacy@example.com shown',
      'Verify: Link to Privacy Policy shown',
      'User clicks link → opens support contact'
    ]
  },
  {
    test: 'Audit Log Retention',
    steps: [
      'AdminActionLog entry created',
      'Run retention audit',
      'Verify: AdminActionLog NEVER deleted (Data.2)',
      'Verify: Retained indefinitely for compliance'
    ]
  },
  {
    test: 'PolicyAcceptance Retention',
    steps: [
      'User accepts ToS v1.0',
      'PolicyAcceptance record created',
      'User requests GDPR erasure',
      'User PII anonymised (F-017)',
      'Verify: PolicyAcceptance NEVER deleted (F-018 Audit.1)',
      'Verify: Acceptance fact retained for legal compliance'
    ]
  },
  {
    test: 'BookingRequest Retention',
    steps: [
      'BookingRequest created and completed',
      'User deleted (F-017)',
      'Run retention audit',
      'Verify: BookingRequest NEVER deleted (Data.2)',
      'Verify: User reference anonymised',
      'Verify: Booking details retained for audit'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * CRITICAL REQUIREMENTS:
 * - Access.2: Privacy Policy approved before launch
 * - Logic.1: Privacy Policy must exist before data collection
 * - Logic.2: Consent via ToS acceptance (F-018)
 * - Data.2: Retention schedule documented and enforced
 * - Triggers.1: Manual enforcement at MVP via admin queries
 * - Audit.2: Monthly compliance audit required
 * - Errors.1: Over-retention is compliance violation
 * - Errors.2: Legal hold procedure documented
 * - Edge.1: Defer erasure if legal hold active
 * - Edge.2: Old policy terms apply to old data
 * - Abuse.1: Policy changes require re-acceptance
 * - Abuse.2: Erasure requests via support at MVP
 * 
 * INTEGRATION WITH OTHER FEATURES:
 * - F-017: Soft delete fields (is_deleted, deleted_at) already exist
 * - F-018: ToS/Privacy Policy acceptance captures consent
 * - F-019: PolicyChangeLog tracks retention policy changes
 * - F-008: AdminActionLog logs retention audit actions
 * 
 * MVP vs POST-MVP:
 * - MVP: Manual admin queries, monthly audit, documented policy
 * - Post-MVP: Scheduled deletion jobs, Data Retention admin UI, LegalHold entity
 * 
 * NEXT STEPS:
 * 1. Create Privacy Policy document with retention schedule
 * 2. Get approval from platform operator (Access.2)
 * 3. Publish at /legal/privacy-policy
 * 4. Create PolicyVersion record
 * 5. Implement manual admin retention queries
 * 6. Schedule monthly compliance audit
 * 7. Document legal hold procedure
 * 8. Document erasure request procedure
 * 9. Add erasure link to account settings UI
 * 10. Test all acceptance criteria
 */

export default function F020DataRetentionPolicyDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-020: Consent & Data Retention Policy - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Policy documentation component created</p>
      <p><strong>Next Step:</strong> Create Privacy Policy document + implement manual admin queries</p>
      
      <h2>Critical Requirements</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ LEGAL COMPLIANCE</strong>
        <ul>
          <li><strong>Access.2:</strong> Privacy Policy MUST be approved before launch</li>
          <li><strong>Logic.1:</strong> Privacy Policy MUST exist before collecting data</li>
          <li><strong>Logic.2:</strong> Consent captured via ToS acceptance (F-018)</li>
          <li><strong>Audit.2:</strong> Monthly compliance audit REQUIRED</li>
          <li><strong>Errors.1:</strong> Over-retention is compliance violation</li>
        </ul>
      </div>
      
      <h2>Retention Schedule (Data.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Data Type</th>
            <th>Retention Period</th>
            <th>Action After</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Messages</td>
            <td>12 months post-booking completion</td>
            <td>Anonymise content (set is_deleted=true, content="[Deleted]")</td>
          </tr>
          <tr>
            <td>BookingRequests</td>
            <td>Indefinite</td>
            <td>Anonymise user reference when User deleted (F-017)</td>
          </tr>
          <tr>
            <td>PII (on erasure request)</td>
            <td>30 days</td>
            <td>Anonymise fields (F-017 hard delete)</td>
          </tr>
          <tr>
            <td>AdminActionLog</td>
            <td>Indefinite</td>
            <td>Never delete (compliance requirement)</td>
          </tr>
          <tr>
            <td>PIIAccessLog</td>
            <td>24 months</td>
            <td>Hard delete</td>
          </tr>
          <tr>
            <td>PolicyAcceptance</td>
            <td>Indefinite</td>
            <td>Never delete (F-018 Audit.1)</td>
          </tr>
          <tr>
            <td>PolicyChangeLog</td>
            <td>Indefinite</td>
            <td>Never delete (F-019 Audit.1)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Enforcement Approach</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>MVP: Manual Enforcement (Triggers.1)</strong>
        <ul>
          <li><strong>Process:</strong> Admin runs monthly queries to identify retention-eligible records</li>
          <li><strong>Review:</strong> Admin reviews results for accuracy</li>
          <li><strong>Execution:</strong> Admin manually deletes eligible records</li>
          <li><strong>Logging:</strong> All actions logged to AdminActionLog</li>
        </ul>
        <strong>Post-MVP: Automated Enforcement (Triggers.2)</strong>
        <ul>
          <li>Scheduled jobs run weekly (cron: 2 AM Monday)</li>
          <li>Automatically delete retention-eligible records</li>
          <li>Email summary to super_admin</li>
        </ul>
      </div>
      
      <h2>Privacy Policy Requirements (Access.2, Logic.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ PRE-LAUNCH REQUIREMENTS</strong>
        <ol>
          <li>Create Privacy Policy document with retention schedule</li>
          <li>Include user rights (access, erasure, portability)</li>
          <li>Include contact method for erasure requests</li>
          <li>Review by legal counsel (recommended)</li>
          <li>Approve by platform operator (Access.2)</li>
          <li>Publish at /legal/privacy-policy</li>
          <li>Create PolicyVersion record with is_current=true</li>
          <li>Users accept via registration (F-018)</li>
        </ol>
      </div>
      
      <h2>Monthly Compliance Audit (Audit.2)</h2>
      <ul>
        <li><strong>Frequency:</strong> Monthly (first Monday of month)</li>
        <li><strong>Scope:</strong> Review records eligible for deletion</li>
        <li><strong>Actions:</strong> Delete eligible records OR defer with documented reason</li>
        <li><strong>Logging:</strong> Log audit completion to AdminActionLog</li>
        <li><strong>Escalation:</strong> Alert super_admin if >100 overdue records (Errors.1)</li>
      </ul>
      
      <h2>Legal Hold Procedure (Errors.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>IMPORTANT: Prevent under-retention</strong>
        <ul>
          <li><strong>Purpose:</strong> Exempt records from deletion during disputes/investigations</li>
          <li><strong>Process:</strong> Admin places legal hold on record</li>
          <li><strong>Effect:</strong> Record skipped during retention audit</li>
          <li><strong>Release:</strong> Admin releases hold when resolved</li>
          <li><strong>Implementation:</strong> LegalHold entity (post-MVP)</li>
        </ul>
      </div>
      
      <h2>Erasure Request Handling (Abuse.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Step</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1. Request</td>
            <td>User contacts support via email or contact form</td>
          </tr>
          <tr>
            <td>2. Verification</td>
            <td>Support admin verifies user identity</td>
          </tr>
          <tr>
            <td>3. Legal Hold Check</td>
            <td>Admin checks for active legal holds (Edge.1)</td>
          </tr>
          <tr>
            <td>4a. No Hold</td>
            <td>Execute F-017 hard delete (anonymise PII within 30 days)</td>
          </tr>
          <tr>
            <td>4b. Legal Hold</td>
            <td>Inform user, document pending request, process after hold released</td>
          </tr>
          <tr>
            <td>5. Completion</td>
            <td>Notify user, log to AdminActionLog</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Retention Policy Changes (Abuse.1, Edge.2)</h2>
      <ul>
        <li><strong>Versioning:</strong> Change to retention period → new Privacy Policy version (F-019)</li>
        <li><strong>Re-acceptance:</strong> All users must re-accept updated policy</li>
        <li><strong>Retroactive Application:</strong> Old terms apply to data collected before change (Edge.2)</li>
        <li><strong>PolicyChangeLog:</strong> Tracks retention policy changes for audit</li>
      </ul>
      
      <h2>Over-Retention Prevention (Errors.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ COMPLIANCE VIOLATION RISK</strong>
        <ul>
          <li><strong>Problem:</strong> Retaining data longer than stated in Privacy Policy</li>
          <li><strong>Mitigation:</strong> Monthly compliance audit (Audit.2)</li>
          <li><strong>Monitoring:</strong> Calculate days_overdue for each eligible record</li>
          <li><strong>Escalation:</strong> Alert super_admin if >100 overdue or >30 days overdue</li>
        </ul>
      </div>
      
      <h2>User-Facing UI (UI.1)</h2>
      <ul>
        <li><strong>Location:</strong> Account settings page</li>
        <li><strong>Action:</strong> Link to support contact for erasure requests</li>
        <li><strong>Email:</strong> privacy@example.com</li>
        <li><strong>Privacy Policy:</strong> Link to /legal/privacy-policy</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Create Privacy Policy document with retention schedule</li>
        <li>Get approval from platform operator (Access.2)</li>
        <li>Publish at /legal/privacy-policy</li>
        <li>Create PolicyVersion record</li>
        <li>Implement getMessagesRetentionEligible query (Triggers.1)</li>
        <li>Implement getPIIAccessLogsRetentionEligible query</li>
        <li>Implement monthlyRetentionComplianceAudit function (Audit.2)</li>
        <li>Schedule monthly audit (first Monday of month)</li>
        <li>Document legal hold procedure (Errors.2)</li>
        <li>Document erasure request procedure (Abuse.2)</li>
        <li>Set up privacy@example.com email</li>
        <li>Add erasure link to account settings UI (UI.1)</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <h2>Post-MVP Features (Triggers.2, UI.2)</h2>
      <ul>
        <li><strong>Scheduled Jobs:</strong> Weekly automated deletion (2 AM Monday)</li>
        <li><strong>LegalHold Entity:</strong> Track legal holds on records</li>
        <li><strong>Data Retention Admin UI:</strong> Dashboard for retention management</li>
        <li><strong>PendingErasureRequest:</strong> Track deferred erasure requests</li>
      </ul>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete retention schedule, manual admin queries, legal hold procedure, and erasure request workflow.</em></p>
    </div>
  );
}