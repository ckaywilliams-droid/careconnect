/**
 * F-015: SUSPENSION RECORD MODEL CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-015
 * Suspension Record Model. Tracks user suspension state directly on User entity
 * with immediate JWT invalidation and middleware enforcement.
 * 
 * STATUS: Phase 0 - User entity updated with suspension fields
 * NEXT STEP: Implement suspension/unsuspension automation + middleware checks
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F015_SUSPENSION_SPECIFICATION = {
  
  /**
   * ENTITY FIELDS (Data.1-2)
   * Suspension state stored directly on User entity
   */
  entity_fields: {
    
    user_entity_fields: {
      // Data.1: Fields on User entity
      entity: 'User',
      
      is_suspended: {
        field: 'is_suspended',
        type: 'Boolean',
        default: false,
        required: true,
        description: 'Whether user account is suspended',
        
        // Access.1: Readable by user, admins, middleware
        readable_by: ['self', 'support_admin', 'trust_admin', 'super_admin', 'auth_middleware'],
        
        // Access.2: Writable by admins only
        writable_by: ['support_admin', 'trust_admin', 'super_admin'],
        write_method: 'AdminActionLog-backed automation only (not direct write)',
        
        integration: 'F-003 middleware checks this field on every request (Gate 2)'
      },
      
      suspension_reason: {
        field: 'suspension_reason',
        type: 'Text',
        nullable: true,
        description: 'Admin-populated reason for suspension',
        
        // Access.3: Readable by admins only
        readable_by: ['support_admin', 'trust_admin', 'super_admin'],
        forbidden: 'NEVER shown to suspended user',
        
        populated: 'When user is suspended (required at suspension time)',
        example: 'Repeated spam violations - contacted 3 times, no response'
      }
    },
    
    no_separate_collection: {
      // Data.2: No separate Suspension collection
      rationale: 'Suspension fields on User entity for fast per-request access',
      benefit: 'F-003 middleware can check is_suspended without separate lookup',
      performance: 'Single query: get user + check suspension in one operation'
    }
  },
  
  /**
   * SUSPENSION STATE MACHINE (States.1)
   * Active ↔ Suspended
   */
  suspension_state_machine: {
    
    states: {
      active: {
        state: 'Active',
        is_suspended: false,
        suspension_reason: null,
        allowed_actions: 'All normal user actions',
        transitions: 'Admin suspend action → Suspended'
      },
      
      suspended: {
        state: 'Suspended',
        is_suspended: true,
        suspension_reason: 'Populated by admin (required)',
        allowed_actions: 'None - blocked at middleware layer (Logic.2)',
        transitions: 'Admin unsuspend action → Active'
      }
    },
    
    no_auto_expiry: {
      // States.1: Manual unsuspension only
      requirement: 'Suspension is permanent until manually lifted',
      no_expires_at: 'No time-based auto-expiry at MVP',
      rationale: 'Admin must explicitly review and approve unsuspension'
    },
    
    state_diagram: `
      ┌─────────┐
      │ Active  │ ← Default state (is_suspended = false)
      └────┬────┘
           │
           │ Admin suspend action (logged to AdminActionLog)
           ↓
      ┌─────────────┐
      │  Suspended  │ (is_suspended = true, suspension_reason populated)
      └──────┬──────┘
             │
             │ Admin unsuspend action (logged to AdminActionLog)
             ↓
        ┌─────────┐
        │ Active  │ (is_suspended = false, suspension_reason cleared or kept for history)
        └─────────┘
    `
  },
  
  /**
   * SUSPENSION AUTOMATION (Triggers.1)
   * Admin triggers suspend → automation executes
   */
  suspension_automation: {
    
    suspend_workflow: {
      // Triggers.1: Suspension automation steps
      trigger: 'Admin clicks "Suspend User" button in admin UI',
      steps: [
        '1. Admin provides mandatory suspension_reason',
        '2. Automation sets is_suspended = true',
        '3. Automation populates suspension_reason',
        '4. Automation writes to AdminActionLog (action_type = suspend_user)',
        '5. Automation invalidates all active JWT tokens for user (Logic.1)',
        '6. Downstream effects handled by collection rules (Triggers.2)'
      ],
      
      implementation: `
        // Suspension automation
        async function suspendUser(adminUser, targetUserId, reason) {
          if (!reason || reason.length < 10) {
            throw new Error('Suspension reason required (minimum 10 characters)');
          }
          
          // Step 1: Create AdminActionLog entry FIRST (atomicity - Errors.1)
          let logEntry;
          try {
            logEntry = await base44.asServiceRole.entities.AdminActionLog.create({
              admin_user_id: adminUser.id,
              admin_role: adminUser.role,
              action_type: 'suspend_user',
              target_entity_type: 'User',
              target_entity_id: targetUserId,
              reason: reason,
              payload: JSON.stringify({
                before: { is_suspended: false },
                after: { is_suspended: true }
              }),
              action_timestamp: new Date().toISOString()
            });
          } catch (error) {
            // Errors.1: AdminActionLog write failed - do NOT suspend
            console.error('AdminActionLog write failed - suspension aborted', error);
            
            await sendOperatorAlert({
              severity: 'CRITICAL',
              title: 'Suspension failed - audit log unavailable',
              details: { target_user_id: targetUserId, error: error.message }
            });
            
            throw new Error('Unable to suspend user - audit log unavailable');
          }
          
          // Step 2: Update User entity (Triggers.1)
          try {
            await base44.asServiceRole.entities.User.update(targetUserId, {
              is_suspended: true,
              suspension_reason: reason
            });
          } catch (error) {
            // Rollback: Delete AdminActionLog entry
            await base44.asServiceRole.entities.AdminActionLog.delete(logEntry.id);
            throw error;
          }
          
          // Step 3: Invalidate all active sessions (Logic.1)
          await invalidateUserSessions(targetUserId);
          
          // Step 4: Log downstream effects (Audit.2)
          console.info('User suspended', {
            target_user_id: targetUserId,
            admin_user_id: adminUser.id,
            reason: reason,
            sessions_invalidated: true
          });
          
          return { success: true };
        }
      `
    },
    
    unsuspend_workflow: {
      trigger: 'Admin clicks "Unsuspend User" button in admin UI',
      steps: [
        '1. Admin provides mandatory unsuspension_reason',
        '2. Automation sets is_suspended = false',
        '3. Automation writes to AdminActionLog (action_type = unsuspend_user)',
        '4. User can login again'
      ],
      
      implementation: `
        // Unsuspension automation
        async function unsuspendUser(adminUser, targetUserId, reason) {
          if (!reason || reason.length < 10) {
            throw new Error('Unsuspension reason required (minimum 10 characters)');
          }
          
          // Step 1: Create AdminActionLog entry FIRST (atomicity)
          let logEntry;
          try {
            logEntry = await base44.asServiceRole.entities.AdminActionLog.create({
              admin_user_id: adminUser.id,
              admin_role: adminUser.role,
              action_type: 'unsuspend_user',
              target_entity_type: 'User',
              target_entity_id: targetUserId,
              reason: reason,
              payload: JSON.stringify({
                before: { is_suspended: true },
                after: { is_suspended: false }
              }),
              action_timestamp: new Date().toISOString()
            });
          } catch (error) {
            console.error('AdminActionLog write failed - unsuspension aborted', error);
            throw new Error('Unable to unsuspend user - audit log unavailable');
          }
          
          // Step 2: Update User entity
          try {
            await base44.asServiceRole.entities.User.update(targetUserId, {
              is_suspended: false
              // Note: suspension_reason NOT cleared - kept for history
            });
          } catch (error) {
            // Rollback: Delete AdminActionLog entry
            await base44.asServiceRole.entities.AdminActionLog.delete(logEntry.id);
            throw error;
          }
          
          // Step 3: Log unsuspension
          console.info('User unsuspended', {
            target_user_id: targetUserId,
            admin_user_id: adminUser.id,
            reason: reason
          });
          
          return { success: true };
        }
      `
    }
  },
  
  /**
   * SESSION INVALIDATION (Logic.1)
   * Immediately invalidate all active JWT tokens
   */
  session_invalidation: {
    
    requirement: {
      // Logic.1: Invalidate on suspension
      when: 'User is suspended',
      action: 'Immediately invalidate all active JWT tokens',
      reason: 'Prevent suspended user from continuing to use platform with existing session',
      integration: 'F-003 middleware handles subsequent blocking'
    },
    
    jwt_invalidation_methods: {
      
      method_1_token_blacklist: {
        // From F-003: TokenBlacklist entity
        approach: 'Add all user\'s active tokens to blacklist',
        
        implementation: `
          async function invalidateUserSessions(userId) {
            // Method 1: Token blacklist (F-003)
            
            // Get user's active tokens (if tracked)
            const activeTokens = await getActiveTokensForUser(userId);
            
            for (const token of activeTokens) {
              await base44.asServiceRole.entities.TokenBlacklist.create({
                user_id: userId,
                token_jti: token.jti,  // JWT ID claim
                blacklisted_at: new Date().toISOString(),
                reason: 'user_suspended',
                expires_at: token.exp  // Original token expiry
              });
            }
          }
        `
      },
      
      method_2_token_version: {
        approach: 'Increment user token version',
        mechanism: 'JWTs include version number - middleware rejects mismatched versions',
        
        user_entity_addition: {
          field: 'token_version',
          type: 'Number',
          default: 1,
          description: 'Incremented on suspension - invalidates all existing tokens'
        },
        
        implementation: `
          async function invalidateUserSessions(userId) {
            // Method 2: Token versioning
            
            const user = await base44.entities.User.read(userId);
            const newVersion = (user.token_version || 1) + 1;
            
            await base44.asServiceRole.entities.User.update(userId, {
              token_version: newVersion
            });
            
            // F-003 middleware checks: JWT.token_version === User.token_version
            // Mismatched version → 401 Unauthorized
          }
        `
      }
    },
    
    middleware_check: {
      // F-003 Gate 2: User suspension check
      location: 'F-003 middleware, after JWT validation (Gate 1)',
      check: 'Read User.is_suspended from database (live read)',
      on_suspended: 'Return 403 with message (Logic.2)',
      
      implementation: `
        // F-003 middleware Gate 2 enhancement
        async function gate2_userSuspensionCheck(userId) {
          // Live database read (F-003 requirement)
          const user = await base44.entities.User.read(userId);
          
          // Logic.2: Check suspension
          if (user.is_suspended) {
            // User is suspended - block immediately
            console.warn('Suspended user attempted access', {
              user_id: userId,
              endpoint: req.path
            });
            
            // UI.1: Generic suspension message
            return res.status(403).json({
              error: 'account_suspended',
              message: 'Your account has been suspended. Please contact support.'
            });
          }
          
          // Not suspended - continue to Gate 3
          next();
        }
      `
    }
  },
  
  /**
   * DOWNSTREAM EFFECTS (Triggers.2)
   * Collection-level rules handle side effects
   */
  downstream_effects: {
    
    profile_hidden: {
      // Triggers.2: CaregiverProfile hidden from search
      collection: 'CaregiverProfile',
      rule: 'If user.is_suspended = true → profile excluded from search results',
      implementation: 'F-001 collection rules (not separate automation)',
      
      query_example: `
        // Caregiver search query
        const caregivers = await base44.entities.CaregiverProfile.filter({
          is_published: true,
          city: 'San Francisco'
        });
        
        // Filter out suspended caregivers
        const activeCaregivers = [];
        for (const caregiver of caregivers) {
          const user = await base44.entities.User.read(caregiver.user_id);
          if (!user.is_suspended) {
            activeCaregivers.push(caregiver);
          }
        }
      `
    },
    
    active_bookings_flagged: {
      // Abuse.1: Active bookings require manual review
      scenario: 'Caregiver suspended while having active/pending bookings',
      action: 'NOT automatically cancelled at MVP',
      admin_action_required: 'Admin must manually review and cancel',
      
      moderation_queue: {
        feature: 'Admin dashboard shows suspended users with active bookings',
        query: `
          // Query for suspended users with active bookings
          const suspendedUsers = await base44.entities.User.filter({
            is_suspended: true
          });
          
          for (const user of suspendedUsers) {
            const activeBookings = await base44.entities.BookingRequest.filter({
              caregiver_profile_id: user.caregiver_profile_id,
              status: { $in: ['pending', 'accepted'] }
            });
            
            if (activeBookings.length > 0) {
              // Flag for admin review
              console.warn('Suspended caregiver has active bookings', {
                user_id: user.id,
                active_bookings: activeBookings.length
              });
            }
          }
        `
      }
    }
  },
  
  /**
   * ERROR HANDLING (Errors.1-2)
   * Atomicity and re-registration detection
   */
  error_handling: {
    
    atomicity: {
      // Errors.1: Suspension atomicity
      requirement: 'Do NOT suspend user without AdminActionLog entry',
      
      correct_order: [
        '1. Create AdminActionLog entry FIRST',
        '2. If log write succeeds → update User.is_suspended',
        '3. If log write fails → do NOT suspend, alert operators'
      ],
      
      rollback_scenario: {
        scenario: 'User update succeeds but log write failed',
        action: 'Rollback user update (or retry log write)',
        alert: 'Operator alert - audit trail gap'
      },
      
      implementation: `
        async function suspendUserWithAtomicity(adminUser, targetUserId, reason) {
          let logEntry;
          
          try {
            // Step 1: AdminActionLog FIRST
            logEntry = await base44.entities.AdminActionLog.create({
              admin_user_id: adminUser.id,
              action_type: 'suspend_user',
              target_entity_id: targetUserId,
              reason: reason
            });
          } catch (error) {
            // Log write failed - abort suspension
            throw new Error('Suspension aborted - audit log unavailable');
          }
          
          try {
            // Step 2: Update User
            await base44.entities.User.update(targetUserId, {
              is_suspended: true,
              suspension_reason: reason
            });
          } catch (error) {
            // User update failed - rollback log entry
            await base44.entities.AdminActionLog.delete(logEntry.id);
            throw error;
          }
          
          // Both succeeded - suspension complete
        }
      `
    },
    
    re_registration_detection: {
      // Errors.2: Detect suspended users creating new accounts
      trigger: 'User creates new account with email of previously suspended account',
      action: 'Flag new account for admin review automatically',
      
      implementation: `
        // User registration hook
        async function onUserRegistration(newUser) {
          // Check if this email was previously suspended
          const existingUsers = await base44.asServiceRole.entities.User.filter({
            email: newUser.email
          });
          
          const wasPreviouslySuspended = existingUsers.some(u => 
            u.is_suspended || (u.suspension_reason && u.suspension_reason.length > 0)
          );
          
          if (wasPreviouslySuspended) {
            // Errors.2: Flag for admin review
            await base44.entities.FlaggedContent.create({
              target_type: 'user',
              target_id: newUser.id,
              reporter_user_id: 'SYSTEM',
              reason: 'other',
              reason_detail: 'New account created with email of previously suspended user',
              status: 'pending'
            });
            
            // Notify admins
            await sendAdminAlert({
              severity: 'WARNING',
              title: 'Suspended user re-registered',
              details: {
                new_user_id: newUser.id,
                email: newUser.email,
                previous_suspension: 'Email was previously suspended'
              }
            });
          }
        }
      `
    }
  },
  
  /**
   * EDGE CASES (Edge.1-2)
   * Accidental suspension and suspended admin
   */
  edge_cases: {
    
    accidental_suspension: {
      // Edge.1: Admin suspends wrong user
      scenario: 'Admin accidentally clicks "Suspend" on wrong user in table',
      solution: 'Unsuspend action reverses suspension',
      
      audit_trail: {
        preservation: 'Both log entries remain in AdminActionLog',
        entries: [
          'Entry 1: suspend_user (accidental)',
          'Entry 2: unsuspend_user (correction)'
        ],
        rationale: 'Complete audit trail - do not delete log entries'
      },
      
      prevention: {
        ui: 'Confirmation modal with user details',
        modal_text: 'Are you sure you want to suspend [User Name] ([user@email.com])?',
        required_input: 'Suspension reason (minimum 10 characters)'
      }
    },
    
    suspended_admin: {
      // Edge.2: Suspended admin cannot unsuspend themselves
      scenario: 'super_admin account is suspended',
      restriction: 'Suspended admin CANNOT unsuspend themselves',
      solution: 'Another super_admin must perform unsuspension',
      
      pre_launch_requirement: {
        // Edge.2: Minimum 2 super_admins
        requirement: 'At least TWO super_admin accounts must exist before launch',
        verification: 'Count super_admin roles before go-live',
        rationale: 'Prevent lockout if sole super_admin is suspended'
      },
      
      enforcement: `
        async function unsuspendUser(adminUser, targetUserId, reason) {
          // Edge.2: Prevent self-unsuspension
          if (adminUser.id === targetUserId) {
            throw new Error('Administrators cannot unsuspend themselves. Contact another super_admin.');
          }
          
          // Proceed with unsuspension
          // ...
        }
      `
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-2)
   * Suspension actions and downstream effects
   */
  logging_and_audit: {
    
    suspension_logging: {
      // Audit.1: Log to AdminActionLog
      collection: 'AdminActionLog',
      
      suspend_entry: {
        admin_user_id: 'Admin who performed suspension',
        admin_role: 'Admin role at time of action',
        action_type: 'suspend_user',
        target_entity_type: 'User',
        target_entity_id: 'Suspended user ID',
        reason: 'REQUIRED - minimum 10 characters',
        payload: 'JSON: { before: { is_suspended: false }, after: { is_suspended: true } }',
        action_timestamp: 'Auto-set timestamp'
      },
      
      unsuspend_entry: {
        admin_user_id: 'Admin who performed unsuspension',
        admin_role: 'Admin role at time of action',
        action_type: 'unsuspend_user',
        target_entity_type: 'User',
        target_entity_id: 'Unsuspended user ID',
        reason: 'REQUIRED - why user is being unsuspended',
        payload: 'JSON: { before: { is_suspended: true }, after: { is_suspended: false } }',
        action_timestamp: 'Auto-set timestamp'
      }
    },
    
    downstream_effects_logging: {
      // Audit.2: System events in structured log
      log_destination: 'F-010 structured logging (Sentry)',
      
      events: [
        'User suspended → log sessions invalidated',
        'Profile hidden from search → log visibility change',
        'Active bookings flagged for review → log flag creation'
      ],
      
      example: `
        // Audit.2: Log downstream effects
        console.info('User suspension effects', {
          user_id: targetUserId,
          effects: {
            sessions_invalidated: true,
            profile_hidden: true,
            active_bookings: activeBookings.length
          }
        });
      `
    }
  },
  
  /**
   * USER-FACING UI (UI.1)
   * Suspension message on login
   */
  user_facing_ui: {
    
    suspended_user_login: {
      // UI.1: Login attempt by suspended user
      trigger: 'Suspended user attempts to login',
      
      message: 'Your account has been suspended. Please contact support.',
      
      forbidden_information: [
        'Suspension reason',
        'When suspension occurred',
        'Who suspended the account',
        'How to appeal'
      ],
      
      allowed_elements: [
        'Generic suspension message',
        'Link to support contact form'
      ],
      
      implementation: `
        // Login endpoint
        async function login(email, password) {
          const user = await authenticateUser(email, password);
          
          if (!user) {
            return { error: 'Invalid credentials' };
          }
          
          // UI.1: Check suspension before issuing JWT
          if (user.is_suspended) {
            return {
              error: 'account_suspended',
              message: 'Your account has been suspended. Please contact support.',
              support_url: 'https://example.com/support'
            };
          }
          
          // Generate JWT for active user
          const jwt = generateJWT(user);
          return { token: jwt };
        }
      `,
      
      ui_display: {
        component: 'Login page error message',
        styling: 'Error alert with support link',
        support_link: 'Opens support contact form or email'
      }
    }
  },
  
  /**
   * ADMIN UI (UI.2)
   * Suspension control in user management table
   */
  admin_ui: {
    
    suspension_toggle: {
      // UI.2: Admin user management table
      location: 'Admin dashboard → User Management table',
      
      ui_elements: [
        'Status column: Active / Suspended badge',
        'Action dropdown: Suspend User / Unsuspend User',
        'Confirmation modal with mandatory reason input'
      ],
      
      suspend_action: {
        button: 'Suspend User',
        confirmation_modal: {
          title: 'Suspend User Account',
          body: 'Are you sure you want to suspend [User Name] ([user@email.com])?',
          reason_input: {
            label: 'Suspension Reason (required)',
            placeholder: 'Enter reason for suspension...',
            min_length: 10,
            validation: 'Required field - minimum 10 characters'
          },
          buttons: ['Cancel', 'Suspend User (red button)']
        }
      },
      
      unsuspend_action: {
        button: 'Unsuspend User',
        confirmation_modal: {
          title: 'Unsuspend User Account',
          body: 'Are you sure you want to unsuspend [User Name] ([user@email.com])?',
          reason_input: {
            label: 'Unsuspension Reason (required)',
            placeholder: 'Enter reason for unsuspension...',
            min_length: 10,
            validation: 'Required field - minimum 10 characters'
          },
          buttons: ['Cancel', 'Unsuspend User (green button)']
        }
      },
      
      implementation_example: `
        import React, { useState } from 'react';
        import { base44 } from '@/api/base44Client';
        import { Button } from '@/components/ui/button';
        import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
        import { Textarea } from '@/components/ui/textarea';
        
        export default function UserManagementTable() {
          const [showSuspendModal, setShowSuspendModal] = useState(false);
          const [selectedUser, setSelectedUser] = useState(null);
          const [reason, setReason] = useState('');
          
          const handleSuspendClick = (user) => {
            setSelectedUser(user);
            setReason('');
            setShowSuspendModal(true);
          };
          
          const handleSuspendConfirm = async () => {
            if (reason.length < 10) {
              alert('Reason must be at least 10 characters');
              return;
            }
            
            try {
              // Call suspension automation
              await suspendUser(selectedUser.id, reason);
              
              // Refresh user list
              // ...
              
              setShowSuspendModal(false);
            } catch (error) {
              alert('Suspension failed: ' + error.message);
            }
          };
          
          return (
            <>
              {/* User table with suspend button */}
              <table>
                {/* ... */}
              </table>
              
              {/* Suspension confirmation modal */}
              <Dialog open={showSuspendModal} onOpenChange={setShowSuspendModal}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Suspend User Account</DialogTitle>
                  </DialogHeader>
                  
                  <p>
                    Are you sure you want to suspend{' '}
                    <strong>{selectedUser?.full_name}</strong> ({selectedUser?.email})?
                  </p>
                  
                  <Textarea
                    placeholder="Enter reason for suspension..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                  />
                  
                  <p className="text-sm text-gray-500">
                    Minimum 10 characters required
                  </p>
                  
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowSuspendModal(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleSuspendConfirm}
                      disabled={reason.length < 10}
                    >
                      Suspend User
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          );
        }
      `
    }
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F015_CONFIGURATION_CHECKLIST = [
  {
    category: 'User Entity Fields',
    tasks: [
      { task: 'Add is_suspended field to User entity', status: 'complete' },
      { task: 'Add suspension_reason field to User entity', status: 'complete' },
      { task: 'Configure is_suspended: readable by self, admins, middleware (Access.1)', status: 'pending' },
      { task: 'Configure is_suspended: writable by admins only (Access.2)', status: 'pending' },
      { task: 'Configure suspension_reason: readable by admins only (Access.3)', status: 'pending' }
    ]
  },
  {
    category: 'Suspension Automation',
    tasks: [
      { task: 'Implement suspendUser function (Triggers.1)', status: 'pending' },
      { task: 'Implement unsuspendUser function', status: 'pending' },
      { task: 'Atomicity: AdminActionLog FIRST, then User update (Errors.1)', status: 'pending' },
      { task: 'Rollback on failure', status: 'pending' },
      { task: 'Validate reason minimum 10 characters', status: 'pending' }
    ]
  },
  {
    category: 'Session Invalidation',
    tasks: [
      { task: 'Implement invalidateUserSessions function (Logic.1)', status: 'pending' },
      { task: 'Method: Token blacklist OR token versioning', status: 'pending' },
      { task: 'Test: Suspended user existing JWT → 403', status: 'pending' }
    ]
  },
  {
    category: 'Middleware Integration',
    tasks: [
      { task: 'F-003 Gate 2: Check User.is_suspended (live read)', status: 'pending' },
      { task: 'Return 403 with "Account suspended" message (Logic.2)', status: 'pending' },
      { task: 'Test: Suspended user → all requests blocked', status: 'pending' }
    ]
  },
  {
    category: 'Downstream Effects',
    tasks: [
      { task: 'CaregiverProfile: Exclude suspended users from search (Triggers.2)', status: 'pending' },
      { task: 'Admin moderation queue: Show suspended users with active bookings (Abuse.1)', status: 'pending' },
      { task: 'Log downstream effects to structured log (Audit.2)', status: 'pending' }
    ]
  },
  {
    category: 'Error Handling',
    tasks: [
      { task: 'Implement atomicity: log FIRST, user update SECOND (Errors.1)', status: 'pending' },
      { task: 'Rollback on failure + operator alert', status: 'pending' },
      { task: 'Implement re-registration detection (Errors.2)', status: 'pending' },
      { task: 'Flag new accounts with previously suspended emails', status: 'pending' }
    ]
  },
  {
    category: 'Edge Cases',
    tasks: [
      { task: 'Test accidental suspension → unsuspend reverses it (Edge.1)', status: 'pending' },
      { task: 'Verify both log entries remain (no deletion)', status: 'pending' },
      { task: 'Prevent self-unsuspension for admins (Edge.2)', status: 'pending' },
      { task: 'Verify: At least 2 super_admin accounts exist before launch', status: 'pending' }
    ]
  },
  {
    category: 'User-Facing UI',
    tasks: [
      { task: 'Login: Check is_suspended before issuing JWT (UI.1)', status: 'pending' },
      { task: 'Show "Account suspended" message with support link', status: 'pending' },
      { task: 'Do NOT show suspension_reason to user', status: 'pending' }
    ]
  },
  {
    category: 'Admin UI',
    tasks: [
      { task: 'Create UserManagementTable component', status: 'pending' },
      { task: 'Add Status column: Active / Suspended badge', status: 'pending' },
      { task: 'Add Suspend/Unsuspend buttons', status: 'pending' },
      { task: 'Create suspension confirmation modal (UI.2)', status: 'pending' },
      { task: 'Require reason input (min 10 chars)', status: 'pending' }
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
    test: 'Suspension - Create',
    steps: [
      'Admin navigates to user management',
      'Admin clicks "Suspend User" on user_abc123',
      'Modal appears: "Are you sure?"',
      'Admin enters reason: "Repeated spam violations"',
      'Admin clicks "Suspend User"',
      'Verify: User.is_suspended = true',
      'Verify: User.suspension_reason = "Repeated spam violations"',
      'Verify: AdminActionLog entry created (action_type = suspend_user)',
      'Verify: User table shows "Suspended" badge'
    ]
  },
  {
    test: 'Suspension - Session Invalidation',
    steps: [
      'User_abc123 is logged in with active JWT',
      'Admin suspends user_abc123',
      'User_abc123 makes API request with existing JWT',
      'Verify: Returns 403 Forbidden (Logic.1)',
      'Verify: Message: "Account suspended. Contact support." (Logic.2)'
    ]
  },
  {
    test: 'Suspension - Login Attempt',
    steps: [
      'User_abc123 is suspended',
      'User_abc123 attempts to login with valid credentials',
      'Verify: Login rejected (UI.1)',
      'Verify: Error message: "Your account has been suspended. Please contact support."',
      'Verify: NO JWT token issued',
      'Verify: suspension_reason NOT shown to user (Access.3)'
    ]
  },
  {
    test: 'Suspension - Profile Hidden',
    steps: [
      'Caregiver is suspended',
      'Parent searches for caregivers',
      'Verify: Suspended caregiver NOT in search results (Triggers.2)',
      'Verify: Profile page returns 404 or "Profile unavailable"'
    ]
  },
  {
    test: 'Suspension - Active Bookings',
    steps: [
      'Caregiver has 2 pending bookings and 1 accepted booking',
      'Admin suspends caregiver',
      'Verify: Bookings NOT automatically cancelled (Abuse.1)',
      'Admin opens moderation queue',
      'Verify: Queue shows "Suspended caregiver with 3 active bookings"',
      'Admin manually cancels bookings'
    ]
  },
  {
    test: 'Unsuspension',
    steps: [
      'User_abc123 is suspended',
      'Admin clicks "Unsuspend User"',
      'Modal appears: "Are you sure?"',
      'Admin enters reason: "User contacted support, issue resolved"',
      'Admin clicks "Unsuspend User"',
      'Verify: User.is_suspended = false',
      'Verify: AdminActionLog entry created (action_type = unsuspend_user)',
      'User_abc123 attempts login',
      'Verify: Login succeeds, JWT issued'
    ]
  },
  {
    test: 'Suspension - Atomicity',
    steps: [
      'Mock AdminActionLog write failure',
      'Admin attempts to suspend user',
      'Verify: Suspension FAILS (Errors.1)',
      'Verify: User.is_suspended = false (unchanged)',
      'Verify: Operator alert sent',
      'Verify: User can still access platform'
    ]
  },
  {
    test: 'Re-Registration Detection',
    steps: [
      'User user@example.com is suspended',
      'User creates new account with user@example.com',
      'Verify: New account created',
      'Verify: FlaggedContent entry created (Errors.2)',
      'Verify: reason_detail: "Previously suspended email"',
      'Verify: Admin notification sent'
    ]
  },
  {
    test: 'Accidental Suspension',
    steps: [
      'Admin accidentally suspends wrong user',
      'Admin immediately clicks "Unsuspend User"',
      'Admin enters reason: "Accidental suspension - wrong user selected"',
      'Admin clicks "Unsuspend User"',
      'Verify: User.is_suspended = false',
      'Verify: TWO AdminActionLog entries exist (Edge.1)',
      'Verify: Entry 1: suspend_user',
      'Verify: Entry 2: unsuspend_user',
      'Verify: Neither entry deleted'
    ]
  },
  {
    test: 'Suspended Admin Self-Unsuspension',
    steps: [
      'Admin_super_123 (super_admin) is suspended by another admin',
      'Admin_super_123 attempts to unsuspend themselves',
      'Verify: Action FAILS (Edge.2)',
      'Verify: Error: "Administrators cannot unsuspend themselves"',
      'Another super_admin unsuspends Admin_super_123',
      'Verify: Unsuspension succeeds'
    ]
  },
  {
    test: 'Field-Level Security - is_suspended',
    steps: [
      'User_abc123 queries own User record',
      'Verify: is_suspended field visible (Access.1 - self)',
      'User_abc123 attempts to UPDATE is_suspended = false',
      'Verify: 403 Forbidden (Access.2 - admin-only write)',
      'Admin queries User_abc123',
      'Verify: is_suspended field visible'
    ]
  },
  {
    test: 'Field-Level Security - suspension_reason',
    steps: [
      'User_abc123 is suspended with reason: "Spam violations"',
      'User_abc123 queries own User record',
      'Verify: suspension_reason field NOT visible (Access.3)',
      'Admin queries User_abc123',
      'Verify: suspension_reason = "Spam violations" (visible to admin)'
    ]
  },
  {
    test: 'Pre-Launch - Multiple Super Admins',
    steps: [
      'Before launch, query User collection',
      'Count users with role = super_admin',
      'Verify: Count >= 2 (Edge.2)',
      'If count < 2: Create additional super_admin account',
      'Document: List of super_admin email addresses'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - Field-level security for is_suspended and suspension_reason
 * - Middleware hooks for suspension checks (F-003 Gate 2)
 * - Session invalidation mechanism (token blacklist or versioning)
 * 
 * Supporting Entities:
 * - User: is_suspended, suspension_reason fields
 * - AdminActionLog: suspend_user, unsuspend_user actions
 * - TokenBlacklist (F-003): Session invalidation
 * - FlaggedContent (F-016): Re-registration detection
 * 
 * Integration with Other Features:
 * - F-003: Middleware checks is_suspended (Gate 2)
 * - F-008: AdminActionLog tracks suspension actions
 * - F-010: Structured logging for downstream effects
 * - F-016: Moderation queue for active bookings review
 * 
 * CRITICAL WARNINGS:
 * - Data.2: Fields on User entity (NOT separate collection)
 * - Access.3: suspension_reason NEVER shown to user
 * - Logic.1: Invalidate sessions immediately on suspension
 * - Triggers.1: AdminActionLog entry REQUIRED for suspension
 * - Errors.1: Atomicity - log FIRST, user update SECOND
 * - Errors.2: Detect re-registration by email match
 * - Edge.1: Both suspend + unsuspend logs remain (no deletion)
 * - Edge.2: Suspended admin cannot self-unsuspend
 * - States.1: No auto-expiry - manual unsuspension only
 * - Abuse.1: Active bookings NOT auto-cancelled
 * 
 * NEXT STEPS:
 * 1. Configure field-level security for is_suspended and suspension_reason
 * 2. Implement suspension/unsuspension automations
 * 3. Implement session invalidation (token blacklist or versioning)
 * 4. Update F-003 middleware Gate 2 to check is_suspended
 * 5. Implement downstream effects (profile hidden, bookings flagged)
 * 6. Implement re-registration detection
 * 7. Create admin UI (suspension modal, user management table)
 * 8. Update login flow to check is_suspended
 * 9. Verify minimum 2 super_admin accounts exist
 * 10. Test all acceptance criteria
 */

export default function F015SuspensionDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-015: Suspension Record Model - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> User entity updated with suspension fields</p>
      <p><strong>Next Step:</strong> Implement suspension/unsuspension automation + middleware checks</p>
      
      <h2>User Entity Fields (Data.1-2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Field</th>
            <th>Type</th>
            <th>Readable By</th>
            <th>Writable By</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>is_suspended</td>
            <td>Boolean (default false)</td>
            <td>Self, admins, middleware</td>
            <td>Admins only (via automation)</td>
          </tr>
          <tr>
            <td>suspension_reason</td>
            <td>Text (nullable)</td>
            <td>Admins ONLY</td>
            <td>Admins only (via automation)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Suspension State Machine (States.1)</h2>
      <ul>
        <li><strong>Active:</strong> is_suspended = false, user can access platform</li>
        <li><strong>Suspended:</strong> is_suspended = true, ALL requests blocked at middleware</li>
        <li><strong>No Auto-Expiry:</strong> Manual unsuspension required</li>
      </ul>
      
      <h2>Suspension Automation (Triggers.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>IMPORTANT: Atomicity required (Errors.1)</strong>
        <ol>
          <li>Create AdminActionLog entry FIRST</li>
          <li>If log write succeeds → update User.is_suspended</li>
          <li>If log write fails → do NOT suspend, alert operators</li>
          <li>Invalidate all user sessions (Logic.1)</li>
        </ol>
      </div>
      
      <h2>Session Invalidation (Logic.1)</h2>
      <ul>
        <li><strong>Method 1:</strong> Token blacklist (F-003 TokenBlacklist entity)</li>
        <li><strong>Method 2:</strong> Token versioning (increment User.token_version)</li>
        <li><strong>Effect:</strong> Existing JWT tokens immediately invalid</li>
        <li><strong>Enforcement:</strong> F-003 middleware checks on every request</li>
      </ul>
      
      <h2>Middleware Integration (Logic.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: F-003 Gate 2 checks User.is_suspended</strong>
        <ul>
          <li>Live database read of User entity</li>
          <li>If is_suspended = true → return 403 immediately</li>
          <li>Message: "Account suspended. Contact support."</li>
          <li>Block ALL actions - no exceptions</li>
        </ul>
      </div>
      
      <h2>Downstream Effects (Triggers.2)</h2>
      <ul>
        <li><strong>CaregiverProfile:</strong> Hidden from search results</li>
        <li><strong>Active Bookings (Abuse.1):</strong> NOT auto-cancelled - admin review required</li>
        <li><strong>Moderation Queue:</strong> Shows suspended users with active bookings</li>
      </ul>
      
      <h2>Re-Registration Detection (Errors.2)</h2>
      <ul>
        <li><strong>Trigger:</strong> New account created with email of previously suspended user</li>
        <li><strong>Action:</strong> Flag new account for admin review (FlaggedContent)</li>
        <li><strong>Notification:</strong> Admin alert sent</li>
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
            <td>Accidental Suspension (Edge.1)</td>
            <td>Unsuspend reverses it. Both log entries remain (no deletion).</td>
          </tr>
          <tr>
            <td>Suspended Admin (Edge.2)</td>
            <td>Cannot unsuspend themselves. Another super_admin required.</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Pre-Launch Requirement (Edge.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>REQUIRED: At least 2 super_admin accounts before launch</strong>
        <ul>
          <li>Prevents lockout if sole super_admin is suspended</li>
          <li>Verify count before go-live</li>
          <li>Document super_admin email addresses</li>
        </ul>
      </div>
      
      <h2>User-Facing UI (UI.1)</h2>
      <ul>
        <li><strong>Login Attempt:</strong> "Your account has been suspended. Please contact support."</li>
        <li><strong>Support Link:</strong> Opens support contact form</li>
        <li><strong>Forbidden:</strong> Do NOT show suspension_reason (Access.3)</li>
      </ul>
      
      <h2>Admin UI (UI.2)</h2>
      <ul>
        <li><strong>User Management Table:</strong> Status column (Active/Suspended badge)</li>
        <li><strong>Actions:</strong> Suspend User / Unsuspend User buttons</li>
        <li><strong>Confirmation Modal:</strong> Requires reason input (min 10 characters)</li>
        <li><strong>Display:</strong> User name and email in modal</li>
      </ul>
      
      <h2>Logging & Audit (Audit.1-2)</h2>
      <ul>
        <li><strong>Suspension (Audit.1):</strong> AdminActionLog entry (action_type = suspend_user)</li>
        <li><strong>Unsuspension (Audit.1):</strong> AdminActionLog entry (action_type = unsuspend_user)</li>
        <li><strong>Downstream Effects (Audit.2):</strong> F-010 structured logging</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Configure field-level security (Access.1-3)</li>
        <li>Implement suspendUser automation with atomicity</li>
        <li>Implement unsuspendUser automation</li>
        <li>Implement session invalidation (token blacklist or versioning)</li>
        <li>Update F-003 middleware Gate 2 to check is_suspended</li>
        <li>Implement profile hiding from search (Triggers.2)</li>
        <li>Implement re-registration detection (Errors.2)</li>
        <li>Create admin UI (suspension modal, user management table)</li>
        <li>Update login flow to check is_suspended before JWT issue</li>
        <li>Verify minimum 2 super_admin accounts exist</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete implementation examples, atomicity patterns, and admin UI code.</em></p>
    </div>
  );
}