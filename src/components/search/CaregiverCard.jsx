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

const AGE_LABELS = {
    newborn_0_1: 'Newborns',
    toddler_1_3: 'Toddlers',
    preschool_3_5: 'Preschool',
    school_age_5_12: 'School Age',
    teenager_13_17: 'Teens',
};

export default function CaregiverCard({ caregiver, user }) {
    const navigate = useNavigate();

    const services = caregiver.services_offered
        ? caregiver.services_offered.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    const ageGroups = caregiver.age_groups
        ? caregiver.age_groups.split(',').map(a => a.trim()).filter(Boolean)
        : [];

    const rate = caregiver.hourly_rate_cents
        ? `$${(caregiver.hourly_rate_cents / 100).toFixed(0)}/hr`
        : null;

    const profileUrl = caregiver.slug
        ? `${createPageUrl('PublicCaregiverProfile')}?slug=${caregiver.slug}`
        : null;

    const handleBook = (e) => {
        e.preventDefault();
        if (!user) {
            // Access.2: unauthenticated → prompt to sign in
            navigate('/login');
        } else {
            navigate(profileUrl);
        }
    };

    const isParent = user?.app_role === 'parent';
    const isCaregiver = user?.app_role === 'caregiver';

    return (
        <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
            <Link to={profileUrl || '#'} className="block">
                {/* Photo */}
                <div className="relative h-52 bg-gray-100">
                    <img
                        src={caregiver.profile_photo_url || 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=300&fit=crop'}
                        alt={caregiver.display_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {caregiver.is_verified && (
                        <div className="absolute top-3 left-3">
                            <Badge className="bg-green-600 text-white flex items-center gap-1 text-xs">
                                <Shield className="w-3 h-3" /> Verified
                            </Badge>
                        </div>
                    )}
                    {rate && (
                        <div className="absolute bottom-3 right-3 bg-white/95 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 shadow">
                            {rate}
                        </div>
                    )}
                </div>
            </Link>

            <CardContent className="p-4 space-y-3">
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
                    <p className="text-xs text-gray-600 line-clamp-2">{caregiver.bio}</p>
                )}

                {/* Experience */}
                {caregiver.experience_years && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {caregiver.experience_years} yr{caregiver.experience_years !== 1 ? 's' : ''} experience
                    </div>
                )}

                {/* Services tags */}
                {services.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {services.slice(0, 3).map(s => (
                            <Badge key={s} variant="secondary" className="text-xs px-2 py-0">
                                {SERVICE_LABELS[s] || s}
                            </Badge>
                        ))}
                        {services.length > 3 && (
                            <Badge variant="secondary" className="text-xs px-2 py-0">
                                +{services.length - 3}
                            </Badge>
                        )}
                    </div>
                )}

                {/* CTA — Access.2 */}
                {!isCaregiver && (
                    <Button
                        className={`w-full text-sm ${isParent ? 'bg-[#C36239] hover:bg-[#75290F] text-white' : 'border border-[#C36239] text-[#C36239] hover:bg-[#C36239] hover:text-white'}`}
                        variant={isParent ? 'default' : 'outline'}
                        onClick={handleBook}
                    >
                        {user ? 'View Profile & Book' : 'Sign in to book'}
                    </Button>
                )}
                {isCaregiver && (
                    <Link to={profileUrl || '#'}>
                        <Button variant="outline" className="w-full text-sm">View Profile</Button>
                    </Link>
                )}
            </CardContent>
        </Card>
    );
}