import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

const PAGE_SIZE = 20;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));

        const {
            zip,
            city,
            state,
            age_group,
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

        const page = Math.max(1, parseInt(rawPage) || 1);

        // Mandatory base conditions (Data.3): is_published=true, profile_status=active
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
        if (age_group) filter.age_groups = { $contains: age_group };
        if (service) filter.services_offered = { $contains: service };
        if (languages) filter.languages = { $contains: languages };

        // Sort
        let sortField = '-created_date';
        if (sort === 'rate_asc') sortField = 'hourly_rate_cents';
        else if (sort === 'rate_desc') sortField = '-hourly_rate_cents';
        else if (sort === 'rating') sortField = '-average_rating';

        // Fetch profiles
        let profiles = await base44.asServiceRole.entities.CaregiverProfile.filter(filter, sortField, 1000);

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

        // Sanitise output — never expose sensitive fields (Data.2)
        const results = pageResults.map(c => ({
            id: c.id,
            slug: c.slug,
            display_name: c.display_name,
            profile_photo_url: c.profile_photo_url || null,
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

        return Response.json({
            results,
            total_count,
            current_page: clampedPage,
            total_pages,
            has_next_page: clampedPage < total_pages,
        });

    } catch (error) {
        console.error('searchCaregivers error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});