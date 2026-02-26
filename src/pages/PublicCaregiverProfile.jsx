import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MapPin, DollarSign, Calendar, CheckCircle, Shield, Languages, Award, AlertTriangle } from 'lucide-react';
import BookingRequestModal from '@/components/BookingRequestModal';

export default function PublicCaregiverProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    loadProfile();
  }, [slug]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if user is authenticated
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch {
        setUser(null);
      }

      // Load caregiver profile
      const profiles = await base44.entities.CaregiverProfile.filter({
        slug: slug,
        is_published: true
      });

      if (!profiles || profiles.length === 0) {
        setError('Caregiver profile not found or is not available.');
        setLoading(false);
        return;
      }

      const caregiverProfile = profiles[0];
      setProfile(caregiverProfile);

      // Load availability slots (open slots only)
      const slots = await base44.entities.AvailabilitySlot.filter({
        caregiver_profile_id: caregiverProfile.id,
        status: 'open'
      }, 'start_datetime');
      setAvailabilitySlots(slots);

      // Load certifications
      const certs = await base44.entities.Certification.filter({
        caregiver_profile_id: caregiverProfile.id,
        is_deleted: false,
        is_suppressed: false,
        verification_status: 'verified'
      });
      setCertifications(certs);

      setLoading(false);
    } catch (err) {
      console.error('Error loading profile:', err);
      setError('Failed to load caregiver profile.');
      setLoading(false);
    }
  };

  const handleRequestBooking = () => {
    if (!user) {
      // Not logged in - redirect to login with return URL
      const returnUrl = window.location.pathname;
      base44.auth.redirectToLogin(returnUrl);
      return;
    }

    // Check if user is a parent
    if (user.app_role !== 'parent') {
      alert('Only parents can request bookings.');
      return;
    }

    setShowBookingModal(true);
  };

  const handleSlotClick = (slot) => {
    setSelectedSlot(slot);
    handleRequestBooking();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C36239] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Profile Not Found</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => navigate(createPageUrl('Marketplace'))}>
              Browse Caregivers
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const servicesArray = profile.services_offered ? profile.services_offered.split(',').map(s => s.trim()) : [];
  const languagesArray = profile.languages ? profile.languages.split(',').map(l => l.trim()) : [];
  const ageGroupsArray = profile.age_groups ? profile.age_groups.split(',').map(a => a.trim()) : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#434C30] to-[#0C2119] h-48"></div>

      <div className="container mx-auto px-4 -mt-24 pb-12">
        {/* Profile Header Card */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Profile Photo */}
              <div className="relative">
                <img
                  src={profile.profile_photo_url || 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400'}
                  alt={profile.display_name}
                  className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
                />
                {profile.is_verified && (
                  <div className="absolute -bottom-2 -right-2 bg-green-600 text-white rounded-full p-2">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                )}
              </div>

              {/* Profile Info */}
              <div className="flex-1">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-3xl font-bold text-gray-900">{profile.display_name}</h1>
                      {profile.is_verified && (
                        <Badge className="bg-green-600 text-white">
                          <Shield className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-gray-600 mb-4">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span>{profile.city}, {profile.state}</span>
                      </div>
                      {profile.experience_years && (
                        <div>
                          <span className="font-semibold">{profile.experience_years}</span> years experience
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hourly Rate */}
                  <div className="text-right">
                    <div className="text-3xl font-bold text-[#C36239]">
                      ${(profile.hourly_rate_cents / 100).toFixed(0)}/hr
                    </div>
                    <p className="text-sm text-gray-500">Starting rate</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  <Button
                    size="lg"
                    className="bg-[#C36239] hover:bg-[#75290F] text-white"
                    onClick={handleRequestBooking}
                  >
                    <Calendar className="w-5 h-5 mr-2" />
                    Request Booking
                  </Button>
                  {user && (
                    <Button variant="outline" size="lg">
                      Report
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* About Section */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">About</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {profile.bio || 'No bio provided.'}
                </p>
              </CardContent>
            </Card>

            {/* Services & Age Groups */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Services Offered</h2>
                <div className="flex flex-wrap gap-2 mb-6">
                  {servicesArray.length > 0 ? (
                    servicesArray.map((service, idx) => (
                      <Badge key={idx} variant="secondary" className="text-sm">
                        {service.replace(/_/g, ' ')}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-gray-500">No services listed</p>
                  )}
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-3">Age Groups</h3>
                <div className="flex flex-wrap gap-2">
                  {ageGroupsArray.length > 0 ? (
                    ageGroupsArray.map((age, idx) => (
                      <Badge key={idx} variant="outline" className="text-sm">
                        {age.replace(/_/g, ' ')}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-gray-500">No age groups listed</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Availability Calendar */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Availability</h2>
                {availabilitySlots.length > 0 ? (
                  <div className="space-y-2">
                    {availabilitySlots.slice(0, 10).map((slot) => (
                      <button
                        key={slot.id}
                        onClick={() => handleSlotClick(slot)}
                        className="w-full flex items-center justify-between p-4 border border-green-200 bg-green-50 hover:bg-green-100 rounded-lg transition-colors text-left"
                      >
                        <div>
                          <div className="font-semibold text-gray-900">
                            {new Date(slot.start_datetime).toLocaleDateString('en-US', { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </div>
                          <div className="text-sm text-gray-600">
                            {new Date(slot.start_datetime).toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit' 
                            })} - {new Date(slot.end_datetime).toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </div>
                        <Badge className="bg-green-600 text-white">Available</Badge>
                      </button>
                    ))}
                    {availabilitySlots.length > 10 && (
                      <p className="text-sm text-gray-500 text-center mt-4">
                        +{availabilitySlots.length - 10} more slots available
                      </p>
                    )}
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>
                      No availability slots currently posted. Check back soon!
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Languages */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Languages className="w-5 h-5" />
                  Languages
                </h3>
                <div className="space-y-2">
                  {languagesArray.length > 0 ? (
                    languagesArray.map((lang, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#C36239] rounded-full"></div>
                        <span className="text-gray-700">{lang}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No languages listed</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Certifications */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Certifications
                </h3>
                <div className="space-y-3">
                  {certifications.length > 0 ? (
                    certifications.map((cert) => (
                      <div key={cert.id} className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-gray-900">{cert.cert_name}</div>
                          {cert.issuing_organization && (
                            <div className="text-sm text-gray-600">{cert.issuing_organization}</div>
                          )}
                          {cert.expiry_date && (
                            <div className="text-xs text-gray-500">
                              Expires: {new Date(cert.expiry_date).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No certifications listed</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Profile Stats */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Profile Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Completed Bookings</span>
                    <span className="font-semibold">{profile.total_bookings_completed || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Profile Completion</span>
                    <span className="font-semibold">{profile.completion_pct || 0}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Booking Request Modal */}
      {showBookingModal && (
        <BookingRequestModal
          profile={profile}
          availabilitySlots={availabilitySlots}
          preselectedSlot={selectedSlot}
          onClose={() => {
            setShowBookingModal(false);
            setSelectedSlot(null);
          }}
        />
      )}
    </div>
  );
}