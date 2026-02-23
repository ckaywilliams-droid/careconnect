/**
 * F-016: FLAG & REPORT DATA MODEL CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-016
 * Flag & Report Data Model. Allows authenticated users to report content for admin
 * review with automatic escalation and duplicate detection.
 * 
 * STATUS: Phase 0 - FlaggedContent entity created
 * NEXT STEP: Implement report creation validation + admin moderation queue
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F016_FLAG_REPORT_SPECIFICATION = {
  
  /**
   * ENTITY SCHEMA (Data.1)
   * FlaggedContent collection
   */
  entity_schema: {
    
    flagged_content: {
      entity: 'FlaggedContent',
      purpose: 'Track user reports of inappropriate content for admin moderation',
      
      fields: {
        id: 'UUID (auto)',
        reporter_user_id: 'Relation:User (required) - User who submitted report',
        target_type: 'Select (required) - Type of content (user/message/profile/review)',
        target_id: 'Text (required) - ID of flagged content',
        reason: 'Select (required) - Report category (spam/harassment/fake_profile/etc)',
        reason_detail: 'Text (optional, max 500 chars) - Additional detail',
        status: 'Select (default: pending) - pending/reviewed/resolved',
        reviewed_by_admin_id: 'Relation:User (nullable) - Admin who reviewed',
        reviewed_at: 'DateTime (nullable) - When admin reviewed',
        resolution_note: 'Text (nullable) - Admin notes on resolution',
        created_date: 'DateTime (auto) - When report was created',
        is_deleted: 'Boolean (default: false) - Soft delete (Logic.2: never actually deleted)'
      },
      
      access_control: {
        // Access.2: Writable INSERT by any authenticated user
        create: ['parent', 'caregiver', 'support_admin', 'trust_admin', 'super_admin'],
        
        // Access.2: Writable UPDATE by admins only
        update: ['support_admin', 'trust_admin', 'super_admin'],
        update_fields: ['status', 'reviewed_by_admin_id', 'reviewed_at', 'resolution_note'],
        
        // Access.3: Readable by reporter (own reports) and admins (all reports)
        read: 'Reporter sees own reports, admins see all'
      }
    },
    
    phase_dependency: {
      // Data.2: Must exist before messaging (Phase 7)
      requirement: 'FlaggedContent entity must exist before Phase 7 (Messaging)',
      rationale: 'Messages can be flagged - entity must be ready',
      current_phase: 'Phase 0 (MVP Security)',
      messaging_phase: 'Phase 7'
    }
  },
  
  /**
   * STATUS STATE MACHINE (States.1)
   * Pending → Reviewed → Resolved
   */
  status_state_machine: {
    
    states: {
      pending: {
        state: 'Pending',
        description: 'Report created, awaiting admin review',
        allowed_actions: ['Admin: Mark as Reviewed', 'Admin: Resolve'],
        transitions: ['reviewed', 'resolved']
      },
      
      reviewed: {
        state: 'Reviewed',
        description: 'Admin has looked at the report',
        allowed_actions: ['Admin: Resolve'],
        transitions: ['resolved']
      },
      
      resolved: {
        state: 'Resolved',
        description: 'Admin has taken action or dismissed',
        allowed_actions: ['None - terminal state'],
        transitions: []
      }
    },
    
    transition_rules: {
      // States.1: All transitions admin-only
      rule: 'Only admins can update status - reporters cannot change status',
      enforcement: 'Access.2: status field writable by admins only',
      
      logging: 'All status transitions logged to AdminActionLog (Audit.2)'
    },
    
    state_diagram: `
      ┌──────────┐
      │ Pending  │ ← Report created by user
      └────┬─────┘
           │
           │ Admin reviews
           ↓
      ┌──────────┐
      │ Reviewed │ ← Admin has looked at it
      └────┬─────┘
           │
           │ Admin takes action
           ↓
      ┌──────────┐
      │ Resolved │ ← Admin resolved or dismissed (terminal)
      └──────────┘
    `
  },
  
  /**
   * DUPLICATE DETECTION (Logic.1)
   * One active report per reporter+target
   */
  duplicate_detection: {
    
    rule: {
      // Logic.1: One active report per reporter+target combination
      requirement: 'Only allow one active (pending/reviewed) report per reporter_id + target_id',
      on_duplicate: 'Surface existing report to reporter - do NOT create new one',
      rationale: 'Prevent spam reporting by same user'
    },
    
    implementation: {
      server_side: `
        // Report creation validation
        async function createReport(reporterUser, reportData) {
          // Logic.1: Check for existing active report
          const existingReport = await base44.entities.FlaggedContent.filter({
            reporter_user_id: reporterUser.id,
            target_id: reportData.target_id,
            status: { $in: ['pending', 'reviewed'] }
          });
          
          if (existingReport.length > 0) {
            // Duplicate detected - surface existing report
            return {
              success: false,
              error: 'duplicate_report',
              message: 'You have already reported this content. Your report is being reviewed.',
              existing_report_id: existingReport[0].id,
              existing_report_status: existingReport[0].status
            };
          }
          
          // No duplicate - create report
          const report = await base44.entities.FlaggedContent.create({
            reporter_user_id: reporterUser.id,
            target_type: reportData.target_type,
            target_id: reportData.target_id,
            reason: reportData.reason,
            reason_detail: reportData.reason_detail,
            status: 'pending'
          });
          
          // Triggers.1: Check for auto-escalation
          await checkAutoEscalation(reportData.target_id);
          
          // Abuse.1: Send confirmation to reporter
          await sendReporterConfirmation(reporterUser, report);
          
          // Abuse.2: Notify admin
          await notifyAdminOfNewReport(report);
          
          return {
            success: true,
            report: report
          };
        }
      `,
      
      allowed_scenarios: {
        new_report: 'User reports content A → allowed (no existing report)',
        duplicate_active: 'User reports content A again → blocked (existing pending report)',
        resolved_then_new: 'User reports content A (resolved) → report again → allowed (previous resolved)'
      }
    }
  },
  
  /**
   * AUTO-ESCALATION (Triggers.1)
   * 3+ reports on same target → AbuseAlert
   */
  auto_escalation: {
    
    threshold: {
      // Triggers.1: 3+ pending reports from different reporters
      requirement: '3 or more pending reports from different reporters on same target_id',
      action: 'Create AbuseAlert (F-014) + email admin',
      no_auto_suspension: 'Does NOT auto-suspend reported user (Triggers.2)'
    },
    
    implementation: {
      server_side: `
        // After creating each FlaggedContent record
        async function checkAutoEscalation(targetId) {
          // Count pending reports on this target from different reporters
          const pendingReports = await base44.entities.FlaggedContent.filter({
            target_id: targetId,
            status: 'pending'
          });
          
          // Count unique reporters
          const uniqueReporters = new Set(pendingReports.map(r => r.reporter_user_id));
          
          if (uniqueReporters.size >= 3) {
            // Triggers.1: Auto-escalation threshold reached
            
            // Check if AbuseAlert already exists for this target
            const existingAlert = await base44.entities.AbuseAlert.filter({
              alert_type: 'multiple_reports',
              metadata: { $regex: targetId }  // Check if target_id in metadata
            });
            
            if (existingAlert.length === 0) {
              // Create AbuseAlert (F-014)
              await base44.asServiceRole.entities.AbuseAlert.create({
                alert_type: 'other',
                source_user_id: null,  // Multiple users involved
                source_ip: null,
                description: \`Content auto-escalated: \${uniqueReporters.size} users reported same target\`,
                severity: 'high',
                metadata: JSON.stringify({
                  target_id: targetId,
                  report_count: pendingReports.length,
                  unique_reporters: uniqueReporters.size,
                  reason_categories: pendingReports.map(r => r.reason)
                })
              });
              
              // Send immediate admin notification
              await base44.integrations.Core.SendEmail({
                to: process.env.ADMIN_EMAIL,
                subject: '[URGENT] Content Auto-Escalated - Multiple Reports',
                body: \`
                  A piece of content has been reported by \${uniqueReporters.size} different users:
                  
                  Target ID: \${targetId}
                  Report Count: \${pendingReports.length}
                  Reasons: \${pendingReports.map(r => r.reason).join(', ')}
                  
                  This requires immediate review in the moderation queue.
                \`
              });
              
              console.warn('Content auto-escalated', {
                target_id: targetId,
                report_count: pendingReports.length,
                unique_reporters: uniqueReporters.size
              });
            }
          }
        }
      `
    }
  },
  
  /**
   * REPORTER RATE LIMITING (Errors.1)
   * Prevent report flooding
   */
  reporter_rate_limiting: {
    
    threshold: {
      // Errors.1: >10 reports in 24 hours
      limit: '10 reports per 24 hours per user',
      action: 'Flag reporter account for admin review',
      rationale: 'Prevent report flooding being used as attack vector'
    },
    
    implementation: {
      server_side: `
        // Check reporter rate limit before creating report
        async function checkReporterRateLimit(reporterUserId) {
          const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
          
          const recentReports = await base44.entities.FlaggedContent.filter({
            reporter_user_id: reporterUserId,
            created_date: { $gte: last24Hours.toISOString() }
          });
          
          if (recentReports.length >= 10) {
            // Errors.1: Rate limit exceeded - flag reporter
            
            // Check if already flagged
            const existingFlag = await base44.entities.FlaggedContent.filter({
              target_type: 'user',
              target_id: reporterUserId,
              reason: 'other',
              status: 'pending'
            });
            
            if (existingFlag.length === 0) {
              // Create FlaggedContent for the reporter
              await base44.asServiceRole.entities.FlaggedContent.create({
                reporter_user_id: 'SYSTEM',
                target_type: 'user',
                target_id: reporterUserId,
                reason: 'other',
                reason_detail: \`Report flooding: \${recentReports.length} reports in 24 hours\`,
                status: 'pending'
              });
              
              // Notify admin
              await sendAdminAlert({
                severity: 'WARNING',
                title: 'Reporter flagged for excessive reports',
                details: {
                  reporter_user_id: reporterUserId,
                  report_count: recentReports.length,
                  time_window: '24 hours'
                }
              });
            }
            
            // Still allow the report (don't block legitimate reporters)
            // Admin will review if it's abuse
          }
        }
      `
    }
  },
  
  /**
   * REPORTER CONFIRMATION (Abuse.1)
   * User receives confirmation after reporting
   */
  reporter_confirmation: {
    
    notification: {
      // Abuse.1: Confirmation when report created
      method: 'In-app notification or email',
      
      message: {
        title: 'Report Submitted',
        body: 'Thank you for your report. Our moderation team will review it shortly.',
        no_outcome_notification: 'Reporter is NOT notified of admin action outcome at MVP'
      },
      
      implementation: `
        async function sendReporterConfirmation(reporterUser, report) {
          // Abuse.1: Send confirmation
          
          // Option 1: In-app notification (if notification system exists)
          // await createNotification(reporterUser.id, {
          //   type: 'report_confirmation',
          //   message: 'Your report has been submitted. Our team will review it shortly.'
          // });
          
          // Option 2: Email
          await base44.integrations.Core.SendEmail({
            to: reporterUser.email,
            subject: 'Report Submitted',
            body: \`
              Thank you for reporting content that violates our community guidelines.
              
              Your report has been submitted and our moderation team will review it shortly.
              
              Report ID: \${report.id}
              Content Type: \${report.target_type}
              Reason: \${report.reason}
              
              You will not receive updates on the outcome of this report.
            \`
          });
        }
      `
    }
  },
  
  /**
   * ADMIN NOTIFICATION (Abuse.2)
   * Admin receives email on new reports
   */
  admin_notification: {
    
    trigger: {
      // Abuse.2: Email on new report or auto-escalation
      when: [
        'New FlaggedContent record created',
        'Auto-escalation threshold reached (3+ reports)'
      ],
      recipient: 'Admin email (from environment variables)'
    },
    
    implementation: {
      new_report: `
        async function notifyAdminOfNewReport(report) {
          // Abuse.2: Email notification
          await base44.integrations.Core.SendEmail({
            to: process.env.ADMIN_EMAIL,
            subject: 'New Content Report',
            body: \`
              A new content report has been submitted:
              
              Reporter: \${report.reporter_user_id}
              Content Type: \${report.target_type}
              Content ID: \${report.target_id}
              Reason: \${report.reason}
              Detail: \${report.reason_detail || 'None provided'}
              
              Review in moderation queue: {{moderation_queue_url}}
            \`
          });
        }
      `,
      
      auto_escalation: 'See auto_escalation.implementation above'
    }
  },
  
  /**
   * ANONYMOUS REPORTING (Errors.2)
   * Not permitted at MVP
   */
  anonymous_reporting: {
    
    requirement: {
      // Errors.2: Authenticated users only
      rule: 'Anonymous reporting NOT permitted at MVP',
      enforcement: 'reporter_user_id required - taken from session user (Access.1)',
      rationale: 'Prevent abuse - accountability required for reporting'
    },
    
    implementation: {
      // Access.1: reporter_id set from session
      server_side: `
        async function createReport(req, reportData) {
          // Access.1: reporter_user_id MUST be from session
          const reporterUser = req.user;  // From auth middleware
          
          if (!reporterUser) {
            // Errors.2: Unauthenticated - reject
            return res.status(401).json({
              error: 'authentication_required',
              message: 'You must be logged in to report content'
            });
          }
          
          // Never trust client-supplied reporter_id
          const report = await base44.entities.FlaggedContent.create({
            reporter_user_id: reporterUser.id,  // From session
            target_type: reportData.target_type,
            target_id: reportData.target_id,
            reason: reportData.reason,
            reason_detail: reportData.reason_detail
          });
        }
      `
    }
  },
  
  /**
   * EDGE CASES (Edge.1-2)
   * Deleted content and cross-report duplicates
   */
  edge_cases: {
    
    deleted_content: {
      // Edge.1: Reported content deleted before admin review
      scenario: 'Message/profile deleted, but FlaggedContent record still exists',
      
      admin_experience: {
        display: 'Admin moderation queue shows "Target content no longer exists"',
        status: 'Report remains in system, marked as resolved',
        resolution_note: 'Auto-resolved: Target content deleted',
        audit_value: 'Report retained for pattern analysis (Logic.2)'
      },
      
      implementation: `
        // Admin moderation queue - fetch target content
        async function getReportWithTarget(reportId) {
          const report = await base44.entities.FlaggedContent.read(reportId);
          
          // Try to fetch target content
          let targetContent = null;
          try {
            if (report.target_type === 'message') {
              targetContent = await base44.entities.Message.read(report.target_id);
            } else if (report.target_type === 'caregiver_profile') {
              targetContent = await base44.entities.CaregiverProfile.read(report.target_id);
            }
            // ... etc for other types
          } catch (error) {
            // Edge.1: Target no longer exists
            targetContent = null;
          }
          
          return {
            report: report,
            target: targetContent,
            target_exists: targetContent !== null
          };
        }
        
        // Display in admin UI
        if (!targetContent) {
          return (
            <div className="text-gray-500 italic">
              Target content no longer exists
            </div>
          );
        }
      `
    },
    
    cross_report_duplicates: {
      // Edge.2: 20 users report same incident
      scenario: '20 different users report the same message',
      
      storage: {
        // Edge.2: All 20 records retained
        rule: 'All FlaggedContent records retained (Logic.2)',
        no_deduplication: 'Do NOT merge or delete duplicate cross-user reports',
        rationale: 'Each report is independent - shows severity of issue'
      },
      
      admin_ui: {
        // UI.2: Admin queue groups by target
        display: 'Moderation queue groups reports by target_id',
        grouping: 'Show "20 reports" with reason breakdown',
        
        example: `
          // Admin moderation queue grouping
          const groupedReports = {};
          
          for (const report of allReports) {
            if (!groupedReports[report.target_id]) {
              groupedReports[report.target_id] = {
                target_id: report.target_id,
                target_type: report.target_type,
                reports: [],
                total_count: 0,
                reason_breakdown: {}
              };
            }
            
            groupedReports[report.target_id].reports.push(report);
            groupedReports[report.target_id].total_count++;
            
            const reason = report.reason;
            groupedReports[report.target_id].reason_breakdown[reason] = 
              (groupedReports[report.target_id].reason_breakdown[reason] || 0) + 1;
          }
          
          // Display: "Message #abc123: 20 reports (15 spam, 3 harassment, 2 inappropriate)"
        `
      }
    }
  },
  
  /**
   * IMMUTABILITY (Logic.2)
   * Never delete FlaggedContent records
   */
  immutability: {
    
    requirement: {
      // Logic.2: Never deleted
      rule: 'FlaggedContent records are NEVER deleted',
      retention: 'Resolved reports retained indefinitely for pattern analysis',
      
      soft_delete: {
        available: 'is_deleted field exists for soft delete',
        usage: 'If needed for UI filtering, but should not be used',
        audit: 'All reports retained for compliance'
      }
    },
    
    use_cases: {
      pattern_analysis: 'Detect repeat offenders - user has 10 resolved reports',
      compliance: 'Legal requirement to retain moderation decisions',
      admin_history: 'Review past admin actions for quality assurance'
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-2)
   * Report creation and admin actions
   */
  logging_and_audit: {
    
    report_creation: {
      // Audit.1: Log every report
      log_destination: 'F-010 structured logging (Sentry) + FlaggedContent entity itself',
      
      fields: [
        'reporter_user_id',
        'target_type',
        'target_id',
        'reason',
        'created_date'
      ],
      
      implementation: `
        // Report creation logging
        console.info('FlaggedContent created', {
          report_id: report.id,
          reporter_user_id: report.reporter_user_id,
          target_type: report.target_type,
          target_id: report.target_id,
          reason: report.reason
        });
      `
    },
    
    admin_resolution: {
      // Audit.2: Log to AdminActionLog
      collection: 'AdminActionLog',
      
      action_types: {
        content_approved: 'Admin reviewed and approved content (report dismissed)',
        content_removed: 'Admin removed/deleted reported content'
      },
      
      implementation: `
        // Admin resolves report
        async function resolveReport(adminUser, reportId, action, resolutionNote) {
          const report = await base44.entities.FlaggedContent.read(reportId);
          
          // Update report status
          await base44.entities.FlaggedContent.update(reportId, {
            status: 'resolved',
            reviewed_by_admin_id: adminUser.id,
            reviewed_at: new Date().toISOString(),
            resolution_note: resolutionNote
          });
          
          // Audit.2: Log to AdminActionLog
          await base44.entities.AdminActionLog.create({
            admin_user_id: adminUser.id,
            admin_role: adminUser.role,
            action_type: action,  // 'content_approved' or 'content_removed'
            target_entity_type: report.target_type,
            target_entity_id: report.target_id,
            reason: resolutionNote,
            payload: JSON.stringify({
              report_id: reportId,
              reporter_user_id: report.reporter_user_id,
              report_reason: report.reason
            }),
            action_timestamp: new Date().toISOString()
          });
        }
      `
    }
  },
  
  /**
   * REPORTER UI (UI.1)
   * Simple report modal
   */
  reporter_ui: {
    
    report_modal: {
      // UI.1: Report modal
      trigger: 'User clicks "Report" button on content',
      
      fields: [
        {
          field: 'reason',
          type: 'Dropdown (required)',
          options: ['Spam', 'Harassment', 'Fake Profile', 'Inappropriate Content', 'Safety Concern', 'Underage', 'Other']
        },
        {
          field: 'reason_detail',
          type: 'Text area (optional)',
          placeholder: 'Additional details (optional, max 500 characters)',
          max_length: 500
        }
      ],
      
      buttons: ['Cancel', 'Submit Report'],
      
      confirmation: {
        message: 'Thank you for your report. Our moderation team will review it shortly.',
        no_outcome_notification: 'Reporter NOT notified of outcome at MVP (UI.1)'
      },
      
      implementation_example: `
        import React, { useState } from 'react';
        import { base44 } from '@/api/base44Client';
        import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
        import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
        import { Textarea } from '@/components/ui/textarea';
        import { Button } from '@/components/ui/button';
        
        export default function ReportModal({ targetType, targetId, onClose }) {
          const [reason, setReason] = useState('');
          const [reasonDetail, setReasonDetail] = useState('');
          const [submitted, setSubmitted] = useState(false);
          
          const handleSubmit = async () => {
            try {
              const response = await createReport({
                target_type: targetType,
                target_id: targetId,
                reason: reason,
                reason_detail: reasonDetail
              });
              
              if (response.error === 'duplicate_report') {
                alert('You have already reported this content.');
                return;
              }
              
              setSubmitted(true);
            } catch (error) {
              alert('Failed to submit report: ' + error.message);
            }
          };
          
          if (submitted) {
            return (
              <Dialog open onOpenChange={onClose}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Report Submitted</DialogTitle>
                  </DialogHeader>
                  <p>
                    Thank you for your report. Our moderation team will review it shortly.
                  </p>
                  <Button onClick={onClose}>Close</Button>
                </DialogContent>
              </Dialog>
            );
          }
          
          return (
            <Dialog open onOpenChange={onClose}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Report Content</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Reason (required)
                    </label>
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spam">Spam</SelectItem>
                        <SelectItem value="harassment">Harassment</SelectItem>
                        <SelectItem value="fake_profile">Fake Profile</SelectItem>
                        <SelectItem value="inappropriate_content">Inappropriate Content</SelectItem>
                        <SelectItem value="safety_concern">Safety Concern</SelectItem>
                        <SelectItem value="underage">Underage</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Additional Details (optional, max 500 characters)
                    </label>
                    <Textarea
                      placeholder="Provide any additional context..."
                      value={reasonDetail}
                      onChange={(e) => setReasonDetail(e.target.value.slice(0, 500))}
                      rows={4}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {reasonDetail.length} / 500 characters
                    </p>
                  </div>
                  
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!reason}>
                      Submit Report
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          );
        }
      `
    }
  },
  
  /**
   * ADMIN MODERATION QUEUE (UI.2)
   * Grouped by target, filtered by status
   */
  admin_moderation_queue: {
    
    features: {
      // UI.2: Admin moderation queue
      grouping: 'Reports grouped by target_id',
      display: [
        'Target content preview',
        'Total report count',
        'Reason breakdown (5 spam, 2 harassment)',
        'Latest report detail',
        'Status filter (pending/reviewed/resolved)'
      ],
      
      actions: [
        'Mark as Reviewed',
        'Resolve (with note)',
        'View all reports for target',
        'Take action on target (delete, suspend user, etc)'
      ]
    },
    
    implementation_example: `
      import React, { useState } from 'react';
      import { base44 } from '@/api/base44Client';
      import { useQuery } from '@tanstack/react-query';
      import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
      import { Button } from '@/components/ui/button';
      import { Badge } from '@/components/ui/badge';
      
      export default function ModerationQueue() {
        const [statusFilter, setStatusFilter] = useState('pending');
        
        const { data: reports, isLoading } = useQuery({
          queryKey: ['flagged-content', statusFilter],
          queryFn: async () => {
            return await base44.entities.FlaggedContent.filter({
              status: statusFilter
            }, '-created_date', 100);
          }
        });
        
        // UI.2: Group reports by target_id
        const groupedReports = React.useMemo(() => {
          if (!reports) return {};
          
          const grouped = {};
          for (const report of reports) {
            const key = report.target_id;
            if (!grouped[key]) {
              grouped[key] = {
                target_id: report.target_id,
                target_type: report.target_type,
                reports: [],
                total_count: 0,
                reason_breakdown: {},
                latest_report: null
              };
            }
            
            grouped[key].reports.push(report);
            grouped[key].total_count++;
            
            const reason = report.reason;
            grouped[key].reason_breakdown[reason] = 
              (grouped[key].reason_breakdown[reason] || 0) + 1;
            
            // Track latest report
            if (!grouped[key].latest_report || 
                new Date(report.created_date) > new Date(grouped[key].latest_report.created_date)) {
              grouped[key].latest_report = report;
            }
          }
          
          return grouped;
        }, [reports]);
        
        return (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">Moderation Queue</h1>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-4">
              {Object.values(groupedReports).map((group) => (
                <div key={group.target_id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">
                        {group.target_type} #{group.target_id.slice(0, 8)}...
                      </h3>
                      <p className="text-sm text-gray-600">
                        {group.total_count} {group.total_count === 1 ? 'report' : 'reports'}
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      {Object.entries(group.reason_breakdown).map(([reason, count]) => (
                        <Badge key={reason} variant="outline">
                          {count} {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {group.latest_report?.reason_detail && (
                    <p className="text-sm text-gray-700 mb-3">
                      Latest: "{group.latest_report.reason_detail}"
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      View All Reports
                    </Button>
                    <Button variant="outline" size="sm">
                      Mark Reviewed
                    </Button>
                    <Button size="sm">
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
    `
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F016_CONFIGURATION_CHECKLIST = [
  {
    category: 'Entity Configuration',
    tasks: [
      { task: 'FlaggedContent entity created with all required fields', status: 'complete' },
      { task: 'Configure permissions: CREATE by any auth user (Access.2)', status: 'pending' },
      { task: 'Configure permissions: UPDATE by admins only (Access.2)', status: 'pending' },
      { task: 'Configure permissions: READ by reporter (own) + admins (all) (Access.3)', status: 'pending' }
    ]
  },
  {
    category: 'Report Creation Validation',
    tasks: [
      { task: 'Implement createReport function', status: 'pending' },
      { task: 'reporter_user_id from session (Access.1) - never user-supplied', status: 'pending' },
      { task: 'Duplicate detection: check existing pending/reviewed (Logic.1)', status: 'pending' },
      { task: 'On duplicate: surface existing report (do not create)', status: 'pending' },
      { task: 'Validate reason_detail max 500 chars', status: 'pending' }
    ]
  },
  {
    category: 'Auto-Escalation',
    tasks: [
      { task: 'Implement checkAutoEscalation function (Triggers.1)', status: 'pending' },
      { task: 'Count pending reports from different reporters', status: 'pending' },
      { task: 'If >= 3: Create AbuseAlert (F-014)', status: 'pending' },
      { task: 'Send immediate admin email notification', status: 'pending' },
      { task: 'Do NOT auto-suspend reported user (Triggers.2)', status: 'pending' }
    ]
  },
  {
    category: 'Reporter Rate Limiting',
    tasks: [
      { task: 'Implement checkReporterRateLimit function (Errors.1)', status: 'pending' },
      { task: 'Count reports in last 24 hours', status: 'pending' },
      { task: 'If > 10: Flag reporter account for review', status: 'pending' },
      { task: 'Still allow report (do not block - admin reviews)', status: 'pending' }
    ]
  },
  {
    category: 'Notifications',
    tasks: [
      { task: 'Implement sendReporterConfirmation (Abuse.1)', status: 'pending' },
      { task: 'Send email: "Report submitted, under review"', status: 'pending' },
      { task: 'Implement notifyAdminOfNewReport (Abuse.2)', status: 'pending' },
      { task: 'Send admin email on every new report', status: 'pending' }
    ]
  },
  {
    category: 'Anonymous Reporting Prevention',
    tasks: [
      { task: 'Enforce authentication for reporting (Errors.2)', status: 'pending' },
      { task: 'Return 401 if unauthenticated user attempts report', status: 'pending' },
      { task: 'Test: Unauthenticated request → 401', status: 'pending' }
    ]
  },
  {
    category: 'Edge Cases',
    tasks: [
      { task: 'Handle deleted content in admin queue (Edge.1)', status: 'pending' },
      { task: 'Display "Target no longer exists" if content deleted', status: 'pending' },
      { task: 'Keep report in system (Logic.2 - never delete)', status: 'pending' },
      { task: 'Admin queue grouping by target_id (Edge.2)', status: 'pending' }
    ]
  },
  {
    category: 'Reporter UI',
    tasks: [
      { task: 'Create ReportModal component (UI.1)', status: 'pending' },
      { task: 'Reason dropdown (required)', status: 'pending' },
      { task: 'Reason detail textarea (optional, max 500)', status: 'pending' },
      { task: 'Confirmation message after submission', status: 'pending' },
      { task: 'Handle duplicate report error gracefully', status: 'pending' }
    ]
  },
  {
    category: 'Admin Moderation Queue',
    tasks: [
      { task: 'Create ModerationQueue component (UI.2)', status: 'pending' },
      { task: 'Group reports by target_id', status: 'pending' },
      { task: 'Display: report count, reason breakdown, latest detail', status: 'pending' },
      { task: 'Status filter: pending/reviewed/resolved', status: 'pending' },
      { task: 'Actions: Mark Reviewed, Resolve', status: 'pending' }
    ]
  },
  {
    category: 'Logging & Audit',
    tasks: [
      { task: 'Log report creation to F-010 (Audit.1)', status: 'pending' },
      { task: 'Log admin resolution to AdminActionLog (Audit.2)', status: 'pending' },
      { task: 'action_type: content_approved or content_removed', status: 'pending' }
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
    test: 'Report Creation - Success',
    steps: [
      'User clicks "Report" on message_abc123',
      'Modal opens with reason dropdown',
      'User selects "Spam" and enters detail',
      'User clicks "Submit Report"',
      'Verify: FlaggedContent created',
      'Verify: reporter_user_id = current_user (from session)',
      'Verify: status = pending',
      'Verify: Confirmation message shown (UI.1)',
      'Verify: Admin email sent (Abuse.2)'
    ]
  },
  {
    test: 'Report Creation - Duplicate Detection',
    steps: [
      'User reports message_abc123',
      'Verify: Report created (report_1)',
      'User reports message_abc123 again',
      'Verify: Error: "duplicate_report"',
      'Verify: Message: "You have already reported this content"',
      'Verify: NO new report created (Logic.1)',
      'Verify: existing_report_id = report_1'
    ]
  },
  {
    test: 'Report Creation - Resolved Then New',
    steps: [
      'User reports message_abc123 (report_1)',
      'Admin resolves report_1 (status = resolved)',
      'User reports message_abc123 again',
      'Verify: New report created (report_2)',
      'Verify: Previous resolved report does not block new report'
    ]
  },
  {
    test: 'Auto-Escalation',
    steps: [
      'User A reports message_abc123',
      'User B reports message_abc123',
      'User C reports message_abc123',
      'Verify: After 3rd report, AbuseAlert created (Triggers.1)',
      'Verify: severity = high',
      'Verify: Admin email sent with "URGENT" subject',
      'Verify: User NOT auto-suspended (Triggers.2)'
    ]
  },
  {
    test: 'Reporter Rate Limiting',
    steps: [
      'User submits 11 reports in 1 hour',
      'Verify: After 10th report, FlaggedContent created for reporter (Errors.1)',
      'Verify: target_type = user, target_id = reporter_user_id',
      'Verify: reason_detail mentions "Report flooding"',
      'Verify: Admin notification sent',
      'Verify: 11th report still allowed (not blocked)'
    ]
  },
  {
    test: 'Anonymous Reporting Prevention',
    steps: [
      'Unauthenticated user attempts to submit report',
      'Verify: Returns 401 Unauthorized (Errors.2)',
      'Verify: Message: "You must be logged in to report content"',
      'Verify: No report created'
    ]
  },
  {
    test: 'Reporter Confirmation',
    steps: [
      'User submits report',
      'Verify: Email sent to user (Abuse.1)',
      'Verify: Subject: "Report Submitted"',
      'Verify: Body includes: "Our team will review it"',
      'Verify: Body does NOT promise outcome notification'
    ]
  },
  {
    test: 'Admin Moderation Queue - Grouping',
    steps: [
      'User A reports message_abc123 (reason: spam)',
      'User B reports message_abc123 (reason: spam)',
      'User C reports message_abc123 (reason: harassment)',
      'Admin opens moderation queue',
      'Verify: message_abc123 shows as single group (UI.2)',
      'Verify: Display: "3 reports"',
      'Verify: Reason breakdown: "2 spam, 1 harassment"',
      'Verify: Latest report detail shown'
    ]
  },
  {
    test: 'Admin Resolution',
    steps: [
      'Admin opens report',
      'Admin clicks "Resolve"',
      'Admin enters resolution note: "Reviewed and dismissed - not spam"',
      'Admin clicks "Resolve"',
      'Verify: status = resolved',
      'Verify: reviewed_by_admin_id = admin.id',
      'Verify: reviewed_at = now',
      'Verify: resolution_note = "Reviewed and dismissed..."',
      'Verify: AdminActionLog entry created (Audit.2)',
      'Verify: action_type = content_approved'
    ]
  },
  {
    test: 'Deleted Content - Edge Case',
    steps: [
      'User reports message_abc123',
      'Admin deletes message_abc123',
      'Admin opens moderation queue',
      'Verify: Report still shows in queue (Edge.1)',
      'Verify: Display: "Target content no longer exists"',
      'Verify: Report NOT deleted (Logic.2)'
    ]
  },
  {
    test: 'Field-Level Security - reporter_user_id',
    steps: [
      'User attempts to create report with reporter_user_id = another_user',
      'Verify: reporter_user_id from session used (Access.1)',
      'Verify: Client-supplied value ignored'
    ]
  },
  {
    test: 'Field-Level Security - status',
    steps: [
      'User creates report',
      'User attempts to UPDATE status = resolved',
      'Verify: 403 Forbidden (Access.2 - admin-only)',
      'Admin UPDATEs status = resolved',
      'Verify: Success'
    ]
  },
  {
    test: 'Field-Level Security - readable',
    steps: [
      'User A reports content',
      'User B queries FlaggedContent',
      'Verify: User B sees ONLY their own reports (Access.3)',
      'Admin queries FlaggedContent',
      'Verify: Admin sees ALL reports'
    ]
  },
  {
    test: 'Immutability',
    steps: [
      'Admin resolves 100 reports',
      'Query FlaggedContent with status=resolved',
      'Verify: All 100 reports still exist (Logic.2)',
      'Verify: Reports NOT deleted',
      'Verify: Available for pattern analysis'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - Field-level security for reporter_user_id (set from session)
 * - Field-level security for status (admin-only write)
 * - Email integration for notifications
 * 
 * Supporting Entities:
 * - FlaggedContent: Primary entity for reports
 * - AbuseAlert (F-014): Auto-escalation destination
 * - AdminActionLog (F-008): Admin resolution logging
 * 
 * Integration with Other Features:
 * - F-008: AdminActionLog tracks admin resolutions
 * - F-010: Structured logging for report creation
 * - F-014: AbuseAlert for auto-escalation
 * - Phase 7: Messaging (messages can be flagged)
 * 
 * CRITICAL WARNINGS:
 * - Data.2: Must exist before Phase 7 (Messaging)
 * - Access.1: reporter_user_id from session - NEVER client-supplied
 * - Access.2: status field writable by admins only
 * - Access.3: Reporter sees own reports, admins see all
 * - Logic.1: Duplicate detection - one active per reporter+target
 * - Logic.2: Never delete FlaggedContent - audit retention
 * - Triggers.1: Auto-escalate at 3+ reports from different users
 * - Triggers.2: NO auto-suspension - admin reviews first
 * - Errors.1: Flag reporter after 10 reports in 24h
 * - Errors.2: Anonymous reporting NOT permitted
 * - Edge.1: Retain reports even if content deleted
 * - Edge.2: All cross-user reports retained (no merging)
 * - UI.2: Admin queue groups by target_id
 * 
 * NEXT STEPS:
 * 1. Configure field-level security (Access.1-3)
 * 2. Implement report creation with duplicate detection
 * 3. Implement auto-escalation (3+ reports)
 * 4. Implement reporter rate limiting (10 in 24h)
 * 5. Implement reporter confirmation notification
 * 6. Implement admin notification on new reports
 * 7. Create ReportModal component (UI.1)
 * 8. Create ModerationQueue component (UI.2)
 * 9. Implement admin resolution with AdminActionLog
 * 10. Test all acceptance criteria
 */

export default function F016FlagReportDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-016: Flag & Report Data Model - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> FlaggedContent entity created</p>
      <p><strong>Next Step:</strong> Implement report validation + admin moderation queue</p>
      
      <h2>Critical Requirements</h2>
      <ul>
        <li><strong>Access.1:</strong> reporter_user_id from session - NEVER client-supplied</li>
        <li><strong>Logic.1:</strong> Duplicate detection - one active report per reporter+target</li>
        <li><strong>Logic.2:</strong> NEVER delete FlaggedContent - audit retention</li>
        <li><strong>Triggers.1:</strong> Auto-escalate at 3+ reports from different users</li>
        <li><strong>Errors.2:</strong> Anonymous reporting NOT permitted - authentication required</li>
      </ul>
      
      <h2>Status State Machine (States.1)</h2>
      <ul>
        <li><strong>Pending:</strong> Report created, awaiting admin review</li>
        <li><strong>Reviewed:</strong> Admin has looked at the report</li>
        <li><strong>Resolved:</strong> Admin has taken action or dismissed (terminal state)</li>
        <li><strong>Transitions:</strong> Admin-only (Access.2)</li>
      </ul>
      
      <h2>Duplicate Detection (Logic.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>IMPORTANT: Prevent duplicate reports</strong>
        <ul>
          <li>Check for existing pending/reviewed report from same reporter on same target</li>
          <li>If found: Surface existing report (do NOT create new one)</li>
          <li>If previous report is resolved: Allow new report</li>
        </ul>
      </div>
      
      <h2>Auto-Escalation (Triggers.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Threshold</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>3+ pending reports from different reporters on same target</td>
            <td>
              <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                <li>Create AbuseAlert (F-014)</li>
                <li>Send immediate admin email with "URGENT" subject</li>
                <li>Do NOT auto-suspend user (Triggers.2)</li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>
      
      <h2>Reporter Rate Limiting (Errors.1)</h2>
      <ul>
        <li><strong>Threshold:</strong> &gt;10 reports in 24 hours</li>
        <li><strong>Action:</strong> Flag reporter account for admin review</li>
        <li><strong>Behavior:</strong> Still allow report (do not block - admin reviews)</li>
        <li><strong>Rationale:</strong> Prevent report flooding as attack vector</li>
      </ul>
      
      <h2>Notifications</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Recipient</th>
            <th>Trigger</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Reporter (Abuse.1)</td>
            <td>Report created</td>
            <td>"Report submitted. Our team will review it shortly."</td>
          </tr>
          <tr>
            <td>Admin (Abuse.2)</td>
            <td>New report created</td>
            <td>"New content report: [type] [reason]"</td>
          </tr>
          <tr>
            <td>Admin (Triggers.1)</td>
            <td>Auto-escalation (3+ reports)</td>
            <td>"[URGENT] Content auto-escalated - multiple reports"</td>
          </tr>
        </tbody>
      </table>
      
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
            <td>Deleted Content (Edge.1)</td>
            <td>Report remains in system. Admin sees "Target content no longer exists".</td>
          </tr>
          <tr>
            <td>Cross-Report Duplicates (Edge.2)</td>
            <td>All reports retained. Admin queue groups by target_id.</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Reporter UI (UI.1)</h2>
      <ul>
        <li><strong>Trigger:</strong> User clicks "Report" button</li>
        <li><strong>Modal Fields:</strong>
          <ul>
            <li>Reason dropdown (required): Spam, Harassment, Fake Profile, etc.</li>
            <li>Reason detail textarea (optional, max 500 chars)</li>
          </ul>
        </li>
        <li><strong>Confirmation:</strong> "Thank you for your report. Our team will review it."</li>
        <li><strong>No Outcome Notification:</strong> Reporter NOT notified of admin action at MVP</li>
      </ul>
      
      <h2>Admin Moderation Queue (UI.2)</h2>
      <ul>
        <li><strong>Grouping:</strong> Reports grouped by target_id</li>
        <li><strong>Display:</strong>
          <ul>
            <li>Target content preview</li>
            <li>Total report count</li>
            <li>Reason breakdown (e.g., "5 spam, 2 harassment")</li>
            <li>Latest report detail</li>
          </ul>
        </li>
        <li><strong>Filters:</strong> Status (pending/reviewed/resolved)</li>
        <li><strong>Actions:</strong> Mark Reviewed, Resolve (with note)</li>
      </ul>
      
      <h2>Logging & Audit (Audit.1-2)</h2>
      <ul>
        <li><strong>Report Creation (Audit.1):</strong> F-010 structured logging + FlaggedContent entity</li>
        <li><strong>Admin Resolution (Audit.2):</strong> AdminActionLog (action_type: content_approved / content_removed)</li>
      </ul>
      
      <h2>Immutability (Logic.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Never delete FlaggedContent</strong>
        <ul>
          <li>Resolved reports retained indefinitely</li>
          <li>Use case: Pattern analysis (detect repeat offenders)</li>
          <li>Compliance: Legal requirement to retain moderation decisions</li>
          <li>is_deleted field exists for soft delete but should not be used</li>
        </ul>
      </div>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Configure field-level security (Access.1-3)</li>
        <li>Implement createReport with duplicate detection (Logic.1)</li>
        <li>Implement auto-escalation (Triggers.1)</li>
        <li>Implement reporter rate limiting (Errors.1)</li>
        <li>Implement reporter confirmation notification (Abuse.1)</li>
        <li>Implement admin notification on new reports (Abuse.2)</li>
        <li>Enforce authentication for reporting (Errors.2)</li>
        <li>Create ReportModal component (UI.1)</li>
        <li>Create ModerationQueue component with grouping (UI.2)</li>
        <li>Implement admin resolution with AdminActionLog (Audit.2)</li>
        <li>Handle deleted content edge case (Edge.1)</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete implementation examples, auto-escalation logic, and admin queue grouping.</em></p>
    </div>
  );
}