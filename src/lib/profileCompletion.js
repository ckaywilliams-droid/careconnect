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