import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, X, MapPin, Calendar, ShieldCheck } from 'lucide-react';
import SearchFilters from '@/components/search/SearchFilters';
import CaregiverCard from '@/components/search/CaregiverCard';

const TODAY = new Date().toISOString().split('T')[0];

const EMPTY_FILTERS = {
    city: '',
    state: '',
    zip: '',
    date: TODAY,
    time_from: '',
    time_to: '',
    age_groups: [],
    service: '',
    languages: '',
    verified: false,
    min_rate: '',
    max_rate: '',
    sort: 'newest',
};

const VALID_AGE_GROUPS = new Set(['newborn_0_1', 'toddler_1_3', 'preschool_3_5', 'school_age_5_12', 'teenager_13_17']);

function filtersToParams(filters) {
    const p = new URLSearchParams();
    if (filters.city) p.set('city', filters.city);
    if (filters.state) p.set('state', filters.state);
    if (filters.zip) p.set('zip', filters.zip);
    if (filters.date && filters.date !== TODAY) p.set('date', filters.date);
    if (filters.time_from) p.set('time_from', filters.time_from);
    if (filters.time_to) p.set('time_to', filters.time_to);
    if (Array.isArray(filters.age_groups) && filters.age_groups.length > 0)
        filters.age_groups.forEach(v => p.append('age', v));
    if (filters.service) p.set('service', filters.service);
    if (filters.languages) p.set('languages', filters.languages);
    if (filters.verified) p.set('verified', 'true');
    if (filters.min_rate) p.set('min_rate', filters.min_rate);
    if (filters.max_rate) p.set('max_rate', filters.max_rate);
    if (filters.sort && filters.sort !== 'newest') p.set('sort', filters.sort);
    return p;
}

function paramsToFilters(searchParams) {
    const rawAgeGroups = searchParams.getAll('age').filter(v => VALID_AGE_GROUPS.has(v));
    return {
        city: searchParams.get('city') || '',
        state: searchParams.get('state') || '',
        zip: searchParams.get('zip') || '',
        date: searchParams.get('date') || TODAY,
        time_from: searchParams.get('time_from') || '',
        time_to: searchParams.get('time_to') || '',
        age_groups: rawAgeGroups,
        service: searchParams.get('service') || '',
        languages: searchParams.get('languages') || '',
        verified: searchParams.get('verified') === 'true',
        min_rate: searchParams.get('min_rate') || '',
        max_rate: searchParams.get('max_rate') || '',
        sort: searchParams.get('sort') || 'newest',
    };
}

function countActiveFilters(filters) {
    let count = 0;
    if (filters.city) count++;
    if (filters.state) count++;
    if (filters.zip) count++;
    if (filters.date && filters.date !== TODAY) count++;
    if (filters.time_from) count++;
    if (filters.time_to) count++;
    if (Array.isArray(filters.age_groups) && filters.age_groups.length > 0) count++;
    if (filters.service) count++;
    if (filters.languages) count++;
    if (filters.verified) count++;
    if (filters.min_rate) count++;
    if (filters.max_rate) count++;
    return count;
}

export default function FindCaregivers() {
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);

    const [user, setUser] = useState(null);
    const [filters, setFilters] = useState(() => paramsToFilters(searchParams));
    const [results, setResults] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    useEffect(() => {
        base44.auth.me().then(setUser).catch(() => setUser(null));
    }, []);

    const runSearch = useCallback(async (filtersToSearch, page) => {
        setLoading(true);
        setError(null);
        try {
            const payload = {
                city: filtersToSearch.city || undefined,
                state: filtersToSearch.state || undefined,
                zip: filtersToSearch.zip || undefined,
                date: filtersToSearch.date || undefined,
                time_from: filtersToSearch.time_from || undefined,
                time_to: filtersToSearch.time_to || undefined,
                age_groups: (Array.isArray(filtersToSearch.age_groups) && filtersToSearch.age_groups.length > 0)
                    ? filtersToSearch.age_groups : undefined,
                service: filtersToSearch.service || undefined,
                languages: filtersToSearch.languages || undefined,
                verified: filtersToSearch.verified || undefined,
                min_rate: filtersToSearch.min_rate || undefined,
                max_rate: filtersToSearch.max_rate || undefined,
                sort: filtersToSearch.sort || 'newest',
                page,
            };
            const response = await base44.functions.invoke('searchCaregivers', payload);
            const data = response.data;
            setResults(data.results || []);
            setTotalCount(data.total_count || 0);
            setTotalPages(data.total_pages || 1);
            setCurrentPage(data.current_page || 1);
        } catch (err) {
            setError('Something went wrong loading results. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Run search on mount (pre-populates from URL params — UI.2)
    useEffect(() => {
        runSearch(filters, currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const syncUrl = useCallback((newFilters, page) => {
        const p = filtersToParams(newFilters);
        if (page > 1) p.set('page', page);
        const qs = p.toString();
        navigate(`${createPageUrl('FindCaregivers')}${qs ? '?' + qs : ''}`, { replace: true });
    }, [navigate]);

    const handleApply = useCallback((newFilters) => {
        const f = newFilters || filters;
        setCurrentPage(1);
        syncUrl(f, 1);
        runSearch(f, 1);
        setShowMobileFilters(false);
    }, [filters, syncUrl, runSearch]);

    const handleFiltersChangeAndSearch = (newFilters) => {
        if (newFilters._trigger !== filters._trigger) {
            const { _trigger, ...cleanFilters } = newFilters;
            setFilters(cleanFilters);
            handleApply(cleanFilters);
        } else {
            setFilters(newFilters);
        }
    };

    const handleReset = () => {
        setFilters(EMPTY_FILTERS);
        setCurrentPage(1);
        navigate(createPageUrl('FindCaregivers'), { replace: true });
        runSearch(EMPTY_FILTERS, 1);
    };

    const handlePageChange = (page) => {
        setCurrentPage(page);
        syncUrl(filters, page);
        runSearch(filters, page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Quick search bar submit (top bar)
    const handleQuickSearch = () => handleApply(filters);

    const activeFilterCount = countActiveFilters(filters);

    // Human-readable date for empty state
    const displayDate = filters.date
        ? new Date(filters.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;

    return (
        <div className="min-h-screen bg-[#F7F5F2]">
            {/* ── Sticky Top Nav ── */}
            <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
                <div className="container mx-auto px-4">
                    <div className="flex items-center gap-3 h-14">
                        {/* Logo */}
                        <Link to={createPageUrl('Home')} className="flex items-center gap-1.5 shrink-0 mr-2">
                            <span className="text-xl">🧡</span>
                            <span className="font-bold text-gray-900 hidden sm:block">CareNest</span>
                        </Link>

                        {/* Primary search bar */}
                        <div className="flex flex-1 items-center gap-2 border border-gray-200 rounded-lg bg-gray-50 px-3 py-1.5 max-w-2xl">
                            <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                            <Input
                                className="border-0 bg-transparent p-0 text-sm focus-visible:ring-0 h-auto"
                                placeholder="City or zip code"
                                value={filters.city}
                                onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleQuickSearch(); }}
                            />
                            <div className="w-px h-5 bg-gray-200 shrink-0" />
                            <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                            <Input
                                type="date"
                                className="border-0 bg-transparent p-0 text-sm focus-visible:ring-0 h-auto w-36"
                                value={filters.date}
                                min={TODAY}
                                onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
                            />
                            <Button
                                size="sm"
                                className="bg-[#C36239] hover:bg-[#75290F] text-white shrink-0 h-7 px-3"
                                onClick={handleQuickSearch}
                            >
                                <Search className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-2 ml-auto">
                            <Button
                                variant="outline"
                                size="sm"
                                className="md:hidden flex items-center gap-1"
                                onClick={() => setShowMobileFilters(v => !v)}
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                {activeFilterCount > 0 && (
                                    <Badge className="bg-[#C36239] text-white text-xs">{activeFilterCount}</Badge>
                                )}
                            </Button>
                            {user ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="hidden sm:flex"
                                    onClick={() => {
                                        const pg = user.app_role === 'parent' ? 'ParentDashboard' :
                                            user.app_role === 'caregiver' ? 'CaregiverProfile' : 'AdminDashboard';
                                        navigate(createPageUrl(pg));
                                    }}
                                >
                                    My Dashboard
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="hidden sm:flex"
                                        onClick={() => base44.auth.redirectToLogin(window.location.href)}
                                    >
                                        Sign In
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="bg-[#C36239] hover:bg-[#75290F] text-white hidden sm:flex"
                                        onClick={() => navigate(createPageUrl('Register'))}
                                    >
                                        Join Free
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-5">
                {/* Results count bar */}
                <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                            {loading ? (
                                <Skeleton className="h-4 w-44" />
                            ) : (
                                <>
                                    <span className="font-semibold text-gray-900">{totalCount.toLocaleString()}</span>{' '}
                                    caregiver{totalCount !== 1 ? 's' : ''} available
                                    {filters.date && (
                                        <> on <span className="font-medium text-gray-800">{displayDate}</span></>
                                    )}
                                    {(filters.city || filters.zip) && (
                                        <> in <span className="font-medium text-gray-800">{filters.city || filters.zip}</span></>
                                    )}
                                </>
                            )}
                        </div>
                        {activeFilterCount > 0 && (
                            <button
                                className="text-sm text-[#C36239] hover:underline flex items-center gap-1"
                                onClick={handleReset}
                            >
                                <X className="w-3 h-3" /> Clear filters
                            </button>
                        )}
                    </div>

                    {/* F-066 UI.2: Active filter chips */}
                    {filters.verified && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => handleFiltersChangeAndSearch({ ...filters, verified: false })}
                                className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2.5 py-0.5 text-xs font-medium hover:bg-amber-200 transition-colors"
                            >
                                <ShieldCheck className="w-3 h-3" />
                                Verified only
                                <X className="w-3 h-3 ml-0.5" />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex gap-5">
                    {/* ── Desktop Filter Sidebar ── */}
                    <aside className="hidden md:block w-60 shrink-0">
                        <SearchFilters
                            filters={filters}
                            onChange={handleFiltersChangeAndSearch}
                            onReset={handleReset}
                            activeCount={activeFilterCount}
                        />
                    </aside>

                    {/* ── Mobile Filter Drawer ── */}
                    {showMobileFilters && (
                        <div className="fixed inset-0 z-40 md:hidden">
                            <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilters(false)} />
                            <div className="absolute right-0 top-0 h-full w-80 bg-white shadow-xl overflow-y-auto p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="font-semibold text-gray-900">Filters</span>
                                    <button onClick={() => setShowMobileFilters(false)}>
                                        <X className="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>
                                <SearchFilters
                                    filters={filters}
                                    onChange={handleFiltersChangeAndSearch}
                                    onReset={handleReset}
                                    activeCount={activeFilterCount}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Results Grid ── */}
                    <div className="flex-1 min-w-0">
                        {error && (
                            <Alert variant="destructive" className="mb-4">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm">
                                        <Skeleton className="h-48 w-full" />
                                        <div className="p-4 space-y-2">
                                            <Skeleton className="h-4 w-2/3" />
                                            <Skeleton className="h-3 w-1/2" />
                                            <Skeleton className="h-3 w-full" />
                                            <Skeleton className="h-8 w-full mt-2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : results.length === 0 ? (
                            /* Empty state — F-073 */
                            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                                <div className="text-5xl mb-4">🔍</div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                    No caregivers available
                                    {displayDate && <> on {displayDate}</>}
                                    {(filters.city || filters.zip) && (
                                        <> in {filters.city || filters.zip}</>
                                    )}
                                </h3>
                                <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm">
                                    {filters.zip && !filters.date
                                        ? `No caregivers found in zip code ${filters.zip}. Try a nearby zip code or remove the location filter.`
                                        : filters.date && !filters.zip
                                        ? `No caregivers are available on ${displayDate}. Try a different date or browse all caregivers without a date filter.`
                                        : filters.date && filters.zip
                                        ? `No caregivers are available on ${displayDate} in zip code ${filters.zip}. Try adjusting your filters.`
                                        : 'Try a different date, expand your search area, or remove some filters to see more results.'
                                    }
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <Button
                                        variant="outline"
                                        onClick={handleReset}
                                        className="border-[#C36239] text-[#C36239] hover:bg-[#C36239] hover:text-white"
                                    >
                                        Clear all filters
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {results.map(caregiver => (
                                        <CaregiverCard
                                            key={caregiver.id}
                                            caregiver={caregiver}
                                            user={user}
                                            requestedDate={filters.date}
                                        />
                                    ))}
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-center gap-2 mt-8">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage <= 1}
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>

                                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                            let p;
                                            if (totalPages <= 7) {
                                                p = i + 1;
                                            } else if (currentPage <= 4) {
                                                p = i < 5 ? i + 1 : i === 5 ? '...' : totalPages;
                                            } else if (currentPage >= totalPages - 3) {
                                                p = i === 0 ? 1 : i === 1 ? '...' : totalPages - (6 - i);
                                            } else {
                                                const map = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
                                                p = map[i];
                                            }
                                            if (p === '...') {
                                                return <span key={i} className="px-2 text-gray-400 text-sm">…</span>;
                                            }
                                            return (
                                                <Button
                                                    key={i}
                                                    variant={p === currentPage ? 'default' : 'outline'}
                                                    size="sm"
                                                    className={p === currentPage ? 'bg-[#C36239] text-white border-[#C36239]' : ''}
                                                    onClick={() => typeof p === 'number' && handlePageChange(p)}
                                                >
                                                    {p}
                                                </Button>
                                            );
                                        })}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage >= totalPages}
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}

                                <p className="text-center text-xs text-gray-400 mt-3">
                                    Page {currentPage} of {totalPages} · {totalCount} results
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}