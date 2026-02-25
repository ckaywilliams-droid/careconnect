import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-037 Logic.1: OPEN DISPUTE CASE
 * 
 * Admin opens a dispute case on a booking.
 * 
 * WORKFLOW:
 * 1. Validate admin authorization (support/trust/super)
 * 2. Validate booking exists
 * 3. Create DisputeCase record
 * 4. Optionally freeze booking
 * 5. Write AdminActionLog
 * 
 * AUTHORIZATION (F-037 Access.1):
 * - support_admin, trust_admin, super_admin
 * 
 * PAYLOAD:
 * {
 *   booking_id: string (required)
 *   dispute_type: 'payment_dispute' | 'safety_concern' | 'no_show' | 'misconduct' | 'other' (required)
 *   initial_notes: string (required, min 20 chars)
 *   freeze_booking: boolean (optional, default false)
 *   assign_to: string (optional, admin user_id)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-037 Access.1: Admin authorization
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedRoles = ['support_admin', 'trust_admin', 'super_admin'];
    if (!authorizedRoles.includes(admin.role)) {
      return Response.json({ 
        error: 'Forbidden: Admin access required for disputes' 
      }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { booking_id, dispute_type, initial_notes, freeze_booking = false, assign_to } = payload;

    // Validation
    if (!booking_id || !dispute_type || !initial_notes) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (initial_notes.length < 20) {
      return Response.json({ error: 'Initial notes must be at least 20 characters' }, { status: 400 });
    }

    const validTypes = ['payment_dispute', 'safety_concern', 'no_show', 'misconduct', 'other'];
    if (!validTypes.includes(dispute_type)) {
      return Response.json({ error: 'Invalid dispute type' }, { status: 400 });
    }

    // Validate booking exists
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id });
    if (!bookings || bookings.length === 0) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // F-037 Logic.1: Create DisputeCase
    const disputeCase = await base44.asServiceRole.entities.DisputeCase.create({
      booking_id,
      opened_by: admin.id,
      dispute_type,
      initial_notes,
      status: freeze_booking ? 'frozen' : 'open',
      assigned_to: assign_to || admin.id,
      opened_at: new Date().toISOString(),
    });

    // F-037 Access.2: Freeze booking if requested (trust_admin+ only)
    if (freeze_booking) {
      if (!['trust_admin', 'super_admin'].includes(admin.role)) {
        return Response.json({ 
          error: 'Only trust_admin and super_admin can freeze bookings' 
        }, { status: 403 });
      }

      await base44.asServiceRole.entities.BookingRequest.update(booking_id, {
        status: 'frozen',
      });
    }

    // F-037 Audit.1: Write AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'other',
      target_entity_type: 'DisputeCase',
      target_entity_id: disputeCase.id,
      reason: `Opened dispute case: ${dispute_type}`,
      payload: JSON.stringify({
        booking_id,
        dispute_type,
        freeze_booking,
        initial_notes: initial_notes.substring(0, 200),
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return Response.json({
      success: true,
      message: 'Dispute case opened successfully',
      dispute_id: disputeCase.id,
    });

  } catch (error) {
    console.error('Error opening dispute case:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});