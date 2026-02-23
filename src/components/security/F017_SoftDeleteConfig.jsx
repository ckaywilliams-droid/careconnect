/**
 * F-017: SOFT DELETE VS HARD DELETE POLICY CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-017
 * Soft Delete vs Hard Delete Policy. Defines deletion lifecycle with soft delete
 * as default, preserving audit trails and enabling recovery.
 * 
 * STATUS: Phase 0 - Entities updated with soft delete fields
 * NEXT STEP: Implement soft delete automation + admin UI controls
 * 
 * ============================================================================
 * CRITICAL POLICY REQUIREMENTS
 * ============================================================================
 */

const F017_SOFT_DELETE_SPECIFICATION = {
  
  /**
   * ENTITY FIELDS (Data.1-3)
   * Soft delete fields required on deletable entities
   */
  entity_fields: {
    
    required_fields: {
      // Data.1: Three fields required for soft delete support
      is_deleted: {
        field: 'is_deleted',
        type: 'Boolean',
        default: false,
        description: 'Soft delete flag - when true, record excluded from public queries'
      },
      
      deleted_at: {
        field: 'deleted_at',
        type: 'DateTime',
        nullable: true,
        description: 'Timestamp when record was soft-deleted'
      },
      
      deletion_reason: {
        field: 'deletion_reason',
        type: 'Text',
        nullable: true,
        description: 'Admin-provided reason for deletion (audit trail)'
      }
    },
    
    entities_with_soft_delete: {
      // Data.2: Collections requiring soft delete support
      user: {
        entity: 'User',
        rationale: 'Preserve audit trail, session history, booking references',
        cascades: 'CaregiverProfile auto-unpublished (Triggers.2)'
      },
      
      caregiver_profile: {
        entity: 'CaregiverProfile',
        rationale: 'Preserve booking history, review references',
        cascades: 'Auto-unpublished from search when deleted'
      },
      
      message: {
        entity: 'Message',
        rationale: 'Admin content removal while preserving thread context',
        cascades: 'None'
      },
      
      other_entities_with_soft_delete: [
        'ParentProfile (preserves booking history)',
        'BookingRequest (audit trail, never actually deleted)',
        'FlaggedContent (never deleted - F-016 Logic.2)',
        'MessageThread (preserves context)'
      ]
    },
    
    no_new_record: {
      // Data.3: Soft delete modifies existing record
      rule: 'Soft delete does NOT create new record - sets is_deleted = true on existing',
      implementation: 'UPDATE operation, not INSERT'
    }
  },
  
  /**
   * AUTOMATIC QUERY FILTERING (Access.1)
   * Soft-deleted records excluded from queries
   */
  query_filtering: {
    
    requirement: {
      // Access.1: Automatic exclusion from public queries
      rule: 'is_deleted = true records excluded from all public queries automatically',
      mechanism: 'Base44 collection filter applies is_deleted = false by default',
      visibility: 'Soft-deleted records invisible to regular users and admins'
    },
    
    base44_configuration: {
      collection_filter: `
        // Base44 collection-level filter
        User collection → Default Query Filter:
        {
          "is_deleted": false
        }
        
        CaregiverProfile collection → Default Query Filter:
        {
          "is_deleted": false
        }
        
        Message collection → Default Query Filter:
        {
          "is_deleted": false
        }
        
        // All queries automatically exclude soft-deleted records
        // Example:
        const users = await base44.entities.User.list();
        // Returns only users where is_deleted = false
      `,
      
      override_filter: {
        // Access.2: super_admin can query deleted records
        approach: 'Use asServiceRole to bypass collection filter',
        
        implementation: `
          // Super_admin querying soft-deleted records
          async function getSoftDeletedUsers() {
            // Access.2: Only super_admin can access
            const allUsers = await base44.asServiceRole.entities.User.filter({
              is_deleted: true
            });
            
            return allUsers;
          }
        `
      }
    },
    
    search_exclusion: {
      example: `
        // Caregiver search automatically excludes soft-deleted
        const caregivers = await base44.entities.CaregiverProfile.filter({
          city: 'San Francisco',
          is_published: true
        });
        // is_deleted = false applied automatically by collection filter
        // No soft-deleted profiles returned
      `
    }
  },
  
  /**
   * DELETION LIFECYCLE (States.1-2)
   * Active → Soft Deleted → Hard Deleted → Purged
   */
  deletion_lifecycle: {
    
    states: {
      active: {
        state: 'Active',
        is_deleted: false,
        deleted_at: null,
        description: 'Normal operational state',
        visibility: 'Public/admin queries'
      },
      
      soft_deleted: {
        state: 'Soft Deleted',
        is_deleted: true,
        deleted_at: 'Timestamp set',
        deletion_reason: 'Admin reason recorded',
        description: 'Record hidden but data intact',
        visibility: 'super_admin only (Access.2)',
        duration: '90 days retention window (Edge.1)',
        restorable: 'Yes - set is_deleted = false (States.2)'
      },
      
      hard_deleted: {
        state: 'Hard Deleted (PII Anonymised)',
        description: 'PII anonymised, skeleton retained',
        pii_fields: 'email → deleted_user_123@anon.local, phone → null, address → null',
        visibility: 'Audit trail only',
        restorable: 'No - PII gone (States.2)',
        when: 'GDPR/CCPA erasure request (post-MVP - Logic.2)',
        skeleton: 'User ID, created_date, role remain for referential integrity'
      },
      
      purged: {
        state: 'Purged',
        description: 'Complete record deletion',
        when: 'Explicit GDPR erasure (post-MVP)',
        visibility: 'None',
        restorable: 'No'
      }
    },
    
    state_diagram: `
      ┌─────────┐
      │ Active  │ ← Normal operational state
      └────┬────┘
           │
           │ Admin soft delete (Triggers.1)
           ↓
      ┌──────────────┐
      │ Soft Deleted │ (is_deleted=true, 90-day retention - Edge.1)
      └──────┬───────┘
             │
             ├─→ Restore (Abuse.1): set is_deleted=false
             │
             │ After 90 days OR GDPR request (Logic.2, post-MVP)
             ↓
      ┌──────────────┐
      │ Hard Deleted │ (PII anonymised, skeleton retained)
      │ (PII Anon)   │
      └──────┬───────┘
             │
             │ Explicit GDPR erasure (post-MVP)
             ↓
      ┌──────────┐
      │  Purged  │ (complete deletion)
      └──────────┘
    `
  },
  
  /**
   * PREFERRED DELETION PATH (Logic.1)
   * Soft delete is default for MVP
   */
  preferred_deletion_path: {
    
    policy: {
      // Logic.1: Soft delete is default
      default: 'Soft delete for ALL MVP operations',
      rationale: [
        'Preserves BookingRequest history',
        'Maintains AdminActionLog references',
        'Enables audit trail',
        'Allows account restoration',
        'Maintains referential integrity'
      ],
      
      when_to_use_hard_delete: 'Only for GDPR/CCPA erasure requests (post-MVP)'
    },
    
    examples: {
      user_account_deletion: {
        scenario: 'User requests account deletion',
        action: 'Soft delete (is_deleted = true)',
        result: 'User data intact but hidden, 90-day recovery window'
      },
      
      admin_content_removal: {
        scenario: 'Admin removes inappropriate message',
        action: 'Soft delete Message (is_deleted = true)',
        result: 'Message hidden from thread, but context preserved'
      },
      
      caregiver_deactivation: {
        scenario: 'Caregiver deactivates profile',
        action: 'Soft delete CaregiverProfile',
        result: 'Profile hidden from search, booking history intact'
      }
    }
  },
  
  /**
   * HARD DELETE / PII ANONYMISATION (Logic.2)
   * GDPR/CCPA erasure (post-MVP)
   */
  hard_delete_pii_anonymisation: {
    
    policy: {
      // Logic.2: Post-MVP feature
      status: 'Post-MVP - document procedure even if not automated',
      trigger: 'GDPR/CCPA erasure request',
      scope: 'PII fields anonymised, skeleton retained'
    },
    
    pii_fields_to_anonymise: {
      user: {
        email: 'deleted_user_[user_id]@anon.local',
        full_name: 'Deleted User',
        phone: null,
        suspension_reason: null
      },
      
      parent_profile: {
        address_line_1: null,
        address_line_2: null,
        zip_code: null,
        special_needs_notes: '[Anonymised]'
      },
      
      caregiver_profile: {
        bio: '[Anonymised]',
        profile_photo_url: null
      },
      
      message: {
        content: '[Deleted]',
        body_original: null
      }
    },
    
    skeleton_retained: {
      // States.2: Skeleton for referential integrity
      fields_retained: [
        'id (UUID)',
        'created_date',
        'role (for User)',
        'is_deleted = true',
        'deleted_at'
      ],
      
      rationale: 'Maintain BookingRequest references, audit logs, analytics'
    },
    
    procedure_documentation: {
      // Logic.2: Document even if not automated at MVP
      steps: [
        '1. Verify GDPR/CCPA erasure request legitimacy',
        '2. Backup user data to secure compliance archive',
        '3. Run PII anonymisation script (manual at MVP)',
        '4. Log hard delete to AdminActionLog (Audit.2)',
        '5. Confirm completion to requester',
        '6. Archive erasure request documentation'
      ],
      
      manual_script_example: `
        // Manual PII anonymisation (post-MVP automation)
        async function anonymiseUserPII(userId) {
          const user = await base44.asServiceRole.entities.User.read(userId);
          
          // Step 1: Backup to compliance archive
          await archiveUserData(user);
          
          // Step 2: Anonymise User entity
          await base44.asServiceRole.entities.User.update(userId, {
            email: \`deleted_user_\${userId}@anon.local\`,
            full_name: 'Deleted User',
            phone: null,
            suspension_reason: null,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deletion_reason: 'GDPR erasure request'
          });
          
          // Step 3: Anonymise related entities
          const profile = await base44.asServiceRole.entities.ParentProfile.filter({
            user_id: userId
          });
          
          if (profile.length > 0) {
            await base44.asServiceRole.entities.ParentProfile.update(profile[0].id, {
              address_line_1: null,
              address_line_2: null,
              zip_code: null,
              special_needs_notes: '[Anonymised]'
            });
          }
          
          // Step 4: Log hard delete (Audit.2)
          await base44.asServiceRole.entities.AdminActionLog.create({
            admin_user_id: 'SYSTEM',
            admin_role: 'system',
            action_type: 'manual_override',
            target_entity_type: 'User',
            target_entity_id: userId,
            reason: 'GDPR erasure request - PII anonymised',
            action_timestamp: new Date().toISOString()
          });
        }
      `
    }
  },
  
  /**
   * SOFT DELETE AUTOMATION (Triggers.1)
   * Admin soft delete workflow
   */
  soft_delete_automation: {
    
    workflow: {
      // Triggers.1: Automation on soft delete
      trigger: 'Admin clicks "Delete User" in admin panel',
      
      steps: [
        '1. Admin provides mandatory deletion_reason',
        '2. Set is_deleted = true',
        '3. Set deleted_at = now',
        '4. Write AdminActionLog entry (Audit.1)',
        '5. If User: unpublish CaregiverProfile (if exists)',
        '6. If User: invalidate all sessions (F-015)',
        '7. If User: anonymise BookingRequest references (Triggers.2)'
      ],
      
      implementation: `
        // Soft delete user automation
        async function softDeleteUser(adminUser, targetUserId, deletionReason) {
          if (!deletionReason || deletionReason.length < 10) {
            throw new Error('Deletion reason required (minimum 10 characters)');
          }
          
          const user = await base44.entities.User.read(targetUserId);
          
          // Step 1: Log to AdminActionLog FIRST (atomicity)
          let logEntry;
          try {
            logEntry = await base44.asServiceRole.entities.AdminActionLog.create({
              admin_user_id: adminUser.id,
              admin_role: adminUser.role,
              action_type: 'manual_override',
              target_entity_type: 'User',
              target_entity_id: targetUserId,
              reason: \`Soft delete: \${deletionReason}\`,
              payload: JSON.stringify({
                before: { is_deleted: false },
                after: { is_deleted: true }
              }),
              action_timestamp: new Date().toISOString()
            });
          } catch (error) {
            throw new Error('Unable to soft delete - audit log unavailable');
          }
          
          try {
            // Step 2: Soft delete User
            await base44.asServiceRole.entities.User.update(targetUserId, {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deletion_reason: deletionReason
            });
            
            // Step 3: Triggers.1 - Unpublish CaregiverProfile if exists
            if (user.role === 'caregiver') {
              const profiles = await base44.asServiceRole.entities.CaregiverProfile.filter({
                user_id: targetUserId
              });
              
              if (profiles.length > 0) {
                // Triggers.2: Soft delete CaregiverProfile
                await base44.asServiceRole.entities.CaregiverProfile.update(profiles[0].id, {
                  is_published: false,
                  is_deleted: true,
                  deleted_at: new Date().toISOString(),
                  deletion_reason: 'User account deleted'
                });
              }
            }
            
            // Step 4: Invalidate sessions (F-015)
            await invalidateUserSessions(targetUserId);
            
            // Step 5: Triggers.2 - Anonymise BookingRequest references
            await anonymiseBookingReferences(targetUserId);
            
            console.info('User soft deleted', {
              user_id: targetUserId,
              admin_id: adminUser.id,
              reason: deletionReason
            });
            
          } catch (error) {
            // Rollback: Delete AdminActionLog entry
            await base44.asServiceRole.entities.AdminActionLog.delete(logEntry.id);
            throw error;
          }
        }
      `
    }
  },
  
  /**
   * CASCADE BEHAVIOR (Triggers.2)
   * User deletion cascades
   */
  cascade_behavior: {
    
    when_user_soft_deleted: {
      // Triggers.2: User deletion cascades
      
      caregiver_profile: {
        action: 'Soft deleted (is_deleted = true)',
        rationale: 'Profile should not appear in search'
      },
      
      parent_profile: {
        action: 'Soft deleted',
        rationale: 'Consistent with user deletion'
      },
      
      booking_requests: {
        action: 'NOT deleted - retained with anonymised user reference',
        anonymisation: 'User reference → "deleted_user" (Triggers.2)',
        rationale: 'Preserve audit trail, caregiver earnings history',
        
        implementation: `
          // Logic.3: Anonymise BookingRequest references
          async function anonymiseBookingReferences(userId) {
            // Find all bookings involving this user
            const parentBookings = await base44.asServiceRole.entities.BookingRequest.filter({
              parent_profile_id: { $exists: true }  // Complex query needed
            });
            
            const caregiverBookings = await base44.asServiceRole.entities.BookingRequest.filter({
              caregiver_profile_id: { $exists: true }
            });
            
            // Update display names (not IDs - preserve referential integrity)
            // This is a metadata update, not breaking foreign keys
            
            console.info('Booking references anonymised', {
              user_id: userId,
              parent_bookings: parentBookings.length,
              caregiver_bookings: caregiverBookings.length
            });
          }
        `
      },
      
      messages: {
        action: 'NOT deleted - retained',
        display: 'Sender shows as "[Deleted User]" in UI',
        rationale: 'Preserve thread context for other participant'
      }
    }
  },
  
  /**
   * RESTORATION (Abuse.1)
   * Restore soft-deleted records
   */
  restoration: {
    
    policy: {
      // Abuse.1: Restoration allowed within 90-day window
      who: 'super_admin only',
      action: 'Set is_deleted = false',
      logging: 'Logged to AdminActionLog with mandatory reason',
      window: '90 days (Edge.1)'
    },
    
    implementation: {
      restore_function: `
        // Restore soft-deleted user
        async function restoreUser(adminUser, targetUserId, restorationReason) {
          if (!restorationReason || restorationReason.length < 10) {
            throw new Error('Restoration reason required (minimum 10 characters)');
          }
          
          const user = await base44.asServiceRole.entities.User.filter({
            id: targetUserId,
            is_deleted: true
          });
          
          if (user.length === 0) {
            throw new Error('User not found or not soft-deleted');
          }
          
          // Check 90-day window (Edge.1)
          const deletedAt = new Date(user[0].deleted_at);
          const now = new Date();
          const daysSinceDeletion = (now - deletedAt) / (1000 * 60 * 60 * 24);
          
          if (daysSinceDeletion > 90) {
            throw new Error('User exceeds 90-day restoration window');
          }
          
          // Abuse.1: Log restoration to AdminActionLog
          await base44.asServiceRole.entities.AdminActionLog.create({
            admin_user_id: adminUser.id,
            admin_role: adminUser.role,
            action_type: 'manual_override',
            target_entity_type: 'User',
            target_entity_id: targetUserId,
            reason: \`Restore user: \${restorationReason}\`,
            payload: JSON.stringify({
              before: { is_deleted: true },
              after: { is_deleted: false }
            }),
            action_timestamp: new Date().toISOString()
          });
          
          // Restore user
          await base44.asServiceRole.entities.User.update(targetUserId, {
            is_deleted: false,
            // Keep deleted_at and deletion_reason for audit history
          });
          
          // Restore CaregiverProfile if exists
          const profiles = await base44.asServiceRole.entities.CaregiverProfile.filter({
            user_id: targetUserId,
            is_deleted: true
          });
          
          if (profiles.length > 0) {
            await base44.asServiceRole.entities.CaregiverProfile.update(profiles[0].id, {
              is_deleted: false
            });
          }
        }
      `
    }
  },
  
  /**
   * ERROR HANDLING (Errors.1-2)
   * Accepted bookings and super_admin protection
   */
  error_handling: {
    
    accepted_future_bookings: {
      // Errors.1: Caregiver with accepted future bookings
      scenario: 'Caregiver soft-deleted while having accepted future bookings',
      requirement: 'Admin must review and notify parents',
      
      admin_query: {
        title: 'Soft-Deleted Caregivers with Active Bookings',
        query: `
          // Admin panel query
          async function getSoftDeletedCaregiversWithBookings() {
            // Get soft-deleted caregivers
            const deletedCaregivers = await base44.asServiceRole.entities.CaregiverProfile.filter({
              is_deleted: true
            });
            
            const results = [];
            
            for (const profile of deletedCaregivers) {
              // Check for accepted future bookings
              const futureDate = new Date();
              const futureBookings = await base44.asServiceRole.entities.BookingRequest.filter({
                caregiver_profile_id: profile.id,
                status: 'accepted',
                requested_date: { $gte: futureDate.toISOString() }
              });
              
              if (futureBookings.length > 0) {
                results.push({
                  caregiver_profile_id: profile.id,
                  user_id: profile.user_id,
                  deleted_at: profile.deleted_at,
                  active_bookings: futureBookings.length,
                  bookings: futureBookings
                });
              }
            }
            
            return results;
          }
        `,
        
        admin_action: [
          'Review each booking',
          'Contact parent to notify of caregiver unavailability',
          'Offer to cancel booking or find replacement',
          'Log action to AdminActionLog'
        ]
      }
    },
    
    super_admin_protection: {
      // Errors.2: Prevent accidental super_admin deletion
      
      soft_delete_protection: {
        rule: 'Soft delete of super_admin must be reversible',
        requirement: 'At least TWO super_admin accounts must exist',
        verification: 'Count super_admin roles before allowing soft delete',
        
        implementation: `
          async function softDeleteUser(adminUser, targetUserId, deletionReason) {
            const targetUser = await base44.entities.User.read(targetUserId);
            
            // Errors.2: Check if deleting super_admin
            if (targetUser.role === 'super_admin') {
              // Count remaining active super_admins
              const activeSuperAdmins = await base44.entities.User.filter({
                role: 'super_admin',
                is_deleted: false
              });
              
              if (activeSuperAdmins.length <= 2) {
                throw new Error('Cannot soft delete super_admin - minimum 2 active accounts required');
              }
            }
            
            // Proceed with soft delete
            // ...
          }
        `
      },
      
      hard_delete_protection: {
        rule: 'Hard delete of super_admin blocked until another super_admin confirms',
        enforcement: 'Two-person rule for super_admin hard deletion',
        
        implementation: `
          async function hardDeleteUser(requestingAdmin, confirmingAdmin, targetUserId) {
            const targetUser = await base44.asServiceRole.entities.User.filter({
              id: targetUserId,
              is_deleted: true
            });
            
            if (targetUser[0].role === 'super_admin') {
              // Errors.2: Require second super_admin confirmation
              if (confirmingAdmin.role !== 'super_admin' || confirmingAdmin.id === requestingAdmin.id) {
                throw new Error('Hard delete of super_admin requires second super_admin confirmation');
              }
            }
            
            // Proceed with hard delete (PII anonymisation)
            await anonymiseUserPII(targetUserId);
          }
        `
      }
    }
  },
  
  /**
   * EDGE CASES (Edge.1-2)
   * 90-day retention and re-registration
   */
  edge_cases: {
    
    ninety_day_retention: {
      // Edge.1: 90-day window before hard deletion eligibility
      policy: 'Soft-deleted User records retained for 90 days',
      purpose: 'User can request account restoration during this window',
      
      after_90_days: {
        eligibility: 'Record eligible for hard deletion (PII anonymisation)',
        not_automatic: 'Hard deletion NOT automatic - manual admin action or GDPR request',
        user_initiated: 'User cannot restore after 90 days'
      },
      
      restoration_window: `
        // Check if user is within restoration window
        function canRestoreUser(deletedAt) {
          const now = new Date();
          const deleted = new Date(deletedAt);
          const daysSinceDeletion = (now - deleted) / (1000 * 60 * 60 * 24);
          
          return daysSinceDeletion <= 90;
        }
      `
    },
    
    soft_deleted_reregistration: {
      // Edge.2: Soft-deleted user tries to re-register
      scenario: 'User with soft-deleted account tries to create new account with same email',
      
      detection: {
        rule: 'Detect soft-deleted record during registration',
        action: 'Route to support (do not create duplicate)',
        
        implementation: `
          // User registration hook
          async function onUserRegistration(email) {
            // Edge.2: Check for soft-deleted account
            const softDeletedUser = await base44.asServiceRole.entities.User.filter({
              email: email,
              is_deleted: true
            });
            
            if (softDeletedUser.length > 0) {
              const deletedAt = new Date(softDeletedUser[0].deleted_at);
              const daysSinceDeletion = (new Date() - deletedAt) / (1000 * 60 * 60 * 24);
              
              if (daysSinceDeletion <= 90) {
                // Within restoration window
                return {
                  error: 'account_exists_deleted',
                  message: 'An account with this email was recently deleted. Please contact support to restore your account.',
                  support_url: 'https://example.com/support'
                };
              } else {
                // Beyond restoration window - hard delete eligible
                // Admin decision: restore or allow new registration
                await notifySupportTeam({
                  type: 'soft_deleted_reregistration',
                  email: email,
                  deleted_at: softDeletedUser[0].deleted_at,
                  days_since_deletion: daysSinceDeletion
                });
                
                return {
                  error: 'account_exists_deleted',
                  message: 'Please contact support to proceed.',
                  support_url: 'https://example.com/support'
                };
              }
            }
            
            // No soft-deleted account - proceed with registration
            return { success: true };
          }
        `
      }
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-2)
   * Soft delete and hard delete logging
   */
  logging_and_audit: {
    
    soft_delete_logging: {
      // Audit.1: Log to AdminActionLog
      collection: 'AdminActionLog',
      
      fields: {
        admin_user_id: 'Admin who performed soft delete',
        admin_role: 'Admin role at time of action',
        action_type: 'manual_override (or create dedicated "soft_delete" type)',
        target_entity_type: 'User / CaregiverProfile / Message',
        target_entity_id: 'ID of deleted record',
        reason: 'REQUIRED - deletion_reason from admin input',
        payload: 'JSON: { before: { is_deleted: false }, after: { is_deleted: true } }',
        action_timestamp: 'Auto-set timestamp'
      }
    },
    
    hard_delete_logging: {
      // Audit.2: Compliance event
      log_type: 'Compliance event (separate from AdminActionLog)',
      
      fields: {
        event_type: 'pii_anonymisation',
        target_user_id: 'User whose PII was anonymised',
        timestamp: 'When anonymisation occurred',
        scope: 'Which entities were anonymised (User, ParentProfile, etc)',
        requester: 'Who requested erasure (GDPR data subject)',
        admin_confirming: 'Admin who executed anonymisation'
      },
      
      implementation: `
        // Log hard delete as compliance event
        async function logHardDelete(userId, adminUser) {
          // Audit.2: Create compliance log entry
          await base44.asServiceRole.entities.ComplianceLog.create({
            event_type: 'pii_anonymisation',
            target_user_id: userId,
            timestamp: new Date().toISOString(),
            scope: JSON.stringify(['User', 'ParentProfile', 'CaregiverProfile', 'Message']),
            requester: 'GDPR data subject',
            admin_confirming: adminUser.id
          });
          
          // Also log to AdminActionLog
          await base44.asServiceRole.entities.AdminActionLog.create({
            admin_user_id: adminUser.id,
            admin_role: adminUser.role,
            action_type: 'manual_override',
            target_entity_type: 'User',
            target_entity_id: userId,
            reason: 'GDPR erasure request - PII anonymised',
            action_timestamp: new Date().toISOString()
          });
        }
      `
    }
  },
  
  /**
   * ADMIN UI (UI.1-2)
   * Delete action and soft-deleted visibility
   */
  admin_ui: {
    
    delete_action: {
      // UI.1: Admin user management delete action
      location: 'Admin dashboard → User Management table',
      
      confirmation_modal: {
        title: 'Delete User Account',
        body: 'Are you sure you want to delete [User Name] ([user@email.com])?',
        
        deletion_options: [
          {
            option: 'Soft Delete (recommended)',
            description: 'Hide account but retain data. Can be restored within 90 days.',
            button: 'Soft Delete',
            enabled: true,
            color: 'destructive'
          },
          {
            option: 'Anonymise PII (hard delete)',
            description: 'Permanently remove personal information. Cannot be undone.',
            button: 'Anonymise PII',
            enabled: false,  // UI.1: Disabled at MVP
            tooltip: 'Coming soon - GDPR/CCPA compliance feature',
            color: 'destructive'
          }
        ],
        
        reason_input: {
          label: 'Deletion Reason (required)',
          placeholder: 'Enter reason for deletion...',
          min_length: 10,
          validation: 'Required field - minimum 10 characters'
        },
        
        buttons: ['Cancel', 'Soft Delete (red button)']
      },
      
      implementation_example: `
        import React, { useState } from 'react';
        import { base44 } from '@/api/base44Client';
        import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
        import { Textarea } from '@/components/ui/textarea';
        import { Button } from '@/components/ui/button';
        import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
        import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
        
        export default function DeleteUserModal({ user, onClose }) {
          const [deletionType, setDeletionType] = useState('soft');
          const [reason, setReason] = useState('');
          
          const handleDelete = async () => {
            if (reason.length < 10) {
              alert('Reason must be at least 10 characters');
              return;
            }
            
            try {
              if (deletionType === 'soft') {
                await softDeleteUser(user.id, reason);
              } else {
                // UI.1: Disabled at MVP
                alert('PII anonymisation coming soon');
              }
              
              onClose();
            } catch (error) {
              alert('Deletion failed: ' + error.message);
            }
          };
          
          return (
            <Dialog open onOpenChange={onClose}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Delete User Account</DialogTitle>
                </DialogHeader>
                
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete <strong>{user.full_name}</strong> ({user.email})?
                </p>
                
                <RadioGroup value={deletionType} onValueChange={setDeletionType}>
                  <div className="flex items-start space-x-3 border rounded-lg p-3">
                    <RadioGroupItem value="soft" id="soft" />
                    <div className="flex-1">
                      <label htmlFor="soft" className="font-medium cursor-pointer">
                        Soft Delete (recommended)
                      </label>
                      <p className="text-sm text-gray-600">
                        Hide account but retain data. Can be restored within 90 days.
                      </p>
                    </div>
                  </div>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-start space-x-3 border rounded-lg p-3 opacity-50">
                          <RadioGroupItem value="hard" id="hard" disabled />
                          <div className="flex-1">
                            <label htmlFor="hard" className="font-medium">
                              Anonymise PII (hard delete)
                            </label>
                            <p className="text-sm text-gray-600">
                              Permanently remove personal information. Cannot be undone.
                            </p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Coming soon - GDPR/CCPA compliance feature</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </RadioGroup>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Deletion Reason (required)
                  </label>
                  <Textarea
                    placeholder="Enter reason for deletion..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum 10 characters
                  </p>
                </div>
                
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={reason.length < 10}
                  >
                    Soft Delete
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          );
        }
      `
    },
    
    soft_deleted_visibility: {
      // UI.2: Soft-deleted profiles in admin panel
      
      admin_view: {
        display: 'Soft-deleted profiles show as "Deleted" badge in admin panel',
        filter: 'Show Deleted toggle to include/exclude soft-deleted records',
        actions: ['View Details', 'Restore (super_admin only)']
      },
      
      public_view: {
        display: 'Soft-deleted profiles NOT visible to public or other users',
        enforcement: 'Access.1 automatic query filter excludes is_deleted = true'
      },
      
      implementation_example: `
        // Admin user table with soft-deleted visibility
        export default function AdminUserTable() {
          const [showDeleted, setShowDeleted] = useState(false);
          
          const { data: users } = useQuery({
            queryKey: ['users', showDeleted],
            queryFn: async () => {
              if (showDeleted) {
                // Access.2: Query soft-deleted (super_admin only)
                return await base44.asServiceRole.entities.User.filter({
                  is_deleted: true
                });
              } else {
                // Normal query (excludes soft-deleted)
                return await base44.entities.User.list();
              }
            }
          });
          
          return (
            <div>
              <div className="mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showDeleted}
                    onChange={(e) => setShowDeleted(e.target.checked)}
                  />
                  Show Deleted Users
                </label>
              </div>
              
              <table className="w-full">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map(user => (
                    <tr key={user.id}>
                      <td>{user.full_name}</td>
                      <td>{user.email}</td>
                      <td>
                        {user.is_deleted ? (
                          <Badge variant="destructive">Deleted</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      <td>
                        {user.is_deleted && canRestoreUser(user.deleted_at) ? (
                          <Button size="sm" onClick={() => restoreUser(user.id)}>
                            Restore
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
const F017_CONFIGURATION_CHECKLIST = [
  {
    category: 'Entity Fields',
    tasks: [
      { task: 'Add soft delete fields to User entity', status: 'complete' },
      { task: 'Add soft delete fields to CaregiverProfile entity', status: 'complete' },
      { task: 'Add soft delete fields to Message entity', status: 'complete' },
      { task: 'Add soft delete fields to ParentProfile entity', status: 'pending' },
      { task: 'Add soft delete fields to BookingRequest entity', status: 'pending' }
    ]
  },
  {
    category: 'Query Filtering',
    tasks: [
      { task: 'Configure Base44 collection filter: is_deleted = false (Access.1)', status: 'pending' },
      { task: 'Test: Regular queries exclude soft-deleted records', status: 'pending' },
      { task: 'Test: asServiceRole can query soft-deleted records (Access.2)', status: 'pending' }
    ]
  },
  {
    category: 'Soft Delete Automation',
    tasks: [
      { task: 'Implement softDeleteUser function (Triggers.1)', status: 'pending' },
      { task: 'Set is_deleted = true, deleted_at = now', status: 'pending' },
      { task: 'Log to AdminActionLog (Audit.1)', status: 'pending' },
      { task: 'Unpublish CaregiverProfile if exists', status: 'pending' },
      { task: 'Invalidate user sessions (F-015)', status: 'pending' },
      { task: 'Anonymise BookingRequest references (Triggers.2)', status: 'pending' }
    ]
  },
  {
    category: 'Restoration',
    tasks: [
      { task: 'Implement restoreUser function (Abuse.1)', status: 'pending' },
      { task: 'Check 90-day window (Edge.1)', status: 'pending' },
      { task: 'Set is_deleted = false', status: 'pending' },
      { task: 'Log to AdminActionLog with reason', status: 'pending' },
      { task: 'Restore CaregiverProfile if exists', status: 'pending' }
    ]
  },
  {
    category: 'Error Handling',
    tasks: [
      { task: 'Create admin query: soft-deleted caregivers with bookings (Errors.1)', status: 'pending' },
      { task: 'Implement super_admin protection (Errors.2)', status: 'pending' },
      { task: 'Block soft delete if < 2 active super_admins', status: 'pending' },
      { task: 'Hard delete requires second super_admin confirmation', status: 'pending' }
    ]
  },
  {
    category: 'Edge Cases',
    tasks: [
      { task: 'Implement 90-day retention check (Edge.1)', status: 'pending' },
      { task: 'Implement soft-deleted re-registration detection (Edge.2)', status: 'pending' },
      { task: 'Route to support instead of creating duplicate', status: 'pending' }
    ]
  },
  {
    category: 'Hard Delete (Post-MVP)',
    tasks: [
      { task: 'Document PII anonymisation procedure (Logic.2)', status: 'complete' },
      { task: 'Define PII fields to anonymise', status: 'complete' },
      { task: 'Define skeleton fields to retain', status: 'complete' },
      { task: 'Create anonymiseUserPII function (manual at MVP)', status: 'pending' },
      { task: 'Log hard delete to compliance log (Audit.2)', status: 'pending' }
    ]
  },
  {
    category: 'Admin UI',
    tasks: [
      { task: 'Create DeleteUserModal component (UI.1)', status: 'pending' },
      { task: 'Show Soft Delete / Anonymise PII options', status: 'pending' },
      { task: 'Disable "Anonymise PII" with "Coming soon" tooltip', status: 'pending' },
      { task: 'Require deletion reason (min 10 chars)', status: 'pending' },
      { task: 'Add "Show Deleted" toggle to admin table (UI.2)', status: 'pending' },
      { task: 'Display "Deleted" badge for soft-deleted users', status: 'pending' },
      { task: 'Add "Restore" button (super_admin only)', status: 'pending' }
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
    test: 'Soft Delete - User',
    steps: [
      'Admin clicks "Delete User" on user_abc123',
      'Modal opens with Soft Delete / Anonymise PII options',
      'Admin selects "Soft Delete"',
      'Admin enters reason: "User requested account deletion"',
      'Admin clicks "Soft Delete"',
      'Verify: User.is_deleted = true',
      'Verify: User.deleted_at = now',
      'Verify: User.deletion_reason = "User requested account deletion"',
      'Verify: AdminActionLog entry created (Audit.1)'
    ]
  },
  {
    test: 'Soft Delete - Query Filtering',
    steps: [
      'Soft delete user_abc123',
      'Query: base44.entities.User.list()',
      'Verify: user_abc123 NOT in results (Access.1)',
      'Query as super_admin: base44.asServiceRole.entities.User.filter({ is_deleted: true })',
      'Verify: user_abc123 IS in results (Access.2)'
    ]
  },
  {
    test: 'Soft Delete - Cascade to CaregiverProfile',
    steps: [
      'User is caregiver with published profile',
      'Admin soft deletes user',
      'Verify: CaregiverProfile.is_deleted = true (Triggers.2)',
      'Verify: CaregiverProfile.is_published = false',
      'Query caregivers in search',
      'Verify: Profile NOT in search results'
    ]
  },
  {
    test: 'Soft Delete - Session Invalidation',
    steps: [
      'User is logged in with active JWT',
      'Admin soft deletes user',
      'User makes API request with existing JWT',
      'Verify: Returns 403 Forbidden (sessions invalidated)'
    ]
  },
  {
    test: 'Soft Delete - Booking Retention',
    steps: [
      'User has 3 BookingRequests',
      'Admin soft deletes user',
      'Query BookingRequests',
      'Verify: All 3 bookings still exist (NOT deleted - Triggers.2)',
      'Verify: User reference anonymised to "deleted_user"'
    ]
  },
  {
    test: 'Restoration - Within 90 Days',
    steps: [
      'User soft-deleted 30 days ago',
      'super_admin clicks "Restore User"',
      'super_admin enters reason: "User requested account recovery"',
      'super_admin clicks "Restore"',
      'Verify: User.is_deleted = false',
      'Verify: User can login',
      'Verify: AdminActionLog entry created for restoration (Abuse.1)'
    ]
  },
  {
    test: 'Restoration - Beyond 90 Days',
    steps: [
      'User soft-deleted 100 days ago',
      'super_admin attempts to restore',
      'Verify: Error: "User exceeds 90-day restoration window" (Edge.1)',
      'Verify: User NOT restored'
    ]
  },
  {
    test: 'Soft-Deleted Re-Registration',
    steps: [
      'User soft-deleted 20 days ago',
      'User attempts to register with same email',
      'Verify: Error: "account_exists_deleted" (Edge.2)',
      'Verify: Message: "Contact support to restore your account"',
      'Verify: NO new account created'
    ]
  },
  {
    test: 'Admin Query - Caregivers with Active Bookings',
    steps: [
      'Caregiver has 2 accepted future bookings',
      'Admin soft deletes caregiver',
      'Admin runs query: soft-deleted caregivers with active bookings',
      'Verify: Caregiver appears in results (Errors.1)',
      'Verify: Shows 2 active bookings'
    ]
  },
  {
    test: 'Super Admin Protection - Soft Delete',
    steps: [
      'Only 2 active super_admins exist',
      'Admin attempts to soft delete super_admin_1',
      'Verify: Error: "Cannot soft delete - minimum 2 required" (Errors.2)',
      'Verify: super_admin NOT deleted'
    ]
  },
  {
    test: 'Hard Delete - Disabled at MVP',
    steps: [
      'Admin opens delete modal',
      'Verify: "Anonymise PII" option shown but DISABLED (UI.1)',
      'Hover over disabled option',
      'Verify: Tooltip: "Coming soon - GDPR/CCPA compliance feature"'
    ]
  },
  {
    test: 'Admin UI - Deleted Badge',
    steps: [
      'Admin opens user management table',
      'Soft-deleted users NOT shown by default',
      'Admin toggles "Show Deleted"',
      'Verify: Soft-deleted users now visible (UI.2)',
      'Verify: "Deleted" badge shown',
      'Verify: "Restore" button available (super_admin only)'
    ]
  },
  {
    test: 'Logging - Soft Delete',
    steps: [
      'Admin soft deletes user',
      'Query AdminActionLog',
      'Verify: Entry created (Audit.1)',
      'Verify: action_type = manual_override (or soft_delete)',
      'Verify: reason = admin input',
      'Verify: payload shows before/after state'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - Collection-level default filter (is_deleted = false)
 * - Field-level security for is_deleted (admin-only write)
 * - Session invalidation on user deletion
 * 
 * Supporting Entities:
 * - User: is_deleted, deleted_at, deletion_reason
 * - CaregiverProfile: is_deleted, deleted_at, deletion_reason
 * - Message: is_deleted, deleted_at, deletion_reason
 * - AdminActionLog: Logs all soft delete actions
 * 
 * Integration with Other Features:
 * - F-008: AdminActionLog tracks deletion actions
 * - F-015: Session invalidation on user deletion
 * - F-016: FlaggedContent never deleted (Logic.2)
 * - F-017: BookingRequests retained with anonymised references
 * 
 * CRITICAL WARNINGS:
 * - Access.1: Automatic query filter excludes is_deleted = true
 * - Access.2: Only super_admin can query soft-deleted records
 * - Logic.1: Soft delete is PREFERRED for all MVP operations
 * - Logic.2: Hard delete (PII anonymisation) post-MVP only
 * - Logic.3: User deletion cascades to profile, NOT to bookings
 * - States.2: Soft delete restorable, hard delete NOT restorable
 * - Triggers.2: BookingRequests retained with anonymised user reference
 * - Errors.1: Query caregivers with active bookings before deletion
 * - Errors.2: Protect super_admin accounts (minimum 2 active)
 * - Edge.1: 90-day restoration window
 * - Edge.2: Detect soft-deleted re-registration attempts
 * - Audit.1: Log all soft deletes to AdminActionLog
 * - Audit.2: Log hard deletes as compliance events
 * 
 * NEXT STEPS:
 * 1. Configure Base44 collection filters (is_deleted = false)
 * 2. Implement softDeleteUser automation
 * 3. Implement restoreUser function with 90-day check
 * 4. Implement super_admin protection checks
 * 5. Implement soft-deleted re-registration detection
 * 6. Create admin query for caregivers with active bookings
 * 7. Create DeleteUserModal component (UI.1)
 * 8. Add "Show Deleted" toggle to admin table (UI.2)
 * 9. Document PII anonymisation procedure (post-MVP)
 * 10. Test all acceptance criteria
 */

export default function F017SoftDeleteDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-017: Soft Delete vs Hard Delete Policy - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Entities updated with soft delete fields</p>
      <p><strong>Next Step:</strong> Configure query filtering + implement soft delete automation</p>
      
      <h2>Deletion Lifecycle (States.1-2)</h2>
      <ul>
        <li><strong>Active:</strong> Normal operational state (is_deleted = false)</li>
        <li><strong>Soft Deleted:</strong> Hidden but data intact, 90-day retention (is_deleted = true)</li>
        <li><strong>Hard Deleted (post-MVP):</strong> PII anonymised, skeleton retained (GDPR/CCPA)</li>
        <li><strong>Purged (post-MVP):</strong> Complete deletion (explicit GDPR erasure)</li>
      </ul>
      
      <h2>Preferred Deletion Path (Logic.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>POLICY: Soft delete is DEFAULT for all MVP operations</strong>
        <ul>
          <li>Preserves BookingRequest history</li>
          <li>Maintains AdminActionLog references</li>
          <li>Enables audit trail</li>
          <li>Allows 90-day account restoration</li>
        </ul>
      </div>
      
      <h2>Query Filtering (Access.1-2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Query Type</th>
            <th>Includes Soft-Deleted?</th>
            <th>Who Can Access?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Regular queries (base44.entities.User.list())</td>
            <td>NO (automatic filter)</td>
            <td>All users, admins</td>
          </tr>
          <tr>
            <td>Service role queries (asServiceRole)</td>
            <td>YES (if queried explicitly)</td>
            <td>super_admin only</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Cascade Behavior (Triggers.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>When User Soft-Deleted</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CaregiverProfile</td>
            <td>Soft deleted (is_deleted = true, is_published = false)</td>
          </tr>
          <tr>
            <td>ParentProfile</td>
            <td>Soft deleted</td>
          </tr>
          <tr>
            <td>BookingRequests</td>
            <td>NOT deleted - retained with anonymised user reference</td>
          </tr>
          <tr>
            <td>Messages</td>
            <td>NOT deleted - sender shows as "[Deleted User]"</td>
          </tr>
          <tr>
            <td>Sessions</td>
            <td>Invalidated (F-015)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Restoration (Abuse.1)</h2>
      <ul>
        <li><strong>Who:</strong> super_admin only</li>
        <li><strong>Window:</strong> 90 days after soft deletion (Edge.1)</li>
        <li><strong>Action:</strong> Set is_deleted = false</li>
        <li><strong>Logging:</strong> AdminActionLog with mandatory reason</li>
        <li><strong>Cascades:</strong> Restore CaregiverProfile if exists</li>
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
            <td>90-Day Retention (Edge.1)</td>
            <td>Soft-deleted users can be restored within 90 days. After 90 days, eligible for hard deletion.</td>
          </tr>
          <tr>
            <td>Re-Registration (Edge.2)</td>
            <td>Soft-deleted user tries to register → route to support, do NOT create duplicate.</td>
          </tr>
          <tr>
            <td>Caregiver with Active Bookings (Errors.1)</td>
            <td>Admin query shows soft-deleted caregivers with accepted future bookings. Admin must notify parents.</td>
          </tr>
          <tr>
            <td>Super Admin Protection (Errors.2)</td>
            <td>Block soft delete if &lt;2 active super_admins. Hard delete requires second super_admin confirmation.</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Hard Delete / PII Anonymisation (Logic.2, post-MVP)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ POST-MVP FEATURE</strong>
        <ul>
          <li><strong>Trigger:</strong> GDPR/CCPA erasure request</li>
          <li><strong>Action:</strong> Anonymise PII fields (email, phone, address, etc)</li>
          <li><strong>Skeleton Retained:</strong> User ID, created_date, role (referential integrity)</li>
          <li><strong>Not Restorable:</strong> PII gone permanently (States.2)</li>
          <li><strong>UI:</strong> "Anonymise PII" option disabled at MVP with "Coming soon" tooltip</li>
        </ul>
      </div>
      
      <h2>Admin UI (UI.1-2)</h2>
      <ul>
        <li><strong>Delete Modal:</strong> Shows Soft Delete (enabled) and Anonymise PII (disabled at MVP)</li>
        <li><strong>Reason Required:</strong> Minimum 10 characters for deletion reason</li>
        <li><strong>Admin Table:</strong> "Show Deleted" toggle to include soft-deleted users</li>
        <li><strong>Deleted Badge:</strong> Soft-deleted users show "Deleted" badge</li>
        <li><strong>Restore Button:</strong> Available for super_admin (within 90-day window)</li>
      </ul>
      
      <h2>Logging & Audit (Audit.1-2)</h2>
      <ul>
        <li><strong>Soft Delete:</strong> AdminActionLog with admin_id, target_id, reason</li>
        <li><strong>Hard Delete:</strong> Compliance log (post-MVP) with timestamp, scope, requester</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Configure Base44 collection filters (is_deleted = false)</li>
        <li>Implement softDeleteUser automation (Triggers.1)</li>
        <li>Cascade to CaregiverProfile soft delete</li>
        <li>Invalidate user sessions (F-015)</li>
        <li>Anonymise BookingRequest references (Triggers.2)</li>
        <li>Implement restoreUser function (Abuse.1)</li>
        <li>Implement 90-day restoration window check (Edge.1)</li>
        <li>Implement soft-deleted re-registration detection (Edge.2)</li>
        <li>Implement super_admin protection (Errors.2)</li>
        <li>Create admin query: caregivers with active bookings (Errors.1)</li>
        <li>Create DeleteUserModal component (UI.1)</li>
        <li>Add "Show Deleted" toggle to admin table (UI.2)</li>
        <li>Document PII anonymisation procedure (Logic.2, post-MVP)</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete deletion lifecycle, restoration procedures, and admin UI implementation.</em></p>
    </div>
  );
}