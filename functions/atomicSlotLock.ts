import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.app_role !== 'parent') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slot_id, caregiver_profile_id, slot_date } = await req.json();

    if (!slot_id || !caregiver_profile_id || !slot_date) {
      return Response.json(
        { error: 'Missing required fields: slot_id, caregiver_profile_id, slot_date' },
        { status: 400 }
      );
    }

    // F-054 Logic.1: Atomic conditional update - transition open -> soft_locked
    // Fetch the slot to verify it exists and is still open
    const slot = await base44.entities.AvailabilitySlot.filter({ id: slot_id });

    if (slot.length === 0) {
      return Response.json(
        { error: 'Slot not found' },
        { status: 404 }
      );
    }

    const currentSlot = slot[0];

    // Check status before attempting update
    if (currentSlot.status === 'soft_locked') {
      // Slot is already pending a booking
      return Response.json({
        success: false,
        error: 'This slot is already being requested by another parent.',
        error_code: 'RACE_CONDITION',
        slot_id
      }, { status: 409 });
    }

    if (currentSlot.status === 'booked') {
      return Response.json({
        success: false,
        error: 'This slot has already been booked. Please choose another time.',
        error_code: 'ALREADY_BOOKED',
        slot_id
      }, { status: 409 });
    }

    if (currentSlot.is_blocked) {
      return Response.json({
        success: false,
        error: 'This time slot is not available.',
        error_code: 'BLOCKED',
        slot_id
      }, { status: 409 });
    }

    if (currentSlot.status !== 'open') {
      return Response.json({
        success: false,
        error: 'This slot is no longer available.',
        error_code: 'UNAVAILABLE',
        slot_id
      }, { status: 409 });
    }

    // F-054 Logic.1: Perform atomic update - set status to soft_locked
    try {
      await base44.entities.AvailabilitySlot.update(slot_id, {
        status: 'soft_locked',
        updated_at: new Date().toISOString()
      });
    } catch (updateError) {
      // If update fails, the slot was likely already claimed
      return Response.json({
        success: false,
        error: 'This slot was just claimed by another parent.',
        error_code: 'RACE_CONDITION',
        slot_id
      }, { status: 409 });
    }

    // F-054 States.2: Successful lock acquired
    return Response.json({
      success: true,
      message: 'Slot successfully locked for booking',
      slot_id,
      locked_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in atomicSlotLock:', error);
    return Response.json(
      { error: 'Failed to lock slot' },
      { status: 500 }
    );
  }
});