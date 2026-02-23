/**
 * F-013: BOOKING & MESSAGE SPAM PREVENTION CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-013
 * Booking & Message Spam Prevention. Prevents duplicate bookings and message flooding
 * through server-side validation with automatic flagging and admin notification.
 * 
 * STATUS: Phase 0 - Documentation complete
 * NEXT STEP: Implement duplicate booking check + message flood detection logic
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F013_SPAM_PREVENTION_SPECIFICATION = {
  
  /**
   * DUPLICATE BOOKING PREVENTION (Logic.1)
   * Prevent parents from creating multiple pending requests with same caregiver
   */
  duplicate_booking_prevention: {
    
    rule: {
      // Logic.1: Check for existing pending request before creating new one
      requirement: 'Before creating BookingRequest, check if one already exists',
      query: 'parent_id = current_user AND caregiver_id = requested_caregiver AND status = pending',
      on_found: 'Reject creation, return error, redirect to existing request',
      on_not_found: 'Allow creation'
    },
    
    implementation: {
      server_side: `
        // Triggers.1: Duplicate check automation on BookingRequest creation
        async function createBookingRequest(parentUser, requestData) {
          // Logic.1: Check for existing pending request
          const existingRequest = await base44.entities.BookingRequest.filter({
            parent_profile_id: requestData.parent_profile_id,
            caregiver_profile_id: requestData.caregiver_profile_id,
            status: 'pending'
          });
          
          if (existingRequest.length > 0) {
            // Duplicate detected
            
            // Audit.1: Log duplicate attempt
            await logDuplicateBookingAttempt({
              parent_profile_id: requestData.parent_profile_id,
              caregiver_profile_id: requestData.caregiver_profile_id,
              existing_request_id: existingRequest[0].id,
              timestamp: new Date().toISOString()
            });
            
            // Abuse.2: Check for escalation (3 attempts in 1 hour)
            await checkDuplicateBookingEscalation(requestData.parent_profile_id, requestData.caregiver_profile_id);
            
            // Return error with link to existing request
            return {
              success: false,
              error: 'duplicate_booking',
              message: 'You already have a pending request with this caregiver',
              existing_request_id: existingRequest[0].id
            };
          }
          
          // No duplicate - create booking request
          const booking = await base44.entities.BookingRequest.create(requestData);
          
          return {
            success: true,
            booking: booking
          };
        }
      `,
      
      validation_order: [
        '1. Check for duplicate pending request (Logic.1)',
        '2. If found → reject with error',
        '3. If not found → proceed to other validations (F-074)',
        '4. Create booking request'
      ]
    },
    
    escalation_logic: {
      // Abuse.2: Flag after 3 duplicate attempts in 1 hour
      threshold: '3 duplicate attempts within 1 hour',
      action: 'Create FlaggedContent record + notify admin',
      
      implementation: `
        async function checkDuplicateBookingEscalation(parentProfileId, caregiverProfileId) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          
          // Count recent duplicate attempts for this parent+caregiver pair
          const recentAttempts = await base44.entities.DuplicateBookingLog.filter({
            parent_profile_id: parentProfileId,
            caregiver_profile_id: caregiverProfileId,
            attempt_timestamp: { $gte: oneHourAgo.toISOString() }
          });
          
          if (recentAttempts.length >= 3) {
            // Abuse.2: Escalate to admin flag
            
            // Check if already flagged
            const existingFlag = await base44.entities.FlaggedContent.filter({
              target_type: 'parent_profile',
              target_id: parentProfileId,
              reason: 'duplicate_booking_abuse',
              status: 'pending'
            });
            
            if (existingFlag.length === 0) {
              // Create FlaggedContent record
              await base44.entities.FlaggedContent.create({
                target_type: 'parent_profile',
                target_id: parentProfileId,
                reporter_user_id: 'SYSTEM',
                reason: 'other',
                reason_detail: \`Repeated duplicate booking attempts: \${recentAttempts.length} attempts in 1 hour for caregiver \${caregiverProfileId}\`,
                status: 'pending'
              });
              
              // Notify admin
              await sendAdminAlert({
                severity: 'WARNING',
                title: 'Duplicate booking abuse detected',
                details: {
                  parent_profile_id: parentProfileId,
                  caregiver_profile_id: caregiverProfileId,
                  attempt_count: recentAttempts.length,
                  time_window: '1 hour'
                }
              });
            }
          }
        }
      `
    },
    
    cancel_resubmit_pattern: {
      // Errors.2: Detect cancel+resubmit cycles
      pattern: 'Parent cancels booking, immediately resubmits to same caregiver',
      threshold: '>5 cancel+resubmit cycles for same caregiver within 24 hours',
      action: 'Flag for review',
      
      detection: `
        async function detectCancelResubmitPattern(parentProfileId) {
          const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
          
          // Get all bookings from this parent in last 24 hours
          const recentBookings = await base44.entities.BookingRequest.filter({
            parent_profile_id: parentProfileId,
            created_date: { $gte: last24Hours.toISOString() }
          });
          
          // Group by caregiver
          const byCaregiverCycles = {};
          recentBookings.forEach(booking => {
            const key = booking.caregiver_profile_id;
            if (!byCaregiverCycles[key]) {
              byCaregiverCycles[key] = [];
            }
            byCaregiverCycles[key].push(booking);
          });
          
          // Count cancel+resubmit cycles per caregiver
          for (const [caregiverId, bookings] of Object.entries(byCaregiverCycles)) {
            const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;
            const totalCount = bookings.length;
            
            // If >5 cycles (cancelled + recreated)
            if (cancelledCount >= 5 && totalCount >= 10) {
              // Flag for review
              await base44.entities.FlaggedContent.create({
                target_type: 'parent_profile',
                target_id: parentProfileId,
                reporter_user_id: 'SYSTEM',
                reason: 'other',
                reason_detail: \`Cancel+resubmit pattern: \${cancelledCount} cancellations, \${totalCount} total bookings for caregiver \${caregiverId} in 24 hours\`,
                status: 'pending'
              });
              
              break;  // Flag once, not per caregiver
            }
          }
        }
      `
    }
  },
  
  /**
   * MESSAGE FLOOD PREVENTION (Logic.2)
   * Prevent users from sending too many messages too quickly
   */
  message_flood_prevention: {
    
    threshold: {
      // Logic.2: 30 messages in 5 minutes
      standard: '30 messages per 5 minutes',
      action_on_exceed: [
        'Reject message creation',
        'Create FlaggedContent record (Abuse.1)',
        'Notify admin via email',
        'Show user-friendly message'
      ]
    },
    
    implementation: {
      server_side: `
        // Triggers.1: Flood check automation on Message creation
        async function createMessage(senderUser, messageData) {
          // Logic.2: Count recent messages from this sender
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          
          const recentMessages = await base44.entities.Message.filter({
            sender_user_id: senderUser.id,
            sent_at: { $gte: fiveMinutesAgo.toISOString() }
          });
          
          // Edge.1: Higher threshold for accepted booking threads
          const thread = await base44.entities.MessageThread.read(messageData.thread_id);
          const booking = await base44.entities.BookingRequest.read(thread.booking_id);
          
          const threshold = (booking.status === 'accepted') ? 50 : 30;
          
          if (recentMessages.length >= threshold) {
            // Flood detected
            
            // Abuse.1: Automatically create FlaggedContent record
            const existingFlag = await base44.entities.FlaggedContent.filter({
              target_type: 'message_thread',
              target_id: messageData.thread_id,
              reason: 'spam',
              status: 'pending'
            });
            
            if (existingFlag.length === 0) {
              // Triggers.2: Create FlaggedContent automatically
              await base44.entities.FlaggedContent.create({
                target_type: 'message_thread',
                target_id: messageData.thread_id,
                reporter_user_id: 'SYSTEM',
                reason: 'spam',
                reason_detail: \`Message flood detected: \${recentMessages.length} messages in 5 minutes (threshold: \${threshold})\`,
                status: 'pending'
              });
              
              // Notify admin
              await sendAdminAlert({
                severity: 'WARNING',
                title: 'Message flood detected',
                details: {
                  sender_user_id: senderUser.id,
                  thread_id: messageData.thread_id,
                  message_count: recentMessages.length,
                  threshold: threshold,
                  time_window: '5 minutes'
                }
              });
            }
            
            // Audit.2: Log flood detection (FlaggedContent serves as log)
            console.warn('Message flood detected', {
              sender_user_id: senderUser.id,
              message_count: recentMessages.length,
              threshold: threshold,
              timestamp: new Date().toISOString()
            });
            
            // Return error to user
            return {
              success: false,
              error: 'message_flood',
              message: "You're sending messages too quickly. Please wait before sending another.",
              retry_after: 60  // seconds
            };
          }
          
          // Under threshold - create message
          const message = await base44.entities.Message.create({
            ...messageData,
            sent_at: new Date().toISOString()
          });
          
          return {
            success: true,
            message: message
          };
        }
      `,
      
      validation_order: [
        '1. Count recent messages from sender (last 5 minutes)',
        '2. Determine threshold (30 for pending, 50 for accepted - Edge.1)',
        '3. If count >= threshold → reject + flag',
        '4. If under threshold → create message'
      ]
    },
    
    elevated_threshold: {
      // Edge.1: Legitimate rapid messaging in accepted bookings
      scenario: 'Caregiver responding urgently to booking inquiry',
      solution: 'Higher threshold for accepted booking threads',
      thresholds: {
        pending_booking: '30 messages / 5 minutes',
        accepted_booking: '50 messages / 5 minutes'
      },
      rationale: 'Accepted bookings involve urgent coordination - need more flexibility'
    }
  },
  
  /**
   * DATABASE INDEXING (Errors.1)
   * Performance optimization for spam checks
   */
  database_indexing: {
    
    message_index: {
      // Errors.1: Index for fast message count query
      collection: 'Message',
      index_fields: ['sender_user_id', 'sent_at'],
      purpose: 'Fast lookup of recent messages by sender',
      
      without_index: {
        problem: 'Message count query becomes table scan',
        impact: 'Slow under load - every message send does full table scan',
        example: '10,000 messages → scan all 10,000 to count recent ones'
      },
      
      with_index: {
        benefit: 'Fast indexed lookup',
        impact: 'Message send performance remains consistent',
        example: '10,000 messages → indexed lookup returns ~30 matching rows instantly'
      },
      
      base44_configuration: `
        // Configure in Base44 dashboard or schema
        Message entity → Indexes:
        - Index 1: sender_user_id + sent_at (ascending)
        
        OR
        
        // If Base44 supports index hints
        const recentMessages = await base44.entities.Message
          .filter({
            sender_user_id: senderUser.id,
            sent_at: { $gte: fiveMinutesAgo.toISOString() }
          })
          .hint({ sender_user_id: 1, sent_at: 1 });
      `
    },
    
    booking_index: {
      collection: 'BookingRequest',
      index_fields: ['parent_profile_id', 'caregiver_profile_id', 'status'],
      purpose: 'Fast duplicate booking check',
      
      base44_configuration: `
        BookingRequest entity → Indexes:
        - Index 1: parent_profile_id + caregiver_profile_id + status
      `
    }
  },
  
  /**
   * AUTOMATIC FLAGGING (Triggers.2, Abuse.1)
   * FlaggedContent created automatically
   */
  automatic_flagging: {
    
    principle: {
      // Triggers.2: Automation creates FlaggedContent
      requirement: 'FlaggedContent record created automatically when threshold reached',
      no_admin_action: 'Does NOT require admin intervention to create',
      automation: 'Server-side automation handles flagging'
    },
    
    message_flood_flagging: {
      // Abuse.1: Message flood → immediate flag + admin notification
      trigger: 'Message count >= threshold in 5 minutes',
      
      flagged_content_entry: {
        target_type: 'message_thread',
        target_id: 'thread_id where flood occurred',
        reporter_user_id: 'SYSTEM',
        reason: 'spam',
        reason_detail: 'Message flood detected: X messages in 5 minutes',
        status: 'pending'
      },
      
      admin_notification: {
        method: 'Email via Base44 integrations.Core.SendEmail',
        subject: 'Message Flood Detected',
        body: `
          A message flood has been detected:
          
          Thread ID: {{thread_id}}
          Sender: {{sender_user_id}}
          Message Count: {{count}} in 5 minutes
          Threshold: {{threshold}}
          
          Review in moderation queue: {{moderation_url}}
        `
      }
    },
    
    duplicate_booking_flagging: {
      // Abuse.2: 3 duplicate attempts in 1 hour → flag
      trigger: '3+ duplicate booking attempts for same parent+caregiver in 1 hour',
      
      flagged_content_entry: {
        target_type: 'parent_profile',
        target_id: 'parent_profile_id',
        reporter_user_id: 'SYSTEM',
        reason: 'other',
        reason_detail: 'Repeated duplicate booking attempts: X attempts in 1 hour',
        status: 'pending'
      }
    }
  },
  
  /**
   * LOGGING & AUDIT (Audit.1-2)
   * Track all spam prevention events
   */
  logging_and_audit: {
    
    duplicate_booking_log: {
      // Audit.1: All duplicate booking attempts logged
      requirement: 'Log every duplicate booking attempt',
      
      optional_entity: {
        entity_name: 'DuplicateBookingLog',
        purpose: 'Track duplicate attempts for escalation detection',
        schema: {
          parent_profile_id: 'Relation:ParentProfile',
          caregiver_profile_id: 'Relation:CaregiverProfile',
          existing_request_id: 'Text - ID of existing pending request',
          attempt_timestamp: 'DateTime'
        }
      },
      
      alternative: 'Use F-010 structured logging (Sentry) instead of entity',
      
      implementation: `
        async function logDuplicateBookingAttempt(details) {
          // Option 1: Entity (for escalation detection)
          await base44.entities.DuplicateBookingLog.create({
            parent_profile_id: details.parent_profile_id,
            caregiver_profile_id: details.caregiver_profile_id,
            existing_request_id: details.existing_request_id,
            attempt_timestamp: details.timestamp
          });
          
          // Option 2: Structured logging (F-010)
          Sentry.captureMessage('Duplicate booking attempt', {
            level: 'info',
            tags: {
              event_type: 'duplicate_booking'
            },
            extra: {
              parent_profile_id: details.parent_profile_id,
              caregiver_profile_id: details.caregiver_profile_id,
              existing_request_id: details.existing_request_id
            }
          });
        }
      `
    },
    
    message_flood_log: {
      // Audit.2: FlaggedContent record serves as persistent log
      log_source: 'FlaggedContent entity',
      fields: {
        target_type: 'message_thread',
        target_id: 'Thread where flood occurred',
        reason: 'spam',
        reason_detail: 'Message count, threshold, time window',
        created_date: 'Auto-set timestamp'
      },
      
      additional_logging: `
        // Also log to F-010 structured logging
        console.warn('Message flood detected', {
          sender_user_id: senderUser.id,
          message_count: recentMessages.length,
          threshold: threshold,
          timestamp: new Date().toISOString()
        });
      `
    }
  },
  
  /**
   * USER INTERFACE MESSAGES (UI.1-2)
   * User-facing error messages
   */
  user_interface: {
    
    duplicate_booking_message: {
      // UI.1: Specific, actionable error message
      scenario: 'Parent tries to create duplicate pending request',
      
      wrong_message: 'An error occurred',
      correct_message: 'You already have a pending request with this caregiver',
      
      additional_ui: {
        show_link: true,
        link_text: 'View existing request',
        link_url: '/booking/requests/{existing_request_id}'
      },
      
      implementation: `
        // Frontend response handling
        try {
          const response = await createBooking(bookingData);
          
          if (!response.success && response.error === 'duplicate_booking') {
            // Show specific message with link
            showError({
              message: response.message,
              action: {
                label: 'View existing request',
                url: \`/booking/requests/\${response.existing_request_id}\`
              }
            });
            return;
          }
          
          // Handle other errors...
        } catch (error) {
          // Generic error handling
        }
      `
    },
    
    message_flood_message: {
      // UI.2: Temporary input disable with clear message
      scenario: 'User hits message flood threshold',
      
      message: "You're sending messages too quickly. Please wait before sending another.",
      ui_behavior: {
        disable_input: true,
        disable_duration: '60 seconds',
        show_countdown: false,  // Don't show exact countdown
        permanent_disable: false
      },
      
      implementation: `
        // Frontend message send handling
        async function sendMessage(messageData) {
          try {
            const response = await createMessage(messageData);
            
            if (!response.success && response.error === 'message_flood') {
              // Temporarily disable input
              setInputDisabled(true);
              showError(response.message);
              
              // Re-enable after retry_after seconds
              setTimeout(() => {
                setInputDisabled(false);
              }, response.retry_after * 1000);
              
              return;
            }
            
            // Message sent successfully
            appendMessageToThread(response.message);
          } catch (error) {
            // Handle other errors
          }
        }
      `
    }
  },
  
  /**
   * SERVER-SIDE ENFORCEMENT (Access.1)
   * Validation must be server-side
   */
  server_side_enforcement: {
    
    principle: {
      // Access.1: Server-side only enforcement
      requirement: 'Spam detection logic runs server-side only',
      forbidden: 'UI-layer validation alone',
      rationale: 'Client-side checks can be bypassed - server is source of truth'
    },
    
    implementation_pattern: {
      correct: `
        // Server-side (backend function or automation)
        async function createBookingRequest(data) {
          // Server validates duplicate
          const existing = await checkForDuplicate(data);
          if (existing) {
            return { error: 'duplicate_booking' };
          }
          
          // Create booking
          return await base44.entities.BookingRequest.create(data);
        }
      `,
      
      incorrect: `
        // Client-side only (WRONG - can be bypassed)
        async function submitBooking(data) {
          // Check duplicate on client
          const existing = await base44.entities.BookingRequest.filter({...});
          if (existing.length > 0) {
            alert('Duplicate booking');
            return;
          }
          
          // Attacker can bypass this and call create directly
          await base44.entities.BookingRequest.create(data);
        }
      `
    },
    
    base44_configuration: {
      // Configure server-side validation hooks
      booking_request_create_hook: `
        // Base44 automation: BEFORE BookingRequest.create
        async function beforeBookingRequestCreate(data, user) {
          // Duplicate check
          const duplicate = await checkForDuplicate(data);
          if (duplicate) {
            throw new Error('Duplicate booking request');
          }
          
          return data;  // Allow creation
        }
      `,
      
      message_create_hook: `
        // Base44 automation: BEFORE Message.create
        async function beforeMessageCreate(data, user) {
          // Flood check
          const isFlood = await checkMessageFlood(user.id);
          if (isFlood) {
            throw new Error('Message flood detected');
          }
          
          return data;  // Allow creation
        }
      `
    }
  }
};

/**
 * ============================================================================
 * OPTIONAL SUPPORTING ENTITY
 * ============================================================================
 */
const OPTIONAL_ENTITY = {
  
  duplicate_booking_log: {
    entity_name: 'DuplicateBookingLog',
    purpose: 'Track duplicate booking attempts for escalation detection (Abuse.2)',
    alternative: 'Can use F-010 structured logging (Sentry) instead',
    
    schema: {
      parent_profile_id: 'Relation:ParentProfile - Parent who attempted duplicate',
      caregiver_profile_id: 'Relation:CaregiverProfile - Caregiver targeted',
      existing_request_id: 'Text - ID of existing pending request',
      attempt_timestamp: 'DateTime - When duplicate attempt occurred'
    },
    
    use_case: 'Query recent attempts to detect 3+ in 1 hour for escalation'
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F013_CONFIGURATION_CHECKLIST = [
  {
    category: 'Duplicate Booking Prevention',
    tasks: [
      { task: 'Implement checkForDuplicate function (Logic.1)', status: 'pending' },
      { task: 'Query: parent + caregiver + status=pending', status: 'pending' },
      { task: 'On duplicate: reject + return existing_request_id', status: 'pending' },
      { task: 'Add index: BookingRequest(parent_id, caregiver_id, status)', status: 'pending' }
    ]
  },
  {
    category: 'Duplicate Booking Escalation',
    tasks: [
      { task: 'Create DuplicateBookingLog entity (or use Sentry)', status: 'pending' },
      { task: 'Log all duplicate attempts (Audit.1)', status: 'pending' },
      { task: 'Implement checkDuplicateBookingEscalation function', status: 'pending' },
      { task: 'Threshold: 3 attempts in 1 hour → flag (Abuse.2)', status: 'pending' },
      { task: 'Create FlaggedContent entry on escalation', status: 'pending' }
    ]
  },
  {
    category: 'Cancel+Resubmit Pattern Detection',
    tasks: [
      { task: 'Implement detectCancelResubmitPattern function', status: 'pending' },
      { task: 'Threshold: >5 cycles in 24 hours (Errors.2)', status: 'pending' },
      { task: 'Flag for review when threshold reached', status: 'pending' }
    ]
  },
  {
    category: 'Message Flood Prevention',
    tasks: [
      { task: 'Implement checkMessageFlood function (Logic.2)', status: 'pending' },
      { task: 'Count messages: sender + last 5 minutes', status: 'pending' },
      { task: 'Threshold: 30 for pending, 50 for accepted (Edge.1)', status: 'pending' },
      { task: 'On flood: reject + create FlaggedContent (Abuse.1)', status: 'pending' },
      { task: 'Add index: Message(sender_user_id, sent_at) (Errors.1)', status: 'pending' }
    ]
  },
  {
    category: 'Automatic Flagging',
    tasks: [
      { task: 'Message flood → FlaggedContent with reason=spam', status: 'pending' },
      { task: 'Duplicate booking → FlaggedContent with reason=other', status: 'pending' },
      { task: 'Notify admin via email on flag creation (Triggers.2)', status: 'pending' },
      { task: 'Test: Automation creates flag without admin intervention', status: 'pending' }
    ]
  },
  {
    category: 'Database Indexing',
    tasks: [
      { task: 'Add Message index: sender_user_id + sent_at (Errors.1)', status: 'pending' },
      { task: 'Add BookingRequest index: parent + caregiver + status', status: 'pending' },
      { task: 'Test query performance: should be <50ms', status: 'pending' }
    ]
  },
  {
    category: 'Server-Side Enforcement',
    tasks: [
      { task: 'Configure BEFORE BookingRequest.create hook', status: 'pending' },
      { task: 'Configure BEFORE Message.create hook', status: 'pending' },
      { task: 'Test: Client-side bypass prevented (Access.1)', status: 'pending' }
    ]
  },
  {
    category: 'UI Messages',
    tasks: [
      { task: 'Duplicate booking: "You already have a pending request" + link', status: 'pending' },
      { task: 'Message flood: "Sending too quickly. Please wait"', status: 'pending' },
      { task: 'Temporarily disable message input (60 seconds)', status: 'pending' },
      { task: 'Do NOT permanently disable (UI.2)', status: 'pending' }
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
    test: 'Duplicate Booking Prevention',
    steps: [
      'Parent creates booking request for caregiver A',
      'Verify: BookingRequest created with status=pending',
      'Parent tries to create another booking for same caregiver A',
      'Verify: Request rejected with "duplicate_booking" error',
      'Verify: Response includes existing_request_id',
      'Verify: UI shows "View existing request" link'
    ]
  },
  {
    test: 'Duplicate Booking Escalation',
    steps: [
      'Parent attempts duplicate booking 3 times in 1 hour',
      'Verify: All 3 attempts logged to DuplicateBookingLog',
      'Verify: After 3rd attempt, FlaggedContent created',
      'Verify: Admin notification email sent',
      'Verify: reason_detail shows attempt count'
    ]
  },
  {
    test: 'Duplicate After Status Change',
    steps: [
      'Parent creates booking for caregiver A (status=pending)',
      'Caregiver accepts booking (status=accepted)',
      'Parent tries to create new booking for same caregiver A',
      'Verify: Allowed (no duplicate - existing is not pending)',
      'Verify: New booking created successfully'
    ]
  },
  {
    test: 'Message Flood Detection - Standard Threshold',
    steps: [
      'User sends 30 messages in 5 minutes in pending booking thread',
      'Verify: All 30 messages created successfully',
      'User tries to send 31st message',
      'Verify: Message rejected with "message_flood" error',
      'Verify: FlaggedContent created with reason=spam',
      'Verify: Admin notification sent',
      'Verify: UI shows "Sending too quickly" message',
      'Verify: Input temporarily disabled'
    ]
  },
  {
    test: 'Message Flood Detection - Elevated Threshold',
    steps: [
      'Booking accepted (status=accepted)',
      'User sends 50 messages in 5 minutes',
      'Verify: All 50 messages created (Edge.1 elevated threshold)',
      'User tries to send 51st message',
      'Verify: Message rejected with flood error'
    ]
  },
  {
    test: 'Cancel+Resubmit Pattern Detection',
    steps: [
      'Parent creates 10 bookings for caregiver A in 24 hours',
      'Parent cancels 6 of them',
      'Verify: After 5th cancellation, FlaggedContent created (Errors.2)',
      'Verify: reason_detail mentions cancel+resubmit pattern'
    ]
  },
  {
    test: 'Database Index Performance',
    steps: [
      'Insert 10,000 messages',
      'Time message flood check query',
      'Verify: Query executes in <50ms (Errors.1)',
      'Without index, same query takes >1000ms'
    ]
  },
  {
    test: 'Server-Side Enforcement',
    steps: [
      'Attempt to bypass client validation via direct API call',
      'Create duplicate booking via API (no UI)',
      'Verify: Server rejects with duplicate error (Access.1)',
      'Attempt to create 31st message via API',
      'Verify: Server rejects with flood error'
    ]
  },
  {
    test: 'Automatic Flagging',
    steps: [
      'Trigger message flood (31 messages in 5 min)',
      'Verify: FlaggedContent created automatically (Triggers.2)',
      'Verify: status=pending',
      'Verify: No admin action required to create flag',
      'Check admin email inbox',
      'Verify: Notification received with thread ID and details'
    ]
  },
  {
    test: 'UI Temporary Disable',
    steps: [
      'Trigger message flood',
      'Verify: Message input disabled',
      'Wait 60 seconds',
      'Verify: Message input re-enabled automatically (UI.2)',
      'Verify: NOT permanently disabled'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - Server-side validation hooks (BEFORE entity.create)
 * - Database indexing support for performance
 * - Email integration for admin notifications
 * 
 * Supporting Entities (Optional):
 * - DuplicateBookingLog: Track duplicate attempts (can use F-010 Sentry instead)
 * 
 * Integration with Other Features:
 * - F-010: Structured logging for spam events
 * - F-014: IP blocking for credential stuffing
 * - F-016: FlaggedContent for spam review
 * - F-074: Insert-time booking validation
 * 
 * CRITICAL WARNINGS:
 * - Access.1: Server-side enforcement REQUIRED (client checks can be bypassed)
 * - Logic.1: Check duplicate BEFORE creating BookingRequest
 * - Logic.2: Count messages BEFORE creating Message
 * - Triggers.2: FlaggedContent created automatically (no admin action needed)
 * - Errors.1: Database indexes REQUIRED for performance
 * - Errors.2: Detect cancel+resubmit pattern (>5 cycles in 24h)
 * - Edge.1: Higher threshold for accepted bookings (50 vs 30)
 * - Abuse.1: Message flood → immediate flag + admin notification
 * - Abuse.2: Duplicate booking → escalate after 3 attempts in 1 hour
 * 
 * NEXT STEPS:
 * 1. Implement duplicate booking check logic
 * 2. Implement message flood detection logic
 * 3. Add database indexes for performance
 * 4. Configure server-side validation hooks
 * 5. Implement automatic FlaggedContent creation
 * 6. Implement admin email notifications
 * 7. Implement duplicate booking escalation
 * 8. Implement cancel+resubmit pattern detection
 * 9. Update UI for user-facing error messages
 * 10. Test all acceptance criteria
 */

export default function F013SpamPreventionDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-013: Booking & Message Spam Prevention - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Documentation complete</p>
      <p><strong>Next Step:</strong> Implement duplicate booking check + message flood detection</p>
      
      <h2>Duplicate Booking Prevention (Logic.1)</h2>
      <ul>
        <li><strong>Rule:</strong> Before creating BookingRequest, check for existing pending request</li>
        <li><strong>Query:</strong> parent_id = current_user AND caregiver_id = target AND status = pending</li>
        <li><strong>On Found:</strong> Reject + return existing_request_id</li>
        <li><strong>On Not Found:</strong> Allow creation</li>
        <li><strong>Escalation (Abuse.2):</strong> Flag after 3 duplicate attempts in 1 hour</li>
      </ul>
      
      <h2>Message Flood Prevention (Logic.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Booking Status</th>
            <th>Threshold</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pending</td>
            <td>30 messages / 5 minutes</td>
            <td>Standard spam prevention</td>
          </tr>
          <tr>
            <td>Accepted</td>
            <td>50 messages / 5 minutes</td>
            <td>Urgent coordination needs (Edge.1)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Automatic Flagging (Triggers.2, Abuse.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>IMPORTANT: FlaggedContent created automatically</strong>
        <ul>
          <li>Message flood → FlaggedContent with reason=spam</li>
          <li>3+ duplicate bookings in 1 hour → FlaggedContent with reason=other</li>
          <li>Admin notification sent via email</li>
          <li>No admin intervention required to create flag</li>
        </ul>
      </div>
      
      <h2>Database Indexing (Errors.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Indexes required for performance</strong>
        <ul>
          <li><strong>Message:</strong> Index on (sender_user_id, sent_at)</li>
          <li><strong>BookingRequest:</strong> Index on (parent_id, caregiver_id, status)</li>
          <li><strong>Without indexes:</strong> Table scan on every message → slow under load</li>
          <li><strong>With indexes:</strong> Fast indexed lookup (&lt;50ms)</li>
        </ul>
      </div>
      
      <h2>Cancel+Resubmit Pattern (Errors.2)</h2>
      <ul>
        <li><strong>Pattern:</strong> Parent cancels and resubmits bookings repeatedly</li>
        <li><strong>Threshold:</strong> &gt;5 cancel+resubmit cycles for same caregiver in 24 hours</li>
        <li><strong>Action:</strong> Flag for review</li>
        <li><strong>Detection:</strong> Count cancelled + total bookings per caregiver</li>
      </ul>
      
      <h2>User Interface Messages (UI.1-2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Scenario</th>
            <th>Message</th>
            <th>UI Behavior</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Duplicate Booking</td>
            <td>"You already have a pending request with this caregiver"</td>
            <td>Show link to existing request</td>
          </tr>
          <tr>
            <td>Message Flood</td>
            <td>"You're sending messages too quickly. Please wait."</td>
            <td>Disable input for 60 seconds (not permanent)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Server-Side Enforcement (Access.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: Server-side validation required</strong>
        <ul>
          <li>Spam detection MUST run server-side</li>
          <li>Client-side checks can be bypassed</li>
          <li>Configure BEFORE entity.create hooks</li>
          <li>Test: Direct API calls should be blocked</li>
        </ul>
      </div>
      
      <h2>Logging & Audit (Audit.1-2)</h2>
      <ul>
        <li><strong>Duplicate Booking (Audit.1):</strong> Log parent_id, caregiver_id, existing_request_id, timestamp</li>
        <li><strong>Message Flood (Audit.2):</strong> FlaggedContent entry serves as log + structured logging</li>
        <li><strong>Optional Entity:</strong> DuplicateBookingLog for escalation detection (or use Sentry)</li>
      </ul>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Implement duplicate booking check (query existing pending)</li>
        <li>Implement message flood detection (count recent messages)</li>
        <li>Add database indexes (Message, BookingRequest)</li>
        <li>Configure server-side validation hooks</li>
        <li>Implement automatic FlaggedContent creation</li>
        <li>Implement admin email notifications</li>
        <li>Implement duplicate booking escalation (3 in 1 hour)</li>
        <li>Implement cancel+resubmit pattern detection (5 cycles in 24h)</li>
        <li>Update UI with specific error messages + temporary disable</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete implementation examples, escalation logic, and performance optimization.</em></p>
    </div>
  );
}