/**
 * F-091: User Reporting Workflow
 * F-091 Logic.1: Validation sequence before creating FlaggedContent (user report).
 * F-091 Abuse.1: Rate limit 10 user reports/user/24h.
 * F-091 Abuse.2: Alert on 5+ reports against different users in 24h.
 * F-091 Audit.1: Report creation logged.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VALID_CATEGORIES = ['harassment', 'inappropriate_content', 'spam', 'safety_concern', 'other'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['parent', 'caregiver'].includes(user.app_role)) {
    return Response.json({ error: 'Only parents and caregivers can submit reports.' }, { status: 403 });
  }

  const body = await req.json();
  const { reported_user_id, reason_category, reason_note, booking_id } = body;

  if (!reported_user_id) return Response.json({ error: 'reported_user_id is required.' }, { status: 400 });

  // (2) Cannot self-report
  if (reported_user_id === user.id) {
    return Response.json({ error: 'You cannot report yourself.' }, { status: 400 });
  }

  // (3) reported_user_id exists
  const reportedUsers = await base44.asServiceRole.entities.User.filter({ id: reported_user_id });
  if (!reportedUsers[0]) return Response.json({ error: 'Not found.' }, { status: 404 });

  // (3) reason_category valid
  if (!reason_category || !VALID_CATEGORIES.includes(reason_category)) {
    return Response.json({ error: 'Please select a valid reason category.' }, { status: 400 });
  }

  // (4) reason_note: present and not whitespace-only
  const trimmedNote = (reason_note || '').trim();
  if (!trimmedNote) {
    return Response.json({ error: 'Please describe the reason for your report.' }, { status: 400 });
  }
  if (trimmedNote.length > 1000) {
    return Response.json({ error: 'Your report is too long. Please limit your description to 1,000 characters.' }, { status: 400 });
  }

  // F-091 Abuse.1: Rate limit 10 user reports/24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const allUserReports = await base44.asServiceRole.entities.FlaggedContent.filter({
    reporter_user_id: user.id,
    target_type: 'user'
  });
  const recentCount = allUserReports.filter(r => r.created_date > oneDayAgo).length;
  if (recentCount >= 10) {
    return Response.json({ error: 'You have reached the maximum number of reports for today. Please try again tomorrow.' }, { status: 429 });
  }

  // (5) Duplicate check: no existing pending/under_review report against this user
  const duplicates = allUserReports.filter(r =>
    r.target_id === reported_user_id &&
    ['pending', 'under_review'].includes(r.status)
  );
  if (duplicates.length > 0) {
    return Response.json({ error: 'You have already submitted a report for this user. Our team is reviewing it.' }, { status: 409 });
  }

  // Create FlaggedContent record for user report
  // Fix: include booking_id context when provided
  const flagRecord = await base44.asServiceRole.entities.FlaggedContent.create({
    reporter_user_id: user.id,
    target_type: 'user',
    target_id: reported_user_id,
    reason: reason_category,
    reason_detail: trimmedNote,
    booking_id: booking_id || null,
    status: 'pending'
  });

  // F-091 Abuse.2: Alert on 5+ reports against different users in 24h
  const recentReports = allUserReports.filter(r => r.created_date > oneDayAgo);
  const distinctReportedUsers = new Set(recentReports.map(r => r.target_id));
  distinctReportedUsers.add(reported_user_id);
  if (distinctReportedUsers.size >= 5) {
    await base44.asServiceRole.entities.AbuseAlert.create({
      alert_type: 'mass_reporting',
      severity: 'high',
      message: `User ${user.id} has submitted reports against ${distinctReportedUsers.size} different users in the last 24 hours`,
      is_resolved: false,
      created_at: new Date().toISOString()
    }).catch(() => {});
  }

  // Send confirmation to reporter
  await base44.asServiceRole.integrations.Core.SendEmail({
    to: user.email,
    subject: 'Your report has been submitted',
    body: 'Your report has been submitted. Our team typically reviews reports within 48 hours.'
  }).catch(() => {});

  return Response.json({ success: true, report_id: flagRecord.id }, { status: 201 });
});
