import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // (2) Reject if already onboarded
        if (user.onboarding_complete) {
            return Response.json({ error: 'Role already selected' }, { status: 409 });
        }

        // Parse body
        let body;
        try {
            body = await req.json();
        } catch {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { role, display_name } = body;

        // (3) Validate role
        if (!['parent', 'caregiver'].includes(role)) {
            return Response.json({ error: 'Invalid role. Must be parent or caregiver.' }, { status: 400 });
        }

        // (4) Update User record: set app_role and onboarding_complete
        await base44.asServiceRole.entities.User.update(user.id, {
            app_role: role,
            onboarding_complete: true
        });

        let profile = null;

        try {
            if (role === 'caregiver') {
                // (5) Generate slug from display_name (from registration form) or full_name fallback
                const baseName = (display_name || user.full_name || 'caregiver')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .substring(0, 60) || 'caregiver';

                // Check for slug collisions
                let slug = baseName;
                let suffix = 2;
                while (true) {
                    const existing = await base44.asServiceRole.entities.CaregiverProfile.filter({ slug });
                    if (!existing || existing.length === 0) break;
                    slug = `${baseName}-${suffix}`;
                    suffix++;
                }

                profile = await base44.asServiceRole.entities.CaregiverProfile.create({
                    user_id: user.id,
                    slug,
                    display_name: display_name || user.full_name || 'New Caregiver',
                    is_verified: false,
                    is_published: false,
                    completion_pct: 0
                });

            } else if (role === 'parent') {
                // (6) Create ParentProfile
                profile = await base44.asServiceRole.entities.ParentProfile.create({
                    user_id: user.id,
                    display_name: display_name || user.full_name || 'New Parent'
                });

                // F-096 Triggers.1: Create first Household automatically.
                // zip_code omitted here — user hasn't entered one yet; filled in during onboarding.
                await base44.asServiceRole.entities.Household.create({
                    parent_id: user.id,
                    nickname: 'My Home',
                    has_pets: false,
                    pet_count: 0,
                    child_count: 0,
                    is_primary: true,
                    is_active: true
                });

                // F-099: Set onboarding_step=1 (email not yet verified, or 2 if already verified)
                // Fix: use email_verified (not is_email_verified — wrong field name)
                const onboardingStep = user.email_verified ? 2 : 1;
                await base44.asServiceRole.entities.User.update(user.id, {
                    onboarding_step: onboardingStep,
                    onboarding_complete: false
                });
            }
        } catch (profileError) {
            // (7) Roll back: clear app_role and onboarding_complete
            await base44.asServiceRole.entities.User.update(user.id, {
                app_role: null,
                onboarding_complete: false
            }).catch(() => {});

            console.error('Profile creation failed, rolled back user changes:', profileError.message);
            return Response.json({ error: 'Profile creation failed. Please try again.' }, { status: 500 });
        }

        console.log(`initializeRole AUDIT: user_id=${user.id} role=${role} timestamp=${new Date().toISOString()}`);
        return Response.json({ success: true, role, profile });

    } catch (error) {
        console.error('initializeRole error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
