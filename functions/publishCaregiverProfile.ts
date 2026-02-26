import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.app_role !== 'caregiver') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { profileId } = await req.json();

    // Fetch the caregiver profile
    const profile = await base44.asServiceRole.entities.CaregiverProfile.filter({
      id: profileId,
      user_id: user.id
    });

    if (!profile || profile.length === 0) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const currentProfile = profile[0];

    // Validation: Check all publishing conditions
    const errors = [];

    if (!currentProfile.profile_photo_url) {
      errors.push('Add a profile photo (JPEG or PNG, min 400x400px)');
    }

    if (!currentProfile.bio || currentProfile.bio.trim().length === 0) {
      errors.push('Write a bio (at least 1 character)');
    }

    if (!currentProfile.hourly_rate_cents || currentProfile.hourly_rate_cents <= 0) {
      errors.push('Set your hourly rate (must be greater than $0)');
    }

    if (!currentProfile.services_offered || currentProfile.services_offered.trim().length === 0) {
      errors.push('Select at least one service');
    }

    if (!currentProfile.age_groups || currentProfile.age_groups.trim().length === 0) {
      errors.push('Select at least one age group');
    }

    if (!currentProfile.is_verified) {
      errors.push('Background verification required (contact support)');
    }

    if (errors.length > 0) {
      return Response.json({ error: 'Profile is incomplete', details: errors }, { status: 400 });
    }

    // Publish the profile
    await base44.asServiceRole.entities.CaregiverProfile.update(profileId, {
      is_published: true
    });

    return Response.json({
      success: true,
      message: 'Profile published successfully',
      is_published: true
    });
  } catch (error) {
    console.error('Error publishing profile:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});