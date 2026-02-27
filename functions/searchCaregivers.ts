import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

const PAGE_SIZE = 20;

Deno.serve(async (req) => {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    try {
        const base44 = createClientFromRequest(req);

        // Parse request body
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
            sort = 'newest',
            page: rawPage = 1,
        } = body;

        // Errors.1: Clamp invalid pages to 1
        const page = Math.max(1, parseInt(rawPage) || 1);

        // --- Build filter object ---
        // Data.3: Mandatory base conditions — always applied
        const filter = {
            is_published: true,
            is_deleted: false,
        };

        // Optional filters (AND logic — Logic.2)
        if (verified === true || verified === 'true') filter.is_verified = true;
        if (city) filter.city = city;
        if (state) filter.state = state;
        if (zip) filter.zip_code = zip;
        if (age_group) filter.age_groups = { $contains: age_group };
        if (service) filter.services_offered = { $contains: service };

        // Sort mapping — Data.4 default: newest first
        let sortField = '-created_date';
        if (sort === 'rate_asc') sortField = 'hourly_rate_cents';
        else if (sort === 'rate_desc') sortField = '-hourly_rate_cents';
        else if (sort === 'rating') sortField = '-average_rating';

        // Fetch all matching profiles for total_count
        const allResults = await base44.asServiceRole.entities.CaregiverProfile.filter(filter, sortField, 1000);

        // Additional JS-level filtering that can't be done via entity filter
        let filtered = allResults;

        if (min_rate !== undefined && min_rate !== null && min_rate !== '') {
            const minCents = parseInt(min_rate) * 100;
            filtered = filtered.filter(c => c.hourly_rate_cents >= minCents);
        }
        if (max_rate !== undefined && max_rate !== null && max_rate !== '') {
            const maxCents = parseInt(max_rate) * 100;
            filtered = filtered.filter(c => c.hourly_rate_cents <= maxCents);
        }

        const total_count = filtered.length;
        const total_pages = Math.max(1, Math.ceil(total_count / PAGE_SIZE));
        const clampedPage = Math.min(page, total_pages);

        // Paginate
        const start = (clampedPage - 1) * PAGE_SIZE;
        const pageResults = filtered.slice(start, start + PAGE_SIZE);

        // Data.2: Sanitise output — never expose sensitive fields
        const sanitised = pageResults.map(c => ({
            id: c.id,
            slug: c.slug,
            display_name: c.display_name,
            profile_photo_url: c.profile_photo_url || null,
            hourly_rate_cents: c.hourly_rate_cents || null,
            services_offered: c.services_offered || null,
            age_groups: c.age_groups || null,
            is_verified: c.is_verified || false,
            average_rating: c.average_rating || null,
            total_reviews: c.total_reviews || 0,
            city: c.city || null,
            state: c.state || null,
            bio: c.bio ? c.bio.substring(0, 200) : null,
            experience_years: c.experience_years || null,
            created_date: c.created_date,
        }));

        return Response.json({
            results: sanitised,
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