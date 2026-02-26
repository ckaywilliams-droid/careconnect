import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * F-044: AUTO-UNPUBLISH ON FIELD REMOVAL
 * 
 * Automatically unpublishes a caregiver profile when any of the 6 gate conditions
 * from F-043 become unmet. Fires on every CaregiverProfile update.
 * 
 * FEATURES:
 * - F-044 Logic.1: Evaluates all 6 gate conditions after update
 * - F-044 States.2: Instantaneous unpublish when conditions fail
 * - F-044 Logic.3: Sends notification email with specific field name
 * - F-044 Triggers.3: Only notifies if profile was previously published
 * - F-044 Abuse.1: Detects >3 auto-unpublish events in 1 hour
 * - F-044 Audit.1: Logs every auto-unpublish event
 * 
 * PAYLOAD:
 * - event: { type: 'update', entity_name: 'CaregiverProfile', entity_id: string }
 * - data: updated CaregiverProfile record
 * - old_data: previous CaregiverProfile record
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    // Handle payload_too_large case
    let currentProfile = data;
    let previousProfile = old_data;
    
    if (!currentProfile) {
      currentProfile = await base44.asServiceRole.entities.CaregiverProfile.get(event.entity_id);
    }
    
    if (!previousProfile) {
      // If old_data not available, we can't determine if it was previously published
      // Skip auto-unpublish for safety
      console.log('[autoUnpublishProfile] Skipping - old_data not available');
      return Response.json({ success: true, message: 'Skipped - no old_data' });
    }

    // F-044 Logic.1: Only act if profile was previously published
    if (!previousProfile.is_published) {
      // Profile wasn't published, no need to unpublish
      return Response.json({ success: true, message: 'Profile was not published' });
    }

    // F-044 Logic.2: Evaluate all 6 gate conditions on current state
    const gateCheck = validateGateConditions(currentProfile);

    if (gateCheck.passed) {
      // All conditions still met, profile can remain published
      return Response.json({ success: true, message: 'All gate conditions met' });
    }

    // F-044 States.1: Gate conditions failed - auto-unpublish
    console.log(`[autoUnpublishProfile] Auto-unpublishing profile ${currentProfile.id}: ${gateCheck.failureReasons.join(', ')}`);

    // F-044 Abuse.1: Check for repeated auto-unpublish abuse
    await checkAutoUnpublishAbuse(base44, currentProfile.id);

    // Unpublish the profile
    await base44.asServiceRole.entities.CaregiverProfile.update(event.entity_id, {
      is_published: false
    });

    // F-044 Audit.1: Log auto-unpublish event
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_user_id: 'SYSTEM',
      admin_role: 'system',
      action_type: 'content_removed',
      target_entity_type: 'CaregiverProfile',
      target_entity_id: currentProfile.id,
      reason: `Auto-unpublish: ${gateCheck.failureReasons.join(', ')}`,
      payload: JSON.stringify({
        before: { is_published: true },
        after: { is_published: false },
        failed_conditions: gateCheck.failedFields
      })
    });

    // F-044 Logic.3, Triggers.2: Send notification email immediately
    await sendUnpublishNotification(base44, currentProfile, gateCheck.failedFields);

    return Response.json({ 
      success: true, 
      message: 'Profile auto-unpublished',
      failed_conditions: gateCheck.failedFields
    });

  } catch (error) {
    console.error('[autoUnpublishProfile] Error:', error);
    
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});

/**
 * F-044 Logic.2: Validate all 6 gate conditions from F-043
 * Returns detailed information about failed conditions
 */
function validateGateConditions(profile) {
  const failedFields = [];
  const failureReasons = [];

  // Condition 6: is_verified
  if (!profile.is_verified) {
    failedFields.push('is_verified');
    failureReasons.push('verification badge');
  }

  // Condition 1: profile_photo
  if (!profile.profile_photo_url || profile.profile_photo_url.trim() === '') {
    failedFields.push('profile_photo_url');
    failureReasons.push('profile photo');
  }

  // Condition 2: bio (with whitespace trimming)
  const bioTrimmed = profile.bio ? profile.bio.trim() : '';
  if (bioTrimmed.length === 0) {
    failedFields.push('bio');
    failureReasons.push('bio');
  }

  // Condition 3: hourly_rate
  if (!profile.hourly_rate_cents || profile.hourly_rate_cents <= 0) {
    failedFields.push('hourly_rate_cents');
    failureReasons.push('hourly rate');
  }

  // Condition 4: services_offered
  const services = profile.services_offered ? profile.services_offered.split(',').filter(s => s.trim()) : [];
  if (services.length === 0) {
    failedFields.push('services_offered');
    failureReasons.push('services offered');
  }

  // Condition 5: age_groups
  const ageGroups = profile.age_groups ? profile.age_groups.split(',').filter(a => a.trim()) : [];
  if (ageGroups.length === 0) {
    failedFields.push('age_groups');
    failureReasons.push('age groups');
  }

  return {
    passed: failedFields.length === 0,
    failedFields,
    failureReasons
  };
}

/**
 * F-044 Logic.3: Send notification email about auto-unpublish
 * Uses human-readable field names
 */
async function sendUnpublishNotification(base44, profile, failedFields) {
  try {
    // Get user email
    const user = await base44.asServiceRole.entities.User.get(profile.user_id);
    if (!user || !user.email) {
      console.warn(`[autoUnpublishProfile] Cannot send email - user ${profile.user_id} not found or has no email`);
      return;
    }

    // F-044 Logic.3: Map technical field names to human-readable
    const fieldNameMap = {
      'is_verified': 'verification badge',
      'profile_photo_url': 'profile photo',
      'bio': 'bio',
      'hourly_rate_cents': 'hourly rate',
      'services_offered': 'services offered',
      'age_groups': 'age groups'
    };

    const humanReadableFields = failedFields
      .map(f => fieldNameMap[f] || f)
      .join(', ');

    const subject = 'Your Caregiver Profile Has Been Unpublished';
    const body = `
Hi ${user.full_name || 'there'},

Your caregiver profile has been automatically unpublished because the following required field(s) were removed or cleared:

${humanReadableFields}

To make your profile visible to parents again, please:
1. Go to your profile editor
2. Restore the missing field(s)
3. Click "Publish Profile"

If you have any questions, please contact our support team.

Best regards,
The Care Team
    `.trim();

    // F-044 Triggers.2: Send email immediately via Resend
    const emailResponse = await base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: subject,
      body: body
    });

    // F-044 Audit.2: Log email delivery status
    console.log(`[autoUnpublishProfile] Email sent to ${user.email}: profile_id=${profile.id}, response=${JSON.stringify(emailResponse)}`);

  } catch (error) {
    console.error('[autoUnpublishProfile] Failed to send notification email:', error);
    // Don't throw - email failure shouldn't block the unpublish
  }
}

/**
 * F-044 Abuse.1: Detect repeated auto-unpublish events (>3 in 1 hour)
 */
async function checkAutoUnpublishAbuse(base44, profileId) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Query recent auto-unpublish events for this profile
    const recentEvents = await base44.asServiceRole.entities.AdminActionLog.filter({
      target_entity_type: 'CaregiverProfile',
      target_entity_id: profileId,
      action_type: 'content_removed',
      admin_user_id: 'SYSTEM',
      action_timestamp: { $gte: oneHourAgo }
    });

    if (recentEvents.length >= 3) {
      // F-044 Abuse.1: Create AbuseAlert
      await base44.asServiceRole.entities.AbuseAlert.create({
        alert_type: 'other',
        source_user_id: null,
        source_ip: null,
        description: `Repeated auto-unpublish events for CaregiverProfile ${profileId} - ${recentEvents.length} events in last hour. Possible credential compromise or automation abuse.`,
        severity: 'high',
        reviewed: false,
        metadata: JSON.stringify({
          profile_id: profileId,
          event_count: recentEvents.length,
          time_window: '1 hour'
        })
      });

      console.warn(`[autoUnpublishProfile] ABUSE ALERT: ${recentEvents.length} auto-unpublish events in 1 hour for profile ${profileId}`);
    }
  } catch (error) {
    console.error('[autoUnpublishProfile] Failed to check abuse:', error);
    // Don't throw - abuse check failure shouldn't block the unpublish
  }
}