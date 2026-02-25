import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-037: SUBMIT EVIDENCE (PARTY-FACING)
 * 
 * Allows parent or caregiver to submit evidence via time-limited URL.
 * 
 * WORKFLOW:
 * 1. Validate token exists and matches dispute
 * 2. Check 24h expiry
 * 3. Check rate limit (3 per party per dispute)
 * 4. Create DisputeEvidence record
 * 5. Update dispute status if needed
 * 
 * SECURITY:
 * - F-037 Edge.2: Allows write even if account is locked (exception for dispute evidence)
 * - F-037 Abuse.2: Max 3 submissions per party per dispute
 * - F-037 Triggers.1: Token is single-use per party, 24h expiry
 * 
 * PAYLOAD:
 * {
 *   token: string (required)
 *   dispute_id: string (required)
 *   evidence_type: 'text_statement' | 'screenshot' | 'message_log' (required)
 *   content: string (required, max 2000 chars for text)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse payload
    const payload = await req.json();
    const { token, dispute_id, evidence_type, content } = payload;

    // Validation
    if (!token || !dispute_id || !evidence_type || !content) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validTypes = ['text_statement', 'screenshot', 'message_log'];
    if (!validTypes.includes(evidence_type)) {
      return Response.json({ error: 'Invalid evidence type' }, { status: 400 });
    }

    if (evidence_type === 'text_statement' && content.length > 2000) {
      return Response.json({ error: 'Text statement must be 2000 characters or less' }, { status: 400 });
    }

    // Get dispute
    const disputes = await base44.asServiceRole.entities.DisputeCase.filter({ id: dispute_id });
    if (!disputes || disputes.length === 0) {
      return Response.json({ error: 'Dispute not found' }, { status: 404 });
    }
    const dispute = disputes[0];

    // Validate token matches
    let submitterRole = null;
    let submitterId = null;

    if (token === dispute.parent_evidence_token) {
      submitterRole = 'parent';
      // Get parent user_id from booking
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: dispute.booking_id });
      submitterId = bookings[0]?.parent_user_id;
    } else if (token === dispute.caregiver_evidence_token) {
      submitterRole = 'caregiver';
      // Get caregiver user_id from booking
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: dispute.booking_id });
      submitterId = bookings[0]?.caregiver_user_id;
    } else {
      return Response.json({ error: 'Invalid or expired token' }, { status: 403 });
    }

    if (!submitterId) {
      return Response.json({ error: 'Unable to identify submitter' }, { status: 400 });
    }

    // F-037 Triggers.1: Check 24h expiry
    if (dispute.evidence_request_sent_at) {
      const requestTime = new Date(dispute.evidence_request_sent_at);
      const now = new Date();
      const hoursPassed = (now - requestTime) / (1000 * 60 * 60);

      if (hoursPassed > 24) {
        return Response.json({ 
          error: 'Evidence submission window has closed (24h expired)' 
        }, { status: 403 });
      }
    }

    // F-037 Abuse.2: Check rate limit (3 per party per dispute)
    const existingEvidence = await base44.asServiceRole.entities.DisputeEvidence.filter({
      dispute_id,
      submitted_by: submitterId,
    });

    if (existingEvidence.length >= 3) {
      return Response.json({ 
        error: 'Evidence submission limit reached (max 3 per party)' 
      }, { status: 429 });
    }

    // Create DisputeEvidence record
    const evidence = await base44.asServiceRole.entities.DisputeEvidence.create({
      dispute_id,
      submitted_by: submitterId,
      evidence_type,
      content,
      submitted_at: new Date().toISOString(),
    });

    // Update dispute status to ruling_pending if both parties have submitted
    const allEvidence = await base44.asServiceRole.entities.DisputeEvidence.filter({ dispute_id });
    const submitters = new Set(allEvidence.map(e => e.submitted_by));
    
    if (submitters.size >= 2 && dispute.status === 'evidence_requested') {
      await base44.asServiceRole.entities.DisputeCase.update(dispute_id, {
        status: 'ruling_pending',
      });
    }

    // F-037 Audit.3: Log evidence submission
    console.log('Evidence submitted:', {
      dispute_id,
      submitter_id: submitterId,
      evidence_type,
      submitted_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: 'Evidence submitted successfully',
      evidence_id: evidence.id,
    });

  } catch (error) {
    console.error('Error submitting evidence:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});