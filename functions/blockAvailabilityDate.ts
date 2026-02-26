import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.app_role !== 'caregiver') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caregiver_profile_id, slot_date, action, blockAllSlots } = await req.json();

    // Validate inputs
    if (!caregiver_profile_id || !slot_date || !action) {
      return Response.json(
        { error: 'Missing required fields: caregiver_profile_id, slot_date, action' },
        { status: 400 }
      );
    }

    if (!['block', 'unblock'].includes(action)) {
      return Response.json({ error: 'Action must be "block" or "unblock"' }, { status: 400 });
    }

    // Verify caregiver owns the profile
    const profile = await base44.entities.CaregiverProfile.filter(
      { id: caregiver_profile_id, user_id: user.id }
    );
    if (profile.length === 0) {
      return Response.json(
        { error: 'Caregiver profile not found or not owned by you' },
        { status: 403 }
      );
    }

    // Validate date is not in past (for blocking only)
    if (action === 'block') {
      const today = new Date();
      const blockDate = new Date(slot_date);
      const todayStr = today.toISOString().split('T')[0];
      
      if (slot_date < todayStr) {
        return Response.json(
          { error: 'You cannot block past dates.' },
          { status: 400 }
        );
      }
    }

    // Check for active bookings on this date (for blocking only)
    if (action === 'block') {
      const bookedSlots = await base44.entities.AvailabilitySlot.filter({
        caregiver_profile_id,
        slot_date,
        status: 'booked'
      });

      if (bookedSlots.length > 0) {
        return Response.json(
          { error: 'This date has a confirmed booking. You cannot block it. Please resolve the booking first.' },
          { status: 400 }
        );
      }
    }

    // Fetch all slots on this date
    const slotsOnDate = await base44.entities.AvailabilitySlot.filter({
      caregiver_profile_id,
      slot_date
    });

    const isBlocked = action === 'block';

    if (blockAllSlots && slotsOnDate.length > 0) {
      // Batch update: block/unblock all existing slots on this date
      for (const slot of slotsOnDate) {
        await base44.entities.AvailabilitySlot.update(slot.id, {
          is_blocked: isBlocked
        });
      }
      
      return Response.json({
        success: true,
        message: `${action === 'block' ? 'Blocked' : 'Unblocked'} ${slotsOnDate.length} slot(s) on ${slot_date}`,
        updated_slots: slotsOnDate.length
      });
    }

    // Single full-day block: check if full-day block exists
    const fullDayBlock = slotsOnDate.find(s => s.start_time === '00:00' && s.end_time === '23:59');

    if (action === 'block') {
      if (fullDayBlock) {
        // Already blocked
        return Response.json({
          success: true,
          message: 'This date is already blocked.',
          slot_id: fullDayBlock.id
        });
      }

      // Create full-day block
      const newBlock = await base44.entities.AvailabilitySlot.create({
        caregiver_profile_id,
        caregiver_user_id: user.id,
        slot_date,
        start_time: '00:00',
        end_time: '23:59',
        is_blocked: true,
        status: 'open',
        notes: 'Full-day block'
      });

      return Response.json({
        success: true,
        message: 'Date blocked successfully.',
        slot_id: newBlock.id
      });
    } else {
      // Unblock
      if (!fullDayBlock) {
        return Response.json({
          success: true,
          message: 'This date is not blocked.'
        });
      }

      await base44.entities.AvailabilitySlot.update(fullDayBlock.id, {
        is_blocked: false
      });

      return Response.json({
        success: true,
        message: 'Block removed successfully.',
        slot_id: fullDayBlock.id
      });
    }
  } catch (error) {
    console.error('Error in blockAvailabilityDate:', error);
    return Response.json(
      { error: 'Failed to process block action' },
      { status: 500 }
    );
  }
});