import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlidersHorizontal, X, MapPin } from 'lucide-react';

const AGE_GROUPS = [
    { value: 'newborn_0_1', label: 'Newborn (0–1)' },
    { value: 'toddler_1_3', label: 'Toddler (1–3)' },
    { value: 'preschool_3_5', label: 'Preschool (3–5)' },
    { value: 'school_age_5_12', label: 'School Age (5–12)' },
    { value: 'teenager_13_17', label: 'Teenager (13–17)' },
];

const SERVICES = [
    { value: 'babysitting', label: 'Babysitting' },
    { value: 'nanny_care', label: 'Nanny Care' },
    { value: 'overnight_care', label: 'Overnight Care' },
    { value: 'school_pickup', label: 'School Pickup' },
    { value: 'homework_help', label: 'Homework Help' },
    { value: 'special_needs_care', label: 'Special Needs Care' },
];

const LANGUAGES = [
    { value: 'English', label: 'English' },
    { value: 'Spanish', label: 'Spanish' },
    { value: 'French', label: 'French' },
    { value: 'Mandarin', label: 'Mandarin' },
    { value: 'Portuguese', label: 'Portuguese' },
    { value: 'Arabic', label: 'Arabic' },
    { value: 'Hindi', label: 'Hindi' },
    { value: 'Korean', label: 'Korean' },
];

export default function SearchFilters({ filters, onChange, onReset, activeCount }) {
    const set = (key, value) => onChange({ ...filters, [key]: value });

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5 sticky top-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-gray-600" />
                    <span className="font-semibold text-gray-900">Filters</span>
                    {activeCount > 0 && (
                        <Badge className="bg-[#C36239] text-white text-xs">{activeCount}</Badge>
                    )}
                </div>
                {activeCount > 0 && (
                    <button
                        onClick={onReset}
                        className="text-sm text-[#C36239] hover:text-[#75290F] flex items-center gap-1"
                    >
                        <X className="w-3 h-3" /> Clear all
                    </button>
                )}
            </div>

            {/* Date */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Date Needed</Label>
                <Input
                    type="date"
                    value={filters.date || ''}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => set('date', e.target.value)}
                    className="text-sm"
                />
            </div>

            {/* Time Range */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Time Range</Label>
                <div className="flex items-center gap-2">
                    <Input
                        type="time"
                        value={filters.time_from || ''}
                        onChange={e => set('time_from', e.target.value)}
                        className="text-sm w-full"
                    />
                    <span className="text-gray-400 shrink-0">–</span>
                    <Input
                        type="time"
                        value={filters.time_to || ''}
                        onChange={e => set('time_to', e.target.value)}
                        className="text-sm w-full"
                    />
                </div>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Location</Label>
                <Input
                    placeholder="City"
                    value={filters.city || ''}
                    onChange={e => set('city', e.target.value)}
                    className="text-sm"
                />
                <Input
                    placeholder="State (e.g. NY)"
                    value={filters.state || ''}
                    onChange={e => set('state', e.target.value)}
                    className="text-sm"
                />
                <Input
                    placeholder="Zip code"
                    value={filters.zip || ''}
                    onChange={e => set('zip', e.target.value)}
                    className="text-sm"
                />
            </div>

            {/* Max Hourly Rate */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Max Hourly Rate ($/hr)</Label>
                <Input
                    type="number"
                    placeholder="e.g. 25"
                    value={filters.max_rate || ''}
                    onChange={e => set('max_rate', e.target.value)}
                    className="text-sm w-full"
                    min={0}
                />
            </div>

            {/* Languages */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Language Spoken</Label>
                <Select
                    value={filters.languages || 'any'}
                    onValueChange={v => set('languages', v === 'any' ? '' : v)}
                >
                    <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Any language" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Any language</SelectItem>
                        {LANGUAGES.map(l => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Age Groups */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Child's Age Group</Label>
                <Select
                    value={filters.age_group || 'any'}
                    onValueChange={v => set('age_group', v === 'any' ? '' : v)}
                >
                    <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Any age group" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Any age group</SelectItem>
                        {AGE_GROUPS.map(a => (
                            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Services */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Service Type</Label>
                <Select
                    value={filters.service || 'any'}
                    onValueChange={v => set('service', v === 'any' ? '' : v)}
                >
                    <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Any service" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Any service</SelectItem>
                        {SERVICES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Verified Only */}
            <div className="flex items-center gap-2">
                <Checkbox
                    id="verified"
                    checked={!!filters.verified}
                    onCheckedChange={v => set('verified', v)}
                />
                <Label htmlFor="verified" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Verified caregivers only
                </Label>
            </div>

            {/* Sort */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Sort By</Label>
                <Select
                    value={filters.sort || 'newest'}
                    onValueChange={v => set('sort', v)}
                >
                    <SelectTrigger className="text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="rate_asc">Rate: Low to High</SelectItem>
                        <SelectItem value="rate_desc">Rate: High to Low</SelectItem>
                        <SelectItem value="rating">Top Rated</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Button
                className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
                onClick={() => onChange({ ...filters, _trigger: Date.now() })}
            >
                Apply Filters
            </Button>
        </div>
    );
}