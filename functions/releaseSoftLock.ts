import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
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

    // F-055 Security: Only the owning caregiver or admin can release soft locks
    const isAdmin = ['support_admin', 'trust_admin', 'super_admin'].includes(user.role);
    const isOwner = slot.caregiver_user_id === user.id;
    
    if (!isAdmin && !isOwner) {
      return Response.json(
        { error: 'Unauthorized: Only the caregiver who owns this slot or an admin can release soft locks' },
        { status: 403 }
      );
    }

    // Only release if currently soft_locked
    if (slot.status !== 'soft_locked') {
      return Response.json({
        success: true,
        message: `Slot is in ${slot.status} state, no soft lock to release`,
        slot_id
      });
    }

    // Release the soft lock - transition soft_locked -> open
    await base44.entities.AvailabilitySlot.update(slot_id, {
      status: 'open'
    });

    return Response.json({
      success: true,
      message: 'Soft lock released, slot returned to open',
      slot_id,
      released_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in releaseSoftLock:', error);
    return Response.json(
      { error: 'Failed to release soft lock' },
      { status: 500 }
    );
  }
});