import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import AvailabilityCalendar from './AvailabilityCalendar';

/**
 * F-056: Availability Calendar UI
 * Calendar view for caregivers to manage availability slots
 */
export default function AvailabilityTab({ user, profile }) {
  const [slots, setSlots] = useState([]);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  // F-056 Triggers.1: Fetch slots for current month
  const { data: fetchedSlots = [], isLoading, refetch } = useQuery({
    queryKey: ['availabilitySlots', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      return await base44.entities.AvailabilitySlot.filter({
        caregiver_profile_id: profile.id
      });
    },
    enabled: !!profile?.id
  });

  useEffect(() => {
    setSlots(fetchedSlots);
  }, [fetchedSlots]);

  // F-056 Triggers.2: Handle optimistic updates
  useEffect(() => {
    const unsubscribe = base44.entities.AvailabilitySlot.subscribe((event) => {
      if (event.data?.caregiver_profile_id === profile?.id) {
        setSlots(prevSlots => {
          if (event.type === 'create') {
            return [...prevSlots, event.data];
          } else if (event.type === 'update') {
            return prevSlots.map(s => s.id === event.id ? event.data : s);
          } else if (event.type === 'delete') {
            return prevSlots.filter(s => s.id !== event.id);
          }
          return prevSlots;
        });
      }
    });

    return () => unsubscribe();
  }, [profile?.id]);

  const handleRefresh = async () => {
    await refetch();
  };

  const handleCopyLink = () => {
    const baseUrl = window.location.origin;
    const profileUrl = `${baseUrl}/publiccaregiverprofile/${profile.slug}`;
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <AvailabilityCalendar
        slots={slots}
        onRefresh={handleRefresh}
        isLoading={isLoading}
        caregiverProfileId={profile?.id}
      />
      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-600 mb-3">Share your profile:</p>
        <Button
          variant="outline"
          onClick={handleCopyLink}
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
  );
}