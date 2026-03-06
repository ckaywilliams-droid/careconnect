import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * F-057: Create Availability Slot
 * Securely creates an availability slot for the authenticated caregiver.
 * Server-side: Validates caregiver ownership and populates caregiver_user_id.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.app_role !== 'caregiver') {
      return Response.json({ error: 'Only caregivers can create availability slots' }, { status: 403 });
    }

    const { caregiver_profile_id, slot_date, start_time, end_time, notes } = await req.json();

    // Validate required fields
    if (!caregiver_profile_id || !slot_date || !start_time || !end_time) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the caregiver owns this profile
    const caregiverProfile = await base44.entities.CaregiverProfile.get(caregiver_profile_id);
    
    if (!caregiverProfile) {
      return Response.json({ error: 'Caregiver profile not found' }, { status: 404 });
    }

    if (caregiverProfile.user_id !== user.id) {
      return Response.json({ error: 'You can only create slots for your own profile' }, { status: 403 });
    }

    // Create the availability slot with server-populated caregiver_user_id
    const slot = await base44.entities.AvailabilitySlot.create({
      caregiver_profile_id,
      caregiver_user_id: user.id,
      slot_date,
      start_time,
      end_time,
      notes: notes || null
    });

    return Response.json({ success: true, slot });
  } catch (error) {
    console.error('Error creating availability slot:', error);
    return Response.json({ error: error.message || 'Failed to create availability slot' }, { status: 500 });
  }
});