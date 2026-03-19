import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// F-097: Child CRUD — create, update, soft-delete
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.app_role !== 'parent') return Response.json({ error: 'Parents only.' }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
        const { household_id, first_name, date_of_birth, allergies, notes, special_needs_flag } = body;

        if (!household_id) return Response.json({ error: 'household_id required.' }, { status: 400 });
        if (!first_name || !first_name.trim()) return Response.json({ error: "Please enter the child's name or nickname." }, { status: 400 });
        if (!date_of_birth) return Response.json({ error: 'date_of_birth required.' }, { status: 400 });

        // Verify household belongs to parent
        const hhs = await base44.entities.Household.filter({ id: household_id, parent_id: user.id, is_active: true });
        if (!hhs || hhs.length === 0) return Response.json({ error: 'Household not found.' }, { status: 404 });

        // F-097 Logic.3: date_of_birth cannot be in future
        if (new Date(date_of_birth) > new Date()) {
            return Response.json({ error: 'Date of birth cannot be in the future.' }, { status: 400 });
        }

        // Abuse.1: max 10 active children per household
        const existing = await base44.entities.Child.filter({ household_id, is_active: true });
        if (existing.length >= 10) return Response.json({ error: 'Maximum children reached for this household.' }, { status: 400 });

        const age_group = calcAgeGroup(date_of_birth);

        const sanitize = (s, max) => s ? s.replace(/<[^>]*>/g, '').substring(0, max) : null;

        const child = await base44.asServiceRole.entities.Child.create({
            household_id,
            parent_id: user.id,
            first_name: first_name.trim().substring(0, 50),
            date_of_birth,
            age_group,
            allergies: sanitize(allergies, 500),
            notes: sanitize(notes, 250),
            special_needs_flag: special_needs_flag || false,
            is_active: true
        });

        // Increment household child_count
        const hh = hhs[0];
        await base44.asServiceRole.entities.Household.update(household_id, {
            child_count: (hh.child_count || 0) + 1
        });

        // F-099 Triggers.2: evaluate onboarding gate
        await evaluateOnboardingGate(base44, user);

        console.log(`CHILD_AUDIT: created child_id=${child.id} household_id=${household_id} parent_id=${user.id} ts=${new Date().toISOString()}`);
        return Response.json({ success: true, child });
    }

    if (action === 'update') {
        const { child_id, first_name, date_of_birth, allergies, notes, special_needs_flag } = body;
        if (!child_id) return Response.json({ error: 'child_id required.' }, { status: 400 });

        const children = await base44.entities.Child.filter({ id: child_id, parent_id: user.id });
        if (!children || children.length === 0) return Response.json({ error: 'Not found.' }, { status: 404 });

        if (date_of_birth && new Date(date_of_birth) > new Date()) {
            return Response.json({ error: 'Date of birth cannot be in the future.' }, { status: 400 });
        }

        const sanitize = (s, max) => s ? s.replace(/<[^>]*>/g, '').substring(0, max) : null;

        const updateData = {};
        if (first_name !== undefined) updateData.first_name = first_name.trim().substring(0, 50);
        if (date_of_birth !== undefined) {
            updateData.date_of_birth = date_of_birth;
            updateData.age_group = calcAgeGroup(date_of_birth);
        }
        if (allergies !== undefined) updateData.allergies = sanitize(allergies, 500);
        if (notes !== undefined) updateData.notes = sanitize(notes, 250);
        if (special_needs_flag !== undefined) updateData.special_needs_flag = special_needs_flag;

        const updated = await base44.asServiceRole.entities.Child.update(child_id, updateData);
        return Response.json({ success: true, child: updated });
    }

    if (action === 'delete') {
        const { child_id } = body;
        if (!child_id) return Response.json({ error: 'child_id required.' }, { status: 400 });

        const children = await base44.entities.Child.filter({ id: child_id, parent_id: user.id });
        if (!children || children.length === 0) return Response.json({ error: 'Not found.' }, { status: 404 });
        const child = children[0];

        // F-097 Edge.1: block if in active booking
        const activeStatuses = ['pending', 'accepted', 'in_progress'];
        const allBookings = await base44.asServiceRole.entities.BookingRequest.filter({ parent_user_id: user.id });
        const blocked = (allBookings || []).some(b =>
            activeStatuses.includes(b.status) &&
            Array.isArray(b.children_ids) && b.children_ids.includes(child_id)
        );
        if (blocked) {
            return Response.json({ error: 'This child is included in an active booking. You cannot remove them until the booking is completed or cancelled.' }, { status: 400 });
        }

        await base44.asServiceRole.entities.Child.update(child_id, { is_active: false });

        // Decrement household child_count
        const hhs = await base44.asServiceRole.entities.Household.filter({ id: child.household_id });
        if (hhs && hhs.length > 0) {
            const hh = hhs[0];
            await base44.asServiceRole.entities.Household.update(hh.id, {
                child_count: Math.max(0, (hh.child_count || 1) - 1)
            });
        }

        // F-099 States.2: check if last child removed → regress onboarding
        const remainingChildren = await base44.asServiceRole.entities.Child.filter({ parent_id: user.id, is_active: true });
        if (!remainingChildren || remainingChildren.length === 0) {
            await base44.asServiceRole.entities.User.update(user.id, {
                onboarding_complete: false,
                onboarding_step: 2
            });
            console.log(`ONBOARDING_GATE: regressed user_id=${user.id} event=child_deleted ts=${new Date().toISOString()}`);
        }

        console.log(`CHILD_AUDIT: soft-deleted child_id=${child_id} household_id=${child.household_id} parent_id=${user.id} ts=${new Date().toISOString()}`);
        return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action.' }, { status: 400 });
});

function calcAgeGroup(dob) {
    const birth = new Date(dob);
    const today = new Date();
    const ageMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
    const ageYears = ageMonths / 12;
    if (ageYears < 2) return 'infant';
    if (ageYears < 4) return 'toddler';
    if (ageYears < 6) return 'preschool';
    if (ageYears < 13) return 'school_age';
    return 'teen';
}

async function evaluateOnboardingGate(base44, user) {
    try {
        if (!user.is_email_verified) return;
        const households = await base44.asServiceRole.entities.Household.filter({ parent_id: user.id, is_active: true });
        if (!households || households.length === 0) return;

        const hasAddressHousehold = households.some(h => h.street_address && h.city && h.state);
        if (!hasAddressHousehold) {
            // Advance step if not already beyond step 3
            const currentStep = user.onboarding_step || 1;
            if (currentStep < 3) {
                await base44.asServiceRole.entities.User.update(user.id, { onboarding_step: 3 });
            }
            return;
        }

        const children = await base44.asServiceRole.entities.Child.filter({ parent_id: user.id, is_active: true });
        if (!children || children.length === 0) return;

        const petsHouseholds = households.filter(h => h.has_pets);
        for (const hh of petsHouseholds) {
            const pets = await base44.asServiceRole.entities.Pet.filter({ household_id: hh.id, is_active: true });
            if (!pets || pets.length === 0) return;
        }

        await base44.asServiceRole.entities.User.update(user.id, {
            onboarding_complete: true,
            onboarding_step: 5
        });
        console.log(`ONBOARDING_GATE: completed user_id=${user.id} event=child_added ts=${new Date().toISOString()}`);
    } catch (e) {
        console.error('evaluateOnboardingGate error:', e.message);
    }
}