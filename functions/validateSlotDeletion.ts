import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.app_role !== 'caregiver') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slot_id } = await req.json();

    if (!slot_id) {
      return Response.json(
        { error: 'Missing required field: slot_id' },
        { status: 400 }
      );
    }

    // Fetch the slot
    const slots = await base44.entities.AvailabilitySlot.filter({ id: slot_id });

    if (slots.length === 0) {
      return Response.json(
        { error: 'Slot not found' },
        { status: 404 }
      );
    }

    const slot = slots[0];

    // Verify ownership
    if (slot.caregiver_user_id !== user.id) {
      return Response.json(
        { error: 'You do not own this slot' },
        { status: 403 }
      );
    }

    // F-055 Logic.3 + Errors.2: Cannot delete soft-locked slots
    if (slot.status === 'soft_locked') {
      return Response.json({
        success: false,
        error: 'This slot has a pending booking request. You cannot delete it. Please decline the request first, then delete the slot.',
        error_code: 'SOFT_LOCK_ACTIVE',
        slot_id
      }, { status: 409 });
    }

    // Booked slots also cannot be deleted
    if (slot.status === 'booked') {
      return Response.json({
        success: false,
        error: 'This slot has a confirmed booking. You cannot delete it.',
        error_code: 'SLOT_BOOKED',
        slot_id
      }, { status: 409 });
    }

    // F-055 Errors.3: Cannot block a soft-locked slot
    // (This validation is for when caregiver tries to set is_blocked=true on a soft-locked slot)
    // Handled in a separate updateSlotBlocking function

    return Response.json({
      success: true,
      message: 'Slot can be deleted',
      slot_id
    });
  } catch (error) {
    console.error('Error in validateSlotDeletion:', error);
    return Response.json(
      { error: 'Failed to validate slot deletion' },
      { status: 500 }
    );
  }
});