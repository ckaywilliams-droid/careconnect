import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import SlotDetailPanel from '@/components/availability/SlotDetailPanel';
import AvailabilityCalendar from '@/components/caregiver/AvailabilityCalendar';

export default function CaregiverAvailability() {
  const [user, setUser] = useState(null);
  const [caregiverProfile, setCaregiverProfile] = useState(null);

  useEffect(() => {
    (async () => {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      const profiles = await base44.entities.CaregiverProfile.filter({ user_id: currentUser.id });
      if (profiles.length > 0) setCaregiverProfile(profiles[0]);
    })();
  }, []);

  if (!user || !caregiverProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <CalendarIcon className="w-8 h-8" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">My Availability</h1>
            <p className="text-gray-600 mt-1">Manage your availability calendar</p>
          </div>
        </div>
        <AvailabilityCalendar user={user} profile={caregiverProfile} />
      </div>
    </div>
  );
}