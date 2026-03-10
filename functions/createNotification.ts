/**
 * createNotification — Internal helper
 * Creates an in-app Notification record for a user.
 * Called from booking lifecycle functions (submit, accept, decline, cancel).
 * Uses service role so callers don't need user context.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const body = await req.json();
  const { user_id, type, title, message, booking_request_id, action_url } = body;

  if (!user_id || !type || !title || !message) {
    return Response.json({ error: 'user_id, type, title, and message are required.' }, { status: 400 });
  }

  try {
    const notification = await base44.asServiceRole.entities.Notification.create({
      user_id,
      type,
      title,
      message,
      booking_request_id: booking_request_id || null,
      action_url: action_url || null,
      is_read: false
    });

    return Response.json({ success: true, notification_id: notification.id }, { status: 201 });
  } catch (err) {
    console.error('createNotification failed:', err.message);
    return Response.json({ error: 'Failed to create notification.' }, { status: 500 });
  }
});