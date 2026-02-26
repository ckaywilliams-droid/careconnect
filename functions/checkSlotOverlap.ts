import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.app_role !== 'caregiver') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caregiver_profile_id, slot_date, start_time, end_time, exclude_slot_id } = await req.json();

    // Validate inputs
    if (!caregiver_profile_id || !slot_date || !start_time || !end_time) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Parse times as minutes since midnight for comparison
    const parseTime = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const proposedStart = parseTime(start_time);
    const proposedEnd = parseTime(end_time);

    if (proposedStart >= proposedEnd) {
      return Response.json(
        { error: 'End time must be after start time' },
        { status: 400 }
      );
    }

    // F-053 Logic.1: Query all existing slots for this caregiver on this date
    const existingSlots = await base44.entities.AvailabilitySlot.filter({
      caregiver_profile_id,
      slot_date
    });

    // F-053 Data.3: Check slots with status in ('open', 'soft_locked', 'booked') OR is_blocked=true
    const relevantSlots = existingSlots.filter(slot => {
      // Exclude the slot being edited (if provided)
      if (exclude_slot_id && slot.id === exclude_slot_id) {
        return false;
      }
      
      // Include if blocked, or if status is open/soft_locked/booked
      if (slot.is_blocked) {
        return true;
      }
      
      if (['open', 'soft_locked', 'booked'].includes(slot.status)) {
        return true;
      }
      
      return false;
    });

    // F-053 Data.2: Check for overlap - proposed slot overlaps if:
    // proposed.start < existing.end AND proposed.end > existing.start
    for (const existing of relevantSlots) {
      const existingStart = parseTime(existing.start_time);
      const existingEnd = parseTime(existing.end_time);

      if (proposedStart < existingEnd && proposedEnd > existingStart) {
        // Overlap detected
        const errorType = existing.status === 'booked' ? 'booked' : 'partial';
        
        let message;
        if (proposedStart === existingStart && proposedEnd === existingEnd) {
          // F-053 Errors.1: Exact overlap
          if (existing.status === 'soft_locked') {
            message = `This time overlaps with a slot that has a pending booking request.`;
          } else {
            message = `You already have a slot from ${existing.start_time} to ${existing.end_time} on ${slot_date}. Please choose a different time.`;
          }
        } else if (existing.status === 'booked') {
          // F-053 Errors.3: Booked slot conflict
          message = `This time conflicts with a confirmed booking from ${existing.start_time} to ${existing.end_time}. You cannot add a slot that overlaps with a confirmed booking.`;
        } else if (existing.status === 'soft_locked') {
          // F-055 Errors.1: Soft-locked slot overlap
          message = `This slot overlaps with a slot that has a pending booking request (${existing.start_time}–${existing.end_time}).`;
        } else {
          // F-053 Errors.2: Partial overlap
          message = `This slot overlaps with your existing ${existing.start_time}–${existing.end_time} slot on ${slot_date}. Please adjust the start or end time.`;
        }

        return Response.json({
          success: false,
          error: message,
          conflict_details: {
            conflicting_slot_id: existing.id,
            conflicting_start: existing.start_time,
            conflicting_end: existing.end_time,
            conflicting_status: existing.status,
            is_booked: existing.status === 'booked'
          }
        }, { status: 409 });
      }
    }

    // No overlap detected
    return Response.json({
      success: true,
      message: 'No overlaps detected'
    });
  } catch (error) {
    console.error('Error in checkSlotOverlap:', error);
    return Response.json(
      { error: 'Failed to check slot overlap' },
      { status: 500 }
    );
  }
});