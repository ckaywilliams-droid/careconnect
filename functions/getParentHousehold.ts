import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Returns all households + children + pets for the logged-in parent
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.app_role !== 'parent') return Response.json({ error: 'Parents only.' }, { status: 403 });

    const households = await base44.entities.Household.filter({ parent_id: user.id, is_active: true });
    const children = await base44.entities.Child.filter({ parent_id: user.id, is_active: true });
    const pets = await base44.entities.Pet.filter({ parent_id: user.id, is_active: true });

    return Response.json({ households: households || [], children: children || [], pets: pets || [] });
});