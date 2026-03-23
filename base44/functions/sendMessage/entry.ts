/**
 * F-088 Logic.3: Send a message to a booking-scoped thread.
 * F-089 Logic.1: Contact redaction filter runs on every message write when booking is pending.
 * F-088 Abuse.1: Rate limit 30 messages/user/thread/hour.
 * F-088 Audit.2: Message send events logged (no body content in log).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// F-089 Data.3: Redaction patterns
const REDACTION_PATTERNS = [
  // Phone numbers (10+ digit sequences with optional separators, but NOT 5-digit zip codes)
  /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // Email addresses
  /[^\s@]+@[^\s@]+\.[^\s@]+/g,
  // URLs
  /https?:\/\/[^\s]+/g,
  /www\.[^\s]+\.[^\s]+/g,
  // Social handles (@username without a domain dot)
  /@[a-zA-Z0-9_]+(?!\.[a-zA-Z])/g,
];

const REPLACEMENT = '[Contact info hidden]';

function redactContactInfo(text) {
  let redacted = text;
  let wasRedacted = false;
  for (const pattern of REDACTION_PATTERNS) {
    pattern.lastIndex = 0;
    const result = redacted.replace(pattern, (match) => {
      wasRedacted = true;
      return REPLACEMENT;
    });
    redacted = result;
  }
  return { redacted, wasRedacted };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['parent', 'caregiver'].includes(user.app_role)) {
    return Response.json({ error: 'Only parents and caregivers can send messages.' }, { status: 403 });
  }

  const body = await req.json();
  const { thread_id, booking_id, content } = body;

  if (!thread_id) return Response.json({ error: 'thread_id is required.' }, { status: 400 });

  // Validate message content
  const trimmed = (content || '').trim();
  if (!trimmed) return Response.json({ error: 'Your message cannot be empty.' }, { status: 400 });
  if (trimmed.length > 2000) return Response.json({ error: 'Message cannot exceed 2,000 characters.' }, { status: 400 });

  // Fetch thread by primary key
  const thread = await base44.asServiceRole.entities.MessageThread.get(thread_id);
  if (!thread) return Response.json({ error: 'Not found.' }, { status: 404 });

  // Access check: must be a party to this thread
  const isParty = thread.parent_user_id === user.id || thread.caregiver_user_id === user.id;
  console.log('thread.parent_user_id:', thread.parent_user_id);
  console.log('thread.caregiver_user_id:', thread.caregiver_user_id);
  console.log('user.id:', user.id);
  console.log('isParty:', isParty);
  if (!isParty) return Response.json({ error: 'Not found.' }, { status: 404 });

  // F-088 States.1: thread must be open
  if (!thread.is_active) {
    return Response.json({ error: 'This conversation has been closed. You can no longer send messages.' }, { status: 409 });
  }

  // F-088 Abuse.1: Rate limit 30 messages/user/thread/hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentMessages = await base44.asServiceRole.entities.Message.filter({
    thread_id,
    sender_user_id: user.id
  });
  const recentCount = recentMessages.filter(m => m.created_date > oneHourAgo).length;
  if (recentCount >= 30) {
    return Response.json({ error: 'You are sending messages too quickly. Please wait before sending more.' }, { status: 429 });
  }

  // F-089: Check if redaction is needed (booking status = pending)
  let finalContent = trimmed;
  let isFiltered = false;
  let bodyOriginal = null;

  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: thread.booking_id });
  const booking = bookings[0];

  if (booking && booking.status === 'pending') {
    const { redacted, wasRedacted } = redactContactInfo(trimmed);

    if (wasRedacted) {
      // F-089 Logic.3: reject if entire body is contact info
      const strippedOfRedaction = redacted.replace(/\[Contact info hidden\]/g, '').trim();
      if (!strippedOfRedaction) {
        return Response.json({
          error: 'Your message could not be sent — it contained only contact information, which is not permitted before a booking is confirmed.'
        }, { status: 400 });
      }
      bodyOriginal = trimmed;
      finalContent = redacted;
      isFiltered = true;
    }
  }

  // Create the message
  // Fix: store deletion_reason='filtered' so MessageThread.jsx can detect redacted messages
  const message = await base44.asServiceRole.entities.Message.create({
    thread_id,
    sender_user_id: user.id,
    content: finalContent,
    body_original: bodyOriginal,
    deletion_reason: isFiltered ? 'filtered' : null,
    is_read: false,
    is_system_message: false,
    sent_at: new Date().toISOString(),
    is_deleted: false,
  });

  // Update thread last_message_at
  await base44.asServiceRole.entities.MessageThread.update(thread_id, {
    last_message_at: new Date().toISOString()
  }).catch(() => {});

  // F-089 Triggers.1: Admin alert on redaction
  if (isFiltered) {
    await base44.asServiceRole.entities.AbuseAlert.create({
      alert_type: 'redaction_triggered',
      severity: 'low',
      booking_id: thread.booking_id,
      message: `Contact info redaction triggered in thread ${thread_id} by user ${user.id}`,
      is_resolved: false,
      created_at: new Date().toISOString()
    }).catch(() => {});
  }

  // F-088 Triggers.1: New message notification
  // Fix: fetch recipient's own recent messages (not the sender's) to detect activity
  const recipientId = thread.parent_user_id === user.id ? thread.caregiver_user_id : thread.parent_user_id;
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const recentRecipientMessages = await base44.asServiceRole.entities.Message.filter({
    thread_id,
    sender_user_id: recipientId
  });
  const recipientWasRecentlyActive = recentRecipientMessages.some(m => m.created_date > thirtyMinAgo);

  if (!recipientWasRecentlyActive) {
    const recipientUsers = await base44.asServiceRole.entities.User.filter({ id: recipientId });
    const recipientUser = recipientUsers[0];
    if (recipientUser?.email) {
      const baseUrl = Deno.env.get('BASE_URL') || 'https://your-app.base44.app';
      // Fix: send caregivers to CaregiverProfile, parents to ParentBookings
      const isRecipientCaregiver = recipientId === thread.caregiver_user_id;
      const inboxPath = isRecipientCaregiver ? '/CaregiverProfile' : '/ParentBookings';
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: recipientUser.email,
        subject: 'New message from CareNest',
        body: `You have a new message. Log in to read it:\n\n${baseUrl}${inboxPath}`
      }).catch(() => {});
    }
  }

  return Response.json({
    success: true,
    message_id: message.id,
    is_filtered: isFiltered,
    content: finalContent
  }, { status: 201 });
});