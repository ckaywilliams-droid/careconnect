import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

const PAGE_SIZE = 20;

// In-memory rate limit & scraping detection store (resets on cold start — acceptable for MVP)
const ipRequestLog = new Map(); // ip -> { count, windowStart }
const ipPageLog = new Map();    // ip -> { count, windowStart }

function getRateLimitBucket(map, ip, windowMs) {
    const now = Date.now();
    const bucket = map.get(ip) || { count: 0, windowStart: now };
    if (now - bucket.windowStart > windowMs) {
        bucket.count = 0;
        bucket.windowStart = now;
    }
    bucket.count++;
    map.set(ip, bucket);
    return bucket;
}

Deno.serve(async (req) => {
    const reqStart = Date.now();
    try {
        const base44 = createClientFromRequest(req);
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

        // ── Abuse.1: Rate limiting ──────────────────────────────────────────
        let authedUser = null;
        try { authedUser = await base44.auth.me(); } catch { /* unauthenticated */ }

        const rateLimit = authedUser ? 120 : 60;
        const rateBucket = getRateLimitBucket(ipRequestLog, ip, 60_000); // 1-minute window
        if (rateBucket.count > rateLimit) {
            return Response.json(
                { error: 'Too many requests. Please wait before searching again.' },
                { status: 429 }
            );
        }

        // ── Abuse.2: Scraping detection ─────────────────────────────────────
        const scrapeBucket = getRateLimitBucket(ipPageLog, ip, 3_600_000); // 1-hour window
        if (scrapeBucket.count > 500) {
            // Alert admin (fire-and-forget)
            base44.asServiceRole.entities.AbuseAlert.create({
                alert_type: 'scraping_detected',
                source_ip: ip,
                description: `Scraping detected: IP ${ip} made ${scrapeBucket.count} paginated search requests within 1 hour.`,
                severity: 'high',
                triggered_at: new Date().toISOString(),
            }).catch(() => {});
            return Response.json(
                { error: 'Too many requests. Please wait before searching again.' },
                { status: 429 }
            );
        }

        const body = await req.json().catch(() => ({}));

        const {
            zip,
            city,
            state,
            age_groups: rawAgeGroups,
            service,
            verified,
            min_rate,
            max_rate,
            date,
            time_from,
            time_to,
            languages,
            sort = 'newest',
            page: rawPage = 1,
        } = body;

        // F-065 Abuse.1: validate age_groups against canonical enum; strip invalid values
        const VALID_AGE_GROUPS = ['newborn_0_1', 'toddler_1_3', 'preschool_3_5', 'school_age_5_12', 'teenager_13_17'];
        const age_groups = Array.isArray(rawAgeGroups)
            ? rawAgeGroups.filter(v => VALID_AGE_GROUPS.includes(v))
            : [];

        const page = Math.max(1, parseInt(rawPage) || 1);

        // Mandatory base conditions (Data.3): is_published=true, profile_status=active, is_deleted=false
        const filter = {
            is_published: true,
            profile_status: 'active',
            is_deleted: false,
        };

        // Optional filters — AND logic
        if (verified === true || verified === 'true') filter.is_verified = true;
        if (city) filter.city = city;
        if (state) filter.state = state;

        // F-063 Logic.1: sanitise zip — strip non-alphanumeric, truncate to 10, trim
        if (zip) {
            const sanitisedZip = zip.replace(/[^a-zA-Z0-9]/g, '').trim().substring(0, 10);
            if (sanitisedZip) filter.zip_code = sanitisedZip;
        }
        // F-065 Logic.3: omit filter if no valid age groups selected
        // Post-fetch JS overlap filter applied below (Base44 doesn't support $overlap natively)
        if (service) filter.services_offered = { $contains: service };
        if (languages) filter.languages = { $contains: languages };

        // Sort
        let sortField = '-created_date';
        if (sort === 'rate_asc') sortField = 'hourly_rate_cents';
        else if (sort === 'rate_desc') sortField = '-hourly_rate_cents';
        else if (sort === 'rating') sortField = '-average_rating';

        // Fetch profiles
        let profiles = await base44.asServiceRole.entities.CaregiverProfile.filter(filter, sortField, 1000);

        // F-065 Logic.1/Data.3: Age group overlap filter (OR within group) — post-fetch JS
        // Applied before suspension check for efficiency
        if (age_groups.length > 0) {
            profiles = profiles.filter(c => {
                if (!c.age_groups) return false;
                const caregiverGroups = c.age_groups.split(',').map(v => v.trim());
                return age_groups.some(selected => caregiverGroups.includes(selected));
            });
        }

        // ── Data.3: Suspension exclusion — mandatory, hard-coded, cannot be bypassed ──
        // Fetch all suspended user IDs and exclude their profiles from results.
        const suspendedUsers = await base44.asServiceRole.entities.User.filter(
            { is_suspended: true },
            null,
            5000
        );
        const suspendedIds = new Set(suspendedUsers.map(u => u.id));
        profiles = profiles.filter(p => !suspendedIds.has(p.user_id));

        // JS-level rate filtering
        if (min_rate !== undefined && min_rate !== '') {
            const minCents = parseInt(min_rate) * 100;
            profiles = profiles.filter(c => c.hourly_rate_cents != null && c.hourly_rate_cents >= minCents);
        }
        if (max_rate !== undefined && max_rate !== '') {
            const maxCents = parseInt(max_rate) * 100;
            profiles = profiles.filter(c => c.hourly_rate_cents != null && c.hourly_rate_cents <= maxCents);
        }

        // F-064 Logic.2: validate date — reject past dates (server-side date check)
        let validatedDate = null;
        if (date) {
            const today = new Date().toISOString().split('T')[0];
            // F-064 Logic.3: reject malformed strings — treat as no filter
            const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(date);
            if (isValidFormat && date >= today) {
                validatedDate = date;
            }
            // past date or malformed: silently treat as no date filter (Logic.3)
        }

        // If a date is requested, join AvailabilitySlot to:
        // (a) filter to caregivers who have open slots on that date (Data.2)
        // (b) attach matching slot times to each card
        let slotsByCaregiver = {}; // caregiver_profile_id -> slots[]

        if (validatedDate) {
            const slots = await base44.asServiceRole.entities.AvailabilitySlot.filter(
                { slot_date: validatedDate, status: 'open', is_blocked: false },
                'start_time',
                1000
            );

            // Index by caregiver_profile_id
            for (const slot of slots) {
                if (!slotsByCaregiver[slot.caregiver_profile_id]) {
                    slotsByCaregiver[slot.caregiver_profile_id] = [];
                }
                // Optionally filter by requested time range
                let include = true;
                if (time_from && slot.end_time <= time_from) include = false;
                if (time_to && slot.start_time >= time_to) include = false;
                if (include) slotsByCaregiver[slot.caregiver_profile_id].push(slot);
            }

            // F-064 Logic.1 / Data.2: only keep caregivers with at least one open slot on the date
            profiles = profiles.filter(c => slotsByCaregiver[c.id] && slotsByCaregiver[c.id].length > 0);
        }

        const total_count = profiles.length;
        const total_pages = Math.max(1, Math.ceil(total_count / PAGE_SIZE));
        const clampedPage = Math.min(page, total_pages);
        const start = (clampedPage - 1) * PAGE_SIZE;
        const pageResults = profiles.slice(start, start + PAGE_SIZE);

        // ── Triggers.2: Generate signed URLs for profile photos (60-min expiry) ──
        const signedPhotoUrls = {};
        await Promise.all(pageResults.map(async (c) => {
            if (c.profile_photo_url) {
                try {
                    const result = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
                        file_uri: c.profile_photo_url,
                        expires_in: 3600,
                    });
                    signedPhotoUrls[c.id] = result.signed_url;
                } catch {
                    // If signing fails (e.g. already a public URL), use as-is
                    signedPhotoUrls[c.id] = c.profile_photo_url;
                }
            }
        }));

        // Sanitise output — never expose sensitive fields (Data.2)
        const results = pageResults.map(c => ({
            id: c.id,
            slug: c.slug,
            display_name: c.display_name,
            profile_photo_url: signedPhotoUrls[c.id] || null,
            hourly_rate_cents: c.hourly_rate_cents || null,
            services_offered: c.services_offered || null,
            age_groups: c.age_groups || null,
            languages: c.languages || null,
            is_verified: c.is_verified || false,
            average_rating: c.average_rating || null,
            total_reviews: c.total_reviews || 0,
            city: c.city || null,
            state: c.state || null,
            bio: c.bio ? c.bio.substring(0, 200) : null,
            experience_years: c.experience_years || null,
            created_date: c.created_date,
            // Available slots for requested date (for display on card)
            available_slots: validatedDate
                ? (slotsByCaregiver[c.id] || []).map(s => ({ start_time: s.start_time, end_time: s.end_time }))
                : [],
        }));

        const responsePayload = {
            results,
            total_count,
            current_page: clampedPage,
            total_pages,
            has_next_page: clampedPage < total_pages,
        };

        // ── Audit.1: Aggregate search logging (no user-identifying data) ──
        const responseTimeMs = Date.now() - reqStart;
        base44.asServiceRole.entities.AdminActionLog.create({
            admin_user_id: 'SYSTEM',
            admin_role: 'system',
            action_type: 'other',
            target_entity_type: 'CaregiverProfile',
            target_entity_id: 'search',
            reason: 'Aggregate search log — automated system entry',
            payload: JSON.stringify({
                type: 'search_request',
                timestamp: new Date().toISOString(),
                filters: { zip, city, state, age_groups, service, verified, min_rate, max_rate, date, time_from, time_to, languages, sort },
                page: clampedPage,
                result_count: total_count,
                response_time_ms: responseTimeMs,
            }),
            action_timestamp: new Date().toISOString(),
        }).catch(() => {}); // fire-and-forget — never block response

        return Response.json(responsePayload);

    } catch (error) {
        console.error('searchCaregivers error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});