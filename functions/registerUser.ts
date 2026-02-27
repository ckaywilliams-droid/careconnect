import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';
import bcrypt from 'npm:bcryptjs';

/**
 * F-021: User Registration Backend Function
 * 
 * Handles new user registration with email verification flow.
 * Creates User, Profile, and EmailVerificationToken entities.
 * Sends verification email with token link.
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
        const newUser = await base44.asServiceRole.entities.User.create({
            full_name: trimmedName,
            email: normalizedEmail,
            password_hash: hashedPassword,
            app_role: role,
            role: role,
            email_verified: false
        });

        // NOTE: Profile (CaregiverProfile / ParentProfile) is created lazily on first
        // dashboard visit after login, because asServiceRole cannot write custom entities
        // in an unauthenticated request context. Role is stored on the User record so
        // the dashboard knows which profile type to create.

        // Generate verification token (64 random hex chars)
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const verificationToken = Array.from(tokenBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Store verification token
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await base44.asServiceRole.entities.EmailVerificationToken.create({
            user_id: newUser.id,
            token: verificationToken,
            expires_at: expiresAt.toISOString()
        });

        // Get base URL for verification link
        const baseUrl = Deno.env.get('BASE_URL') || 'https://yourdomain.com';
        const verificationLink = `${baseUrl}/verify?token=${verificationToken}`;

        // Send verification email
        await base44.asServiceRole.integrations.Core.SendEmail({
            to: normalizedEmail,
            subject: 'Verify your email address',
            body: `Hello ${trimmedName},

Thank you for registering! Please verify your email address by clicking the link below:

${verificationLink}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

Best regards,
The Team`
        });

        return Response.json({ 
            message: 'Registration successful! Please check your email to verify your account.',
            email: normalizedEmail
        }, { status: 201 });

    } catch (error) {
        console.error('Registration error:', error);
        return Response.json({ error: error.message || 'Registration failed' }, { status: 500 });
    }
});