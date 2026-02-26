import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

/**
 * F-047: Profile Completion Indicator
 * Calculates and updates completion_pct for CaregiverProfile
 * Runs as automation on every profile write
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { event } = await req.json();

        if (event.type !== 'update' && event.type !== 'create') {
            return Response.json({ success: true });
        }

        const profileId = event.entity_id;
        const profile = await base44.asServiceRole.entities.CaregiverProfile.read(profileId);

        if (!profile) {
            return Response.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Calculate completion based on 6 required fields
        let completedFields = 0;

        // 1. Profile photo (not null)
        if (profile.profile_photo_url) completedFields++;

        // 2. Bio (not null and not empty after trim)
        if (profile.bio && profile.bio.trim().length > 0) completedFields++;

        // 3. Hourly rate (not null and > 0)
        if (profile.hourly_rate_cents && profile.hourly_rate_cents > 0) completedFields++;

        // 4. Services offered (at least 1 item)
        if (profile.services_offered && profile.services_offered.trim().length > 0) {
            const services = profile.services_offered.split(',').map(s => s.trim()).filter(s => s.length > 0);
            if (services.length > 0) completedFields++;
        }

        // 5. Age groups (at least 1 item)
        if (profile.age_groups && profile.age_groups.trim().length > 0) {
            const groups = profile.age_groups.split(',').map(g => g.trim()).filter(g => g.length > 0);
            if (groups.length > 0) completedFields++;
        }

        // 6. Is verified (must be true)
        if (profile.is_verified === true) completedFields++;

        // Calculate percentage: (completed / 6) * 100, rounded to nearest integer
        const completionPct = Math.round((completedFields / 6) * 100);
        const oldPct = profile.completion_pct || 0;

        // Update profile with new completion percentage
        const updated = await base44.asServiceRole.entities.CaregiverProfile.update(profileId, {
            completion_pct: completionPct
        });

        // Log completion change for analytics
        if (oldPct !== completionPct) {
            console.log(`Profile ${profileId} completion changed: ${oldPct}% → ${completionPct}%`);
        }

        return Response.json({
            success: true,
            profile_id: profileId,
            completion_pct: completionPct,
            fields_completed: completedFields
        });

    } catch (error) {
        console.error('Profile completion calculation error:', error);
        return Response.json({ 
            error: error.message || 'Calculation failed' 
        }, { status: 500 });
    }
});