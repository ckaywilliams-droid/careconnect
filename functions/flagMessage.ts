/**
 * F-090: Message Flagging System
 * F-090 Logic.1: Full validation sequence before creating FlaggedContent.
 * F-090 Abuse.1: Rate limit 5 flags/user/24h.
 * F-090 Abuse.2: Duplicate flag prevention (non-resolved flags only).
 * F-090 Abuse.3: false_flag_count threshold → AbuseAlert.
 * F-090 Audit.1: Flag creation logged.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VALID_CATEGORIES = ['harassment', 'inappropriate_content', 'spam', 'safety_concern', 'other'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // (1) Session authenticated, role is parent or caregiver
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['parent', 'caregiver'].includes(user.app_role)) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  const body = await req.json();
  const { message_id, reason_category, reason_note } = body;

  // (2) message_id present — checked first so subsequent errors are correctly attributed
  if (!message_id) return Response.json({ error: 'message_id is required.' }, { status: 400 });

  // (4) reason_category valid
  if (!reason_category || !VALID_CATEGORIES.includes(reason_category)) {
    return Response.json({ error: 'Please select a valid reason category.' }, { status: 400 });
  }

  // (5) reason_note validation
  const trimmedNote = (reason_note || '').trim();
  if (!trimmedNote) {
    return Response.json({ error: 'Your report cannot consist of spaces or blank lines. Please describe the issue.' }, { status: 400 });
  }
  if (trimmedNote.length < 20) {
    return Response.json({ error: 'Please provide more detail in your report (minimum 20 characters).' }, { status: 400 });
  }
  if (trimmedNote.length > 1000) {
    return Response.json({ error: 'Your report is too long. Please limit your description to 1,000 characters.' }, { status: 400 });
  }

  // (2) Message exists
  const messages = await base44.asServiceRole.entities.Message.filter({ id: message_id });
  const message = messages[0];
  if (!message) return Response.json({ error: 'Not found.' }, { status: 404 });

  // (3) Session user is a party to the thread containing this message
  const threads = await base44.asServiceRole.entities.MessageThread.filter({ id: message.thread_id });
  const thread = threads[0];
  if (!thread) return Response.json({ error: 'Not found.' }, { status: 404 });

  const isParty = thread.parent_user_id === user.id || thread.caregiver_user_id === user.id;
  if (!isParty) return Response.json({ error: 'Not found.' }, { status: 404 });

  // F-090 Abuse.1: Rate limit 5 flags/user/24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentFlags = await base44.asServiceRole.entities.FlaggedContent.filter({
    reporter_user_id: user.id
  });
  const recentFlagCount = recentFlags.filter(f => f.created_date > oneDayAgo).length;
  if (recentFlagCount >= 5) {
    return Response.json({ error: 'You have reached the maximum number of reports for today. Please try again tomorrow.' }, { status: 429 });
  }

  // (6) Duplicate check: no existing pending/under_review flag from this user on this message
  // Uses all-time recentFlags (no time scope) so active flags always block re-flagging
  const duplicateFlags = recentFlags.filter(f =>
    f.target_id === message_id &&
    f.target_type === 'message' &&
    ['pending', 'under_review'].includes(f.status)
  );
  if (duplicateFlags.length > 0) {
    return Response.json({ error: 'You have already reported this message. Our team will review your report.' }, { status: 409 });
  }

  // Create FlaggedContent record
  const flagRecord = await base44.asServiceRole.entities.FlaggedContent.create({
    reporter_user_id: user.id,
    target_type: 'message',
    target_id: message_id,
    reason: reason_category,
    reason_detail: trimmedNote,
    status: 'pending'
  });

  // Mark thread as flagged for admin visibility
  await base44.asServiceRole.entities.MessageThread.update(message.thread_id, {
    is_flagged: true
  }).catch(() => {});

  // Fix: also flag the individual Message entity so admin queries on Message.is_flagged work
  await base44.asServiceRole.entities.Message.update(message_id, {
    is_flagged: true
  }).catch(() => {});

  // F-090 Triggers.1 (4): Send confirmation to flagging user
  await base44.asServiceRole.integrations.Core.SendEmail({
    to: user.email,
    subject: 'Your report has been submitted',
    body: 'Your report has been submitted and will be reviewed by our team.'
  }).catch(() => {});

  // F-090 Abuse.3: Check false_flag_count threshold
  const userRecords = await base44.asServiceRole.entities.User.filter({ id: user.id });
  const userRecord = userRecords[0];
  if (userRecord?.false_flag_count >= 3) {
    await base44.asServiceRole.entities.AbuseAlert.create({
      alert_type: 'false_flag_threshold',
      severity: 'medium',
      message: `User ${user.id} has reached false_flag_count threshold (${userRecord.false_flag_count})`,
      is_resolved: false,
      created_at: new Date().toISOString()
    }).catch(() => {});
  }

  return Response.json({ success: true, flag_id: flagRecord.id }, { status: 201 });
});
