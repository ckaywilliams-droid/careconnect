import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, MapPin, Star, AlertCircle, Edit2, Copy, Check } from 'lucide-react';
import ReviewsSection from '@/components/ReviewsSection';

export default function PublicCaregiverProfile() {
  const [searchParams] = useSearchParams();
  const slug = searchParams.get('slug');
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [certifications, setCertifications] = useState([]);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current user
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // Fetch caregiver profile
        const response = await base44.functions.invoke('getCaregiverPublicProfile', { slug });

        if (response.status === 404) {
          setError('Caregiver not found');
          setProfile(null);
          return;
        }

        if (response.data) {
          setProfile(response.data.profile);
          setCertifications(response.data.certifications || []);
          setAvailabilitySlots(response.data.availabilitySlots || []);

          // Check if user is viewing their own profile
          if (currentUser && currentUser.id === response.data.profile.user_id) {
            setIsOwnProfile(true);
          }
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        if (err.response?.status === 404) {
          setError('Caregiver not found');
        } else {
          setError('Failed to load profile');
        }
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchProfile();
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FEFEFE] to-[#F5F1EC] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#C36239]"></div>
          <p className="mt-4 text-[#643737]">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FEFEFE] to-[#F5F1EC] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-2 border-[#E5E2DC]">
          <CardHeader className="text-center">
            <AlertCircle className="w-12 h-12 text-[#C36239] mx-auto mb-3" />
            <CardTitle className="text-2xl text-[#0C2119]">Caregiver Not Found</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-[#643737]">{error}</p>
            <Button
              onClick={() => navigate(createPageUrl('Home'))}
              className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const hourlyRateDisplay = profile.hourly_rate_cents
    ? `$${(profile.hourly_rate_cents / 100).toFixed(2)}/hr`
    : 'Rate on request';

  const servicesArray = profile.services_offered
    ? profile.services_offered.split(',').map(s => s.trim())
    : [];

  const ageGroupsArray = profile.age_groups
    ? profile.age_groups.split(',').map(a => a.trim())
    : [];

  const renderBookingCTA = () => {
    if (!user) {
      return (
        <Button
          size="lg"
          className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
          onClick={() => base44.auth.redirectToLogin(window.location.href)}
        >
          Sign in to Request Booking
        </Button>
      );
    }

    if (user.app_role === 'caregiver') {
      return (
        <Button
          variant="outline"
          size="lg"
          className="w-full border-[#C36239] text-[#C36239]"
          onClick={() => navigate(createPageUrl('CaregiverProfile'))}
        >
          View Your Own Profile
        </Button>
      );
    }

    if (!user.email_verified) {
      return (
        <Button
          disabled
          size="lg"
          className="w-full bg-gray-300 text-gray-600 cursor-not-allowed"
        >
          Verify Your Email to Book
        </Button>
      );
    }

    return (
      <Button
        size="lg"
        className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
        onClick={() => {
          // TODO: Open booking modal with this caregiver pre-selected
        }}
      >
        Request Booking
      </Button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FEFEFE] to-[#F5F1EC]">
      {/* Header Banner */}
      <div className="relative">
        <div
          className="w-full h-64 md:h-80 bg-gradient-to-r from-[#C36239] to-[#8B4513] bg-cover bg-center"
          style={{
            backgroundImage: profile.header_image_url
              ? `url(${profile.header_image_url})`
              : undefined
          }}
        />

        {/* Profile Photo */}
        <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2">
          <div className="relative">
            <img
              src={profile.profile_photo_url || null}
              alt={profile.display_name}
              className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-white shadow-lg object-cover"
              onError={(e) => e.target.style.display='none'}
            />
            {profile.is_verified && (
              <div className="absolute bottom-2 right-2 bg-white rounded-full p-1 shadow-md">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            )}
          </div>
        </div>

        {/* Edit Button (if own profile) */}
        {isOwnProfile && (
          <Button
            size="icon"
            className="absolute top-4 right-4 bg-white hover:bg-gray-100 text-[#C36239] shadow-lg"
            onClick={() => navigate(createPageUrl('CaregiverProfile'))}
            title="Edit your profile"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 pt-24 pb-24 md:pb-8">
        {/* Name & Rating */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <h1 className="text-3xl md:text-4xl font-bold text-[#0C2119]">
              {profile.display_name}
            </h1>
            {profile.is_verified && (
              <div title="Background verified by our team">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
            )}
          </div>

          {/* Rate Pill */}
          <Badge className="bg-[#C36239] text-white text-lg px-6 py-2 mb-4">
            {hourlyRateDisplay}
          </Badge>

          {/* Rating & Location */}
          <div className="flex items-center justify-center gap-6 text-[#643737] text-sm md:text-base">
            {profile.average_rating > 0 && (
              <div className="flex items-center gap-1">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < Math.round(profile.average_rating)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <span>
                  {profile.average_rating.toFixed(1)} ({profile.total_reviews} reviews)
                </span>
              </div>
            )}
            {(profile.city || profile.state) && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{profile.city && `${profile.city}, `}{profile.state}</span>
              </div>
            )}
            {profile.total_bookings_completed > 0 && (
              <span>{profile.total_bookings_completed} completed bookings</span>
            )}
          </div>
        </div>

        {/* Services & Age Groups */}
        <div className="space-y-6 mb-8">
          {servicesArray.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[#0C2119] mb-3 uppercase tracking-wide">
                Services
              </h3>
              <div className="flex flex-wrap gap-2">
                {servicesArray.map((service) => (
                  <Badge
                    key={service}
                    className="bg-[#E5E2DC] text-[#643737] hover:bg-[#D4D1CC]"
                  >
                    {service.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {ageGroupsArray.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[#0C2119] mb-3 uppercase tracking-wide">
                Age Groups
              </h3>
              <div className="flex flex-wrap gap-2">
                {ageGroupsArray.map((group) => (
                  <Badge
                    key={group}
                    className="bg-[#E5E2DC] text-[#643737] hover:bg-[#D4D1CC]"
                  >
                    {group.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* About */}
        {profile.bio && (
          <Card className="mb-8 border-[#E5E2DC]">
            <CardHeader>
              <CardTitle className="text-[#0C2119]">About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[#643737] leading-relaxed whitespace-pre-wrap">
                {profile.bio}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Experience & Languages */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {profile.experience_years !== undefined && profile.experience_years !== null && (
            <Card className="border-[#E5E2DC]">
              <CardHeader>
                <CardTitle className="text-[#0C2119]">Experience</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[#643737]">
                  {profile.experience_years} {profile.experience_years === 1 ? 'year' : 'years'} of experience
                </p>
              </CardContent>
            </Card>
          )}

          {profile.languages && (
            <Card className="border-[#E5E2DC]">
              <CardHeader>
                <CardTitle className="text-[#0C2119]">Languages</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[#643737]">{profile.languages}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Certifications */}
        {certifications.length > 0 && (
          <Card className="mb-8 border-[#E5E2DC]">
            <CardHeader>
              <CardTitle className="text-[#0C2119]">Certifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {certifications.map((cert) => (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between p-3 bg-[#F9F7F4] rounded-lg border border-[#E5E2DC]"
                  >
                    <div>
                      <p className="font-medium text-[#0C2119]">{cert.cert_name}</p>
                      <p className="text-sm text-[#643737]">{cert.issuing_organization}</p>
                    </div>
                    {cert.expiry_date && (
                      <p className="text-sm text-[#643737]">
                        Expires: {new Date(cert.expiry_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {certifications.length === 0 && (
          <div className="mb-8 p-4 bg-[#F9F7F4] rounded-lg border border-[#E5E2DC] text-center text-[#643737]">
            No certifications listed.
          </div>
        )}

        {/* F-058 Logic.3: Availability - parents see only open slots, no status labels */}
        <Card className="mb-8 border-[#E5E2DC]">
          <CardHeader>
            <CardTitle className="text-[#0C2119]">Available times</CardTitle>
          </CardHeader>
          <CardContent>
            {availabilitySlots.filter(s => s.status === 'open' && !s.is_blocked).length > 0 ? (
              <div className="space-y-2">
                {availabilitySlots.filter(s => s.status === 'open' && !s.is_blocked).slice(0, 7).map((slot) => {
                  const startDate = new Date(slot.slot_start_time);
                  const endDate = new Date(slot.slot_end_time);
                  return (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between p-3 bg-[#F9F7F4] rounded-lg border border-[#E5E2DC]"
                    >
                      <span className="font-medium text-[#0C2119]">
                        {startDate.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      <span className="text-[#643737]">
                        {startDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}{' '}
                        –{' '}
                        {endDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-[#643737]">
                No available times — contact to enquire.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Copy Profile Link Button */}
        <div className="mb-8 p-4 bg-[#F9F7F4] rounded-lg border border-[#E5E2DC]">
          <Button
            variant="outline"
            onClick={() => {
              const baseUrl = window.location.origin;
              const profileUrl = `${baseUrl}/publiccaregiverprofile/${profile.slug}`;
              navigator.clipboard.writeText(profileUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="w-full"
          >
            {copied ? (
              <><Check className="w-4 h-4 mr-2 text-green-600" /> Copied!</>
            ) : (
              <><Copy className="w-4 h-4 mr-2" /> Copy Profile Link</>
            )}
          </Button>
        </div>
      </div>

      {/* Sticky Booking CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E2DC] shadow-2xl md:hidden p-4 z-40">
        {renderBookingCTA()}
      </div>

      {/* Desktop Inline CTA */}
      <div className="hidden md:block max-w-4xl mx-auto px-4 pb-8">
        {renderBookingCTA()}
      </div>
    </div>
  );
}