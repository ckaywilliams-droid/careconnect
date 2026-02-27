import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

/**
 * Entity automation handler: fires when a User record is created via native Base44 auth.
 * Responsible for:
 *   1. Creating the role-appropriate profile (CaregiverProfile or ParentProfile)
 *   2. Creating the EmailVerificationToken
 *   3. Sending the verification email
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();

        // Support both automation payload shape and direct test calls
        const data = payload.data || payload;

        if (!data || !data.id) {
            return Response.json({ error: 'Invalid payload: missing user data' }, { status: 400 });
        }

        const { id: userId, full_name, app_role, email } = data;

        if (!email) {
            return Response.json({ error: 'User missing email' }, { status: 400 });
        }

        const results = {};

        // 1. Create role-appropriate profile
        if (app_role === 'caregiver') {
            try {
                const existing = await base44.asServiceRole.entities.CaregiverProfile.filter({ user_id: userId });
                if (!existing || existing.length === 0) {
                    const baseSlug = (full_name || '')
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-+|-+$/g, '');
                    const slug = `${baseSlug || 'caregiver'}-${userId.substring(0, 8)}`;

                    await base44.asServiceRole.entities.CaregiverProfile.create({
                        user_id: userId,
                        slug: slug,
                        display_name: full_name || 'New Caregiver',
                        is_verified: false,
                        is_published: false,
                        completion_pct: 0
                    });
                    results.profile = 'CaregiverProfile created';
                } else {
                    results.profile = 'CaregiverProfile already exists';
                }
            } catch (profileError) {
                console.error('CaregiverProfile.create failed:', profileError.message);
                results.profile = `CaregiverProfile failed: ${profileError.message}`;
            }
        } else if (app_role === 'parent') {
            try {
                const existing = await base44.asServiceRole.entities.ParentProfile.filter({ user_id: userId });
                if (!existing || existing.length === 0) {
                    await base44.asServiceRole.entities.ParentProfile.create({
                        user_id: userId,
                        display_name: full_name || 'New Parent'
                    });
                    results.profile = 'ParentProfile created';
                } else {
                    results.profile = 'ParentProfile already exists';
                }
            } catch (profileError) {
                console.error('ParentProfile.create failed:', profileError.message);
                results.profile = `ParentProfile failed: ${profileError.message}`;
            }
        } else {
            results.profile = `Skipped - role is ${app_role}`;
        }

        // 2. Create email verification token (only for parent/caregiver roles)
        if (['parent', 'caregiver'].includes(app_role)) {
            try {
                const tokenBytes = new Uint8Array(32);
                crypto.getRandomValues(tokenBytes);
                const verificationToken = Array.from(tokenBytes)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');

                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

                await base44.asServiceRole.entities.EmailVerificationToken.create({
                    user_id: userId,
                    token: verificationToken,
                    expires_at: expiresAt
                });
                results.token = 'EmailVerificationToken created';

                // Note: Base44 native auth sends the verification email automatically.
                results.email = 'Skipped - handled by native auth';
            } catch (tokenError) {
                console.error('EmailVerificationToken.create failed:', tokenError.message);
                results.token = `Token creation failed: ${tokenError.message}`;
            }
        }

        return Response.json({ success: true, results });

    } catch (error) {
        console.error('createProfileAndVerification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});