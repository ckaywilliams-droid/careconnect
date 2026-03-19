import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

/**
 * Entity automation handler: fires when a User record is created.
 * Creates the appropriate profile (CaregiverProfile or ParentProfile)
 * based on the user's app_role.
 *
 * Running as an automation gives full server-side privileges,
 * bypassing RLS on custom entities.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();

        // Support both automation payload and direct call
        const user = payload.data || payload;

        if (!user || !user.id) {
            return Response.json({ error: 'Invalid payload: missing user data' }, { status: 400 });
        }

        const { id: userId, full_name, app_role, onboarding_complete } = user;

        // Guard: Only create profiles for users who have explicitly completed onboarding
        // (i.e. initializeRole has run). If app_role is set but onboarding_complete is
        // false, it means the role was implicitly assigned — skip to avoid premature creation.
        if (!onboarding_complete) {
            console.log(`Skipping profile creation for user ${userId}: onboarding_complete=false. Awaiting explicit role selection.`);
            return Response.json({ message: 'Skipped: awaiting explicit role selection via initializeRole.' });
        }

        if (!['parent', 'caregiver'].includes(app_role)) {
            // Not a regular user role (e.g. admin created via another route) - skip
            return Response.json({ message: `Skipped profile creation for role: ${app_role}` });
        }

        if (app_role === 'parent') {
            const existing = await base44.asServiceRole.entities.ParentProfile.filter({ user_id: userId });
            if (existing && existing.length > 0) {
                return Response.json({ message: 'ParentProfile already exists' });
            }
            await base44.asServiceRole.entities.ParentProfile.create({
                user_id: userId,
                display_name: full_name || 'New Parent'
            });
            return Response.json({ message: 'ParentProfile created successfully' });
        }

        if (app_role === 'caregiver') {
            const existing = await base44.asServiceRole.entities.CaregiverProfile.filter({ user_id: userId });
            if (existing && existing.length > 0) {
                return Response.json({ message: 'CaregiverProfile already exists' });
            }
            const baseSlug = (full_name || 'caregiver')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '');
            const slug = baseSlug || `caregiver-${userId.substring(0, 8)}`;

            await base44.asServiceRole.entities.CaregiverProfile.create({
                user_id: userId,
                slug: slug,
                display_name: full_name || 'New Caregiver'
            });
            return Response.json({ message: 'CaregiverProfile created successfully' });
        }

    } catch (error) {
        console.error('createProfileOnUserCreate error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});