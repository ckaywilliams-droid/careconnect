import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Shield, Clock } from 'lucide-react';
import { createPageUrl } from '@/utils';

const SERVICE_LABELS = {
    babysitting: 'Babysitting',
    nanny_care: 'Nanny Care',
    overnight_care: 'Overnight',
    school_pickup: 'School Pickup',
    homework_help: 'Homework Help',
    special_needs_care: 'Special Needs',
};

function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'pm' : 'am';
    const display = hour % 12 || 12;
    return `${display}:${m}${ampm}`;
}

export default function CaregiverCard({ caregiver, user, requestedDate }) {
    const navigate = useNavigate();

    const services = caregiver.services_offered
        ? caregiver.services_offered.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    const rate = caregiver.hourly_rate_cents
        ? `$${(caregiver.hourly_rate_cents / 100).toFixed(0)}/hr`
        : null;

    const profileUrl = caregiver.slug
        ? `${createPageUrl('PublicCaregiverProfile')}?slug=${caregiver.slug}`
        : null;

    const slots = caregiver.available_slots || [];

    const handleBook = (e) => {
        e.preventDefault();
        if (!user) {
            base44.auth.redirectToLogin(window.location.href);
        } else {
            navigate(profileUrl);
        }
    };

    const isCaregiver = user?.app_role === 'caregiver';
    const isParent = user?.app_role === 'parent';

    return (
        <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-200 group bg-white">
            <Link to={profileUrl || '#'} className="block">
                {/* Photo */}
                <div className="relative h-48 bg-gray-100 overflow-hidden">
                    <img
                        src={caregiver.profile_photo_url || 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=300&fit=crop'}
                        alt={caregiver.display_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {caregiver.is_verified && (
                        <div className="absolute top-2 left-2">
                            <Badge className="bg-green-600 text-white flex items-center gap-1 text-xs shadow">
                                <Shield className="w-3 h-3" /> Verified
                            </Badge>
                        </div>
                    )}
                    {rate && (
                        <div className="absolute bottom-2 right-2 bg-white/95 rounded-lg px-2 py-0.5 text-sm font-bold text-gray-900 shadow-sm">
                            {rate}
                        </div>
                    )}
                </div>
            </Link>

            <CardContent className="p-4 space-y-2.5">
                {/* Name & Rating */}
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h3 className="font-semibold text-gray-900 text-base leading-tight">
                            {caregiver.display_name}
                        </h3>
                        {(caregiver.city || caregiver.state) && (
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />
                                {[caregiver.city, caregiver.state].filter(Boolean).join(', ')}
                            </p>
                        )}
                    </div>
                    {caregiver.average_rating ? (
                        <div className="flex items-center gap-1 shrink-0">
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-medium">{caregiver.average_rating.toFixed(1)}</span>
                            {caregiver.total_reviews > 0 && (
                                <span className="text-xs text-gray-400">({caregiver.total_reviews})</span>
                            )}
                        </div>
                    ) : null}
                </div>

                {/* Bio snippet */}
                {caregiver.bio && (
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{caregiver.bio}</p>
                )}

                {/* Experience */}
                {caregiver.experience_years > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {caregiver.experience_years} yr{caregiver.experience_years !== 1 ? 's' : ''} experience
                    </div>
                )}

                {/* Available slots for requested date */}
                {requestedDate && slots.length > 0 && (
                    <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">Available slots:</p>
                        <div className="flex flex-wrap gap-1">
                            {slots.slice(0, 4).map((s, i) => (
                                <span
                                    key={i}
                                    className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5"
                                >
                                    {formatTime(s.start_time)}–{formatTime(s.end_time)}
                                </span>
                            ))}
                            {slots.length > 4 && (
                                <span className="text-xs text-gray-400">+{slots.length - 4} more</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Service tags */}
                {services.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {services.slice(0, 3).map(s => (
                            <Badge key={s} variant="secondary" className="text-xs px-1.5 py-0">
                                {SERVICE_LABELS[s] || s}
                            </Badge>
                        ))}
                        {services.length > 3 && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">+{services.length - 3}</Badge>
                        )}
                    </div>
                )}

                {/* CTA */}
                {!isCaregiver ? (
                    <Button
                        className={`w-full text-sm mt-1 ${isParent ? 'bg-[#C36239] hover:bg-[#75290F] text-white' : 'border border-[#C36239] text-[#C36239] hover:bg-[#C36239] hover:text-white'}`}
                        variant={isParent ? 'default' : 'outline'}
                        onClick={handleBook}
                    >
                        {user ? 'View Profile & Book' : 'Sign in to book'}
                    </Button>
                ) : (
                    <Link to={profileUrl || '#'}>
                        <Button variant="outline" className="w-full text-sm mt-1">View Profile</Button>
                    </Link>
                )}
            </CardContent>
        </Card>
    );
}