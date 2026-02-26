import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.app_role !== 'caregiver') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slot_id, action } = await req.json();

    if (!slot_id || !action) {
      return Response.json(
        { error: 'Missing required fields: slot_id, action' },
        { status: 400 }
      );
    }

    // Only validate when blocking
    if (action !== 'block') {
      return Response.json({
        success: true,
        message: 'Unblock action allowed'
      });
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

    // F-055 Errors.3: Cannot block a soft-locked slot
    if (slot.status === 'soft_locked') {
      return Response.json({
        success: false,
        error: 'This slot has a pending booking request. Resolve the request before blocking this time.',
        error_code: 'SOFT_LOCK_ACTIVE',
        slot_id
      }, { status: 409 });
    }

    // Cannot block booked slots either
    if (slot.status === 'booked') {
      return Response.json({
        success: false,
        error: 'This slot has a confirmed booking. You cannot block it.',
        error_code: 'SLOT_BOOKED',
        slot_id
      }, { status: 409 });
    }

    return Response.json({
      success: true,
      message: 'Slot can be blocked',
      slot_id
    });
  } catch (error) {
    console.error('Error in validateSlotBlocking:', error);
    return Response.json(
      { error: 'Failed to validate slot blocking' },
      { status: 500 }
    );
  }
});