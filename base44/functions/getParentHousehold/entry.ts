import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Returns all households + children + pets for the logged-in parent
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.app_role !== 'parent') return Response.json({ error: 'Parents only.' }, { status: 403 });

    const [households, children, pets] = await Promise.all([
        base44.asServiceRole.entities.Household.filter({ parent_id: user.id, is_active: true }),
        base44.asServiceRole.entities.Child.filter({ parent_id: user.id, is_active: true }),
        base44.asServiceRole.entities.Pet.filter({ parent_id: user.id, is_active: true })
    ]);

    return Response.json({ household: (households && households[0]) || null, children: children || [], pets: pets || [] });
});