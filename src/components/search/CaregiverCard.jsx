import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Star, MapPin, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';

const SERVICE_LABELS = {
    babysitting: 'Babysitting',
    nanny_care: 'Nanny Care',
    overnight_care: 'Overnight',
    school_pickup: 'School Pickup',
    homework_help: 'Homework Help',
    special_needs_care: 'Special Needs',
};

const SERVICE_COLORS = 'bg-blue-50 text-blue-700 border-blue-200';

const AGE_LABELS = {
    newborn_0_1: 'Newborn',
    toddler_1_3: 'Toddler',
    preschool_3_5: 'Preschool',
    school_age_5_12: 'School age',
    teenager_13_17: 'Teen',
};

function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m}${hour >= 12 ? 'pm' : 'am'}`;
}

// F-072 Errors.3: omit .00 for whole dollars, keep cents otherwise
function formatRate(hourly_rate) {
    if (hourly_rate == null) return null;
    const num = parseFloat(hourly_rate);
    if (isNaN(num)) return null;
    return num % 1 === 0 ? `$${num.toFixed(0)}/hr` : `$${num.toFixed(2)}/hr`;
}

// F-072 Logic.1 / Errors.1: initial circle fallback, no broken image
function Avatar({ url, name }) {
    const [errored, setErrored] = useState(false);
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    if (!url || errored) {
        return (
            <div className="w-[80px] h-[80px] rounded-full bg-gray-200 flex items-center justify-center text-2xl font-semibold text-gray-500 shrink-0">
                {initial}
            </div>
        );
    }
    return (
        <img
            src={url}
            alt={name}
            onError={() => setErrored(true)}
            className="w-[80px] h-[80px] rounded-full object-cover shrink-0"
        />
    );
}

export default function CaregiverCard({ caregiver, user, requestedDate }) {
    const navigate = useNavigate();

    const services = caregiver.services_offered
        ? caregiver.services_offered.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    const ageGroups = caregiver.age_groups
        ? caregiver.age_groups.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    const rate = formatRate(caregiver.hourly_rate);
    const slots = caregiver.available_slots || [];

    const buildProfileUrl = (hash = '') => {
        if (!caregiver.slug) return '#';
        const params = new URLSearchParams({ slug: caregiver.slug });
        if (requestedDate) params.set('date', format(new Date(requestedDate), 'yyyy-MM-dd'));
        return `${createPageUrl('PublicCaregiverProfile')}?${params.toString()}${hash}`;
    };

    const isCaregiver = user?.app_role === 'caregiver';
    const isParent = user?.app_role === 'parent';
    const isUnverifiedParent = isParent && user?.email_verified === false;

    const goToProfile = () => navigate(buildProfileUrl());
    const goToProfileBook = (e) => {
        e.stopPropagation();
        if (!user) {
            base44.auth.redirectToLogin(window.location.href);
        } else {
            const url = buildProfileUrl('');
            const sep = url.includes('?') ? '&' : '?';
            navigate(url + sep + 'action=book');
        }
    };

    return (
        // Edge.1: h-full on the card + grid items-stretch on parent = equal row heights
        <div
            onClick={goToProfile}
            className="group relative flex flex-col h-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            style={{ minHeight: 280 }}
        >
            <div className="flex flex-col flex-1 p-4 gap-2.5">

                {/* ── Row 1: Photo + identity ── */}
                <div className="flex items-start gap-3">
                    <Avatar url={caregiver.profile_photo_url} name={caregiver.display_name} />

                    <div className="flex-1 min-w-0 pt-1">
                        {/* Name + verified badge on same line — F-072 Logic.1 */}
                        <div className="flex items-start gap-1">
                            {/* F-072 Errors.2: max 2 lines */}
                            <h3 className="font-semibold text-gray-900 text-[15px] leading-snug line-clamp-2 break-words">
                                {caregiver.display_name}
                            </h3>
                            {caregiver.is_verified && (
                                <CheckCircle
                                    className="w-4 h-4 text-green-500 shrink-0 mt-0.5"
                                    aria-label="Background Verified"
                                />
                            )}
                        </div>

                        {/* Location */}
                        {(caregiver.city || caregiver.state) && (
                            <p className="flex items-center gap-0.5 text-xs text-gray-400 mt-0.5">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {[caregiver.city, caregiver.state].filter(Boolean).join(', ')}
                            </p>
                        )}

                        {/* Rate pill — F-072 Logic.1 */}
                        {rate && (
                            <span className="inline-block mt-2 bg-[#C36239]/10 text-[#C36239] text-sm font-bold px-2.5 py-0.5 rounded-full border border-[#C36239]/20">
                                {rate}
                            </span>
                        )}
                    </div>

                    {/* Rating / New — F-072 Triggers.1 */}
                    <div className="shrink-0 pt-1">
                        {caregiver.average_rating != null ? (
                            <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
                                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                                <span className="text-xs font-semibold text-yellow-700">
                                    {parseFloat(caregiver.average_rating).toFixed(1)}
                                </span>
                                {caregiver.total_reviews > 0 && (
                                    <span className="text-xs text-gray-400">({caregiver.total_reviews})</span>
                                )}
                            </div>
                        ) : (
                            <span className="inline-block bg-sky-100 text-sky-700 border border-sky-200 text-xs font-medium rounded-full px-2 py-0.5">
                                New
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Row 2: Bio snippet ── */}
                {caregiver.bio && (
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {caregiver.bio}
                    </p>
                )}

                {/* ── Row 3: Experience ── */}
                {caregiver.experience_years > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3 shrink-0" />
                        {caregiver.experience_years} yr{caregiver.experience_years !== 1 ? 's' : ''} exp
                    </div>
                )}

                {/* ── Row 4: Age group chips — F-072 Logic.1 ── */}
                {ageGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {ageGroups.slice(0, 3).map(a => (
                            <span key={a} className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5">
                                {AGE_LABELS[a] || a}
                            </span>
                        ))}
                        {ageGroups.length > 3 && (
                            <span className="text-xs text-gray-400 self-center">+{ageGroups.length - 3}</span>
                        )}
                    </div>
                )}

                {/* ── Row 5: Service chips — F-072 Logic.1 ── */}
                {services.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {services.slice(0, 3).map(s => (
                            <span key={s} className={`text-xs rounded-full px-2 py-0.5 border ${SERVICE_COLORS}`}>
                                {SERVICE_LABELS[s] || s}
                            </span>
                        ))}
                        {services.length > 3 && (
                            <span className="text-xs text-gray-400 self-center">+{services.length - 3}</span>
                        )}
                    </div>
                )}

                {/* ── Row 6: Available slots (only when date filter active) ── */}
                {requestedDate && slots.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {slots.slice(0, 3).map((s, i) => (
                            <span key={i} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">
                                {formatTime(s.start_time)}–{formatTime(s.end_time)}
                            </span>
                        ))}
                        {slots.length > 3 && (
                            <span className="text-xs text-gray-400 self-center">+{slots.length - 3}</span>
                        )}
                    </div>
                )}

                {/* ── Spacer pushes CTA to bottom — F-072 Edge.1 ── */}
                <div className="flex-1" />

                {/* ── CTA button — F-072 Logic.2 ── */}
                {!isCaregiver && (
                    <div>
                        {!user ? (
                            <Button
                                variant="outline"
                                className="w-full h-11 border-[#C36239] text-[#C36239] hover:bg-[#C36239] hover:text-white text-sm font-medium"
                                onClick={goToProfileBook}
                            >
                                Sign in to book
                            </Button>
                        ) : isUnverifiedParent ? (
                            <Button
                                disabled
                                variant="outline"
                                className="w-full h-11 text-sm font-medium opacity-50 cursor-not-allowed"
                                onClick={e => e.stopPropagation()}
                            >
                                Verify email to book
                            </Button>
                        ) : isParent ? (
                            <Button
                                className="w-full h-11 bg-[#C36239] hover:bg-[#75290F] text-white text-sm font-medium"
                                onClick={goToProfileBook}
                            >
                                Request Booking
                            </Button>
                        ) : (
                            // Admin or other authenticated roles
                            <Button
                                variant="outline"
                                className="w-full h-11 text-sm font-medium"
                                onClick={goToProfile}
                            >
                                View Profile
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}