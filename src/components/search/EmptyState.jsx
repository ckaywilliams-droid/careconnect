import React from 'react';
import { Button } from '@/components/ui/button';
import { Search, Calendar, ShieldCheck, SlidersHorizontal } from 'lucide-react';

// Shared illustration wrapper
function Illustration({ icon: Icon, color = 'text-gray-300' }) {
    return (
        <div className="flex items-center justify-center mb-5">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <Icon className={`w-10 h-10 ${color}`} />
            </div>
        </div>
    );
}

/**
 * variant:
 *   'no_area'      — no caregivers at all in that location
 *   'no_date'      — caregivers exist in area but none on that date
 *   'no_verified'  — verified filter yielding zero
 *   'no_match'     — multiple filters, zero results
 *   'no_platform'  — zero caregivers on platform (launch state)
 */
export default function EmptyState({ variant, filters, onClearFilter, onClearAll, secondaryLoading, TODAY }) {
    const zip = filters.zip;
    const city = filters.city;
    const location = zip || city;
    const dateLabel = filters.date && filters.date !== TODAY
        ? new Date(filters.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        : null;

    if (variant === 'no_area') {
        return (
            <div className="flex flex-col items-center text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-gray-200">
                <Illustration icon={Search} />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No caregivers found near{location ? ` ${location}` : ' your location'}
                </h3>
                <p className="text-sm text-gray-500 mb-6 max-w-xs">
                    We don't have any caregivers in that area yet. Try a nearby zip code or browse without a location filter.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {zip && (
                        <Button
                            variant="outline"
                            className="sm:w-auto w-full border-[#C36239] text-[#C36239] hover:bg-[#C36239] hover:text-white"
                            onClick={() => onClearFilter('zip')}
                        >
                            Remove location filter
                        </Button>
                    )}
                    {city && (
                        <Button
                            variant="outline"
                            className="sm:w-auto w-full border-[#C36239] text-[#C36239] hover:bg-[#C36239] hover:text-white"
                            onClick={() => onClearFilter('city')}
                        >
                            Remove city filter
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        className="sm:w-auto w-full text-gray-500"
                        onClick={onClearAll}
                    >
                        Browse all caregivers
                    </Button>
                </div>
            </div>
        );
    }

    if (variant === 'no_date') {
        return (
            <div className="flex flex-col items-center text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-gray-200">
                <Illustration icon={Calendar} color="text-[#C36239]/40" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No caregivers available{dateLabel ? ` on ${dateLabel}` : ''}{location ? ` near ${location}` : ''}
                </h3>
                <p className="text-sm text-gray-500 mb-6 max-w-xs">
                    Caregivers are in your area, but none have open slots on that date. Try a different date.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <Button
                        className="sm:w-auto w-full bg-[#C36239] hover:bg-[#75290F] text-white"
                        onClick={() => onClearFilter('date')}
                    >
                        See all caregivers near {location || 'you'}
                    </Button>
                    <Button
                        variant="ghost"
                        className="sm:w-auto w-full text-gray-500"
                        onClick={onClearAll}
                    >
                        Browse all caregivers
                    </Button>
                </div>
            </div>
        );
    }

    if (variant === 'no_verified') {
        return (
            <div className="flex flex-col items-center text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-gray-200">
                <Illustration icon={ShieldCheck} color="text-amber-300" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No verified caregivers found with your current filters
                </h3>
                <p className="text-sm text-gray-500 mb-6 max-w-xs">
                    There may be caregivers in your area whose verification is in progress. Remove the verified filter to see all caregivers.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <Button
                        className="sm:w-auto w-full bg-[#C36239] hover:bg-[#75290F] text-white"
                        onClick={() => onClearFilter('verified')}
                    >
                        Show all caregivers (including unverified)
                    </Button>
                </div>
            </div>
        );
    }

    if (variant === 'no_platform') {
        return (
            <div className="flex flex-col items-center text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-gray-200">
                <Illustration icon={Search} />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Search for caregivers near you
                </h3>
            </div>
        );
    }

    // Default: 'no_match' — multiple filters, zero results
    return (
        <div className="flex flex-col items-center text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-gray-200">
            <Illustration icon={SlidersHorizontal} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No caregivers match your filters
            </h3>
            <p className="text-sm text-gray-500 mb-6 max-w-xs">
                Try removing one filter at a time — starting with the date filter often helps.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                {filters.date && (
                    <Button
                        variant="outline"
                        className="sm:w-auto w-full border-[#C36239] text-[#C36239] hover:bg-[#C36239] hover:text-white"
                        onClick={() => onClearFilter('date')}
                    >
                        Clear date filter
                    </Button>
                )}
                <Button
                    className="sm:w-auto w-full bg-[#C36239] hover:bg-[#75290F] text-white"
                    onClick={onClearAll}
                >
                    Clear all filters
                </Button>
            </div>
        </div>
    );
}