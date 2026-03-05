import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, CheckCircle, Clock } from 'lucide-react';
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

const SERVICE_COLORS = {
    babysitting: 'bg-blue-100 text-blue-700',
    nanny_care: 'bg-violet-100 text-violet-700',
    overnight_care: 'bg-indigo-100 text-indigo-700',
    school_pickup: 'bg-sky-100 text-sky-700',
    homework_help: 'bg-cyan-100 text-cyan-700',
    special_needs_care: 'bg-purple-100 text-purple-700',
};

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
    const ampm = hour >= 12 ? 'pm' : 'am';
    return `${hour % 12 || 12}:${m}${ampm}`;
}

// F-072 Errors.3: omit .00, keep cents if not whole
function formatRate(hourly_rate) {
    if (hourly_rate == null) return null;
    const num = parseFloat(hourly_rate);
    return num % 1 === 0 ? `$${num.toFixed(0)}/hr` : `$${num.toFixed(2)}/hr`;
}

// F-072 Logic.1: first initial fallback avatar
function InitialAvatar({ name }) {
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    return (
        <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-semibold text-gray-500 shrink-0 border-2 border-white shadow-sm">
            {initial}
        </div>
    );
}

function PhotoAvatar({ url, name }) {
    const [errored, setErrored] = useState(false);
    if (!url || errored) return <InitialAvatar name={name} />;
    return (
        <img
            src={url}
            alt={name}
            onError={() => setErrored(true)}
            className="w-20 h-20 rounded-full object-cover shrink-0 border-2 border-white shadow-sm"
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

    const profileUrl = caregiver.slug
        ? `${createPageUrl('PublicCaregiverProfile')}?slug=${caregiver.slug}`
        : '#';

    const slots = caregiver.available_slots || [];

    // F-072 Logic.2: CTA logic
    const isCaregiver = user?.app_role === 'caregiver';
    const isParent = user?.app_role === 'parent';
    const isUnverifiedParent = isParent && !user?.email_verified;

    const handleCardClick = (e) => {
        // Let the Link handle navigation — only intercept if needed
    };

    const handleCtaClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
            base44.auth.redirectToLogin(window.location.href);
        } else {
            navigate(profileUrl + '#book');
        }
    };

    return (
        <div className="group relative flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer min-h-[280px]">
            {/* Entire card is a link */}
            <Link to={profileUrl} className="absolute inset-0 z-0" aria-label={`View ${caregiver.display_name}'s profile`} />

            <div className="relative z-10 flex flex-col flex-1 p-4 gap-3">

                {/* Row 1: Photo + Name + Badge + Rate */}
                <div className="flex items-start gap-3">
                    <PhotoAvatar url={caregiver.profile_photo_url} name={caregiver.display_name} />

                    <div className="flex-1 min-w-0 pt-0.5">
                        {/* Name + verified badge */}
                        <div className="flex items-start gap-1.5 flex-wrap">
                            <h3 className="font-semibold text-gray-900 text-base leading-snug line-clamp-2 break-words">
                                {caregiver.display_name}
                            </h3>
                            {caregiver.is_verified && (
                                <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" title="Background Verified" />
                            )}
                        </div>

                        {/* Location */}
                        {(caregiver.city || caregiver.state) && (
                            <p className="text-xs text-gray-400 flex items-center gap-0.5 mt-0.5">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {[caregiver.city, caregiver.state].filter(Boolean).join(', ')}
                            </p>
                        )}

                        {/* Rate pill */}
                        {rate && (
                            <span className="inline-block mt-1.5 bg-[#C36239]/10 text-[#C36239] text-sm font-bold px-2.5 py-0.5 rounded-full">
                                {rate}
                            </span>
                        )}
                    </div>

                    {/* Rating / New badge — top-right */}
                    <div className="shrink-0 pt-0.5">
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
                            <span className="text-xs bg-sky-100 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5 font-medium">
                                New
                            </span>
                        )}
                    </div>
                </div>

                {/* Row 2: Bio snippet */}
                {caregiver.bio && (
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{caregiver.bio}</p>
                )}

                {/* Row 3: Experience */}
                {caregiver.experience_years > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {caregiver.experience_years} yr{caregiver.experience_years !== 1 ? 's' : ''} experience
                    </div>
                )}

                {/* Row 4: Age group chips */}
                {ageGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {ageGroups.slice(0, 3).map(a => (
                            <span key={a} className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5">
                                {AGE_LABELS[a] || a}
                            </span>
                        ))}
                        {ageGroups.length > 3 && (
                            <span className="text-xs text-gray-400 px-1 py-0.5">+{ageGroups.length - 3} more</span>
                        )}
                    </div>
                )}

                {/* Row 5: Service chips */}
                {services.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {services.slice(0, 3).map(s => (
                            <span key={s} className={`text-xs rounded-full px-2 py-0.5 border ${SERVICE_COLORS[s] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {SERVICE_LABELS[s] || s}
                            </span>
                        ))}
                        {services.length > 3 && (
                            <span className="text-xs text-gray-400 px-1 py-0.5">+{services.length - 3} more</span>
                        )}
                    </div>
                )}

                {/* Row 6: Available slots (when date filter active) */}
                {requestedDate && slots.length > 0 && (
                    <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Available:</p>
                        <div className="flex flex-wrap gap-1">
                            {slots.slice(0, 3).map((s, i) => (
                                <span key={i} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">
                                    {formatTime(s.start_time)}–{formatTime(s.end_time)}
                                </span>
                            ))}
                            {slots.length > 3 && (
                                <span className="text-xs text-gray-400">+{slots.length - 3} more</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Spacer to push CTA to bottom */}
                <div className="flex-1" />

                {/* CTA Button — F-072 Logic.2 */}
                {!isCaregiver && (
                    <div className="relative z-20">
                        {!user ? (
                            <Button
                                variant="outline"
                                className="w-full h-11 border-[#C36239] text-[#C36239] hover:bg-[#C36239] hover:text-white text-sm font-medium"
                                onClick={handleCtaClick}
                            >
                                Sign in to book
                            </Button>
                        ) : isUnverifiedParent ? (
                            <Button
                                disabled
                                className="w-full h-11 text-sm font-medium opacity-60 cursor-not-allowed"
                                variant="outline"
                            >
                                Verify email to book
                            </Button>
                        ) : isParent ? (
                            <Button
                                className="w-full h-11 bg-[#C36239] hover:bg-[#75290F] text-white text-sm font-medium"
                                onClick={handleCtaClick}
                            >
                                Request Booking
                            </Button>
                        ) : (
                            // Other auth roles (e.g. admin) — just view
                            <Button
                                variant="outline"
                                className="w-full h-11 text-sm font-medium"
                                onClick={handleCtaClick}
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