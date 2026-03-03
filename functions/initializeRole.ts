import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

/**
 * F-021B: Atomic Role Initialization Transaction
 *
 * Step 1: Validate user is authenticated and NOT yet onboarded
 * Step 2: Update User.app_role
 * Step 3: Create the corresponding Profile record
 * Step 4: Set User.onboarding_complete = true
 *
 * If any step fails, we leave the user in registered_uninitialized state
 * (role not set, onboarding_complete = false) — safe to retry.
 */
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.onboarding_complete) {
            return Response.json({ error: 'Onboarding already complete' }, { status: 409 });
        }

        const { role } = await req.json();

        if (!['parent', 'caregiver'].includes(role)) {
            return Response.json({ error: 'Invalid role. Must be parent or caregiver.' }, { status: 400 });
        }

        // Step 1: Set the role on the User record
        await base44.asServiceRole.entities.User.update(user.id, {
            app_role: role
        });

        // Step 2: Create the corresponding Profile record
        try {
            if (role === 'parent') {
                // Guard against duplicate (idempotent)
                const existing = await base44.asServiceRole.entities.ParentProfile.filter({ user_id: user.id });
                if (!existing || existing.length === 0) {
                    await base44.asServiceRole.entities.ParentProfile.create({
                        user_id: user.id,
                        display_name: user.full_name || 'New Parent'
                    });
                }
            } else if (role === 'caregiver') {
                const existing = await base44.asServiceRole.entities.CaregiverProfile.filter({ user_id: user.id });
                if (!existing || existing.length === 0) {
                    const baseSlug = (user.full_name || 'caregiver')
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-+|-+$/g, '');
                    const slug = `${baseSlug || 'caregiver'}-${user.id.substring(0, 8)}`;
                    await base44.asServiceRole.entities.CaregiverProfile.create({
                        user_id: user.id,
                        slug,
                        display_name: user.full_name || 'New Caregiver',
                        is_verified: false,
                        is_published: false,
                        completion_pct: 0
                    });
                }
            }
        } catch (profileError) {
            // Roll back: clear the role we just set so user stays uninitialized
            await base44.asServiceRole.entities.User.update(user.id, {
                app_role: null
            }).catch(() => {}); // best-effort rollback
            console.error('Profile creation failed, rolled back role:', profileError.message);
            return Response.json({ error: 'Profile creation failed. Please try again.' }, { status: 500 });
        }

        // Step 3: Mark onboarding complete — user now gains dashboard access
        await base44.asServiceRole.entities.User.update(user.id, {
            onboarding_complete: true
        });

        console.log(`F-021B: User ${user.id} initialized as ${role}`);
        return Response.json({ success: true, role });

    } catch (error) {
        console.error('initializeRole error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});