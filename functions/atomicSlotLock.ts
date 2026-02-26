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

    const lockStartTime = Date.now();

    // F-054 Logic.1: Check current slot status
    const slots = await base44.entities.AvailabilitySlot.filter({ id: slot_id });

    if (slots.length === 0) {
      return Response.json(
        { error: 'Slot not found' },
        { status: 404 }
      );
    }

    const currentSlot = slots[0];

    // Verify caregiver_profile_id matches (security check)
    if (currentSlot.caregiver_profile_id !== caregiver_profile_id) {
      return Response.json(
        { error: 'Invalid caregiver profile' },
        { status: 400 }
      );
    }

    // Pre-check for immediate rejections (not race conditions, just unavailable)
    if (currentSlot.is_blocked) {
      return Response.json({
        success: false,
        error: 'This time slot is not available.',
        error_code: 'BLOCKED',
        slot_id
      }, { status: 409 });
    }

    if (currentSlot.status !== 'open') {
      // F-054 Errors.2 & Errors.3: Slot already claimed or booked
      const errorCode = currentSlot.status === 'soft_locked' ? 'RACE_CONDITION' : 'ALREADY_BOOKED';
      const errorMsg = currentSlot.status === 'soft_locked' 
        ? 'Sorry, this time slot was just taken. Here are some other available times:'
        : 'This slot has already been booked. Please choose another time.';

      return Response.json({
        success: false,
        error: errorMsg,
        error_code: errorCode,
        slot_id,
        original_status: currentSlot.status
      }, { status: 409 });
    }

    // F-054 Logic.1: Attempt atomic transition open -> soft_locked
    let lockSuccess = false;
    try {
      await base44.entities.AvailabilitySlot.update(slot_id, {
        status: 'soft_locked'
      });
      lockSuccess = true;
    } catch (updateError) {
      // F-054 Edge.1: Another request won the race
      const lockEndTime = Date.now();
      
      // F-054 Audit.1: Log race condition rejection
      try {
        await base44.asServiceRole.entities.RaceConditionLog.create({
          slot_id,
          caregiver_profile_id,
          rejected_parent_user_id: user.id,
          timestamp: new Date().toISOString(),
          lock_attempt_duration_ms: lockEndTime - lockStartTime
        });
      } catch (logError) {
        console.warn('Failed to log race condition:', logError);
      }

      return Response.json({
        success: false,
        error: 'Sorry, this time slot was just taken. Here are some other available times:',
        error_code: 'RACE_CONDITION',
        slot_id,
        lock_attempt_duration_ms: lockEndTime - lockStartTime
      }, { status: 409 });
    }

    if (!lockSuccess) {
      return Response.json({
        success: false,
        error: 'Failed to lock slot.',
        error_code: 'LOCK_FAILURE',
        slot_id
      }, { status: 409 });
    }

    const lockEndTime = Date.now();

    // F-054 Audit.2: Log successful lock with performance metrics
    if (lockEndTime - lockStartTime > 100) {
      console.warn(`Slow atomic lock: ${lockEndTime - lockStartTime}ms for slot ${slot_id}`);
    }

    // F-054 States.2: Successful lock acquired
    return Response.json({
      success: true,
      message: 'Slot successfully locked for booking',
      slot_id,
      locked_at: new Date().toISOString(),
      lock_duration_ms: lockEndTime - lockStartTime
    });
  } catch (error) {
    console.error('Error in atomicSlotLock:', error);
    return Response.json(
      { error: 'Failed to lock slot' },
      { status: 500 }
    );
  }
});