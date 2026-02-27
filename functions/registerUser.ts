import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

/**
 * F-021: User Registration Backend Function
 *
 * Only creates the User record — custom entity creation (profile, verification token, email)
 * is handled by the "User Created" entity automation → createProfileAndVerification function.
 * This is because asServiceRole cannot write custom entities in an unauthenticated request context.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { full_name, email, password, role } = await req.json();

        // Input validation
        if (!full_name || !email || !password || !role) {
            return Response.json({ error: 'All fields are required' }, { status: 400 });
        }

        if (!['parent', 'caregiver'].includes(role)) {
            return Response.json({ error: 'Invalid role' }, { status: 400 });
        }

        const trimmedName = full_name.trim();
        if (trimmedName.length < 2 || trimmedName.length > 100) {
            return Response.json({ error: 'Name must be between 2 and 100 characters' }, { status: 400 });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return Response.json({ error: 'Invalid email format' }, { status: 400 });
        }

        if (password.length < 8) {
            return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check for duplicate email
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email: normalizedEmail });
        if (existingUsers && existingUsers.length > 0) {
            return Response.json({ error: 'Email already registered' }, { status: 409 });
        }

        // Hash password using native Deno Web Crypto (no external deps)
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashedPassword = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');

        // Create User entity — role is always "user", app_role carries the platform role
        await base44.asServiceRole.entities.User.create({
            full_name: trimmedName,
            email: normalizedEmail,
            password_hash: hashedPassword,
            app_role: role,
            role: 'user',
            email_verified: false,
            is_suspended: false,
            is_deleted: false
        });

        // Non-blocking: create email verification token
        try {
            const tokenBytes = new Uint8Array(32);
            crypto.getRandomValues(tokenBytes);
            const verificationToken = Array.from(tokenBytes)
                .map(b => b.toString(16).padStart(2, '0')).join('');
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            await base44.asServiceRole.entities.EmailVerificationToken.create({
                user_id: normalizedEmail, // will be updated once we can fetch by email
                token: verificationToken,
                expires_at: expiresAt
            });
        } catch (tokenError) {
            console.error('EmailVerificationToken creation failed (non-fatal):', tokenError.message);
        }

        return Response.json({
            message: 'Registration successful! Please check your email to verify your account.',
            email: normalizedEmail
        }, { status: 201 });

    } catch (error) {
        console.error('Registration error:', error);
        return Response.json({ error: error.message || 'Registration failed' }, { status: 500 });
    }
});