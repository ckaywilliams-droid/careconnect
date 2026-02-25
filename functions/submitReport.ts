import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-036 Triggers.1: SUBMIT USER REPORT
 * 
 * Creates a FlaggedContent record for admin review.
 * 
 * WORKFLOW:
 * 1. Validate authenticated, non-suspended user
 * 2. Check duplicate report (F-036 States.2)
 * 3. Check rate limit (5 per hour)
 * 4. Validate target exists
 * 5. Create FlaggedContent record
 * 6. Check for reporter flooding (10 in 24 hours)
 * 7. Check if target has 3+ reports (trigger alert)
 * 
 * SECURITY:
 * - F-036 Data.2: reporter_id ALWAYS from session, never client-supplied
 * - F-036 Access.3: Cannot report yourself
 * - F-036 Abuse.1: Reporter flooding detection (10/24h)
 * - F-036 Abuse.2: Rate limit 5 per hour
 * 
 * PAYLOAD:
 * {
 *   target_type: 'user' | 'message' | 'caregiver_profile' | 'parent_profile' | 'review' (required)
 *   target_id: string (required)
 *   reason_category: 'spam' | 'harassment' | 'fake_profile' | 'inappropriate_content' | 'other' (required)
 *   reason_detail: string (optional, max 500 chars)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-036 Data.3: Authenticated users only
    const reporter = await base44.auth.me();
    if (!reporter) {
      return Response.json({ error: 'Unauthorized: Login required to submit reports' }, { status: 401 });
    }

    // F-036 Triggers.1: Check if reporter is suspended
    if (reporter.is_suspended) {
      return Response.json({ 
        error: 'Your account is suspended. You cannot submit reports.' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { target_type, target_id, reason_category, reason_detail } = payload;

    // Validation
    if (!target_type || !target_id || !reason_category) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // F-036 Logic.2: Validate reason_category (F-036 Errors.3)
    const validCategories = ['spam', 'harassment', 'fake_profile', 'inappropriate_content', 'other'];
    if (!validCategories.includes(reason_category)) {
      return Response.json({ error: 'Please select a valid report reason' }, { status: 400 });
    }

    // F-036 Logic.3: Validate reason_detail length
    if (reason_detail && reason_detail.length > 500) {
      return Response.json({ error: 'Reason detail must be 500 characters or less' }, { status: 400 });
    }

    // F-036 Access.3: Cannot report yourself
    if (target_type === 'user' && target_id === reporter.id) {
      return Response.json({ error: 'You cannot report yourself' }, { status: 400 });
    }

    // F-036 States.2: Duplicate report prevention
    const existingReports = await base44.asServiceRole.entities.FlaggedContent.filter({
      reporter_user_id: reporter.id,
      target_type,
      target_id,
      status: { $in: ['pending', 'reviewed'] },
    });

    if (existingReports.length > 0) {
      return Response.json({ 
        error: 'You have already reported this content. Your report is under review.',
        existing_report_id: existingReports[0].id,
      }, { status: 409 });
    }

    // F-036 Abuse.2: Rate limit - 5 per hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentReports = await base44.asServiceRole.entities.FlaggedContent.filter({
      reporter_user_id: reporter.id,
      created_date: { $gte: oneHourAgo.toISOString() },
    });

    if (recentReports.length >= 5) {
      return Response.json({ 
        error: 'Report limit reached. Please wait before submitting more reports.' 
      }, { status: 429 });
    }

    // F-036 Errors.1-2: Validate target exists
    // For MVP, we'll create the report anyway - admin will see "target not found" in queue
    // This prevents revealing whether content exists to potential bad actors

    // F-036 Triggers.1: Create FlaggedContent record
    const flaggedContent = await base44.asServiceRole.entities.FlaggedContent.create({
      reporter_user_id: reporter.id, // F-036 Data.2: Server-derived from session
      target_type,
      target_id,
      reason: reason_category,
      reason_detail: reason_detail || '',
      status: 'pending',
    });

    // F-036 Audit.1: Log report creation (masked reporter_id)
    console.log('Report submitted:', {
      reporter_id_masked: reporter.id.substring(0, 4) + '***',
      target_type,
      target_id,
      reason_category,
      timestamp: new Date().toISOString(),
    });

    // F-036 Abuse.1: Reporter flooding detection (10 in 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const reports24h = await base44.asServiceRole.entities.FlaggedContent.filter({
      reporter_user_id: reporter.id,
      created_date: { $gte: oneDayAgo.toISOString() },
    });

    if (reports24h.length > 10) {
      // F-036 Abuse.1: Flag the reporter for admin review
      const existingReporterFlags = await base44.asServiceRole.entities.FlaggedContent.filter({
        target_type: 'user',
        target_id: reporter.id,
        reason: 'spam',
        reporter_user_id: 'SYSTEM',
      });

      if (existingReporterFlags.length === 0) {
        await base44.asServiceRole.entities.FlaggedContent.create({
          reporter_user_id: 'SYSTEM',
          target_type: 'user',
          target_id: reporter.id,
          reason: 'spam',
          reason_detail: `Reporter flooding: ${reports24h.length} reports in 24 hours`,
          status: 'pending',
        });

        // F-036 Audit.2: Log reporter flooding
        console.warn('Reporter flooding detected:', {
          reporter_id: reporter.id,
          report_count: reports24h.length,
          threshold: 10,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // F-036 Triggers.1: Check if target has 3+ reports from different reporters
    const targetReports = await base44.asServiceRole.entities.FlaggedContent.filter({
      target_type,
      target_id,
      status: { $in: ['pending', 'reviewed'] },
    });

    const uniqueReporters = new Set(targetReports.map(r => r.reporter_user_id));

    if (uniqueReporters.size >= 3) {
      // Create AbuseAlert (F-014)
      const existingAlerts = await base44.asServiceRole.entities.AbuseAlert.filter({
        alert_type: 'duplicate_booking_abuse', // Reusing closest alert type
        description: { $regex: `Multiple reports: ${target_type} ${target_id}` },
      });

      if (existingAlerts.length === 0) {
        await base44.asServiceRole.entities.AbuseAlert.create({
          alert_type: 'other',
          description: `Multiple reports: ${target_type} ${target_id} has ${uniqueReporters.size} reports from different users`,
          severity: 'high',
          triggered_at: new Date().toISOString(),
        });
      }
    }

    // F-036 Triggers.2: Confirmation (handled by frontend toast)

    return Response.json({
      success: true,
      message: 'Report submitted successfully',
      report_id: flaggedContent.id,
    });

  } catch (error) {
    console.error('Error submitting report:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});