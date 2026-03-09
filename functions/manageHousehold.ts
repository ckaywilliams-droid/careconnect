import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// F-096: Household CRUD — create, update, soft-delete
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.app_role !== 'parent') return Response.json({ error: 'Parents only.' }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
        const existing = await base44.entities.Household.filter({ parent_id: user.id, is_active: true });
        if (existing.length >= 5) {
            return Response.json({ error: 'Maximum households reached.' }, { status: 400 });
        }

        const { nickname, zip_code, has_pets, special_instructions } = body;

        const safeInstructions = special_instructions
            ? special_instructions.replace(/<[^>]*>/g, '').substring(0, 250)
            : null;

        const household = await base44.asServiceRole.entities.Household.create({
            parent_id: user.id,
            nickname: nickname || 'My Home',
            zip_code,
            has_pets: has_pets || false,
            pet_count: 0,
            child_count: 0,
            special_instructions: safeInstructions,
            is_primary: existing.length === 0,
            is_active: true
        });

        console.log(`HOUSEHOLD_AUDIT: created household_id=${household.id} parent_id=${user.id} ts=${new Date().toISOString()}`);
        return Response.json({ success: true, household });
    }

    if (action === 'update') {
        const { household_id, nickname, zip_code, street_address, city, state, has_pets, special_instructions, is_primary } = body;
        if (!household_id) return Response.json({ error: 'household_id required.' }, { status: 400 });

        // Use get() instead of filter() for single-record lookup
        const hh = await base44.asServiceRole.entities.Household.get(household_id);
        if (!hh || hh.parent_id !== user.id) return Response.json({ error: 'Not found.' }, { status: 404 });

        const safeInstructions = special_instructions !== undefined
            ? (special_instructions ? special_instructions.replace(/<[^>]*>/g, '').substring(0, 250) : null)
            : hh.special_instructions;

        const updateData = {};
        if (nickname !== undefined) updateData.nickname = nickname;
        if (zip_code !== undefined) updateData.zip_code = zip_code;
        if (street_address !== undefined) updateData.street_address = street_address;
        if (city !== undefined) updateData.city = city;
        if (state !== undefined) updateData.state = state;
        if (has_pets !== undefined) updateData.has_pets = has_pets;
        if (special_instructions !== undefined) updateData.special_instructions = safeInstructions;

        // F-096 States.2: is_primary transition — run in parallel with update
        const sideEffects = [];

        if (is_primary === true && !hh.is_primary) {
            sideEffects.push(
                base44.asServiceRole.entities.Household.filter({ parent_id: user.id, is_active: true, is_primary: true })
                    .then(allPrimary => Promise.all(
                        allPrimary.filter(h => h.id !== household_id)
                            .map(h => base44.asServiceRole.entities.Household.update(h.id, { is_primary: false }))
                    ))
            );
            updateData.is_primary = true;
        }

        // F-096 Triggers.2: if has_pets toggled to false, soft-delete all pets in parallel
        if (has_pets === false && hh.has_pets === true) {
            sideEffects.push(
                base44.asServiceRole.entities.Pet.filter({ household_id, is_active: true })
                    .then(pets => Promise.all(
                        pets.map(pet => base44.asServiceRole.entities.Pet.update(pet.id, { is_active: false }))
                    ))
            );
            updateData.pet_count = 0;
        }

        // Run the household update and all side effects in parallel
        const [updated] = await Promise.all([
            base44.asServiceRole.entities.Household.update(household_id, updateData),
            ...sideEffects
        ]);

        // F-099 Triggers.3: if address now complete, evaluate onboarding gate
        if (street_address && city && state) {
            await evaluateOnboardingGate(base44, user);
        }

        console.log(`HOUSEHOLD_AUDIT: updated household_id=${household_id} parent_id=${user.id} ts=${new Date().toISOString()}`);
        return Response.json({ success: true, household: updated });
    }

    if (action === 'delete') {
        const { household_id } = body;
        if (!household_id) return Response.json({ error: 'household_id required.' }, { status: 400 });

        const hh = await base44.asServiceRole.entities.Household.get(household_id);
        if (!hh || hh.parent_id !== user.id) return Response.json({ error: 'Not found.' }, { status: 404 });

        // F-096 Edge.2: block if active bookings
        const activeStatuses = ['pending', 'accepted', 'in_progress'];
        const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({ parent_user_id: user.id });
        const hasActive = (activeBookings || []).some(b => activeStatuses.includes(b.status));
        if (hasActive) {
            return Response.json({ error: 'This household has active bookings. Cancel or complete all active bookings before removing this household.' }, { status: 400 });
        }

        await base44.asServiceRole.entities.Household.update(household_id, { is_active: false });

        // F-096 Logic.3: promote another household to primary if this was primary
        if (hh.is_primary) {
            const remaining = await base44.asServiceRole.entities.Household.filter({ parent_id: user.id, is_active: true });
            if (remaining.length > 0) {
                remaining.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
                await base44.asServiceRole.entities.Household.update(remaining[0].id, { is_primary: true });
            }
        }

        console.log(`HOUSEHOLD_AUDIT: soft-deleted household_id=${household_id} parent_id=${user.id} ts=${new Date().toISOString()}`);
        return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action.' }, { status: 400 });
});

async function evaluateOnboardingGate(base44, user) {
    try {
        if (!user.is_email_verified) return;

        // Fetch households and children in parallel
        const [households, children] = await Promise.all([
            base44.asServiceRole.entities.Household.filter({ parent_id: user.id, is_active: true }),
            base44.asServiceRole.entities.Child.filter({ parent_id: user.id, is_active: true })
        ]);

        if (!households || households.length === 0) return;
        if (!households.some(h => h.street_address && h.city && h.state)) return;
        if (!children || children.length === 0) return;

        // Check pets for each household that has_pets=true
        const petsHouseholds = households.filter(h => h.has_pets);
        if (petsHouseholds.length > 0) {
            const petsResults = await Promise.all(
                petsHouseholds.map(hh => base44.asServiceRole.entities.Pet.filter({ household_id: hh.id, is_active: true }))
            );
            if (petsResults.some(pets => !pets || pets.length === 0)) return;
        }

        await base44.asServiceRole.entities.User.update(user.id, {
            onboarding_complete: true,
            onboarding_step: 5
        });
        console.log(`ONBOARDING_GATE: completed user_id=${user.id} event=address_confirmed ts=${new Date().toISOString()}`);
    } catch (e) {
        console.error('evaluateOnboardingGate error:', e.message);
    }
}