import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-037 Logic.2, Triggers.1: REQUEST EVIDENCE FROM PARTIES
 * 
 * Admin requests evidence from parent and/or caregiver.
 * Generates time-limited submission URLs (24h expiry).
 * 
 * WORKFLOW:
 * 1. Validate admin authorization
 * 2. Generate unique tokens for each party
 * 3. Update DisputeCase status
 * 4. Send evidence request emails via Resend
 * 5. Write AdminActionLog
 * 
 * AUTHORIZATION:
 * - support_admin, trust_admin, super_admin
 * 
 * PAYLOAD:
 * {
 *   dispute_id: string (required)
 *   request_from_parent: boolean (default true)
 *   request_from_caregiver: boolean (default true)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Admin authorization
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['support_admin', 'trust_admin', 'super_admin'];
    if (!authorizedRoles.includes(admin.role)) {
      return Response.json({ 
        error: 'Forbidden: Admin access required' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { dispute_id, request_from_parent = true, request_from_caregiver = true } = payload;

    if (!dispute_id) {
      return Response.json({ error: 'dispute_id is required' }, { status: 400 });
    }

    // Get dispute
    const disputes = await base44.asServiceRole.entities.DisputeCase.filter({ id: dispute_id });
    if (!disputes || disputes.length === 0) {
      return Response.json({ error: 'Dispute not found' }, { status: 404 });
    }
    const dispute = disputes[0];

    // Get booking to fetch party details
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: dispute.booking_id });
    if (!bookings || bookings.length === 0) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }
    const booking = bookings[0];

    // F-037 Triggers.1: Generate unique tokens (24h expiry)
    const parentToken = request_from_parent ? crypto.randomUUID() : null;
    const caregiverToken = request_from_caregiver ? crypto.randomUUID() : null;

    // Update DisputeCase
    await base44.asServiceRole.entities.DisputeCase.update(dispute_id, {
      status: 'evidence_requested',
      evidence_request_sent_at: new Date().toISOString(),
      parent_evidence_token: parentToken,
      caregiver_evidence_token: caregiverToken,
    });

    // F-037 Triggers.1: Send evidence request emails
    const appUrl = Deno.env.get('APP_URL') || 'https://your-app-url.base44.com';

    if (request_from_parent && parentToken) {
      const parentUrl = `${appUrl}/submit-evidence?token=${parentToken}&dispute_id=${dispute_id}`;
      
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: booking.parent_user_email || 'parent@example.com',
        subject: 'Evidence Request: Dispute Case',
        body: `
Dear Parent,

A dispute case has been opened regarding your booking (ID: ${booking.id}).

We need your input to help resolve this matter fairly. Please submit your statement and any supporting evidence within 24 hours.

Submit evidence here: ${parentUrl}

This link expires in 24 hours.

Thank you,
Moderation Team
        `.trim(),
      });
    }

    if (request_from_caregiver && caregiverToken) {
      const caregiverUrl = `${appUrl}/submit-evidence?token=${caregiverToken}&dispute_id=${dispute_id}`;
      
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: booking.caregiver_user_email || 'caregiver@example.com',
        subject: 'Evidence Request: Dispute Case',
        body: `
Dear Caregiver,

A dispute case has been opened regarding your booking (ID: ${booking.id}).

We need your input to help resolve this matter fairly. Please submit your statement and any supporting evidence within 24 hours.

Submit evidence here: ${caregiverUrl}

This link expires in 24 hours.

Thank you,
Moderation Team
        `.trim(),
      });
    }

    // F-037 Audit.1: Write AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'other',
      target_entity_type: 'DisputeCase',
      target_entity_id: dispute_id,
      reason: 'Requested evidence from parties',
      payload: JSON.stringify({
        request_from_parent,
        request_from_caregiver,
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return Response.json({
      success: true,
      message: 'Evidence requests sent successfully',
      parent_url: parentToken ? `${appUrl}/submit-evidence?token=${parentToken}` : null,
      caregiver_url: caregiverToken ? `${appUrl}/submit-evidence?token=${caregiverToken}` : null,
    });

  } catch (error) {
    console.error('Error requesting evidence:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});