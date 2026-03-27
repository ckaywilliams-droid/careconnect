/**
 * Computes a caregiver's profile completion percentage (0-100)
 * based on the 6 required fields checked in the ProfileCompletion widget.
 * Use this as the single source of truth — do not read completion_pct from the DB.
 *
 * @param {object} profile - CaregiverProfile object
 * @returns {number} integer 0–100
 */
export function computeCompletionPct(profile) {
    const checks = [
        !!profile?.profile_photo_url,
        !!profile?.bio && profile.bio.trim().length > 0,
        !!profile?.hourly_rate_cents && profile.hourly_rate_cents > 0,
        !!profile?.services_offered && profile.services_offered.split(',').some(s => s.trim()),
        !!profile?.age_groups && profile.age_groups.split(',').some(g => g.trim()),
        profile?.is_verified === true,
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
}
