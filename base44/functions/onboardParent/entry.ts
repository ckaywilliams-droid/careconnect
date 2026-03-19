import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.app_role !== 'parent') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { parent, children, address } = await req.json();

    // 1. Upsert ParentProfile (phone, name, address all stored here — User entity has no phone field)
    const profiles = await base44.asServiceRole.entities.ParentProfile.filter({ user_id: user.id });
    const profileData = {
      user_id: user.id,
      display_name: `${parent.first_name} ${parent.last_name}`,
      phone: parent.phone,
      address_line_1: address.street,
      city: address.city,
      state: address.state,
      zip_code: address.zip,
    };
    if (profiles.length > 0) {
      await base44.asServiceRole.entities.ParentProfile.update(profiles[0].id, profileData);
    } else {
      await base44.asServiceRole.entities.ParentProfile.create(profileData);
    }

    // 3. Upsert Household (required as foreign key for Child records)
    const households = await base44.asServiceRole.entities.Household.filter({ parent_id: user.id, is_active: true });
    let householdId;
    if (households.length > 0) {
      householdId = households[0].id;
      await base44.asServiceRole.entities.Household.update(householdId, {
        has_pets: parent.has_pets,
        street_address: address.street,
        city: address.city,
        state: address.state,
        zip_code: address.zip,
      });
    } else {
      const hh = await base44.asServiceRole.entities.Household.create({
        parent_id: user.id,
        has_pets: parent.has_pets,
        street_address: address.street,
        city: address.city,
        state: address.state,
        zip_code: address.zip,
        is_primary: true,
        is_active: true,
      });
      householdId = hh.id;
    }

    // 4. Sync Child records — soft-delete removed ones, create new ones (prevents duplicates on re-submit)
    const existingChildren = await base44.asServiceRole.entities.Child.filter({ parent_id: user.id, is_active: true });

    // Soft-delete all existing active children first, then recreate from submitted list
    for (const ec of existingChildren) {
      await base44.asServiceRole.entities.Child.update(ec.id, { is_active: false });
    }

    for (const child of children) {
      const months = (Date.now() - new Date(child.date_of_birth)) / (1000 * 60 * 60 * 24 * 30.44);
      const age_group = months < 12 ? 'infant' : months < 36 ? 'toddler' : months < 60 ? 'preschool' : months < 156 ? 'school_age' : 'teen';
      await base44.asServiceRole.entities.Child.create({
        household_id: householdId,
        parent_id: user.id,
        first_name: child.first_name,
        date_of_birth: child.date_of_birth,
        age_group,
        is_active: true,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});