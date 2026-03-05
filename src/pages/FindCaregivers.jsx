import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, X, MapPin, Calendar } from 'lucide-react';
import SearchFilters from '@/components/search/SearchFilters';
import CaregiverCard from '@/components/search/CaregiverCard';
import ActiveFilterChips from '@/components/search/ActiveFilterChips';
import EmptyState from '@/components/search/EmptyState';

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
    const [emptyVariant, setEmptyVariant] = useState('no_match');
    const secondaryAbortRef = useRef(null);

    useEffect(() => {
        base44.auth.me().then(setUser).catch(() => setUser(null));
    }, []);

    const runSearch = useCallback(async (filtersToSearch, page) => {
        setLoading(true);
        setError(null);
        // Cancel any in-flight secondary query
        if (secondaryAbortRef.current) {
            secondaryAbortRef.current = null;
        }
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

            // F-073: determine empty state variant when zero results
            if ((data.total_count || 0) === 0) {
                const hasLocation = !!(filtersToSearch.zip || filtersToSearch.city || filtersToSearch.state);
                const hasDate = !!(filtersToSearch.date && filtersToSearch.date !== TODAY);
                const hasVerified = !!filtersToSearch.verified;
                const activeCount = countActiveFilters(filtersToSearch);

                if (activeCount === 0) {
                    setEmptyVariant('no_platform');
                } else if (hasVerified && activeCount <= 2) {
                    setEmptyVariant('no_verified');
                } else if (hasLocation && hasDate) {
                    // F-073 Logic.1/2: secondary location-only query to distinguish no_area vs no_date
                    const queryId = Date.now();
                    secondaryAbortRef.current = queryId;
                    setEmptyVariant('no_match'); // fallback while secondary runs
                    const timeoutId = setTimeout(() => {
                        // Edge.1: if secondary takes >2s, fallback already shown
                        if (secondaryAbortRef.current === queryId) {
                            secondaryAbortRef.current = null;
                        }
                    }, 2000);
                    base44.functions.invoke('searchCaregivers', {
                        city: filtersToSearch.city || undefined,
                        state: filtersToSearch.state || undefined,
                        zip: filtersToSearch.zip || undefined,
                        sort: 'newest',
                        page: 1,
                    }).then(r => {
                        clearTimeout(timeoutId);
                        if (secondaryAbortRef.current !== queryId) return; // Edge.2: stale
                        secondaryAbortRef.current = null;
                        const count = r?.data?.total_count || 0;
                        setEmptyVariant(count > 0 ? 'no_date' : 'no_area');
                    }).catch(() => {
                        clearTimeout(timeoutId);
                        secondaryAbortRef.current = null;
                        // Edge.1: secondary failed — keep no_match
                    });
                } else if (hasLocation) {
                    setEmptyVariant('no_area');
                } else if (hasDate && activeCount === 1) {
                    setEmptyVariant('no_match');
                } else {
                    setEmptyVariant('no_match');
                }
            }
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
                {/* F-071 UI.3: Results count header */}
                <div className="mb-4 space-y-2">
                    <div className="text-sm text-gray-500">
                        {loading ? (
                            <Skeleton className="h-4 w-56" />
                        ) : (
                            <>
                                <span className="font-semibold text-gray-900">{totalCount.toLocaleString()}</span>{' '}
                                caregiver{totalCount !== 1 ? 's' : ''} found
                                {activeFilterCount > 0 && ' matching your filters'}
                                {filters.sort === 'rate_asc' && ', sorted by lowest rate'}
                                {filters.sort === 'rate_desc' && ', sorted by highest rate'}
                            </>
                        )}
                    </div>

                    {/* F-071 UI.2: Full active filter chips row */}
                    <ActiveFilterChips
                        filters={filters}
                        onChange={handleFiltersChangeAndSearch}
                        onReset={handleReset}
                        TODAY={TODAY}
                    />
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3" style={{ minHeight: 280 }}>
                                        {/* Photo + name row */}
                                        <div className="flex items-start gap-3">
                                            <Skeleton className="w-[80px] h-[80px] rounded-full shrink-0" />
                                            <div className="flex-1 pt-1 space-y-2">
                                                <Skeleton className="h-4 w-3/4" />
                                                <Skeleton className="h-3 w-1/2" />
                                                <Skeleton className="h-6 w-20 rounded-full mt-1" />
                                            </div>
                                        </div>
                                        <Skeleton className="h-3 w-full" />
                                        <Skeleton className="h-3 w-2/3" />
                                        <div className="flex gap-1">
                                            <Skeleton className="h-5 w-16 rounded-full" />
                                            <Skeleton className="h-5 w-16 rounded-full" />
                                        </div>
                                        <div className="flex-1" />
                                        <Skeleton className="h-11 w-full rounded-md" />
                                    </div>
                                ))}
                            </div>
                        ) : results.length === 0 ? (
                            <EmptyState
                                variant={emptyVariant}
                                filters={filters}
                                TODAY={TODAY}
                                onClearAll={handleReset}
                                onClearFilter={(key) => {
                                    const cleared = key === 'verified'
                                        ? { ...filters, verified: false }
                                        : key === 'date'
                                        ? { ...filters, date: TODAY }
                                        : { ...filters, [key]: '' };
                                    handleFiltersChangeAndSearch({ ...cleared, _trigger: Date.now() });
                                }}
                            />
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
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