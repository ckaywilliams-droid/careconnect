import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

/**
 * Entity automation handler: fires when a User record is created via native Base44 auth.
 * Only responsible for creating the role-appropriate profile.
 * Base44 native auth handles all email verification automatically.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { data } = await req.json();

        if (!data?.id || !data?.app_role) {
            console.error('Missing user data:', data);
            return Response.json({ error: 'Missing user data' }, { status: 400 });
        }

        if (data.app_role === 'caregiver') {
            const baseSlug = (data.full_name || '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '');
            const slug = `${baseSlug || 'caregiver'}-${data.id.substring(0, 8)}`;

            try {
                await base44.asServiceRole.entities.CaregiverProfile.create({
                    user_id: data.id,
                    slug: slug,
                    display_name: data.full_name,
                    is_verified: false,
                    is_published: false,
                    completion_pct: 0
                });
                console.log('CaregiverProfile created for user:', data.id);
            } catch (e) {
                console.error('CaregiverProfile.create failed:', e.message, e.code);
                throw e;
            }
        }

        if (data.app_role === 'parent') {
            try {
                await base44.asServiceRole.entities.ParentProfile.create({
                    user_id: data.id,
                    display_name: data.full_name
                });
                console.log('ParentProfile created for user:', data.id);
            } catch (e) {
                console.error('ParentProfile.create failed:', e.message, e.code);
                throw e;
            }
        }

        return Response.json({ success: true });

    } catch (error) {
        console.error('createProfileAndVerification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});