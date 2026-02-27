import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

/**
 * Entity automation handler: fires when a User record is created.
 * Responsible for:
 *   1. Creating the role-appropriate profile (CaregiverProfile or ParentProfile)
 *   2. Creating the EmailVerificationToken
 *   3. Sending the verification email
 *
 * Automations run with full server privileges, bypassing RLS on custom entities.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();

        // Support both automation payload shape and direct test calls
        const user = payload.data || payload;

        if (!user || !user.id) {
            return Response.json({ error: 'Invalid payload: missing user data' }, { status: 400 });
        }

        const { id: userId, full_name, app_role, email } = user;

        if (!email) {
            return Response.json({ error: 'User missing email' }, { status: 400 });
        }

        const results = {};

        // 1. Create role-appropriate profile
        if (app_role === 'parent') {
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
        } else if (app_role === 'caregiver') {
            const existing = await base44.asServiceRole.entities.CaregiverProfile.filter({ user_id: userId });
            if (!existing || existing.length === 0) {
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
                results.profile = 'CaregiverProfile created';
            } else {
                results.profile = 'CaregiverProfile already exists';
            }
        } else {
            results.profile = `Skipped - role is ${app_role}`;
        }

        // 2. Create email verification token (only for parent/caregiver roles)
        if (['parent', 'caregiver'].includes(app_role)) {
            const tokenBytes = new Uint8Array(32);
            crypto.getRandomValues(tokenBytes);
            const verificationToken = Array.from(tokenBytes)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            await base44.asServiceRole.entities.EmailVerificationToken.create({
                user_id: userId,
                token: verificationToken,
                expires_at: expiresAt.toISOString()
            });
            results.token = 'EmailVerificationToken created';

            // 3. Send verification email
            const baseUrl = Deno.env.get('BASE_URL') || 'https://yourdomain.com';
            const verificationLink = `${baseUrl}/verify?token=${verificationToken}`;
            const displayName = full_name || 'there';

            await base44.asServiceRole.integrations.Core.SendEmail({
                to: email,
                subject: 'Verify your email address',
                body: `Hello ${displayName},

Thank you for registering! Please verify your email address by clicking the link below:

${verificationLink}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

Best regards,
The Team`
            });
            results.email = 'Verification email sent';
        }

        return Response.json({ success: true, results });

    } catch (error) {
        console.error('createProfileAndVerification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});