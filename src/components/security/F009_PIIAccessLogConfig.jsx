/**
 * F-009: PII ACCESS LOGGING CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-009
 * PII Access Logging. ALL PII field reads (phone, address, cert files, etc.) must
 * be logged to maintain compliance and detect abuse.
 * 
 * STATUS: Phase 0 - Entity created (PIIAccessLog)
 * NEXT STEP: Configure Base44 permissions + implement logging middleware for PII access
 * 
 * ============================================================================
 * CRITICAL COMPLIANCE REQUIREMENTS
 * ============================================================================
 */

const F009_PII_ACCESS_LOG_SPECIFICATION = {
  
  /**
   * PURPOSE (Data.2)
   * PIIAccessLog vs AdminActionLog distinction
   */
  purpose: {
    pii_access_log: {
      what: 'Logs PII data READS',
      examples: [
        'User.phone included in booking acceptance email',
        'Admin views ParentProfile.address_line_1',
        'Certification.cert_file_url signed URL generated',
        'Message.body_original viewed for moderation',
        'Admin exports user data to CSV'
      ],
      compliance_value: 'Track who accessed sensitive data and when'
    },
    
    admin_action_log: {
      what: 'Logs admin WRITE actions',
      examples: [
        'Admin verifies caregiver',
        'Admin suspends user',
        'Admin changes user role',
        'Admin deletes content'
      ],
      compliance_value: 'Track who changed what and why'
    },
    
    key_difference: 'PIIAccessLog = reads, AdminActionLog = writes'
  },
  
  /**
   * ENTITY SCHEMA (Data.1)
   * PIIAccessLog collection structure
   */
  entity_schema: {
    fields: {
      id: {
        type: 'UUID',
        auto: true,
        immutable: true,
        description: 'Unique identifier for log entry'
      },
      
      accessor_user_id: {
        type: 'Relation to User',
        required: true,
        description: 'The user who accessed the PII field',
        examples: [
          'parent_user_id (receiving booking acceptance email with caregiver phone)',
          'admin_user_id (viewing address for support)',
          'caregiver_user_id (downloading own certification file)'
        ]
      },
      
      accessor_role: {
        type: 'Text',
        required: true,
        description: 'Snapshot of accessor\'s role at time of access',
        rationale: 'Role may change later - log must preserve what role they held at access time',
        examples: ['parent', 'caregiver', 'trust_admin', 'super_admin']
      },
      
      field_accessed: {
        type: 'Text',
        required: true,
        enum: [
          'phone',
          'address', 'address_line_1', 'address_line_2', 'zip_code',
          'cert_file', 'cert_file_url',
          'body_original',
          'full_log',
          'bank_account', 'government_id', 'ssn',
          'oauth_token'
        ],
        description: 'Specific PII field that was accessed',
        integration: {
          f002: 'Field-level security defines which fields are PII',
          f007: 'Masked display - log when full value accessed'
        }
      },
      
      target_entity_type: {
        type: 'Text',
        required: true,
        description: 'Entity type containing the accessed PII',
        examples: ['User', 'ParentProfile', 'Certification', 'Message', 'AdminActionLog']
      },
      
      target_entity_id: {
        type: 'Text',
        required: true,
        description: 'ID of the specific record containing the PII'
      },
      
      booking_context_id: {
        type: 'Relation to BookingRequest',
        nullable: true,
        description: 'If PII access triggered by booking (e.g., phone in acceptance email), reference booking',
        use_case: 'Track PII access related to booking lifecycle'
      },
      
      access_timestamp: {
        type: 'DateTime',
        auto_set: true,
        immutable: true,
        description: 'Timestamp when PII was accessed',
        uses: [
          'Compliance audit trail',
          'Chronological ordering',
          'Abuse detection window (Abuse.1)'
        ]
      },
      
      access_context: {
        type: 'Text',
        description: 'Why the field was accessed',
        examples: [
          'booking_accepted',
          'admin_review',
          'moderation',
          'cert_verification',
          'cert_download',
          'compliance_review_export'
        ]
      },
      
      ip_address: {
        type: 'Text',
        description: 'IP address from which access occurred',
        uses: 'Security analysis, abuse pattern detection'
      }
    }
  },
  
  /**
   * INSERT-ONLY ENFORCEMENT (Data.2)
   * Same as AdminActionLog - no UPDATE or DELETE
   */
  insert_only_enforcement: {
    
    requirement: 'PIIAccessLog is INSERT-only - no UPDATE or DELETE for ANY role',
    
    base44_permission_configuration: {
      entity: 'PIIAccessLog',
      permissions: {
        create: ['system_automation'],  // Only server-side
        read: ['super_admin'],  // Access.2: super_admin only
        update: [],  // EMPTY - no role can update
        delete: []   // EMPTY - no role can delete
      },
      verification: [
        'Attempt UPDATE as super_admin → expect 403',
        'Attempt DELETE as super_admin → expect 403',
        'Attempt READ as trust_admin → expect 403 (only super_admin can read)',
        'Verify Base44 collection settings show update_permission=[] and delete_permission=[]'
      ]
    },
    
    access_restrictions: {
      // Access.2: Readable by super_admin only
      super_admin: 'Can read PIIAccessLog',
      trust_admin: 'CANNOT read PIIAccessLog (more restrictive than AdminActionLog)',
      support_admin: 'CANNOT read PIIAccessLog',
      parent_caregiver: 'CANNOT read PIIAccessLog',
      
      rationale: 'PIIAccessLog contains metadata about sensitive data access - only highest privilege level should see it'
    }
  },
  
  /**
   * LOGGING TRIGGERS (Logic.1)
   * When to create PIIAccessLog entries
   */
  logging_triggers: {
    
    user_phone_in_email: {
      // Logic.1: User.phone included in acceptance email
      scenario: 'Booking accepted → automated email reveals caregiver phone to parent',
      trigger: 'Email automation includes User.phone in email body',
      
      implementation: `
        // F-077: Booking acceptance email automation
        async function sendBookingAcceptanceEmail(booking) {
          const parent = await base44.entities.User.read(booking.parent_user_id);
          const caregiver = await base44.entities.User.read(booking.caregiver_user_id);
          
          // Triggers.1: Log PII access FIRST (atomicity)
          try {
            await base44.asServiceRole.entities.PIIAccessLog.create({
              accessor_user_id: parent.id,
              accessor_role: parent.role,
              field_accessed: 'phone',
              target_entity_type: 'User',
              target_entity_id: caregiver.id,
              booking_context_id: booking.id,
              access_timestamp: new Date().toISOString(),
              access_context: 'booking_accepted',
              ip_address: 'email_automation'  // Server-side action
            });
          } catch (error) {
            // Triggers.1: If log write fails, do NOT send email
            await sendOperatorAlert({
              severity: 'CRITICAL',
              message: 'PIIAccessLog write failed - email not sent',
              details: { booking_id: booking.id, error: error.message }
            });
            throw new Error('Unable to log PII access - email blocked for compliance');
          }
          
          // Log succeeded - safe to send email with phone
          await base44.integrations.Core.SendEmail({
            to: parent.email,
            subject: 'Booking Accepted',
            body: \`Your booking has been accepted. Contact \${caregiver.full_name} at \${caregiver.phone}.\`
          });
        }
      `
    },
    
    admin_views_address: {
      // Logic.1: Admin viewing raw address record
      scenario: 'Admin views ParentProfile with full address for support/moderation',
      trigger: 'Admin queries ParentProfile.address_line_1 (F-002 admin-only field)',
      
      implementation: `
        // Admin endpoint to view full parent profile (including PII)
        async function getParentProfileForAdmin(adminUser, parentProfileId) {
          const profile = await base44.asServiceRole.entities.ParentProfile.read(parentProfileId);
          
          // Log access to PII fields
          const piiFields = ['address_line_1', 'address_line_2', 'zip_code'];
          for (const field of piiFields) {
            if (profile[field]) {
              await base44.asServiceRole.entities.PIIAccessLog.create({
                accessor_user_id: adminUser.id,
                accessor_role: adminUser.role,
                field_accessed: field,
                target_entity_type: 'ParentProfile',
                target_entity_id: profile.id,
                access_timestamp: new Date().toISOString(),
                access_context: 'admin_review',
                ip_address: request.ip
              });
            }
          }
          
          return profile;  // Return full profile to admin
        }
      `
    },
    
    cert_file_signed_url: {
      // Logic.1: Certification.cert_file signed URL generated
      scenario: 'Admin or caregiver downloads certification file',
      trigger: 'CreateFileSignedUrl called for Certification.cert_file_url',
      
      implementation: `
        // From F-002, F-007: Certification download button
        async function generateCertSignedUrl(user, certificationId) {
          const cert = await base44.entities.Certification.read(certificationId);
          
          // Edge.1: Check if signed URL already generated recently (within 15 min)
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
          const recentLog = await base44.asServiceRole.entities.PIIAccessLog.filter({
            accessor_user_id: user.id,
            target_entity_type: 'Certification',
            target_entity_id: cert.id,
            field_accessed: 'cert_file_url',
            access_timestamp: { $gte: fifteenMinutesAgo.toISOString() }
          });
          
          // Log only first generation within expiry window (Edge.1)
          if (recentLog.length === 0) {
            try {
              await base44.asServiceRole.entities.PIIAccessLog.create({
                accessor_user_id: user.id,
                accessor_role: user.role,
                field_accessed: 'cert_file_url',
                target_entity_type: 'Certification',
                target_entity_id: cert.id,
                access_timestamp: new Date().toISOString(),
                access_context: 'cert_download',
                ip_address: request.ip
              });
            } catch (error) {
              // Edge.2: If logging fails, block signed URL generation
              await sendOperatorAlert({
                severity: 'CRITICAL',
                message: 'PIIAccessLog write failed - signed URL blocked',
                details: { cert_id: cert.id, error: error.message }
              });
              throw new Error('Unable to log PII access - download blocked for compliance');
            }
          }
          
          // Log succeeded (or already logged recently) - safe to generate URL
          const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
            file_uri: cert.cert_file_url,
            expires_in: 900
          });
          
          return signed_url;
        }
      `
    },
    
    message_body_original_moderation: {
      // Logic.1: Message.body_original viewed for moderation
      scenario: 'Admin reviews unedited message content for abuse investigation',
      trigger: 'Admin accesses Message.body_original (F-002 admin-only field)',
      
      implementation: `
        async function getMessageForModeration(adminUser, messageId) {
          const message = await base44.asServiceRole.entities.Message.read(messageId);
          
          // Log access to body_original (unedited content)
          await base44.asServiceRole.entities.PIIAccessLog.create({
            accessor_user_id: adminUser.id,
            accessor_role: adminUser.role,
            field_accessed: 'body_original',
            target_entity_type: 'Message',
            target_entity_id: message.id,
            access_timestamp: new Date().toISOString(),
            access_context: 'moderation',
            ip_address: request.ip
          });
          
          return message;  // Return full message including body_original
        }
      `
    },
    
    bulk_export: {
      // Errors.2: Bulk admin export logs ONE entry, not one per record
      scenario: 'Admin exports user data to CSV for compliance review',
      trigger: 'Admin clicks "Export to CSV" button',
      
      implementation: `
        async function exportUserDataToCSV(adminUser, filters) {
          const users = await base44.entities.User.filter(filters);
          
          // Errors.2: ONE log entry for bulk export (not one per user)
          await base44.asServiceRole.entities.PIIAccessLog.create({
            accessor_user_id: adminUser.id,
            accessor_role: adminUser.role,
            field_accessed: 'full_log',  // Generic field for bulk export
            target_entity_type: 'AdminActionLog',  // Or 'User' depending on what's exported
            target_entity_id: 'export',  // Special ID for bulk operations
            access_timestamp: new Date().toISOString(),
            access_context: 'compliance_review_export',
            ip_address: request.ip
          });
          
          // Generate CSV with user data
          const csv = generateCSV(users);
          return csv;
        }
      `
    }
  },
  
  /**
   * ATOMICITY WITH PII REVEAL (Triggers.1)
   * Log write must succeed before PII is revealed
   */
  atomicity: {
    
    principle: 'If log write fails, PII access action is NOT performed',
    
    correct_pattern: `
      async function revealPII(user, piiField, targetEntity, targetId, context) {
        // Step 1: Create log entry FIRST
        try {
          await base44.asServiceRole.entities.PIIAccessLog.create({
            accessor_user_id: user.id,
            field_accessed: piiField,
            target_entity_type: targetEntity,
            target_entity_id: targetId,
            access_context: context,
            access_timestamp: new Date().toISOString()
          });
        } catch (error) {
          // Log write failed - block PII access
          await sendOperatorAlert({
            severity: 'CRITICAL',
            message: 'PIIAccessLog write failed - PII access blocked',
            details: { field: piiField, error: error.message }
          });
          throw new Error('Unable to log PII access - operation blocked for compliance');
        }
        
        // Step 2: Only proceed if log write succeeded
        return performPIIAccess(targetEntity, targetId, piiField);
      }
    `,
    
    incorrect_pattern: `
      // WRONG - PII revealed before logging
      async function revealPIIWrong(user, target) {
        const piiValue = await getPII(target);  // PII accessed first
        
        // Try to log (but might fail)
        await logPIIAccess(user, target);
        
        return piiValue;
        // Problem: If logging fails, PII already accessed without audit trail
      }
    `,
    
    error_handling: {
      // Errors.1: Log write failure → operator alert
      on_failure: [
        'Send immediate operator alert (CRITICAL severity)',
        'Block PII access action (email not sent, signed URL not generated)',
        'Surface error to admin user (if admin action)',
        'Do NOT silently drop log entries - missing entry is compliance gap'
      ],
      
      alert_implementation: `
        async function sendOperatorAlert(alert) {
          // Send email/SMS/Slack to operators
          await base44.integrations.Core.SendEmail({
            to: process.env.OPERATOR_EMAIL,
            subject: \`[\${alert.severity}] \${alert.message}\`,
            body: JSON.stringify(alert.details, null, 2)
          });
          
          // Also log to system error log
          await base44.entities.SystemErrorLog.create({
            severity: alert.severity,
            error_type: 'pii_access_log_failure',
            message: alert.message,
            details: JSON.stringify(alert.details),
            timestamp: new Date().toISOString()
          });
        }
      `
    }
  },
  
  /**
   * SERVER-SIDE ONLY (Logic.2, Access.1)
   * Client never knows log entry was created
   */
  server_side_enforcement: {
    
    rule: 'PIIAccessLog entries created server-side only - client unaware',
    
    write_access: {
      allowed: 'Server-side automations/backend functions only (Access.1)',
      denied: 'Direct client-side writes',
      enforcement: 'Base44 entity write permission restricted to system context'
    },
    
    read_access: {
      // Access.2: super_admin only
      allowed: 'super_admin role only',
      denied: ['trust_admin', 'support_admin', 'parent', 'caregiver'],
      rationale: 'PIIAccessLog contains sensitive metadata about who accessed what - most restricted access level'
    },
    
    client_visibility: {
      // UI.2: No user-facing UI
      users: 'Unaware of PII access logging',
      admins: 'trust_admin cannot see log (only super_admin)',
      super_admin: 'Can view log in admin panel (UI.1)'
    }
  },
  
  /**
   * ABUSE DETECTION (Abuse.1)
   * Alert on excessive PII access
   */
  abuse_detection: {
    
    threshold: {
      // Abuse.1: >20 different records in 60 minutes
      max_records: 20,
      time_window: '60 minutes',
      alert_to: 'super_admin',
      rationale: 'Possible data harvesting or unauthorized bulk PII access'
    },
    
    implementation: `
      // Trigger after each PIIAccessLog entry is created
      async function checkPIIAccessAbuse(accessor_user_id) {
        const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        // Count DISTINCT target_entity_id accessed by this user
        const recentAccesses = await base44.asServiceRole.entities.PIIAccessLog.filter({
          accessor_user_id: accessor_user_id,
          access_timestamp: { $gte: sixtyMinutesAgo.toISOString() }
        });
        
        // Count unique records accessed
        const uniqueRecords = new Set(recentAccesses.map(log => log.target_entity_id));
        
        if (uniqueRecords.size > 20) {
          // Trigger alert
          await sendSuperAdminAlert({
            severity: 'WARNING',
            title: 'Excessive PII access detected',
            details: {
              accessor_user_id: accessor_user_id,
              unique_records_accessed: uniqueRecords.size,
              time_window: '60 minutes',
              timestamp: new Date().toISOString()
            },
            actions: [
              'Review user account for compromise',
              'Check if accesses are legitimate (e.g., bulk admin review)',
              'Consider temporarily suspending user account pending investigation',
              'Review PIIAccessLog entries for this user'
            ]
          });
          
          // Also log the alert to AdminActionLog
          await base44.asServiceRole.entities.AdminActionLog.create({
            admin_user_id: 'SYSTEM',
            admin_role: 'system',
            action_type: 'manual_override',
            target_entity_type: 'User',
            target_entity_id: accessor_user_id,
            reason: \`AUTOMATED ALERT: Excessive PII access - \${uniqueRecords.size} unique records in 60 minutes\`,
            payload: JSON.stringify({
              unique_records_accessed: uniqueRecords.size,
              alert_sent: true
            }),
            action_timestamp: new Date().toISOString()
          });
        }
      }
    `,
    
    legitimate_scenarios: {
      bulk_export: 'Admin exports 100 users to CSV - logged as ONE entry (Errors.2)',
      moderation_queue: 'Admin reviews 25 flagged messages - legitimate, but triggers alert for review',
      compromise: 'Attacker with stolen admin credentials harvesting PII - alert detects abuse'
    }
  },
  
  /**
   * EDGE CASES (Edge.1-2)
   * Signed URL deduplication and failure handling
   */
  edge_cases: {
    
    signed_url_deduplication: {
      // Edge.1: Log only first URL generation within expiry window
      scenario: 'User clicks "Download" button multiple times within 15 minutes',
      problem: 'Each click generates new signed URL - would create redundant log entries',
      solution: 'Log only first generation within 15-minute window',
      
      implementation: `
        async function generateSignedUrlWithLogging(user, certId) {
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
          
          // Check if already logged recently
          const recentLog = await base44.asServiceRole.entities.PIIAccessLog.filter({
            accessor_user_id: user.id,
            target_entity_type: 'Certification',
            target_entity_id: certId,
            field_accessed: 'cert_file_url',
            access_timestamp: { $gte: fifteenMinutesAgo.toISOString() }
          });
          
          // Only log if NOT already logged in last 15 minutes
          if (recentLog.length === 0) {
            await logPIIAccess(user, 'cert_file_url', 'Certification', certId);
          }
          
          // Generate signed URL regardless (may be same URL if still valid)
          return createSignedUrl(certId);
        }
      `,
      
      rationale: 'Reduce log noise while maintaining compliance - one log entry per access window is sufficient'
    },
    
    logging_failure_blocks_access: {
      // Edge.2: If logging fails, block signed URL generation
      scenario: 'Database error prevents PIIAccessLog write',
      correct_behavior: 'Block signed URL generation until logging is restored',
      incorrect_behavior: 'Generate signed URL anyway - unlogged sensitive file access',
      
      implementation: `
        async function generateSignedUrl(user, certId) {
          try {
            // Attempt to create log entry
            await base44.asServiceRole.entities.PIIAccessLog.create({
              accessor_user_id: user.id,
              field_accessed: 'cert_file_url',
              target_entity_type: 'Certification',
              target_entity_id: certId,
              access_timestamp: new Date().toISOString()
            });
          } catch (error) {
            // Edge.2: Log write failed - block signed URL
            await sendOperatorAlert({
              severity: 'CRITICAL',
              message: 'PIIAccessLog write failed - cert download blocked',
              details: { cert_id: certId, user_id: user.id, error: error.message }
            });
            
            throw new Error('Unable to log PII access - download blocked for compliance. Please try again later.');
          }
          
          // Log succeeded - safe to generate signed URL
          return createSignedUrl(certId);
        }
      `,
      
      compliance_value: 'Ensures ALL sensitive file access is logged - no compliance gaps'
    }
  },
  
  /**
   * BACKUP & COMPLIANCE (Audit.1-2)
   * Monthly review and backup
   */
  backup_and_compliance: {
    
    monthly_review: {
      // Audit.1: Monthly review recommended
      frequency: 'Monthly',
      owner: 'Compliance officer or super_admin',
      
      checklist: [
        'Export PIIAccessLog to CSV',
        'Review for unusual patterns (same user, many records)',
        'Verify abuse alerts were investigated',
        'Check for unexpected PII access (e.g., non-admin accessing admin fields)',
        'Document review completion and findings'
      ]
    },
    
    daily_backup: {
      // Audit.2: Include in daily backup
      requirement: 'PIIAccessLog included in daily backup alongside AdminActionLog',
      verification: 'Daily backup test (F-101) must verify PIIAccessLog backup integrity',
      
      restore_procedure: 'Same as AdminActionLog - critical compliance data'
    }
  }
};

/**
 * ============================================================================
 * UI IMPLEMENTATION (UI.1-2)
 * super_admin-facing log viewer only
 * ============================================================================
 */
const UI_IMPLEMENTATION = {
  
  log_viewer: {
    // UI.1: super_admin-facing view
    access: 'super_admin only (Access.2)',
    features: [
      'Filterable by: accessor_user_id, field_accessed, date range',
      'Paginated (50 entries per page)',
      'Sortable by access_timestamp (default: newest first)',
      'Read-only - no edit or delete controls',
      'CSV export button'
    ],
    
    example_implementation: `
      import React, { useState } from 'react';
      import { base44 } from '@/api/base44Client';
      import { useQuery } from '@tanstack/react-query';
      import { Button } from '@/components/ui/button';
      import { Input } from '@/components/ui/input';
      import { Select } from '@/components/ui/select';
      
      export default function PIIAccessLogViewer() {
        const [filters, setFilters] = useState({
          accessor_user_id: '',
          field_accessed: '',
          start_date: '',
          end_date: ''
        });
        
        const { data: logs, isLoading } = useQuery({
          queryKey: ['pii-access-log', filters],
          queryFn: async () => {
            const query = {};
            if (filters.accessor_user_id) query.accessor_user_id = filters.accessor_user_id;
            if (filters.field_accessed) query.field_accessed = filters.field_accessed;
            if (filters.start_date) query.access_timestamp = { $gte: filters.start_date };
            
            return await base44.entities.PIIAccessLog.filter(query, '-access_timestamp', 50);
          }
        });
        
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">PII Access Log</h1>
            
            <div className="mb-4 flex gap-4">
              <Input
                placeholder="Accessor User ID"
                value={filters.accessor_user_id}
                onChange={(e) => setFilters({...filters, accessor_user_id: e.target.value})}
              />
              
              <Select
                value={filters.field_accessed}
                onChange={(value) => setFilters({...filters, field_accessed: value})}
              >
                <option value="">All Fields</option>
                <option value="phone">Phone</option>
                <option value="address">Address</option>
                <option value="cert_file_url">Certification File</option>
                <option value="body_original">Message Original</option>
              </Select>
              
              <Input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({...filters, start_date: e.target.value})}
              />
            </div>
            
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2">Timestamp</th>
                  <th className="p-2">Accessor</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Field</th>
                  <th className="p-2">Target Entity</th>
                  <th className="p-2">Target ID</th>
                  <th className="p-2">Context</th>
                </tr>
              </thead>
              <tbody>
                {logs?.map(log => (
                  <tr key={log.id} className="border-t">
                    <td className="p-2">{new Date(log.access_timestamp).toLocaleString()}</td>
                    <td className="p-2">{log.accessor_user_id}</td>
                    <td className="p-2">{log.accessor_role}</td>
                    <td className="p-2">{log.field_accessed}</td>
                    <td className="p-2">{log.target_entity_type}</td>
                    <td className="p-2">{log.target_entity_id}</td>
                    <td className="p-2">{log.access_context}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    `
  },
  
  no_user_ui: {
    // UI.2: Users unaware of logging
    rule: 'No user-facing UI - logging is transparent to end users',
    visibility: {
      parents: 'Unaware that phone access is logged',
      caregivers: 'Unaware that cert download is logged',
      trust_admin: 'Cannot view PIIAccessLog (only super_admin)',
      super_admin: 'Can view log in admin panel'
    }
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F009_CONFIGURATION_CHECKLIST = [
  {
    category: 'Entity Configuration',
    tasks: [
      { task: 'PIIAccessLog entity created with all required fields', status: 'complete' },
      { task: 'Configure Base44 permissions: create=system, read=super_admin, update=[], delete=[]', status: 'pending' },
      { task: 'Verify INSERT-only: attempt UPDATE as super_admin → expect 403', status: 'pending' },
      { task: 'Verify INSERT-only: attempt DELETE as super_admin → expect 403', status: 'pending' }
    ]
  },
  {
    category: 'Access Control',
    tasks: [
      { task: 'Verify super_admin can read PIIAccessLog', status: 'pending' },
      { task: 'Verify trust_admin CANNOT read PIIAccessLog (403)', status: 'pending' },
      { task: 'Verify support_admin CANNOT read PIIAccessLog (403)', status: 'pending' },
      { task: 'Verify client-side write attempt → 403 (server-side only)', status: 'pending' }
    ]
  },
  {
    category: 'Logging Integration',
    tasks: [
      { task: 'Integrate logging into booking acceptance email (F-077)', status: 'pending' },
      { task: 'Integrate logging into cert file signed URL generation (F-002)', status: 'pending' },
      { task: 'Integrate logging into admin address view (F-002)', status: 'pending' },
      { task: 'Integrate logging into message moderation (body_original access)', status: 'pending' },
      { task: 'Integrate logging into CSV export (one entry for bulk - Errors.2)', status: 'pending' }
    ]
  },
  {
    category: 'Atomicity',
    tasks: [
      { task: 'Implement atomicity: log write BEFORE PII reveal (Triggers.1)', status: 'pending' },
      { task: 'Test: Log write fails → email NOT sent', status: 'pending' },
      { task: 'Test: Log write fails → signed URL NOT generated (Edge.2)', status: 'pending' },
      { task: 'Configure operator alerts for log write failures (Errors.1)', status: 'pending' }
    ]
  },
  {
    category: 'Abuse Detection',
    tasks: [
      { task: 'Implement >20 unique records in 60 min detection', status: 'pending' },
      { task: 'Configure super_admin alert on abuse threshold', status: 'pending' },
      { task: 'Test: Access 21 unique records in 60 min → verify alert sent', status: 'pending' }
    ]
  },
  {
    category: 'Edge Cases',
    tasks: [
      { task: 'Implement signed URL deduplication (Edge.1)', status: 'pending' },
      { task: 'Test: Multiple downloads in 15 min → only one log entry', status: 'pending' },
      { task: 'Test: Log write failure → signed URL blocked (Edge.2)', status: 'pending' }
    ]
  },
  {
    category: 'UI Components',
    tasks: [
      { task: 'Create PIIAccessLogViewer component (super_admin only)', status: 'pending' },
      { task: 'Add filters: accessor, field, date range', status: 'pending' },
      { task: 'Add CSV export button', status: 'pending' },
      { task: 'Verify trust_admin cannot access viewer (403)', status: 'pending' }
    ]
  },
  {
    category: 'Backup & Compliance',
    tasks: [
      { task: 'Verify PIIAccessLog in daily backup (F-101)', status: 'pending' },
      { task: 'Schedule monthly compliance review (Audit.1)', status: 'pending' },
      { task: 'Document backup/restore procedure for PIIAccessLog', status: 'pending' }
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
    test: 'INSERT-only Enforcement',
    steps: [
      'Login as super_admin',
      'Attempt to update existing PIIAccessLog entry',
      'Verify: 403 Forbidden response',
      'Attempt to delete existing PIIAccessLog entry',
      'Verify: 403 Forbidden response'
    ]
  },
  {
    test: 'Access Control',
    steps: [
      'Login as super_admin → query PIIAccessLog → expect success',
      'Login as trust_admin → query PIIAccessLog → expect 403',
      'Login as support_admin → query PIIAccessLog → expect 403',
      'Login as parent → query PIIAccessLog → expect 403'
    ]
  },
  {
    test: 'Phone in Email Logging',
    steps: [
      'Accept booking (triggers email with caregiver phone)',
      'Verify: PIIAccessLog entry created BEFORE email sent',
      'Verify: Entry shows accessor=parent, field=phone, target=caregiver user',
      'Verify: booking_context_id = booking ID'
    ]
  },
  {
    test: 'Cert Download Logging',
    steps: [
      'Click "Download Certificate" button',
      'Verify: PIIAccessLog entry created',
      'Verify: Entry shows field=cert_file_url',
      'Click download again within 15 min',
      'Verify: NO new log entry (Edge.1 deduplication)'
    ]
  },
  {
    test: 'Atomicity',
    steps: [
      'Mock PIIAccessLog write failure',
      'Attempt to send booking acceptance email',
      'Verify: Email NOT sent',
      'Verify: NO PIIAccessLog entry created',
      'Verify: Operator alert sent (Errors.1)'
    ]
  },
  {
    test: 'Atomicity - Signed URL',
    steps: [
      'Mock PIIAccessLog write failure',
      'Attempt to download certification',
      'Verify: Signed URL NOT generated (Edge.2)',
      'Verify: User sees error message',
      'Verify: Operator alert sent'
    ]
  },
  {
    test: 'Abuse Detection',
    steps: [
      'Access PII in 21 unique records within 60 minutes',
      'Verify: Super_admin alert triggered after 20th unique record',
      'Verify: Alert logged to AdminActionLog'
    ]
  },
  {
    test: 'Bulk Export',
    steps: [
      'Export 100 user records to CSV',
      'Verify: ONE PIIAccessLog entry created (not 100)',
      'Verify: Entry shows field=full_log, target_entity_id=export'
    ]
  },
  {
    test: 'Signed URL Deduplication',
    steps: [
      'Download certification file',
      'Verify: PIIAccessLog entry created',
      'Download same file again 5 minutes later',
      'Verify: NO new PIIAccessLog entry (Edge.1)',
      'Download same file again 20 minutes later',
      'Verify: NEW PIIAccessLog entry (outside 15-min window)'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - Entity-level permission configuration (INSERT-only, super_admin read only)
 * - Server-side automation hooks for PII access events
 * - Atomicity support (log BEFORE PII reveal)
 * - Operator alert system for log write failures
 * 
 * Supporting Entities:
 * - PIIAccessLog (primary entity for this feature)
 * - AdminActionLog (logs abuse alerts)
 * 
 * Integration with Other Features:
 * - F-002: Field-level security (defines which fields are PII)
 * - F-007: Masked display (log when full value accessed)
 * - F-077: Booking acceptance email (phone reveal logged)
 * - F-101: Daily backup includes PIIAccessLog
 * 
 * CRITICAL WARNINGS:
 * - Data.2: INSERT-only - configure at Base44 permission layer
 * - Triggers.1: Atomicity REQUIRED - log BEFORE PII reveal
 * - Access.2: super_admin ONLY read access (more restrictive than AdminActionLog)
 * - Edge.2: Block PII access if logging fails (compliance gap prevention)
 * - Errors.1: Operator alert for log write failures (non-blocking but critical)
 * - Errors.2: Bulk export = one log entry (not one per record)
 * 
 * NEXT STEPS:
 * 1. Configure Base44 entity permissions (INSERT-only, super_admin read)
 * 2. Integrate logging into all PII access points
 * 3. Implement atomicity (log BEFORE reveal)
 * 4. Implement abuse detection (>20 records in 60 min)
 * 5. Implement signed URL deduplication (Edge.1)
 * 6. Create PIIAccessLogViewer UI component
 * 7. Test all acceptance criteria
 * 8. Include in daily backup verification
 */

export default function F009PIIAccessLogDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-009: PII Access Logging - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Entity created (PIIAccessLog)</p>
      <p><strong>Next Step:</strong> Configure Base44 INSERT-only permissions + implement logging middleware</p>
      
      <h2>Purpose (Data.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Log Type</th>
            <th>What It Logs</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>PIIAccessLog</strong></td>
            <td>PII data <strong>READS</strong></td>
            <td>Phone in email, admin views address, cert file download</td>
          </tr>
          <tr>
            <td><strong>AdminActionLog</strong></td>
            <td>Admin <strong>WRITES</strong></td>
            <td>Verify caregiver, suspend user, change role</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Critical Requirements</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ ATOMICITY (Triggers.1)</strong>
        <p><strong>Log write MUST succeed BEFORE PII is revealed</strong></p>
        <ul>
          <li>If log write fails → email NOT sent</li>
          <li>If log write fails → signed URL NOT generated (Edge.2)</li>
          <li>Send operator alert on failure (Errors.1)</li>
          <li>Do NOT silently drop log entries - compliance gap</li>
        </ul>
      </div>
      
      <h2>Access Control (Access.1-2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Role</th>
            <th>Read</th>
            <th>Write</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>super_admin</td>
            <td>✓</td>
            <td>Server-side only</td>
          </tr>
          <tr>
            <td>trust_admin</td>
            <td><strong>✗</strong> (more restrictive than AdminActionLog)</td>
            <td>✗</td>
          </tr>
          <tr>
            <td>support_admin</td>
            <td>✗</td>
            <td>✗</td>
          </tr>
          <tr>
            <td>parent/caregiver</td>
            <td>✗</td>
            <td>✗</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Logging Triggers (Logic.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Trigger</th>
            <th>Field</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Booking acceptance email</td>
            <td>phone</td>
            <td>booking_accepted</td>
          </tr>
          <tr>
            <td>Admin views address</td>
            <td>address_line_1, address_line_2, zip_code</td>
            <td>admin_review</td>
          </tr>
          <tr>
            <td>Cert file download</td>
            <td>cert_file_url</td>
            <td>cert_download</td>
          </tr>
          <tr>
            <td>Message moderation</td>
            <td>body_original</td>
            <td>moderation</td>
          </tr>
          <tr>
            <td>CSV export</td>
            <td>full_log</td>
            <td>compliance_review_export</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Abuse Detection (Abuse.1)</h2>
      <ul>
        <li><strong>Threshold:</strong> &gt;20 unique records in 60 minutes</li>
        <li><strong>Alert:</strong> Super_admin notification</li>
        <li><strong>Reason:</strong> Possible data harvesting</li>
        <li><strong>Example:</strong> Compromised admin account bulk-accessing PII</li>
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
            <td>Signed URL requested multiple times (Edge.1)</td>
            <td>Log only FIRST generation within 15-min window</td>
          </tr>
          <tr>
            <td>Log write fails (Edge.2)</td>
            <td>Block signed URL generation + operator alert</td>
          </tr>
          <tr>
            <td>Bulk export (Errors.2)</td>
            <td>ONE log entry for entire export (not one per record)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>UI (UI.1-2)</h2>
      <ul>
        <li><strong>super_admin view:</strong> Filterable table (accessor, field, date range)</li>
        <li><strong>Users:</strong> Unaware of logging (no user-facing UI)</li>
        <li><strong>trust_admin:</strong> Cannot view log (super_admin only)</li>
      </ul>
      
      <h2>Backup & Compliance (Audit.1-2)</h2>
      <ol>
        <li><strong>Daily Backup:</strong> PIIAccessLog included in F-101 daily backup</li>
        <li><strong>Monthly Review:</strong> Export log, check for unusual patterns</li>
        <li><strong>Restore Procedure:</strong> Same as AdminActionLog</li>
      </ol>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Configure Base44 permissions: create=system, read=super_admin, update=[], delete=[]</li>
        <li>Integrate logging into booking acceptance email (F-077)</li>
        <li>Integrate logging into cert file signed URL (F-002, F-007)</li>
        <li>Integrate logging into admin address view (F-002)</li>
        <li>Integrate logging into CSV export (one entry for bulk)</li>
        <li>Implement atomicity (log BEFORE PII reveal)</li>
        <li>Implement abuse detection (&gt;20 records in 60 min)</li>
        <li>Implement signed URL deduplication (Edge.1)</li>
        <li>Configure operator alerts for log failures</li>
        <li>Create PIIAccessLogViewer UI component</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete specification, pseudocode, and integration examples.</em></p>
    </div>
  );
}