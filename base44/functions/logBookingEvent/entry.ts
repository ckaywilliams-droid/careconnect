/**
 * Layer 8: Booking & Lifecycle Audit Logger
 *
 * Centralised audit logging for all booking state transitions and lifecycle events.
 * Called internally by other functions via base44.functions.invoke('logBookingEvent', payload).
 *
 * Per-feature audit requirements:
 *   F-074/F-076 Audit.1: Every status transition logged
 *   F-077 Audit.1-3:     Accept/decline + phone reveal + email delivery
 *   F-078 Audit.1:       Cancellation events + slot version numbers + late cancel flag
 *   F-080 Audit.1:       Check-in events + no-show trigger events
 *   F-081R Audit.1:      Check-out events + 4-hour alert events
 *   F-082R Audit.1:      No-show report events + post-ruling outcome
 *   F-083R Audit.1-2:    profile_status on_hold transitions + duration tracking
 *   F-084R Audit.1-2:    Admin review actions → AdminActionLog
 *   F-085 Audit.1:       Caregiver cancellation request logged
 *   F-086 Audit.1:       Approve/deny events + deadline escalation
 *   F-088 Audit.1-3:     Reopen events with version_numbers; failure as critical alert
 *
 * Log record is written to AdminActionLog for admin-initiated events,
 * and to a structured JSON log for system/user-initiated events.
 * PIIAccessLog entries are written for phone reveal events.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // This is an internal function — called by other backend functions via service role.
  // We accept it from any authenticated caller (user-scoped or service role).
  // No role restriction: logging must never be blocked.
  const body = await req.json();
  const {
    event_type,       // string — e.g. 'booking_status_transition', 'phone_reveal', 'checkin', etc.
    booking_id,       // string
    actor_user_id,    // string — who triggered the event (or 'system' for automations)
    actor_role,       // string — e.g. 'parent', 'caregiver', 'super_admin', 'system'
    old_status,       // string | null
    new_status,       // string | null
    slot_id,          // string | null
    slot_version_before, // number | null
    slot_version_after,  // number | null
    caregiver_profile_id, // string | null
    parent_user_id,   // string | null
    caregiver_user_id, // string | null
    meta,             // object | null — any additional event-specific fields
    is_critical,      // boolean — critical system alerts (slot stuck, reopen failure, etc.)
    pii_event,        // object | null — if set, writes a PIIAccessLog entry
    admin_action,     // object | null — if set, writes to AdminActionLog
  } = body;

  if (!event_type || !booking_id) {
    return Response.json({ error: 'event_type and booking_id are required.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const results = {};

  // ── 1. AdminActionLog — for admin-initiated events ────────────────────────
  if (admin_action) {
    const {
      action_type,
      target_entity_type,
      target_entity_id,
      reason,
      payload,
    } = admin_action;

    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: actor_user_id,
      admin_role: actor_role,
      action_type: action_type || 'other',
      target_entity_type: target_entity_type || 'BookingRequest',
      target_entity_id: target_entity_id || booking_id,
      reason: reason || `Automated log: ${event_type}`,
      payload: payload ? JSON.stringify(payload) : JSON.stringify({
        event_type,
        old_status,
        new_status,
        slot_id,
        slot_version_before,
        slot_version_after,
        meta
      }),
      action_timestamp: now
    }).catch(() => {});

    results.admin_action_logged = true;
  }

  // ── 2. PIIAccessLog — for phone reveal and PII access events ─────────────
  if (pii_event) {
    const {
      field_accessed,
      target_entity_type,
      target_entity_id,
      booking_context_id,
      access_context,
      accessor_role
    } = pii_event;

    await base44.asServiceRole.entities.PIIAccessLog.create({
      accessor_user_id: actor_user_id,
      accessor_role: accessor_role || actor_role,
      field_accessed: field_accessed || 'phone',
      target_entity_type: target_entity_type || 'User',
      target_entity_id: target_entity_id,
      booking_context_id: booking_context_id || booking_id,
      access_timestamp: now,
      access_context: access_context || event_type
    }).catch(() => {});

    results.pii_log_written = true;
  }

  // ── 3. Critical system alert — AdminAlert entity ──────────────────────────
  if (is_critical) {
    await base44.asServiceRole.entities.AdminAlert.create({
      alert_type: event_type,
      severity: 'critical',
      booking_id,
      slot_id: slot_id || null,
      message: `CRITICAL: ${event_type} | booking=${booking_id} | slot=${slot_id || 'N/A'} | ${JSON.stringify(meta || {})}`,
      is_resolved: false,
      created_at: now
    }).catch(() => {});

    results.critical_alert_created = true;
  }

  // ── 4. Structured booking event log entry (via AdminActionLog for all transitions)
  // F-076 Audit.1: every status transition logged with full context
  if (old_status !== undefined || new_status !== undefined) {
    // Only log status transitions as AdminActionLog entries when they are NOT
    // admin-initiated (those are already logged in block 1 above)
    if (!admin_action) {
      const actionTypeMap = {
        'booking_status_transition': 'other',
        'slot_reopen': 'other',
        'slot_soft_lock': 'other',
        'slot_booked': 'other',
        'checkin': 'other',
        'checkout': 'other',
        'no_show_reported': 'other',
        'profile_hold_triggered': 'manual_override',
        'cancellation_request': 'other',
        'cancellation_approved': 'other',
        'cancellation_denied': 'other',
        'cancellation_escalated': 'other',
        'booking_expired': 'other',
        'email_delivery': 'other',
        'phone_reveal': 'other',
        'late_cancellation_flag': 'other',
        'checkin_noshow_flag': 'other',
        'checkout_4hr_alert': 'other',
      };

      const mappedActionType = actionTypeMap[event_type] || 'other';

      await base44.asServiceRole.entities.AdminActionLog.create({
        admin_user_id: actor_user_id || 'system',
        admin_role: actor_role || 'system',
        action_type: mappedActionType,
        target_entity_type: 'BookingRequest',
        target_entity_id: booking_id,
        reason: `${event_type}: ${old_status || '?'} → ${new_status || '?'}`,
        payload: JSON.stringify({
          event_type,
          old_status,
          new_status,
          slot_id,
          slot_version_before,
          slot_version_after,
          caregiver_profile_id,
          parent_user_id,
          caregiver_user_id,
          meta: meta || {}
        }),
        action_timestamp: now
      }).catch(() => {});

      results.transition_logged = true;
    }
  }

  return Response.json({
    success: true,
    event_type,
    booking_id,
    logged_at: now,
    ...results
  }, { status: 200 });
});