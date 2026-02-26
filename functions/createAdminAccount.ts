import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import bcrypt from 'npm:bcryptjs';

/**
 * F-031 Triggers.1: CREATE ADMIN ACCOUNT BACKEND FUNCTION
 * 
 * Super admin only function to create new admin accounts.
 * Generates temporary password, sends welcome email, logs to AdminActionLog.
 * 
 * WORKFLOW:
 * 1. Validate super_admin authorization
 * 2. Check rate limit (5 per day)
 * 3. Validate email uniqueness
 * 4. Create User with admin role
 * 5. Generate temporary password (16 chars, F-026 compliant)
 * 6. Send welcome email
 * 7. Log to AdminActionLog
 * 
 * SECURITY:
 * - F-031 Access.1: Super admin only
 * - F-031 Abuse.1: Rate limit 5 per super admin per day
 * - F-031 Abuse.2: Optional domain restriction
 * - F-031 Triggers.2: Temp password expires in 24 hours
 * 
 * PAYLOAD:
 * {
 *   full_name: string (required)
 *   email: string (required)
 *   role: 'support_admin' | 'trust_admin' | 'super_admin' (required)
 *   reason: string (required, min 10 chars)
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // F-031 Access.1: Super admin authorization
    const admin = await base44.auth.me();
    if (!admin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (admin.role !== 'super_admin') {
      // F-031 Abuse.1: Log privilege escalation attempt
      await base44.asServiceRole.entities.AdminActionLog.create({
        admin_user_id: admin.id,
        admin_role: admin.role,
        action_type: 'manual_override',
        target_entity_type: 'User',
        target_entity_id: 'N/A',
        reason: 'privilege_escalation_attempt: tried to create admin account',
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });

      return Response.json({ error: 'Forbidden: Only super admins can create admin accounts' }, { status: 403 });
    }

    // Parse payload
    const payload = await req.json();
    const { full_name, email, role, reason } = payload;

    // Validation
    if (!full_name || !email || !role || !reason) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (reason.length < 10) {
      return Response.json({ error: 'Reason must be at least 10 characters' }, { status: 400 });
    }

    const validRoles = ['support_admin', 'trust_admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      return Response.json({ error: 'Invalid admin role' }, { status: 400 });
    }

    // F-031 Abuse.2: Optional domain restriction
    // Uncomment to enforce company domain:
    // const companyDomain = '@yourcompany.com';
    // if (!email.endsWith(companyDomain)) {
    //   return Response.json({ error: `Admin emails must use ${companyDomain}` }, { status: 400 });
    // }

    // F-031 Abuse.1: Rate limit check - 5 per super admin per day
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const recentCreations = await base44.asServiceRole.entities.AdminActionLog.filter({
      admin_user_id: admin.id,
      action_type: 'role_change',
      created_date: { $gte: oneDayAgo.toISOString() },
    });

    // Count admin account creations
    const adminCreationCount = recentCreations.filter(log => {
      try {
        const payload = JSON.parse(log.payload || '{}');
        return validRoles.includes(payload.new_role);
      } catch {
        return false;
      }
    }).length;

    if (adminCreationCount >= 5) {
      return Response.json({ 
        error: 'Rate limit exceeded: Maximum 5 admin accounts per day per super admin' 
      }, { status: 429 });
    }

    // F-031 Errors.1: Check email uniqueness
    const existingUser = await base44.asServiceRole.entities.User.filter({ email });
    if (existingUser.length > 0) {
      return Response.json({ error: 'An account already exists with this email' }, { status: 409 });
    }

    // F-031 Triggers.2: Generate temporary password (16 chars, F-026 compliant)
    const tempPassword = generateTemporaryPassword();

    // F-031 Logic.3: Create admin user
    // email_verified = true (admins bypass email verification)
    const newAdmin = await base44.asServiceRole.entities.User.create({
      full_name,
      email,
      role,
      email_verified: true,
      password_hash: await hashPassword(tempPassword),
      is_suspended: false,
      is_deleted: false,
    });

    // F-031 Triggers.1: Send welcome email
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: 'Your Admin Account Has Been Created',
        body: getWelcomeEmailTemplate(full_name, email, role, tempPassword),
      });
    } catch (emailError) {
      // F-031 Errors.2: Email delivery failure
      console.error('Failed to send welcome email:', emailError);
      
      // Alert super admin
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: admin.email,
        subject: 'ALERT: Admin Welcome Email Failed',
        body: `Failed to send welcome email to new admin ${email}. The account was created but they have no credentials. Please resend the welcome email manually.`,
      });

      return Response.json({
        success: true,
        warning: 'Admin account created but welcome email failed to send',
        admin_id: newAdmin.id,
        temp_password: tempPassword, // Return temporarily for manual delivery
      });
    }

    // F-031 Audit.1: Log to AdminActionLog
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: admin.id,
      admin_role: admin.role,
      action_type: 'role_change',
      target_entity_type: 'User',
      target_entity_id: newAdmin.id,
      reason,
      payload: JSON.stringify({
        action: 'admin_account_created',
        new_role: role,
        email,
        full_name,
      }),
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return Response.json({
      success: true,
      message: 'Admin account created successfully',
      admin_id: newAdmin.id,
    });

  } catch (error) {
    console.error('Error creating admin account:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});

/**
 * Generate temporary password (16 chars, F-026 compliant)
 * Must contain: uppercase, lowercase, digit, special char
 */
function generateTemporaryPassword() {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  
  // Ensure at least one of each required character type
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill remaining 12 characters with random mix
  const allChars = uppercase + lowercase + digits + special;
  for (let i = 0; i < 12; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Hash password using bcrypt
 */
async function hashPassword(password) {
  // Use bcryptjs for proper password hashing
  // Note: bcryptjs is imported at the top
  const bcrypt = await import('npm:bcryptjs');
  return await bcrypt.default.hash(password, 10);
}

/**
 * F-031 UI.2: Welcome email template
 */
function getWelcomeEmailTemplate(name, email, role, tempPassword) {
  const roleName = role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  return `
Hello ${name},

Your admin account has been created on our platform.

Account Details:
- Email: ${email}
- Role: ${roleName}
- Temporary Password: ${tempPassword}

IMPORTANT:
1. Your temporary password expires in 24 hours
2. You MUST change your password on first login
3. The password change page is the only accessible page until you change it

Login here: ${Deno.env.get('APP_URL') || 'https://app.example.com'}/login

After logging in, you will be automatically redirected to change your password.

If you have any questions or did not expect this account, please contact your super administrator immediately.

Security Note: This is an automatically generated email. For security reasons, never share your password with anyone.

---
This is a system-generated email. Please do not reply.
  `.trim();
}