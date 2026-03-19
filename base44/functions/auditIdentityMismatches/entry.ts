/**
 * Identity Mismatch Audit Function
 * 
 * Scans critical entities for "ghost records" and identity inconsistencies:
 * - Orphaned records where stored user_id doesn't match any valid User
 * - Mismatches between profile.user_id and booking/message user_id references
 * - Records with null or malformed identity fields
 * 
 * Returns a detailed report of all issues found.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Only admins can run this audit
  const user = await base44.auth.me();
  if (!user || !['trust_admin', 'super_admin'].includes(user.app_role)) {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  console.log('Starting identity audit...');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {},
    issues: {
      booking_requests: [],
      message_threads: [],
      notifications: [],
      parent_profiles: [],
      caregiver_profiles: [],
      reviews: []
    }
  };

  try {
    // Fetch all Users for validation
    const allUsers = await base44.asServiceRole.entities.User.filter({});
    const validUserIds = new Set(allUsers.map(u => u.id));
    console.log(`Found ${validUserIds.size} valid User IDs`);

    // ══════════════════════════════════════════════════════════════
    // AUDIT 1: BookingRequest
    // ══════════════════════════════════════════════════════════════
    console.log('Auditing BookingRequest...');
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({});
    const parentProfiles = await base44.asServiceRole.entities.ParentProfile.filter({});
    const caregiverProfiles = await base44.asServiceRole.entities.CaregiverProfile.filter({});
    
    const parentProfileMap = new Map(parentProfiles.map(p => [p.id, p.user_id]));
    const caregiverProfileMap = new Map(caregiverProfiles.map(p => [p.id, p.user_id]));

    for (const booking of bookings) {
      const issues = [];

      // Check parent_user_id validity
      if (!booking.parent_user_id) {
        issues.push('Missing parent_user_id');
      } else if (!validUserIds.has(booking.parent_user_id)) {
        issues.push(`Orphaned parent_user_id: ${booking.parent_user_id} (no matching User)`);
      }

      // Check caregiver_user_id validity
      if (!booking.caregiver_user_id) {
        issues.push('Missing caregiver_user_id');
      } else if (!validUserIds.has(booking.caregiver_user_id)) {
        issues.push(`Orphaned caregiver_user_id: ${booking.caregiver_user_id} (no matching User)`);
      }

      // Check profile → user_id consistency
      if (booking.parent_profile_id) {
        const expectedParentUserId = parentProfileMap.get(booking.parent_profile_id);
        if (expectedParentUserId && expectedParentUserId !== booking.parent_user_id) {
          issues.push(`Mismatch: parent_user_id=${booking.parent_user_id} but ParentProfile.user_id=${expectedParentUserId}`);
        }
      }

      if (booking.caregiver_profile_id) {
        const expectedCaregiverUserId = caregiverProfileMap.get(booking.caregiver_profile_id);
        if (expectedCaregiverUserId && expectedCaregiverUserId !== booking.caregiver_user_id) {
          issues.push(`Mismatch: caregiver_user_id=${booking.caregiver_user_id} but CaregiverProfile.user_id=${expectedCaregiverUserId}`);
        }
      }

      // Check for null created_date (causes sort crashes)
      if (!booking.created_date) {
        issues.push('Missing created_date (will cause sort failures)');
      }

      if (issues.length > 0) {
        report.issues.booking_requests.push({
          id: booking.id,
          status: booking.status,
          created_date: booking.created_date,
          parent_user_id: booking.parent_user_id,
          caregiver_user_id: booking.caregiver_user_id,
          issues
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // AUDIT 2: MessageThread
    // ══════════════════════════════════════════════════════════════
    console.log('Auditing MessageThread...');
    const threads = await base44.asServiceRole.entities.MessageThread.filter({});

    for (const thread of threads) {
      const issues = [];

      if (!thread.parent_user_id) {
        issues.push('Missing parent_user_id');
      } else if (!validUserIds.has(thread.parent_user_id)) {
        issues.push(`Orphaned parent_user_id: ${thread.parent_user_id}`);
      }

      if (!thread.caregiver_user_id) {
        issues.push('Missing caregiver_user_id');
      } else if (!validUserIds.has(thread.caregiver_user_id)) {
        issues.push(`Orphaned caregiver_user_id: ${thread.caregiver_user_id}`);
      }

      // Check if booking exists
      if (thread.booking_id) {
        const linkedBooking = bookings.find(b => b.id === thread.booking_id);
        if (!linkedBooking) {
          issues.push(`Orphaned booking_id: ${thread.booking_id} (no matching BookingRequest)`);
        } else {
          // Validate that thread user_ids match booking user_ids
          if (linkedBooking.parent_user_id !== thread.parent_user_id) {
            issues.push(`Mismatch: thread.parent_user_id=${thread.parent_user_id} but booking.parent_user_id=${linkedBooking.parent_user_id}`);
          }
          if (linkedBooking.caregiver_user_id !== thread.caregiver_user_id) {
            issues.push(`Mismatch: thread.caregiver_user_id=${thread.caregiver_user_id} but booking.caregiver_user_id=${linkedBooking.caregiver_user_id}`);
          }
        }
      }

      if (issues.length > 0) {
        report.issues.message_threads.push({
          id: thread.id,
          booking_id: thread.booking_id,
          parent_user_id: thread.parent_user_id,
          caregiver_user_id: thread.caregiver_user_id,
          issues
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // AUDIT 3: Notification
    // ══════════════════════════════════════════════════════════════
    console.log('Auditing Notification...');
    const notifications = await base44.asServiceRole.entities.Notification.filter({});

    for (const notif of notifications) {
      const issues = [];

      if (!notif.user_id) {
        issues.push('Missing user_id');
      } else if (!validUserIds.has(notif.user_id)) {
        issues.push(`Orphaned user_id: ${notif.user_id}`);
      }

      if (notif.booking_request_id) {
        const linkedBooking = bookings.find(b => b.id === notif.booking_request_id);
        if (!linkedBooking) {
          issues.push(`Orphaned booking_request_id: ${notif.booking_request_id}`);
        }
      }

      if (issues.length > 0) {
        report.issues.notifications.push({
          id: notif.id,
          user_id: notif.user_id,
          type: notif.type,
          booking_request_id: notif.booking_request_id,
          issues
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // AUDIT 4: ParentProfile
    // ══════════════════════════════════════════════════════════════
    console.log('Auditing ParentProfile...');
    for (const profile of parentProfiles) {
      const issues = [];

      if (!profile.user_id) {
        issues.push('Missing user_id');
      } else if (!validUserIds.has(profile.user_id)) {
        issues.push(`Orphaned user_id: ${profile.user_id}`);
      }

      if (issues.length > 0) {
        report.issues.parent_profiles.push({
          id: profile.id,
          user_id: profile.user_id,
          display_name: profile.display_name,
          issues
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // AUDIT 5: CaregiverProfile
    // ══════════════════════════════════════════════════════════════
    console.log('Auditing CaregiverProfile...');
    for (const profile of caregiverProfiles) {
      const issues = [];

      if (!profile.user_id) {
        issues.push('Missing user_id');
      } else if (!validUserIds.has(profile.user_id)) {
        issues.push(`Orphaned user_id: ${profile.user_id}`);
      }

      if (issues.length > 0) {
        report.issues.caregiver_profiles.push({
          id: profile.id,
          user_id: profile.user_id,
          display_name: profile.display_name,
          slug: profile.slug,
          issues
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // AUDIT 6: Review
    // ══════════════════════════════════════════════════════════════
    console.log('Auditing Review...');
    const reviews = await base44.asServiceRole.entities.Review.filter({});

    for (const review of reviews) {
      const issues = [];

      if (!review.parent_user_id) {
        issues.push('Missing parent_user_id');
      } else if (!validUserIds.has(review.parent_user_id)) {
        issues.push(`Orphaned parent_user_id: ${review.parent_user_id}`);
      }

      if (!review.caregiver_user_id) {
        issues.push('Missing caregiver_user_id');
      } else if (!validUserIds.has(review.caregiver_user_id)) {
        issues.push(`Orphaned caregiver_user_id: ${review.caregiver_user_id}`);
      }

      if (review.booking_request_id) {
        const linkedBooking = bookings.find(b => b.id === review.booking_request_id);
        if (!linkedBooking) {
          issues.push(`Orphaned booking_request_id: ${review.booking_request_id}`);
        }
      }

      if (issues.length > 0) {
        report.issues.reviews.push({
          id: review.id,
          parent_user_id: review.parent_user_id,
          caregiver_user_id: review.caregiver_user_id,
          booking_request_id: review.booking_request_id,
          issues
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // Generate Summary
    // ══════════════════════════════════════════════════════════════
    report.summary = {
      total_users: validUserIds.size,
      total_bookings: bookings.length,
      total_threads: threads.length,
      total_notifications: notifications.length,
      total_parent_profiles: parentProfiles.length,
      total_caregiver_profiles: caregiverProfiles.length,
      total_reviews: reviews.length,
      issues_found: {
        booking_requests: report.issues.booking_requests.length,
        message_threads: report.issues.message_threads.length,
        notifications: report.issues.notifications.length,
        parent_profiles: report.issues.parent_profiles.length,
        caregiver_profiles: report.issues.caregiver_profiles.length,
        reviews: report.issues.reviews.length
      },
      total_issues: Object.values(report.issues).reduce((sum, arr) => sum + arr.length, 0)
    };

    console.log('Audit complete:', report.summary);

    return Response.json({
      success: true,
      report
    }, { status: 200 });

  } catch (error) {
    console.error('Audit failed:', error);
    return Response.json({
      error: 'Audit failed',
      detail: error.message
    }, { status: 500 });
  }
});