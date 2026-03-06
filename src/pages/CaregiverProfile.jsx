import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import ProfileTab from '@/components/caregiver/ProfileTab';
import AvailabilityTab from '@/components/caregiver/AvailabilityTab';
import BookingsTab from '@/components/caregiver/BookingsTab';
import SettingsTab from '@/components/caregiver/SettingsTab';

/**
 * P-04: CAREGIVER DASHBOARD PAGE
 * 
 * Protected caregiver-only dashboard with tabbed layout.
 * Tabs: My Profile, Availability, Bookings, Settings
 * 
 * ACCESS CONTROL:
 * - Auth required
 * - Restricted to users where app_role=caregiver
 * - Redirects non-caregivers to home page
 */
export default function CaregiverProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const [copied, setCopied] = useState(false);

  const handleCopyProfileLink = () => {
    if (profile && profile.slug) {
      const publicProfileUrl = `${window.location.origin}/PublicCaregiverProfile?slug=${profile.slug}`;
      navigator.clipboard.writeText(publicProfileUrl)
        .then(() => {
          setCopied(true);
          toast.success('Your public booking link has been copied!');
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          console.error('Failed to copy profile link:', err);
          toast.error('Failed to copy link. Please try again.');
        });
    } else {
      toast.error('Profile information not available to generate link.');
    }
  };

  useEffect(() => {
    const initDashboard = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // Access Control: Restrict to caregivers (admins can view in read-only mode)
        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        const isAdmin = adminRoles.includes(currentUser.app_role);
        if (currentUser.app_role !== 'caregiver' && !isAdmin) {
          setError('Access denied. This page is for caregivers only.');
          setTimeout(() => navigate('/'), 2000);
          return;
        }

        // Fetch caregiver profile
        const profiles = await base44.entities.CaregiverProfile.filter({
          user_id: currentUser.id
        });

        if (profiles.length > 0) {
          setProfile(profiles[0]);
        }
      } catch (error) {
        console.error('Failed to load dashboard:', error);
        setError('Authentication required.');
        setTimeout(() => base44.auth.redirectToLogin(), 2000);
      } finally {
        setLoading(false);
      }
    };

    initDashboard();
  }, [navigate]);

  // Auto-generate and save slug if missing
  useEffect(() => {
    const generateAndSaveSlug = async () => {
      if (profile && !profile.slug && user) {
        const nameToSlug = profile.display_name || user.full_name;
        if (nameToSlug) {
          const generatedSlug = nameToSlug
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/--+/g, '-')
            .replace(/^-+|-+$/g, '');

          if (generatedSlug) {
            try {
              await base44.entities.CaregiverProfile.update(profile.id, { slug: generatedSlug });
              setProfile(prev => ({ ...prev, slug: generatedSlug }));
              toast.success('Profile link generated!');
            } catch (error) {
              console.error('Failed to generate slug:', error);
            }
          }
        }
      }
    };

    if (!loading && profile && user) {
      generateAndSaveSlug();
    }
  }, [profile?.id, user?.id, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage your profile, availability, and bookings
              </p>
            </div>
            {profile && (
              <div className="flex items-center gap-2">
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  profile.is_published 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {profile.is_published ? 'Published' : 'Unpublished'}
                </div>
                {profile.is_verified && (
                  <div className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    ✓ Verified
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyProfileLink}
                  disabled={!profile.slug}
                  className="flex items-center gap-1"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied ? "Copied!" : "Copy Booking Link"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* F-083R: Profile On Hold Banner */}
      {profile?.profile_status === 'on_hold' && (
        <div className="bg-yellow-50 border-b border-yellow-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <Alert className="border-yellow-300 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>Profile On Hold:</strong> You will not receive new booking requests. 
                Our team will contact you within 48 hours.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Tabbed Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="profile">My Profile</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <ProfileTab user={user} profile={profile} onProfileUpdate={setProfile} />
          </TabsContent>

          <TabsContent value="availability" className="space-y-6">
            <AvailabilityTab user={user} profile={profile} />
          </TabsContent>

          <TabsContent value="bookings" className="space-y-6">
            <BookingsTab user={user} profile={profile} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <SettingsTab user={user} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}