import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { booking_request_id, new_status, release_reason } = await req.json();

    if (!booking_request_id || !new_status) {
      return Response.json(
        { error: 'Missing required fields: booking_request_id, new_status' },
        { status: 400 }
      );
    }

    // F-055 Triggers.2: Release lock only on decline or cancel
    if (!['declined_by_caregiver', 'declined_by_parent', 'cancelled', 'cancellation_requested'].includes(new_status)) {
      return Response.json({
        success: true,
        message: 'No lock release needed for this status transition'
      });
    }

    // Fetch the booking request
    const bookingRequests = await base44.asServiceRole.entities.BookingRequest.filter({
      id: booking_request_id
    });

    if (bookingRequests.length === 0) {
      return Response.json(
        { error: 'BookingRequest not found' },
        { status: 404 }
      );
    }

    const booking = bookingRequests[0];
    const slotId = booking.availability_slot_id;

    if (!slotId) {
      return Response.json({
        success: true,
        message: 'No slot associated with this booking'
      });
    }

    // Fetch the slot
    const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
      id: slotId
    });

    if (slots.length === 0) {
      return Response.json(
        { error: 'AvailabilitySlot not found' },
        { status: 404 }
      );
    }

    const slot = slots[0];

    // Only release if currently soft_locked
    if (slot.status !== 'soft_locked') {
      return Response.json({
        success: true,
        message: `Slot is in ${slot.status} state, no soft lock to release`
      });
    }

    // F-055 States.2: Transition soft_locked → open
    await base44.asServiceRole.entities.AvailabilitySlot.update(slotId, {
      status: 'open'
    });

    // F-055 Audit.2: Log the release event
    try {
      await base44.asServiceRole.entities.SoftLockReleaseLog.create({
        slot_id: slotId,
        booking_request_id,
        release_reason: release_reason || new_status,
        timestamp: new Date().toISOString()
      });
    } catch (logError) {
      console.warn('Failed to log soft lock release:', logError);
    }

    return Response.json({
      success: true,
      message: 'Soft lock released, slot returned to open',
      slot_id: slotId,
      released_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in releaseSoftLockOnDecline:', error);
    return Response.json(
      { error: 'Failed to release soft lock' },
      { status: 500 }
    );
  }
});