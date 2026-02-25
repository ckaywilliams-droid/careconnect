import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-037 Logic.3, Triggers.2: ISSUE DISPUTE RULING
 * 
 * Admin issues final ruling on dispute case.
 * 
 * WORKFLOW:
 * 1. Validate trust_admin or super_admin authorization
 * 2. Validate ruling and resolution_note
 * 3. Update DisputeCase status=resolved
 * 4. Update BookingRequest based on ruling
 * 5. Write AdminActionLog
 * 6. Send notification emails to both parties
 * 
 * AUTHORIZATION (F-037 Access.3):
 * - trust_admin, super_admin ONLY
 * - support_admin cannot issue rulings
 * 
 * PAYLOAD:
 * {
 *   dispute_id: string (required)
 *   ruling: 'uphold_parent' | 'uphold_caregiver' | 'split' | 'dismissed' (required)
 *   resolution_note: string (required, min 20 chars)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-037 Access.3: trust_admin or super_admin ONLY
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['trust_admin', 'super_admin'];
    if (!authorizedRoles.includes(admin.role)) {
      return Response.json({ 
        error: 'Forbidden: Only trust_admin and super_admin can issue rulings' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { dispute_id, ruling, resolution_note } = payload;

    // Validation
    if (!dispute_id || !ruling || !resolution_note) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validRulings = ['uphold_parent', 'uphold_caregiver', 'split', 'dismissed'];
    if (!validRulings.includes(ruling)) {
      return Response.json({ error: 'Invalid ruling type' }, { status: 400 });
    }

    if (resolution_note.length < 20) {
      return Response.json({ error: 'Resolution note must be at least 20 characters' }, { status: 400 });
    }

    // Get dispute
    const disputes = await base44.asServiceRole.entities.DisputeCase.filter({ id: dispute_id });
    if (!disputes || disputes.length === 0) {
      return Response.json({ error: 'Dispute not found' }, { status: 404 });
    }
    const dispute = disputes[0];

    if (dispute.status === 'resolved') {
      return Response.json({ error: 'Dispute already resolved' }, { status: 400 });
    }

    // Get booking
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: dispute.booking_id });
    if (!bookings || bookings.length === 0) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }
    const booking = bookings[0];

    // F-037 Triggers.2: Update DisputeCase
    await base44.asServiceRole.entities.DisputeCase.update(dispute_id, {
      status: 'resolved',
      ruling,
      resolution_note,
      resolved_at: new Date().toISOString(),
    });

    // F-037 Logic.3: Update BookingRequest based on ruling
    if (ruling === 'dismissed' || ruling === 'uphold_parent') {
      // Booking cancelled or parent upheld
      await base44.asServiceRole.entities.BookingRequest.update(dispute.booking_id, {
        status: 'cancelled',
      });
    }
    // If uphold_caregiver or split, booking stays as is

    // F-037 Audit.2: Write AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'other',
      target_entity_type: 'DisputeCase',
      target_entity_id: dispute_id,
      reason: `Issued ruling: ${ruling}`,
      payload: JSON.stringify({
        dispute_id,
        booking_id: dispute.booking_id,
        ruling,
        parent_id: booking.parent_user_id,
        caregiver_id: booking.caregiver_user_id,
        resolution_note: resolution_note.substring(0, 200),
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    // F-037 Triggers.2: Send notification emails (simplified for MVP)
    const rulingText = {
      uphold_parent: 'The dispute has been resolved in favor of the parent.',
      uphold_caregiver: 'The dispute has been resolved in favor of the caregiver.',
      split: 'The dispute has been resolved with a split decision.',
      dismissed: 'The dispute has been dismissed.',
    }[ruling];

    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: booking.parent_user_email || 'parent@example.com',
        subject: 'Dispute Ruling: Case Resolved',
        body: `
Dear Parent,

The dispute case regarding your booking (ID: ${booking.id}) has been resolved.

Ruling: ${rulingText}

${resolution_note}

Thank you,
Moderation Team
        `.trim(),
      });

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: booking.caregiver_user_email || 'caregiver@example.com',
        subject: 'Dispute Ruling: Case Resolved',
        body: `
Dear Caregiver,

The dispute case regarding your booking (ID: ${booking.id}) has been resolved.

Ruling: ${rulingText}

${resolution_note}

Thank you,
Moderation Team
        `.trim(),
      });
    } catch (emailError) {
      console.error('Failed to send ruling emails:', emailError);
      // Don't fail the ruling if email fails
    }

    return Response.json({
      success: true,
      message: 'Ruling issued successfully',
      dispute_id,
      ruling,
    });

  } catch (error) {
    console.error('Error issuing ruling:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});