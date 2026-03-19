import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// F-098: Pet CRUD — create, update, soft-delete
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.app_role !== 'parent') return Response.json({ error: 'Parents only.' }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
        const { household_id, pet_name, pet_type, pet_size, pet_temperament, additional_notes } = body;

        if (!household_id) return Response.json({ error: 'household_id required.' }, { status: 400 });
        if (!pet_type) return Response.json({ error: 'pet_type is required.' }, { status: 400 });
        if (!pet_size) return Response.json({ error: 'pet_size is required.' }, { status: 400 });
        if (!pet_temperament) return Response.json({ error: 'pet_temperament is required.' }, { status: 400 });

        const hhs = await base44.entities.Household.filter({ id: household_id, parent_id: user.id, is_active: true });
        if (!hhs || hhs.length === 0) return Response.json({ error: 'Household not found.' }, { status: 404 });
        const hh = hhs[0];

        // F-098 Logic.1: must have has_pets=true
        if (!hh.has_pets) {
            return Response.json({ error: 'Please enable the pets option on this household first.' }, { status: 400 });
        }

        // Abuse.1: max 10 active pets per household
        const existing = await base44.entities.Pet.filter({ household_id, is_active: true });
        if (existing.length >= 10) return Response.json({ error: 'Maximum pets reached for this household.' }, { status: 400 });

        const sanitize = (s, max) => s ? s.replace(/<[^>]*>/g, '').substring(0, max) : null;

        const pet = await base44.asServiceRole.entities.Pet.create({
            household_id,
            parent_id: user.id,
            pet_name: pet_name ? pet_name.substring(0, 50) : null,
            pet_type,
            pet_size,
            pet_temperament,
            additional_notes: sanitize(additional_notes, 250),
            is_active: true
        });

        // F-098 Triggers.1: increment pet_count, ensure has_pets=true
        await base44.asServiceRole.entities.Household.update(household_id, {
            pet_count: (hh.pet_count || 0) + 1,
            has_pets: true
        });

        console.log(`PET_AUDIT: created pet_id=${pet.id} household_id=${household_id} pet_type=${pet_type} parent_id=${user.id} ts=${new Date().toISOString()}`);
        return Response.json({ success: true, pet });
    }

    if (action === 'update') {
        const { pet_id, pet_name, pet_type, pet_size, pet_temperament, additional_notes } = body;
        if (!pet_id) return Response.json({ error: 'pet_id required.' }, { status: 400 });

        const pets = await base44.entities.Pet.filter({ id: pet_id, parent_id: user.id });
        if (!pets || pets.length === 0) return Response.json({ error: 'Not found.' }, { status: 404 });

        const sanitize = (s, max) => s ? s.replace(/<[^>]*>/g, '').substring(0, max) : null;

        const updateData = {};
        if (pet_name !== undefined) updateData.pet_name = pet_name ? pet_name.substring(0, 50) : null;
        if (pet_type !== undefined) updateData.pet_type = pet_type;
        if (pet_size !== undefined) updateData.pet_size = pet_size;
        if (pet_temperament !== undefined) updateData.pet_temperament = pet_temperament;
        if (additional_notes !== undefined) updateData.additional_notes = sanitize(additional_notes, 250);

        const updated = await base44.asServiceRole.entities.Pet.update(pet_id, updateData);
        return Response.json({ success: true, pet: updated });
    }

    if (action === 'delete') {
        const { pet_id } = body;
        if (!pet_id) return Response.json({ error: 'pet_id required.' }, { status: 400 });

        const pets = await base44.entities.Pet.filter({ id: pet_id, parent_id: user.id });
        if (!pets || pets.length === 0) return Response.json({ error: 'Not found.' }, { status: 404 });
        const pet = pets[0];

        await base44.asServiceRole.entities.Pet.update(pet_id, { is_active: false });

        // F-098 Triggers.2: decrement pet_count, possibly set has_pets=false
        const hhs = await base44.asServiceRole.entities.Household.filter({ id: pet.household_id });
        if (hhs && hhs.length > 0) {
            const hh = hhs[0];
            const newCount = Math.max(0, (hh.pet_count || 1) - 1);
            await base44.asServiceRole.entities.Household.update(hh.id, {
                pet_count: newCount,
                has_pets: newCount > 0
            });
        }

        console.log(`PET_AUDIT: soft-deleted pet_id=${pet_id} household_id=${pet.household_id} parent_id=${user.id} ts=${new Date().toISOString()}`);
        return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action.' }, { status: 400 });
});