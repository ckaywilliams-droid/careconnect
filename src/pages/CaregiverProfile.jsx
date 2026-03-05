import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Loader2 } from 'lucide-react';
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