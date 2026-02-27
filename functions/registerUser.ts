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

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create User entity
        await base44.asServiceRole.entities.User.create({
            full_name: trimmedName,
            email: normalizedEmail,
            password_hash: hashedPassword,
            app_role: role,
            role: role,
            email_verified: false
        });

        // Attempt to send a welcome email (profile + verification token are created
        // lazily after first login, since custom entity writes require an authenticated context)
        try {
            const baseUrl = Deno.env.get('BASE_URL') || 'https://yourdomain.com';
            await base44.asServiceRole.integrations.Core.SendEmail({
                to: normalizedEmail,
                subject: 'Welcome! Please verify your account',
                body: `Hello ${trimmedName},

Thank you for registering! To complete your setup, please log in to your account:

${baseUrl}/login

After logging in, you will be guided to verify your email address.

Best regards,
The Team`
            });
        } catch (emailError) {
            // Non-fatal — user account is created, they can still log in
            console.error('Welcome email failed (non-fatal):', emailError.message);
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