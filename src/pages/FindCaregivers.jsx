import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import SearchFilters from '@/components/search/SearchFilters';
import CaregiverCard from '@/components/search/CaregiverCard';

const EMPTY_FILTERS = {
    city: '',
    state: '',
    zip: '',
    age_group: '',
    service: '',
    verified: false,
    min_rate: '',
    max_rate: '',
    sort: 'newest',
};

function filtersToParams(filters) {
    const p = new URLSearchParams();
    if (filters.city) p.set('city', filters.city);
    if (filters.state) p.set('state', filters.state);
    if (filters.zip) p.set('zip', filters.zip);
    if (filters.age_group) p.set('age_group', filters.age_group);
    if (filters.service) p.set('service', filters.service);
    if (filters.verified) p.set('verified', 'true');
    if (filters.min_rate) p.set('min_rate', filters.min_rate);
    if (filters.max_rate) p.set('max_rate', filters.max_rate);
    if (filters.sort && filters.sort !== 'newest') p.set('sort', filters.sort);
    return p;
}

function paramsToFilters(searchParams) {
    return {
        city: searchParams.get('city') || '',
        state: searchParams.get('state') || '',
        zip: searchParams.get('zip') || '',
        age_group: searchParams.get('age_group') || '',
        service: searchParams.get('service') || '',
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
    if (filters.age_group) count++;
    if (filters.service) count++;
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

    const isFirstRun = useRef(true);

    // Load current user (optional — page is public)
    useEffect(() => {
        base44.auth.me().then(setUser).catch(() => setUser(null));
    }, []);

    // Execute search
    const runSearch = useCallback(async (filtersToSearch, page) => {
        setLoading(true);
        setError(null);
        try {
            const payload = {
                city: filtersToSearch.city || undefined,
                state: filtersToSearch.state || undefined,
                zip: filtersToSearch.zip || undefined,
                age_group: filtersToSearch.age_group || undefined,
                service: filtersToSearch.service || undefined,
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
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // On mount: if URL has params, run search immediately (UI.2)
    useEffect(() => {
        runSearch(filters, currentPage);
        isFirstRun.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync URL whenever filters or page change (UI.1)
    const syncUrl = useCallback((newFilters, page) => {
        const p = filtersToParams(newFilters);
        if (page > 1) p.set('page', page);
        navigate(`${createPageUrl('FindCaregivers')}?${p.toString()}`, { replace: true });
    }, [navigate]);

    const handleFiltersChange = (newFilters) => {
        setFilters(newFilters);
    };

    const handleApply = useCallback((newFilters = filters) => {
        const page = 1;
        setCurrentPage(page);
        syncUrl(newFilters, page);
        runSearch(newFilters, page);
        setShowMobileFilters(false);
    }, [filters, syncUrl, runSearch]);

    // Override onChange to trigger search immediately on apply button click
    const handleFiltersChangeAndSearch = (newFilters) => {
        setFilters(newFilters);
        // Only auto-search if the _trigger key changed (Apply button clicked)
        if (newFilters._trigger !== filters._trigger) {
            const { _trigger, ...cleanFilters } = newFilters;
            setFilters(cleanFilters);
            handleApply(cleanFilters);
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

    const activeFilterCount = countActiveFilters(filters);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top bar */}
            <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between h-14 gap-4">
                        <Link to={createPageUrl('Home')} className="flex items-center gap-2 shrink-0">
                            <span className="text-xl">🧡</span>
                            <span className="font-bold text-gray-900 hidden sm:block">CareNest</span>
                        </Link>
                        <div className="flex-1 max-w-xl">
                            <div className="relative flex items-center gap-2">
                                <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
                                <input
                                    className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C36239]/50 bg-gray-50"
                                    placeholder="City, state, or zip code…"
                                    value={filters.city}
                                    onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleApply(); }}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Mobile filter toggle */}
                            <Button
                                variant="outline"
                                size="sm"
                                className="md:hidden flex items-center gap-1"
                                onClick={() => setShowMobileFilters(v => !v)}
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                Filters
                                {activeFilterCount > 0 && (
                                    <Badge className="bg-[#C36239] text-white text-xs ml-1">{activeFilterCount}</Badge>
                                )}
                            </Button>
                            {user ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const page = user.app_role === 'parent' ? 'ParentDashboard' :
                                            user.app_role === 'caregiver' ? 'CaregiverProfile' : 'AdminDashboard';
                                        navigate(createPageUrl(page));
                                    }}
                                >
                                    Dashboard
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    className="bg-[#C36239] hover:bg-[#75290F] text-white"
                                    onClick={() => base44.auth.redirectToLogin(window.location.href)}
                                >
                                    Sign In
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-6">
                {/* Results header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        {loading ? (
                            <Skeleton className="h-5 w-48" />
                        ) : (
                            <p className="text-gray-700 text-sm">
                                <span className="font-semibold text-gray-900">{totalCount.toLocaleString()}</span>{' '}
                                caregiver{totalCount !== 1 ? 's' : ''} found
                                {activeFilterCount > 0 && ' (filtered)'}
                            </p>
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

                <div className="flex gap-6">
                    {/* Sidebar — desktop */}
                    <aside className="hidden md:block w-64 shrink-0">
                        <SearchFilters
                            filters={filters}
                            onChange={handleFiltersChangeAndSearch}
                            onReset={handleReset}
                            activeCount={activeFilterCount}
                        />
                    </aside>

                    {/* Mobile filter drawer */}
                    {showMobileFilters && (
                        <div className="fixed inset-0 z-40 md:hidden">
                            <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilters(false)} />
                            <div className="absolute right-0 top-0 h-full w-80 bg-white shadow-xl overflow-y-auto p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="font-semibold">Filters</span>
                                    <button onClick={() => setShowMobileFilters(false)}>
                                        <X className="w-5 h-5" />
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

                    {/* Results grid */}
                    <div className="flex-1 min-w-0">
                        {error && (
                            <Alert variant="destructive" className="mb-4">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="bg-white rounded-xl overflow-hidden shadow">
                                        <Skeleton className="h-52 w-full" />
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
                            /* F-073: Empty state */
                            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
                                <div className="text-5xl mb-4">🔍</div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">No caregivers found</h3>
                                <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                                    Try adjusting your filters or search in a broader location.
                                </p>
                                <Button
                                    variant="outline"
                                    onClick={handleReset}
                                    className="border-[#C36239] text-[#C36239]"
                                >
                                    Clear all filters
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {results.map(caregiver => (
                                        <CaregiverCard
                                            key={caregiver.id}
                                            caregiver={caregiver}
                                            user={user}
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
                                            // Show pages around current page
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