import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlidersHorizontal, X, MapPin, ShieldCheck, Info } from 'lucide-react';

const AGE_GROUPS = [
    { value: 'newborn_0_1', label: 'Newborn (0–1 yr)' },
    { value: 'toddler_1_3', label: 'Toddler (1–3 yr)' },
    { value: 'preschool_3_5', label: 'Preschool (3–5 yr)' },
    { value: 'school_age_5_12', label: 'School age (5–12 yr)' },
    { value: 'teenager_13_17', label: 'Teen (13–17 yr)' },
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

    const selectedAgeGroups = Array.isArray(filters.age_groups) ? filters.age_groups : [];
    const toggleAgeGroup = (value) => {
        const next = selectedAgeGroups.includes(value)
            ? selectedAgeGroups.filter(v => v !== value)
            : [...selectedAgeGroups, value];
        set('age_groups', next);
    };

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

            {/* F-064: Date Availability Filter */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-700">Date Needed</Label>
                    {filters.date && (
                        <button
                            onClick={() => set('date', '')}
                            className="text-xs text-[#C36239] hover:underline"
                        >
                            Clear date
                        </button>
                    )}
                </div>
                <Input
                    type="date"
                    value={filters.date || ''}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => set('date', e.target.value)}
                    className="text-sm"
                />
                {filters.date && (
                    <p className="text-xs text-gray-500 font-medium">
                        {new Date(filters.date + 'T00:00:00').toLocaleDateString('en-US', {
                            weekday: 'long', month: 'long', day: 'numeric'
                        })}
                    </p>
                )}
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

            {/* Location — City & State */}
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
            </div>

            {/* F-063: Zip Code Filter */}
            <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Zip Code
                </Label>
                <div className="relative">
                    <Input
                        placeholder="Enter zip code"
                        value={filters.zip || ''}
                        maxLength={10}
                        onChange={e => set('zip', e.target.value.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10))}
                        className="text-sm pr-7"
                    />
                    {filters.zip && (
                        <button
                            onClick={() => set('zip', '')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <p className="text-xs text-gray-400">
                    Exact zip code match — try the caregiver's neighbourhood zip.
                </p>
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

            {/* Age Groups — F-065 multi-select checkboxes */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                        Age groups
                        {selectedAgeGroups.length >= 2 && (
                            <Badge className="bg-[#C36239] text-white text-xs ml-1">{selectedAgeGroups.length}</Badge>
                        )}
                    </Label>
                    {selectedAgeGroups.length > 0 && (
                        <button
                            onClick={() => set('age_groups', [])}
                            className="text-xs text-[#C36239] hover:underline"
                        >
                            Clear
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {AGE_GROUPS.map(a => (
                        <div key={a.value} className="flex items-center gap-2">
                            <Checkbox
                                id={`age-${a.value}`}
                                checked={selectedAgeGroups.includes(a.value)}
                                onCheckedChange={() => toggleAgeGroup(a.value)}
                            />
                            <label
                                htmlFor={`age-${a.value}`}
                                className="text-sm text-gray-700 cursor-pointer select-none"
                            >
                                {a.label}
                            </label>
                        </div>
                    ))}
                </div>
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

            {/* F-066: Verified Badge Filter */}
            <div className={`rounded-lg border p-3 transition-colors ${filters.verified ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck className={`w-4 h-4 shrink-0 ${filters.verified ? 'text-amber-600' : 'text-gray-400'}`} />
                        <Label
                            htmlFor="verified-toggle"
                            className={`text-sm font-medium cursor-pointer select-none ${filters.verified ? 'text-amber-800' : 'text-gray-700'}`}
                        >
                            Background verified only
                        </Label>
                    </div>
                    <Switch
                        id="verified-toggle"
                        checked={!!filters.verified}
                        onCheckedChange={v => set('verified', v)}
                        className={filters.verified ? 'data-[state=checked]:bg-amber-500' : ''}
                    />
                </div>
                <p className="text-xs text-gray-500 mt-1.5 leading-snug">
                    Shows only caregivers whose identity and background have been verified by our team.
                </p>
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