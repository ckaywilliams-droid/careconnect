import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // F-055 Audit.3: Admin-only function for monitoring soft-locks
    if (!user || !['support_admin', 'trust_admin', 'super_admin'].includes(user.app_role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query all soft-locked slots
    const softLockedSlots = await base44.asServiceRole.entities.AvailabilitySlot.filter({
      status: 'soft_locked'
    });

    const now = new Date();
    const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    // F-055 Edge.1 & Audit.3: Detect slots locked for more than 72 hours
    const indefiniteLocks = softLockedSlots.filter(slot => {
      const createdDate = new Date(slot.created_date);
      return createdDate < seventyTwoHoursAgo;
    });

    if (indefiniteLocks.length === 0) {
      return Response.json({
        success: true,
        message: 'No indefinite soft-locks detected',
        checked_at: now.toISOString()
      });
    }

    // Create admin alerts for indefinite locks
    for (const slot of indefiniteLocks) {
      try {
        await base44.asServiceRole.entities.AdminAlert.create({
          alert_type: 'indefinite_soft_lock',
          severity: 'medium',
          target_entity_type: 'AvailabilitySlot',
          target_entity_id: slot.id,
          message: `Slot ${slot.id} has been soft-locked for more than 72 hours. Caregiver: ${slot.caregiver_profile_id}.`,
          created_at: now.toISOString(),
          is_resolved: false
        });
      } catch (alertError) {
        console.warn(`Failed to create alert for soft-lock ${slot.id}:`, alertError);
      }
    }

    return Response.json({
      success: true,
      indefinite_locks_found: indefiniteLocks.length,
      slots: indefiniteLocks.map(slot => ({
        slot_id: slot.id,
        caregiver_profile_id: slot.caregiver_profile_id,
        slot_date: slot.slot_date,
        locked_since: slot.created_date,
        days_locked: Math.floor((now - new Date(slot.created_date)) / (24 * 60 * 60 * 1000))
      })),
      checked_at: now.toISOString()
    });
  } catch (error) {
    console.error('Error in detectIndefiniteSoftLocks:', error);
    return Response.json(
      { error: 'Failed to detect indefinite soft-locks' },
      { status: 500 }
    );
  }
});