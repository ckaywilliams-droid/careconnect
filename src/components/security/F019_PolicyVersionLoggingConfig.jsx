/**
 * F-019: POLICY VERSION LOGGING CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-019
 * Policy Version Logging. Extends F-018 ToS Acceptance with comprehensive change
 * tracking, version lifecycle management, and automated re-acceptance notifications.
 * 
 * STATUS: Phase 0 - Entity created (PolicyChangeLog)
 * NEXT STEP: Implement policy publishing workflow + automated re-acceptance emails
 * 
 * ============================================================================
 * CRITICAL LEGAL COMPLIANCE & AUDIT REQUIREMENTS
 * ============================================================================
 */

const F019_POLICY_VERSION_LOGGING_SPECIFICATION = {
  
  /**
   * ENTITY SCHEMA (Data.2)
   * PolicyChangeLog - Permanent audit trail
   */
  entity_schema: {
    
    policy_change_log: {
      entity: 'PolicyChangeLog',
      purpose: 'Immutable record of all policy version changes',
      extends: 'F-018 PolicyVersion collection',
      
      fields: {
        id: 'UUID (auto)',
        policy_type: 'Select (required) - tos or privacy_policy',
        old_version: 'Text - Previous version (null for initial publication)',
        new_version: 'Text (required) - New version identifier',
        changed_by: 'Relation:User (required) - super_admin who published',
        change_summary: 'Text (required) - Human-readable change description',
        effective_date: 'Date (required) - When version becomes effective',
        created_at: 'DateTime (auto) - When change was published'
      },
      
      access_control: {
        // Access.1: INSERT-only, super_admin write, admin read
        create: ['super_admin'],  // Only super_admin can publish versions
        read: ['trust_admin', 'super_admin'],  // Admins can view change history
        update: [],  // EMPTY - no role can update (INSERT-only)
        delete: []   // EMPTY - never deleted (Audit.1)
      },
      
      immutability: {
        // Access.1: INSERT-only enforcement
        requirement: 'PolicyChangeLog is INSERT-only - no UPDATE or DELETE',
        verification: [
          'Attempt UPDATE as super_admin → expect 403',
          'Attempt DELETE as super_admin → expect 403'
        ],
        rationale: 'Audit trail - change records must be immutable'
      }
    }
  },
  
  /**
   * POLICY VERSION LIFECYCLE (States.1-2)
   * Draft → Current → Superseded
   */
  version_lifecycle: {
    
    states: {
      draft: {
        state: 'Draft',
        is_current: false,
        description: 'Policy version created but not yet published',
        visibility: 'Admin only - not shown to users',
        next_states: ['current']
      },
      
      current: {
        state: 'Current',
        is_current: true,
        description: 'Active policy version users must accept',
        visibility: 'Public - shown to all users',
        constraint: 'States.2: Only ONE current version per policy_type',
        next_states: ['superseded']
      },
      
      superseded: {
        state: 'Superseded',
        is_current: false,
        description: 'Previously current version, now replaced',
        visibility: 'Public (Audit.2) - must remain accessible at original URL',
        next_states: []  // Terminal state - never becomes current again
      }
    },
    
    state_diagram: `
      ┌───────┐
      │ Draft │ (is_current=false, new PolicyVersion created)
      └───┬───┘
          │
          │ super_admin publishes (Logic.1)
          ↓
      ┌─────────┐
      │ Current │ (is_current=true, ONLY ONE per policy_type)
      └────┬────┘
           │
           │ New version published (atomically)
           ↓
      ┌────────────┐
      │ Superseded │ (is_current=false, URL must remain accessible)
      └────────────┘
    `,
    
    uniqueness_constraint: {
      // States.2: Only one current version
      rule: 'Only ONE PolicyVersion per policy_type may have is_current=true',
      enforcement: 'When setting new version is_current=true, set old version is_current=false atomically',
      
      implementation: `
        // Atomic version transition
        async function publishNewVersion(newVersionId, policyType) {
          // Step 1: Find current version
          const currentVersion = await base44.asServiceRole.entities.PolicyVersion.filter({
            policy_type: policyType,
            is_current: true
          });
          
          // Step 2: Atomic update - set new current, unset old current
          if (currentVersion.length > 0) {
            await base44.asServiceRole.entities.PolicyVersion.update(currentVersion[0].id, {
              is_current: false
            });
          }
          
          await base44.asServiceRole.entities.PolicyVersion.update(newVersionId, {
            is_current: true
          });
          
          // States.2: Only one is_current=true per policy_type
        }
      `
    }
  },
  
  /**
   * PUBLISH NEW VERSION WORKFLOW (Logic.1)
   * Atomic multi-step process
   */
  publish_workflow: {
    
    steps: {
      // Logic.1: Publishing new policy version
      workflow: [
        '1. super_admin creates new PolicyVersion record (is_current=false)',
        '2. super_admin reviews and clicks "Publish"',
        '3. System fetches current version (old_version)',
        '4. System sets new_version.is_current=true AND old_version.is_current=false (atomic)',
        '5. System creates PolicyChangeLog entry',
        '6. System triggers re-acceptance email to all active users (Triggers.1)',
        '7. System marks all users as requiring re-acceptance (Logic.2)'
      ],
      
      atomicity: 'Steps 4-5 must be atomic - if PolicyChangeLog creation fails, rollback version changes'
    },
    
    implementation: {
      publish_function: `
        // Publish new policy version
        async function publishPolicyVersion(adminUser, newVersionId) {
          const newVersion = await base44.asServiceRole.entities.PolicyVersion.read(newVersionId);
          
          if (newVersion.is_current) {
            throw new Error('Version is already current');
          }
          
          // Logic.1 Step 3: Fetch current version
          const currentVersion = await base44.asServiceRole.entities.PolicyVersion.filter({
            policy_type: newVersion.policy_type,
            is_current: true
          });
          
          const oldVersion = currentVersion.length > 0 ? currentVersion[0] : null;
          
          try {
            // Logic.1 Step 4: Atomic version transition
            if (oldVersion) {
              await base44.asServiceRole.entities.PolicyVersion.update(oldVersion.id, {
                is_current: false
              });
            }
            
            await base44.asServiceRole.entities.PolicyVersion.update(newVersion.id, {
              is_current: true
            });
            
            try {
              // Logic.1 Step 5: Create PolicyChangeLog
              await base44.asServiceRole.entities.PolicyChangeLog.create({
                policy_type: newVersion.policy_type,
                old_version: oldVersion ? oldVersion.version : null,
                new_version: newVersion.version,
                changed_by: adminUser.id,
                change_summary: newVersion.content_summary || 'Policy updated',
                effective_date: newVersion.effective_date
              });
              
            } catch (error) {
              // Rollback version changes if log creation fails
              console.error('PolicyChangeLog creation failed - rolling back', error);
              
              if (oldVersion) {
                await base44.asServiceRole.entities.PolicyVersion.update(oldVersion.id, {
                  is_current: true
                });
              }
              
              await base44.asServiceRole.entities.PolicyVersion.update(newVersion.id, {
                is_current: false
              });
              
              throw new Error('Failed to publish version - please try again');
            }
            
            // Logic.1 Step 6-7: Trigger re-acceptance (Triggers.1)
            if (newVersion.requires_re_acceptance) {
              await triggerReAcceptanceFlow(newVersion);
            }
            
            console.info('Policy version published', {
              policy_type: newVersion.policy_type,
              old_version: oldVersion?.version,
              new_version: newVersion.version,
              changed_by: adminUser.id
            });
            
            return { success: true };
            
          } catch (error) {
            console.error('Policy version publication failed', error);
            throw error;
          }
        }
      `
    }
  },
  
  /**
   * RE-ACCEPTANCE EMAIL AUTOMATION (Triggers.1)
   * Notify all active users of policy change
   */
  re_acceptance_email: {
    
    trigger: {
      // Triggers.1: Send email on version publication
      when: 'super_admin publishes new policy version',
      to: 'All active, non-suspended, non-deleted users',
      via: 'base44.integrations.Core.SendEmail (F-018 Abuse.2)'
    },
    
    email_content: {
      subject: 'Updated [Terms of Service / Privacy Policy] - Action Required',
      
      body_template: `
        Hi {{user.full_name}},
        
        We've updated our {{policy_type_friendly}}.
        
        What changed:
        {{change_summary from PolicyChangeLog}}
        
        You will be asked to review and accept the updated policy on your next login.
        
        Read the full policy here: {{content_url}}
        
        If you have any questions, please contact support.
      `
    },
    
    implementation: {
      send_re_acceptance_emails: `
        // Triggers.1: Send re-acceptance emails
        async function triggerReAcceptanceFlow(newVersion) {
          // Get all active users
          const activeUsers = await base44.asServiceRole.entities.User.filter({
            is_deleted: false,
            is_suspended: false
          });
          
          console.info('Sending re-acceptance emails', {
            policy_type: newVersion.policy_type,
            user_count: activeUsers.length
          });
          
          const policyTypeFriendly = newVersion.policy_type === 'tos' 
            ? 'Terms of Service' 
            : 'Privacy Policy';
          
          for (const user of activeUsers) {
            try {
              // Edge.2: Log email bounces
              await base44.integrations.Core.SendEmail({
                to: user.email,
                subject: \`Updated \${policyTypeFriendly} - Action Required\`,
                body: \`
                  Hi \${user.full_name},
                  
                  We've updated our \${policyTypeFriendly}.
                  
                  What changed:
                  \${newVersion.content_summary || 'Please review the updated policy.'}
                  
                  You will be asked to review and accept the updated policy on your next login.
                  
                  Read the full policy here: \${newVersion.content_url}
                  
                  If you have any questions, please contact support.
                \`
              });
              
            } catch (error) {
              // Edge.2: Email bounce handling
              console.warn('Re-acceptance email failed', {
                user_id: user.id,
                email: user.email,
                error: error.message
              });
              
              // Flag user for manual review
              await flagUserForManualReview(user.id, 'Re-acceptance email bounced');
            }
          }
        }
        
        // Edge.2: Flag user for manual review
        async function flagUserForManualReview(userId, reason) {
          // Create admin alert or flag on User record
          await base44.asServiceRole.entities.AbuseAlert.create({
            alert_type: 'other',
            source_user_id: userId,
            description: \`Email bounce: \${reason}\`,
            severity: 'low',
            triggered_at: new Date().toISOString()
          });
        }
      `
    }
  },
  
  /**
   * RE-ACCEPTANCE REQUIREMENT TRACKING (Logic.2)
   * Determine which users need to re-accept
   */
  re_acceptance_tracking: {
    
    approach: {
      // Logic.2: Track re-acceptance requirement
      option_1: 'Query PolicyAcceptance - check if user has accepted current version',
      option_2: 'Add flag on User record (requires_policy_re_acceptance)',
      recommended: 'Option 1 - query PolicyAcceptance (no User schema change)'
    },
    
    login_intercept: {
      // Same as F-018 Triggers.2, but with PolicyChangeLog context
      location: 'After authentication, before dashboard redirect',
      check: 'Does user have PolicyAcceptance for current policy versions?',
      
      implementation: `
        // Login endpoint with re-acceptance check
        async function login(email, password, requestContext) {
          const user = await authenticateUser(email, password);
          
          if (!user) {
            return { error: 'Invalid credentials' };
          }
          
          // Check suspension, lockout, etc.
          // ...
          
          // Logic.2: Check if user needs to re-accept policies
          const reAcceptanceRequired = await checkPolicyReAcceptanceRequired(user.id);
          
          if (reAcceptanceRequired.required) {
            // Fetch PolicyChangeLog for context
            const changeLog = await getLatestPolicyChangeLogs(reAcceptanceRequired.missing);
            
            return {
              success: true,
              requires_re_acceptance: true,
              missing_policies: reAcceptanceRequired.missing,
              change_logs: changeLog,  // For UI display
              redirect_url: '/re-accept-policies'
            };
          }
          
          // User has accepted current versions - issue full JWT
          const jwt = generateJWT(user);
          return {
            success: true,
            token: jwt,
            redirect_url: '/dashboard'
          };
        }
        
        // Get latest change logs for missing policies
        async function getLatestPolicyChangeLogs(missingPolicies) {
          const logs = [];
          
          for (const policyType of missingPolicies) {
            const changeLog = await base44.entities.PolicyChangeLog.filter({
              policy_type: policyType
            }, '-created_at', 1);  // Latest change log
            
            if (changeLog.length > 0) {
              logs.push(changeLog[0]);
            }
          }
          
          return logs;
        }
      `
    }
  },
  
  /**
   * PRESERVE OLD POLICY URLS (Triggers.2, Audit.2)
   * Historical policy access
   */
  preserve_old_policies: {
    
    requirement: {
      // Triggers.2: Old policy URLs must remain accessible
      rule: 'Old policy version text must remain accessible at original URL',
      prohibition: 'Do NOT overwrite previous policy versions',
      
      // Audit.2: Retain indefinitely
      retention: 'Retain all previous PolicyVersion content URLs indefinitely',
      rationale: 'Users must view the policy they accepted at time of acceptance'
    },
    
    url_strategy: {
      approach: 'Version-specific URLs',
      
      examples: {
        current: '/legal/terms-of-service (redirects to latest version)',
        v1_0: '/legal/terms-of-service-v1.0.html (permanent)',
        v1_1: '/legal/terms-of-service-v1.1.html (permanent)',
        v2_0: '/legal/terms-of-service-v2.0.html (permanent)'
      },
      
      implementation: `
        // PolicyVersion records
        {
          id: 'policy_v1_0',
          policy_type: 'tos',
          version: 'v1.0',
          content_url: '/legal/terms-of-service-v1.0.html',  // Permanent
          is_current: false
        }
        
        {
          id: 'policy_v1_1',
          policy_type: 'tos',
          version: 'v1.1',
          content_url: '/legal/terms-of-service-v1.1.html',  // Permanent
          is_current: true
        }
        
        // User can view the policy they accepted
        const userAcceptance = await base44.entities.PolicyAcceptance.filter({
          user_id: 'user_123',
          policy_type: 'tos'
        });
        
        // userAcceptance.policy_version = 'v1.0'
        // Find corresponding PolicyVersion
        const acceptedVersion = await base44.entities.PolicyVersion.filter({
          policy_type: 'tos',
          version: 'v1.0'
        });
        
        // acceptedVersion.content_url = '/legal/terms-of-service-v1.0.html'
        // This URL must remain accessible (Triggers.2, Audit.2)
      `
    }
  },
  
  /**
   * SEMANTIC VERSIONING (Abuse.1)
   * Version numbering convention
   */
  semantic_versioning: {
    
    convention: {
      // Abuse.1: Version numbering
      format: 'vMAJOR.MINOR (e.g., v1.0, v1.1, v2.0)',
      
      major_version: {
        format: 'v2.0, v3.0',
        meaning: 'Significant changes requiring prominent notification',
        examples: [
          'New data collection practices',
          'Changed liability terms',
          'New user obligations'
        ],
        notification: 'Email + full-screen modal on next login'
      },
      
      minor_version: {
        format: 'v1.1, v1.2',
        meaning: 'Clarifications, typo fixes, non-material changes',
        examples: [
          'Fixed typos',
          'Clarified existing terms',
          'Updated contact information'
        ],
        notification: 'Email + modal (optional: set requires_re_acceptance=false)'
      }
    },
    
    examples: {
      major_change: {
        old_version: 'v1.0',
        new_version: 'v2.0',
        change_summary: 'Updated data retention policy from 30 days to 90 days',
        requires_re_acceptance: true
      },
      
      minor_change: {
        old_version: 'v1.0',
        new_version: 'v1.1',
        change_summary: 'Clarified refund policy wording (no policy change)',
        requires_re_acceptance: false  // Optional - admin decision
      }
    }
  },
  
  /**
   * ERROR CORRECTION (Errors.1)
   * Cannot edit published versions
   */
  error_correction: {
    
    scenario: {
      // Errors.1: Accidentally published incorrect version
      problem: 'super_admin published v1.1 with typo or incorrect content',
      cannot_do: 'Edit or delete PolicyVersion record (INSERT-only)',
      solution: 'Publish corrected new version (v1.2) with note in change_summary'
    },
    
    correction_workflow: [
      '1. super_admin realizes mistake in v1.1',
      '2. super_admin creates new PolicyVersion v1.2',
      '3. v1.2 change_summary: "Corrected typo in v1.1 - clarified refund terms"',
      '4. super_admin publishes v1.2',
      '5. PolicyChangeLog records the correction',
      '6. v1.1 remains in history (superseded)'
    ],
    
    example: `
      // PolicyVersion records after correction
      {
        id: 'policy_v1_1',
        version: 'v1.1',
        content_url: '/legal/tos-v1.1.html',
        is_current: false,  // Superseded by v1.2
        content_summary: 'Updated refund policy'
      }
      
      {
        id: 'policy_v1_2',
        version: 'v1.2',
        content_url: '/legal/tos-v1.2.html',
        is_current: true,
        content_summary: 'Corrected typo in v1.1 - clarified refund terms'
      }
      
      // PolicyChangeLog
      {
        policy_type: 'tos',
        old_version: 'v1.1',
        new_version: 'v1.2',
        change_summary: 'Corrected typo in v1.1 - clarified refund terms',
        changed_by: 'admin_abc'
      }
    `
  },
  
  /**
   * VERSION CONFLICT PREVENTION (Errors.2)
   * Atomic publication
   */
  version_conflict: {
    
    scenario: {
      // Errors.2: Two admins publishing simultaneously
      problem: 'Admin A and Admin B both try to publish new version at same time',
      risk: 'Two versions marked as is_current=true',
      solution: 'Atomic update with conflict detection'
    },
    
    conflict_detection: {
      approach: 'Check-and-set pattern',
      
      implementation: `
        // Atomic publication with conflict detection
        async function publishPolicyVersionAtomic(adminUser, newVersionId) {
          const newVersion = await base44.asServiceRole.entities.PolicyVersion.read(newVersionId);
          
          // Errors.2: Fetch current version at start of transaction
          const currentVersion = await base44.asServiceRole.entities.PolicyVersion.filter({
            policy_type: newVersion.policy_type,
            is_current: true
          });
          
          const oldVersion = currentVersion.length > 0 ? currentVersion[0] : null;
          
          try {
            // Atomic update: set old to false, new to true
            if (oldVersion) {
              // First, verify old version is still current (conflict check)
              const recheck = await base44.asServiceRole.entities.PolicyVersion.read(oldVersion.id);
              
              if (!recheck.is_current) {
                // Errors.2: Conflict detected - another admin published first
                throw new Error('Version conflict: Another admin published a new version. Please refresh and try again.');
              }
              
              await base44.asServiceRole.entities.PolicyVersion.update(oldVersion.id, {
                is_current: false
              });
            }
            
            await base44.asServiceRole.entities.PolicyVersion.update(newVersion.id, {
              is_current: true
            });
            
            // Create PolicyChangeLog
            await base44.asServiceRole.entities.PolicyChangeLog.create({
              policy_type: newVersion.policy_type,
              old_version: oldVersion?.version,
              new_version: newVersion.version,
              changed_by: adminUser.id,
              change_summary: newVersion.content_summary,
              effective_date: newVersion.effective_date
            });
            
            return { success: true };
            
          } catch (error) {
            // Errors.2: Handle conflict
            if (error.message.includes('Version conflict')) {
              console.warn('Policy version conflict detected', {
                admin: adminUser.id,
                attempted_version: newVersion.version
              });
            }
            
            throw error;
          }
        }
      `
    }
  },
  
  /**
   * MID-SESSION RE-ACCEPTANCE (Edge.1)
   * User already logged in when policy changes
   */
  mid_session_handling: {
    
    scenario: {
      // Edge.1: User is mid-session when new policy published
      problem: 'User logged in before new version published',
      approach: 'Complete current action, intercept on next navigation'
    },
    
    implementation_strategy: {
      not_implemented: 'Do NOT force immediate logout',
      graceful: 'Allow user to complete current task',
      intercept: 'Show re-acceptance modal on next page navigation or API call',
      
      example: `
        // Frontend navigation guard
        router.beforeEach(async (to, from, next) => {
          // Check if user needs to re-accept policies
          const reAcceptanceRequired = await checkPolicyReAcceptance();
          
          if (reAcceptanceRequired && to.path !== '/re-accept-policies') {
            // Edge.1: Intercept navigation to show re-acceptance modal
            next('/re-accept-policies');
          } else {
            next();
          }
        });
        
        // Or API middleware check
        async function apiMiddleware(req, res, next) {
          const user = req.user;
          
          const reAcceptanceRequired = await checkPolicyReAcceptanceRequired(user.id);
          
          if (reAcceptanceRequired.required) {
            // Edge.1: Block API calls until re-acceptance
            return res.status(403).json({
              error: 'policy_re_acceptance_required',
              message: 'Please accept updated policies to continue',
              missing_policies: reAcceptanceRequired.missing
            });
          }
          
          next();
        }
      `
    }
  },
  
  /**
   * IMMUTABILITY (Audit.1-2)
   * Permanent records and URL retention
   */
  immutability: {
    
    policy_change_log: {
      // Audit.1: PolicyChangeLog permanent
      rule: 'PolicyChangeLog is permanent record - never deleted',
      rationale: 'Audit trail of all policy changes',
      access: 'trust_admin and super_admin can read for compliance review'
    },
    
    policy_version_urls: {
      // Audit.2: Retain all previous URLs
      rule: 'Retain all previous PolicyVersion content URLs indefinitely',
      purpose: 'Users must view policy they accepted at time of acceptance',
      
      verification: `
        // User views their accepted policy
        async function viewAcceptedPolicy(userId, policyType) {
          // Get user's acceptance record
          const acceptance = await base44.entities.PolicyAcceptance.filter({
            user_id: userId,
            policy_type: policyType
          }, '-accepted_at', 1);  // Most recent acceptance
          
          if (acceptance.length === 0) {
            return { error: 'No acceptance record found' };
          }
          
          // Find PolicyVersion for accepted version
          const policyVersion = await base44.entities.PolicyVersion.filter({
            policy_type: policyType,
            version: acceptance[0].policy_version
          });
          
          if (policyVersion.length === 0) {
            // Audit.2: This should NEVER happen - version must be retained
            console.error('Policy version not found - audit violation', {
              user_id: userId,
              accepted_version: acceptance[0].policy_version
            });
            
            return { error: 'Policy version not found' };
          }
          
          // Audit.2: URL must be accessible
          return {
            version: policyVersion[0].version,
            content_url: policyVersion[0].content_url,
            accepted_at: acceptance[0].accepted_at
          };
        }
      `
    }
  },
  
  /**
   * ADMIN UI (UI.1)
   * Policy Version Management
   */
  admin_ui: {
    
    requirements: {
      // UI.1: Admin panel
      location: 'Admin dashboard → Legal → Policy Version Management',
      visibility: 'super_admin only',
      
      display_fields: [
        'Current version (e.g., v1.1)',
        'Effective date',
        'Change summary',
        'Changed by (admin name)',
        'Version history (all previous versions)'
      ],
      
      actions: [
        'Publish New Version (super_admin only)',
        'View Change History',
        'View Full Policy Text'
      ]
    },
    
    implementation_example: `
      import React, { useState } from 'react';
      import { base44 } from '@/api/base44Client';
      import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
      import { Button } from '@/components/ui/button';
      import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
      import { Textarea } from '@/components/ui/textarea';
      import { Input } from '@/components/ui/input';
      import { Badge } from '@/components/ui/badge';
      
      export default function PolicyVersionManagement() {
        const [showPublishModal, setShowPublishModal] = useState(false);
        const queryClient = useQueryClient();
        
        // Fetch current versions
        const { data: currentTOS } = useQuery({
          queryKey: ['policyVersion', 'tos', 'current'],
          queryFn: async () => {
            const versions = await base44.entities.PolicyVersion.filter({
              policy_type: 'tos',
              is_current: true
            });
            return versions[0];
          }
        });
        
        const { data: currentPrivacy } = useQuery({
          queryKey: ['policyVersion', 'privacy_policy', 'current'],
          queryFn: async () => {
            const versions = await base44.entities.PolicyVersion.filter({
              policy_type: 'privacy_policy',
              is_current: true
            });
            return versions[0];
          }
        });
        
        // Fetch change history
        const { data: changeHistory } = useQuery({
          queryKey: ['policyChangeLog'],
          queryFn: () => base44.entities.PolicyChangeLog.list('-created_at', 50)
        });
        
        return (
          <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold">Policy Version Management</h1>
              <Button onClick={() => setShowPublishModal(true)}>
                Publish New Version
              </Button>
            </div>
            
            {/* Current Versions */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <PolicyVersionCard
                title="Terms of Service"
                version={currentTOS}
                policyType="tos"
              />
              <PolicyVersionCard
                title="Privacy Policy"
                version={currentPrivacy}
                policyType="privacy_policy"
              />
            </div>
            
            {/* Change History */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Change History</h2>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Policy</th>
                    <th className="text-left py-2">Version Change</th>
                    <th className="text-left py-2">Summary</th>
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Changed By</th>
                  </tr>
                </thead>
                <tbody>
                  {changeHistory?.map(log => (
                    <tr key={log.id} className="border-b">
                      <td className="py-2">
                        <Badge>
                          {log.policy_type === 'tos' ? 'ToS' : 'Privacy'}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {log.old_version || 'Initial'} → {log.new_version}
                      </td>
                      <td className="py-2">{log.change_summary}</td>
                      <td className="py-2">
                        {new Date(log.effective_date).toLocaleDateString()}
                      </td>
                      <td className="py-2">{log.changed_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {showPublishModal && (
              <PublishVersionModal
                onClose={() => setShowPublishModal(false)}
              />
            )}
          </div>
        );
      }
      
      function PolicyVersionCard({ title, version, policyType }) {
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">{title}</h3>
              <Badge variant="success">Current</Badge>
            </div>
            
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Version:</span>{' '}
                <span className="font-medium">{version?.version}</span>
              </div>
              <div>
                <span className="text-gray-600">Effective Date:</span>{' '}
                <span className="font-medium">
                  {new Date(version?.effective_date).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Summary:</span>{' '}
                <p className="mt-1">{version?.content_summary}</p>
              </div>
            </div>
            
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.open(version?.content_url, '_blank')}
            >
              View Full Policy
            </Button>
          </div>
        );
      }
      
      function PublishVersionModal({ onClose }) {
        const [formData, setFormData] = useState({
          policy_type: 'tos',
          version: '',
          effective_date: new Date().toISOString().split('T')[0],
          content_url: '',
          content_summary: ''
        });
        
        const publishMutation = useMutation({
          mutationFn: async () => {
            // Create new PolicyVersion
            const newVersion = await base44.entities.PolicyVersion.create(formData);
            
            // Publish it (calls backend function)
            await publishPolicyVersion(newVersion.id);
          },
          onSuccess: () => {
            queryClient.invalidateQueries();
            onClose();
          }
        });
        
        return (
          <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Publish New Policy Version</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Policy Type
                  </label>
                  <select
                    className="w-full border rounded p-2"
                    value={formData.policy_type}
                    onChange={(e) => setFormData({...formData, policy_type: e.target.value})}
                  >
                    <option value="tos">Terms of Service</option>
                    <option value="privacy_policy">Privacy Policy</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Version (e.g., v1.1, v2.0)
                  </label>
                  <Input
                    placeholder="v1.1"
                    value={formData.version}
                    onChange={(e) => setFormData({...formData, version: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Effective Date
                  </label>
                  <Input
                    type="date"
                    value={formData.effective_date}
                    onChange={(e) => setFormData({...formData, effective_date: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Policy Content URL
                  </label>
                  <Input
                    placeholder="/legal/tos-v1.1.html"
                    value={formData.content_url}
                    onChange={(e) => setFormData({...formData, content_url: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Change Summary (required)
                  </label>
                  <Textarea
                    placeholder="Describe what changed in this version..."
                    value={formData.content_summary}
                    onChange={(e) => setFormData({...formData, content_summary: e.target.value})}
                    rows={4}
                  />
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Warning:</strong> Publishing a new version will:
                    <ul className="list-disc ml-5 mt-2">
                      <li>Set this version as current</li>
                      <li>Mark the old version as superseded</li>
                      <li>Send re-acceptance emails to all users</li>
                      <li>Require users to accept on next login</li>
                    </ul>
                  </p>
                </div>
                
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => publishMutation.mutate()}
                    disabled={!formData.version || !formData.content_summary}
                  >
                    Publish Version
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      }
    `
  },
  
  /**
   * USER-FACING UI (UI.2)
   * Re-acceptance modal
   */
  user_ui: {
    
    requirements: {
      // UI.2: Re-acceptance modal
      trigger: 'Login intercept when re-acceptance required',
      display: 'Full-screen modal (cannot dismiss)',
      
      content: [
        'Clear statement: "Our policies have been updated"',
        'Concise change summary (from PolicyChangeLog)',
        'Link to full policy text',
        'Accept / Decline buttons'
      ]
    },
    
    implementation_example: `
      import React, { useState } from 'react';
      import { base44 } from '@/api/base44Client';
      import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
      import { Button } from '@/components/ui/button';
      import { ScrollArea } from '@/components/ui/scroll-area';
      
      export default function PolicyReAcceptanceModal({ changeLogs, reAcceptanceToken }) {
        const [loading, setLoading] = useState(false);
        
        const handleAccept = async () => {
          setLoading(true);
          
          try {
            const response = await fetch('/api/accept-policy-update', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': \`Bearer \${reAcceptanceToken}\`
              }
            });
            
            const data = await response.json();
            
            if (data.success) {
              // Re-acceptance successful
              window.location.href = '/dashboard';
            } else {
              alert('Failed to record acceptance');
            }
          } catch (error) {
            alert('An error occurred');
          } finally {
            setLoading(false);
          }
        };
        
        const handleDecline = async () => {
          // User declines - log out
          await base44.auth.logout();
        };
        
        return (
          <Dialog open modal>
            <DialogContent className="max-w-2xl" hideClose>
              <DialogHeader>
                <DialogTitle>Our policies have been updated</DialogTitle>
              </DialogHeader>
              
              <ScrollArea className="max-h-96 pr-4">
                <div className="space-y-4">
                  {/* UI.2: Clear statement */}
                  <p className="text-sm text-gray-600">
                    Please review and accept to continue using the platform.
                  </p>
                  
                  {/* UI.2: Change summaries from PolicyChangeLog */}
                  {changeLogs.map(log => (
                    <div key={log.id} className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold mb-2">
                        {log.policy_type === 'tos' ? 'Terms of Service' : 'Privacy Policy'}{' '}
                        <span className="text-gray-600 font-normal">
                          ({log.old_version || 'Initial'} → {log.new_version})
                        </span>
                      </h3>
                      
                      <p className="text-sm mb-2">
                        <strong>What changed:</strong> {log.change_summary}
                      </p>
                      
                      <p className="text-sm mb-2">
                        <strong>Effective Date:</strong>{' '}
                        {new Date(log.effective_date).toLocaleDateString()}
                      </p>
                      
                      {/* UI.2: Link to full policy text */}
                      <p className="text-sm">
                        <a
                          href={getContentUrl(log.policy_type, log.new_version)}
                          target="_blank"
                          className="text-blue-600 underline"
                        >
                          Read Full {log.policy_type === 'tos' ? 'Terms of Service' : 'Privacy Policy'} →
                        </a>
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              {/* UI.2: Accept / Decline buttons */}
              <div className="flex gap-3 justify-end mt-4">
                <Button
                  variant="outline"
                  onClick={handleDecline}
                >
                  I Decline (Logout)
                </Button>
                <Button
                  onClick={handleAccept}
                  disabled={loading}
                >
                  I Accept
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      }
      
      function getContentUrl(policyType, version) {
        // Fetch from PolicyVersion.content_url
        return \`/legal/\${policyType === 'tos' ? 'tos' : 'privacy'}-\${version}.html\`;
      }
    `
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F019_CONFIGURATION_CHECKLIST = [
  {
    category: 'Entity Configuration',
    tasks: [
      { task: 'PolicyChangeLog entity created', status: 'complete' },
      { task: 'Configure PolicyChangeLog: INSERT-only (Access.1)', status: 'pending' },
      { task: 'Verify: UPDATE/DELETE blocked for all roles', status: 'pending' },
      { task: 'Configure PolicyChangeLog: writable by super_admin only', status: 'pending' },
      { task: 'Configure PolicyChangeLog: readable by trust_admin and super_admin', status: 'pending' }
    ]
  },
  {
    category: 'Policy Publishing Workflow',
    tasks: [
      { task: 'Implement publishPolicyVersion function (Logic.1)', status: 'pending' },
      { task: 'Fetch current version (old_version)', status: 'pending' },
      { task: 'Atomic update: new is_current=true, old is_current=false', status: 'pending' },
      { task: 'Create PolicyChangeLog entry', status: 'pending' },
      { task: 'Rollback if PolicyChangeLog creation fails', status: 'pending' },
      { task: 'Trigger re-acceptance flow (Triggers.1)', status: 'pending' }
    ]
  },
  {
    category: 'Re-Acceptance Email',
    tasks: [
      { task: 'Implement triggerReAcceptanceFlow function (Triggers.1)', status: 'pending' },
      { task: 'Fetch all active, non-suspended, non-deleted users', status: 'pending' },
      { task: 'Send email with change_summary (Logic.1)', status: 'pending' },
      { task: 'Include link to new policy (content_url)', status: 'pending' },
      { task: 'Handle email bounces (Edge.2)', status: 'pending' },
      { task: 'Flag users with bounced emails for manual review', status: 'pending' }
    ]
  },
  {
    category: 'Version Conflict Prevention',
    tasks: [
      { task: 'Implement conflict detection (Errors.2)', status: 'pending' },
      { task: 'Check-and-set pattern for is_current', status: 'pending' },
      { task: 'Error if another admin published first', status: 'pending' },
      { task: 'Test: Two admins publishing simultaneously', status: 'pending' }
    ]
  },
  {
    category: 'Old Policy URL Retention',
    tasks: [
      { task: 'Define version-specific URL pattern (Triggers.2)', status: 'pending' },
      { task: 'Example: /legal/tos-v1.0.html, /legal/tos-v1.1.html', status: 'pending' },
      { task: 'Ensure old URLs remain accessible (Audit.2)', status: 'pending' },
      { task: 'Test: User can view policy they accepted', status: 'pending' }
    ]
  },
  {
    category: 'Semantic Versioning',
    tasks: [
      { task: 'Document versioning convention (Abuse.1)', status: 'pending' },
      { task: 'Major version (v2.0) = significant changes', status: 'pending' },
      { task: 'Minor version (v1.1) = clarifications', status: 'pending' },
      { task: 'Admin UI shows version format guidance', status: 'pending' }
    ]
  },
  {
    category: 'Error Correction',
    tasks: [
      { task: 'Document correction workflow (Errors.1)', status: 'pending' },
      { task: 'Cannot edit published version - publish corrected version', status: 'pending' },
      { task: 'change_summary includes "Corrected..." note', status: 'pending' }
    ]
  },
  {
    category: 'Admin UI',
    tasks: [
      { task: 'Create Policy Version Management page (UI.1)', status: 'pending' },
      { task: 'Show current version, effective date, summary', status: 'pending' },
      { task: 'Show change history (PolicyChangeLog)', status: 'pending' },
      { task: 'Publish New Version modal', status: 'pending' },
      { task: 'Confirmation with warning about re-acceptance', status: 'pending' }
    ]
  },
  {
    category: 'User-Facing UI',
    tasks: [
      { task: 'Update PolicyReAcceptanceModal (UI.2)', status: 'pending' },
      { task: 'Show change summaries from PolicyChangeLog', status: 'pending' },
      { task: 'Link to full policy text', status: 'pending' },
      { task: 'Clear statement: "Our policies have been updated"', status: 'pending' }
    ]
  },
  {
    category: 'Mid-Session Handling',
    tasks: [
      { task: 'Implement navigation guard (Edge.1)', status: 'pending' },
      { task: 'Intercept on next navigation (not immediate logout)', status: 'pending' },
      { task: 'Or API middleware check for re-acceptance', status: 'pending' }
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
    test: 'Publish New Version - Atomic Transition',
    steps: [
      'Current ToS version = v1.0',
      'super_admin creates PolicyVersion v1.1',
      'super_admin clicks "Publish"',
      'Verify: v1.0.is_current = false (States.1 - superseded)',
      'Verify: v1.1.is_current = true (States.1 - current)',
      'Verify: Only ONE is_current=true per policy_type (States.2)',
      'Verify: PolicyChangeLog entry created (Logic.1)',
      'Verify: old_version = v1.0, new_version = v1.1'
    ]
  },
  {
    test: 'PolicyChangeLog Creation',
    steps: [
      'super_admin publishes v1.1',
      'Verify: PolicyChangeLog entry created',
      'Verify: policy_type = tos',
      'Verify: old_version = v1.0',
      'Verify: new_version = v1.1',
      'Verify: changed_by = admin user ID',
      'Verify: change_summary = from PolicyVersion.content_summary',
      'Verify: effective_date = from PolicyVersion.effective_date'
    ]
  },
  {
    test: 'Re-Acceptance Email',
    steps: [
      '5 active users exist',
      'super_admin publishes v1.1 with requires_re_acceptance=true',
      'Verify: 5 emails sent (Triggers.1)',
      'Verify: Email subject mentions "Updated"',
      'Verify: Email body includes change_summary',
      'Verify: Email body includes link to content_url',
      'Verify: Soft-deleted users NOT emailed',
      'Verify: Suspended users NOT emailed'
    ]
  },
  {
    test: 'Email Bounce Handling',
    steps: [
      'User has invalid email address',
      'super_admin publishes v1.1',
      'Email to user bounces',
      'Verify: Warning logged (Edge.2)',
      'Verify: User flagged for manual review',
      'Verify: Re-acceptance requirement NOT suppressed'
    ]
  },
  {
    test: 'Version Conflict - Simultaneous Publication',
    steps: [
      'Current version = v1.0',
      'Admin A starts publishing v1.1',
      'Admin B starts publishing v1.2 (simultaneously)',
      'Admin A completes first',
      'Admin B attempts to complete',
      'Verify: Admin B gets "Version conflict" error (Errors.2)',
      'Verify: Only v1.1 published (not both)',
      'Verify: Admin B must refresh and try again'
    ]
  },
  {
    test: 'Rollback on PolicyChangeLog Failure',
    steps: [
      'Mock PolicyChangeLog creation failure',
      'super_admin attempts to publish v1.1',
      'Verify: v1.0.is_current remains true (rollback)',
      'Verify: v1.1.is_current remains false',
      'Verify: Error message shown to admin',
      'Verify: No partial state change'
    ]
  },
  {
    test: 'Old Policy URL Retention',
    steps: [
      'v1.0 content_url = /legal/tos-v1.0.html',
      'super_admin publishes v1.1',
      'v1.1 content_url = /legal/tos-v1.1.html',
      'Verify: /legal/tos-v1.0.html still accessible (Triggers.2)',
      'Verify: User who accepted v1.0 can view v1.0 policy',
      'Verify: All previous versions accessible (Audit.2)'
    ]
  },
  {
    test: 'User Views Accepted Policy',
    steps: [
      'User accepted v1.0 on 2025-01-15',
      'Current version = v1.1',
      'User navigates to "View Accepted Policy"',
      'Verify: Shows v1.0 policy text (Audit.2)',
      'Verify: Shows acceptance date (2025-01-15)',
      'Verify: Can also view current v1.1 policy'
    ]
  },
  {
    test: 'Semantic Versioning',
    steps: [
      'Admin creates major change',
      'Admin uses version = v2.0 (Abuse.1)',
      'change_summary = "Updated data retention to 90 days"',
      'Verify: Version format valid',
      'Admin creates minor change',
      'Admin uses version = v1.1',
      'change_summary = "Clarified wording (no policy change)"',
      'Verify: Version format valid'
    ]
  },
  {
    test: 'Error Correction - Cannot Edit',
    steps: [
      'super_admin publishes v1.1 with typo',
      'super_admin attempts to UPDATE v1.1 (Errors.1)',
      'Verify: 403 Forbidden (INSERT-only)',
      'super_admin creates v1.2',
      'v1.2 change_summary = "Corrected typo in v1.1"',
      'super_admin publishes v1.2',
      'Verify: v1.1 superseded, v1.2 current',
      'Verify: PolicyChangeLog shows correction'
    ]
  },
  {
    test: 'Mid-Session Re-Acceptance',
    steps: [
      'User logged in and browsing',
      'super_admin publishes v1.1',
      'User continues current action (Edge.1)',
      'Verify: User NOT immediately logged out',
      'User navigates to another page',
      'Verify: Re-acceptance modal shown',
      'User accepts',
      'Verify: PolicyAcceptance created for v1.1',
      'Verify: User redirected to intended page'
    ]
  },
  {
    test: 'Immutability - PolicyChangeLog',
    steps: [
      'super_admin publishes v1.1',
      'PolicyChangeLog entry created (log_1)',
      'super_admin attempts to UPDATE log_1',
      'Verify: 403 Forbidden (Access.1 INSERT-only)',
      'super_admin attempts to DELETE log_1',
      'Verify: 403 Forbidden (Audit.1 - never deleted)'
    ]
  },
  {
    test: 'Admin UI - Current Version Display',
    steps: [
      'Admin opens Policy Version Management',
      'Current ToS = v1.1',
      'Verify: Shows "Current" badge (UI.1)',
      'Verify: Shows version v1.1',
      'Verify: Shows effective date',
      'Verify: Shows change summary',
      'Verify: "View Full Policy" link works'
    ]
  },
  {
    test: 'Admin UI - Change History',
    steps: [
      'PolicyChangeLog has 3 entries',
      'Admin opens Policy Version Management',
      'Verify: All 3 changes shown (UI.1)',
      'Verify: Sorted by date (newest first)',
      'Verify: Shows: policy type, version change, summary, date, changed by'
    ]
  },
  {
    test: 'Admin UI - Publish Modal',
    steps: [
      'Admin clicks "Publish New Version"',
      'Modal opens (UI.1)',
      'Verify: Form fields: policy_type, version, effective_date, content_url, change_summary',
      'Verify: Warning message about re-acceptance',
      'Admin fills form and submits',
      'Verify: publishPolicyVersion called',
      'Verify: Modal closes on success'
    ]
  },
  {
    test: 'User UI - Re-Acceptance Modal',
    steps: [
      'User requires re-acceptance for v1.1',
      'User logs in',
      'Re-acceptance modal shown (UI.2)',
      'Verify: Clear statement "Our policies have been updated"',
      'Verify: Shows change_summary from PolicyChangeLog',
      'Verify: Link to full policy text',
      'Verify: Accept / Decline buttons',
      'User clicks Accept',
      'Verify: PolicyAcceptance created',
      'Verify: Redirect to dashboard'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - INSERT-only entity configuration (PolicyChangeLog)
 * - Atomic transaction support (version transition + log creation)
 * - Email integration for re-acceptance notifications
 * - Conflict detection for concurrent admin actions
 * 
 * Supporting Entities:
 * - PolicyVersion (F-018): Track policy versions
 * - PolicyAcceptance (F-018): User acceptance records
 * - PolicyChangeLog (F-019): Change audit trail
 * 
 * Integration with Other Features:
 * - F-018: ToS Acceptance - extends with version logging
 * - F-010: Structured Logging - log policy changes
 * - F-008: AdminActionLog - track admin policy publications
 * 
 * CRITICAL WARNINGS:
 * - Access.1: PolicyChangeLog is INSERT-only (never update/delete)
 * - States.2: Only ONE is_current=true per policy_type
 * - Logic.1: Atomic version transition + log creation
 * - Triggers.1: Send re-acceptance email to all active users
 * - Triggers.2: Old policy URLs must remain accessible
 * - Errors.1: Cannot edit published version - publish correction
 * - Errors.2: Detect version conflicts (concurrent publications)
 * - Edge.1: Mid-session users complete action, intercepted on next navigation
 * - Edge.2: Handle email bounces - flag for manual review
 * - Audit.1: PolicyChangeLog never deleted
 * - Audit.2: Retain all previous PolicyVersion URLs indefinitely
 * - Abuse.1: Use semantic versioning (v1.0, v1.1, v2.0)
 * 
 * NEXT STEPS:
 * 1. Configure PolicyChangeLog INSERT-only permissions
 * 2. Implement publishPolicyVersion function (atomic)
 * 3. Implement version conflict detection
 * 4. Implement re-acceptance email automation
 * 5. Implement email bounce handling
 * 6. Create version-specific URL pattern
 * 7. Create Policy Version Management admin UI
 * 8. Update re-acceptance modal with change summaries
 * 9. Implement mid-session re-acceptance intercept
 * 10. Document semantic versioning convention
 * 11. Test all acceptance criteria
 */

export default function F019PolicyVersionLoggingDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-019: Policy Version Logging - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Entity created (PolicyChangeLog)</p>
      <p><strong>Next Step:</strong> Implement atomic policy publishing workflow + re-acceptance emails</p>
      
      <h2>Critical Requirements</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ LEGAL COMPLIANCE & AUDIT</strong>
        <ul>
          <li><strong>Access.1:</strong> PolicyChangeLog is INSERT-only (never update/delete)</li>
          <li><strong>States.2:</strong> Only ONE is_current=true per policy_type at any time</li>
          <li><strong>Logic.1:</strong> Atomic version transition + PolicyChangeLog creation</li>
          <li><strong>Triggers.2:</strong> Old policy URLs MUST remain accessible</li>
          <li><strong>Audit.2:</strong> Retain all previous PolicyVersion URLs indefinitely</li>
        </ul>
      </div>
      
      <h2>Policy Version Lifecycle (States.1-2)</h2>
      <ul>
        <li><strong>Draft:</strong> Created but not published (is_current=false)</li>
        <li><strong>Current:</strong> Active version users must accept (is_current=true, ONLY ONE per policy_type)</li>
        <li><strong>Superseded:</strong> Previously current, now replaced (is_current=false, URL retained)</li>
      </ul>
      
      <h2>Publish Workflow (Logic.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>IMPORTANT: Atomic publishing process</strong>
        <ol>
          <li>super_admin creates new PolicyVersion (is_current=false)</li>
          <li>super_admin clicks "Publish"</li>
          <li>System fetches current version (old_version)</li>
          <li>System sets new.is_current=true AND old.is_current=false (atomic)</li>
          <li>System creates PolicyChangeLog entry</li>
          <li>System sends re-acceptance emails to all active users</li>
          <li>If PolicyChangeLog fails → rollback version changes</li>
        </ol>
      </div>
      
      <h2>Re-Acceptance Email (Triggers.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Trigger</th>
            <th>Recipients</th>
            <th>Content</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>super_admin publishes new version</td>
            <td>All active, non-suspended, non-deleted users</td>
            <td>Subject: "Updated [Policy] - Action Required"<br/>Body: change_summary + link to policy</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Old Policy URL Retention (Triggers.2, Audit.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>CRITICAL: All previous policy URLs MUST remain accessible</strong>
        <ul>
          <li><strong>Why:</strong> Users must view policy they accepted at time of acceptance</li>
          <li><strong>URL Pattern:</strong> /legal/tos-v1.0.html, /legal/tos-v1.1.html (version-specific)</li>
          <li><strong>Prohibition:</strong> Do NOT overwrite previous versions</li>
          <li><strong>Retention:</strong> Indefinite - never delete old policy URLs</li>
        </ul>
      </div>
      
      <h2>Semantic Versioning (Abuse.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Version Type</th>
            <th>Format</th>
            <th>Meaning</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Major</td>
            <td>v2.0, v3.0</td>
            <td>Significant changes requiring prominent notification</td>
            <td>New data collection, changed liability, new obligations</td>
          </tr>
          <tr>
            <td>Minor</td>
            <td>v1.1, v1.2</td>
            <td>Clarifications, typo fixes, non-material changes</td>
            <td>Fixed typos, clarified wording, updated contact info</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Error Correction (Errors.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CANNOT EDIT PUBLISHED VERSIONS</strong>
        <ul>
          <li><strong>Problem:</strong> Published v1.1 with typo or incorrect content</li>
          <li><strong>Cannot:</strong> Edit or delete PolicyVersion (INSERT-only)</li>
          <li><strong>Solution:</strong> Publish corrected v1.2</li>
          <li><strong>change_summary:</strong> "Corrected typo in v1.1 - clarified refund terms"</li>
        </ul>
      </div>
      
      <h2>Version Conflict Prevention (Errors.2)</h2>
      <ul>
        <li><strong>Problem:</strong> Two admins publishing new version simultaneously</li>
        <li><strong>Risk:</strong> Both versions marked as is_current=true</li>
        <li><strong>Solution:</strong> Check-and-set pattern with conflict detection</li>
        <li><strong>Behavior:</strong> Second admin gets "Version conflict" error, must refresh</li>
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
            <td>Mid-Session User (Edge.1)</td>
            <td>Complete current action, show re-acceptance on next navigation (not immediate logout)</td>
          </tr>
          <tr>
            <td>Email Bounce (Edge.2)</td>
            <td>Log warning, flag user for manual review, do NOT suppress re-acceptance requirement</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Immutability (Audit.1-2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Permanent audit records</strong>
        <ul>
          <li><strong>PolicyChangeLog:</strong> INSERT-only, never updated or deleted (Audit.1)</li>
          <li><strong>PolicyVersion URLs:</strong> Retained indefinitely (Audit.2)</li>
          <li><strong>Use Case:</strong> User views policy they accepted at time of acceptance</li>
        </ul>
      </div>
      
      <h2>Admin UI (UI.1)</h2>
      <ul>
        <li><strong>Location:</strong> Admin → Legal → Policy Version Management</li>
        <li><strong>Display:</strong> Current version, effective date, change summary, version history</li>
        <li><strong>Actions:</strong> Publish New Version (super_admin only), View Change History</li>
        <li><strong>Modal:</strong> Confirmation with warning about re-acceptance emails</li>
      </ul>
      
      <h2>User UI (UI.2)</h2>
      <ul>
        <li><strong>Display:</strong> Full-screen modal (cannot dismiss)</li>
        <li><strong>Content:</strong> "Our policies have been updated" + change_summary from PolicyChangeLog</li>
        <li><strong>Links:</strong> Full policy text (opens in new tab)</li>
        <li><strong>Buttons:</strong> Accept → create PolicyAcceptance, Decline → logout</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Configure PolicyChangeLog INSERT-only permissions</li>
        <li>Implement publishPolicyVersion function (atomic)</li>
        <li>Atomic: set new is_current=true, old is_current=false</li>
        <li>Create PolicyChangeLog entry</li>
        <li>Rollback if PolicyChangeLog creation fails</li>
        <li>Implement version conflict detection (check-and-set)</li>
        <li>Implement triggerReAcceptanceFlow (send emails)</li>
        <li>Handle email bounces - flag for manual review</li>
        <li>Define version-specific URL pattern (/legal/tos-v1.0.html)</li>
        <li>Create Policy Version Management admin UI</li>
        <li>Update re-acceptance modal with PolicyChangeLog summaries</li>
        <li>Implement mid-session re-acceptance intercept</li>
        <li>Document semantic versioning convention</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete publishing workflow, version conflict detection, and re-acceptance automation.</em></p>
    </div>
  );
}