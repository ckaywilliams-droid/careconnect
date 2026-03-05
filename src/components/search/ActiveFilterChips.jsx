import React from 'react';
import { X, ShieldCheck, ArrowUpDown } from 'lucide-react';

const AGE_GROUP_LABELS = {
    newborn_0_1: 'Newborn',
    toddler_1_3: 'Toddler',
    preschool_3_5: 'Preschool',
    school_age_5_12: 'School age',
    teenager_13_17: 'Teen',
};

function Chip({ label, icon, onRemove, color = 'gray' }) {
    const colors = {
        gray: 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200',
        amber: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
        brand: 'bg-[#C36239]/10 text-[#C36239] border-[#C36239]/30 hover:bg-[#C36239]/20',
    };
    return (
        <button
            onClick={onRemove}
            className={`inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${colors[color]}`}
        >
            {icon}
            {label}
            <X className="w-3 h-3 ml-0.5" />
        </button>
    );
}

export default function ActiveFilterChips({ filters, onChange, onReset, TODAY }) {
    const chips = [];

    const set = (key, value) => onChange({ ...filters, [key]: value, _trigger: Date.now() });

    if (filters.city) chips.push(
        <Chip key="city" label={`City: ${filters.city}`} onRemove={() => set('city', '')} />
    );
    if (filters.state) chips.push(
        <Chip key="state" label={`State: ${filters.state}`} onRemove={() => set('state', '')} />
    );
    if (filters.zip) chips.push(
        <Chip key="zip" label={`Zip: ${filters.zip}`} onRemove={() => set('zip', '')} />
    );
    if (filters.date && filters.date !== TODAY) {
        const d = new Date(filters.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        chips.push(
            <Chip key="date" label={d} onRemove={() => set('date', TODAY)} />
        );
    }
    if (filters.time_from || filters.time_to) {
        const label = `${filters.time_from || '—'} to ${filters.time_to || '—'}`;
        chips.push(
            <Chip key="time" label={label} onRemove={() => onChange({ ...filters, time_from: '', time_to: '', _trigger: Date.now() })} />
        );
    }
    if (Array.isArray(filters.age_groups) && filters.age_groups.length > 0) {
        const label = filters.age_groups.length === 1
            ? AGE_GROUP_LABELS[filters.age_groups[0]] || filters.age_groups[0]
            : `${filters.age_groups.length} age groups`;
        chips.push(
            <Chip key="age" label={label} onRemove={() => set('age_groups', [])} />
        );
    }
    if (filters.service) chips.push(
        <Chip key="service" label={filters.service.replace(/_/g, ' ')} onRemove={() => set('service', '')} />
    );
    if (filters.languages) chips.push(
        <Chip key="lang" label={filters.languages} onRemove={() => set('languages', '')} />
    );
    if (filters.max_rate) chips.push(
        <Chip key="maxrate" label={`Max $${filters.max_rate}/hr`} onRemove={() => set('max_rate', '')} />
    );
    if (filters.min_rate) chips.push(
        <Chip key="minrate" label={`Min $${filters.min_rate}/hr`} onRemove={() => set('min_rate', '')} />
    );
    if (filters.verified) chips.push(
        <Chip
            key="verified"
            label="Verified only"
            icon={<ShieldCheck className="w-3 h-3" />}
            color="amber"
            onRemove={() => set('verified', false)}
        />
    );
    if (filters.sort && filters.sort !== 'newest') chips.push(
        <Chip
            key="sort"
            label={filters.sort === 'rate_asc' ? 'Lowest rate' : 'Highest rate'}
            icon={<ArrowUpDown className="w-3 h-3" />}
            color="brand"
            onRemove={() => set('sort', 'newest')}
        />
    );

    if (chips.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {chips}
            {chips.length > 1 && (
                <button
                    onClick={onReset}
                    className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
                >
                    Clear all
                </button>
            )}
        </div>
    );
}