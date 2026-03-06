import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Calendar as CalendarIcon } from 'lucide-react';
import SlotDetailPanel from '@/components/availability/SlotDetailPanel';

const localizer = momentLocalizer(moment);

export default function CaregiverAvailability() {
  const [user, setUser] = useState(null);
  const [caregiverProfileId, setCaregiverProfileId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const currentUser = await base44.auth.me();
    setUser(currentUser);
    const profiles = await base44.entities.CaregiverProfile.filter({ user_id: currentUser.id });
    if (profiles.length > 0) {
      setCaregiverProfileId(profiles[0].id);
    }
  };

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['availability-slots', caregiverProfileId],
    queryFn: async () => {
      if (!caregiverProfileId) return [];
      return await base44.entities.AvailabilitySlot.filter({
        caregiver_profile_id: caregiverProfileId
      });
    },
    enabled: !!caregiverProfileId,
  });

  // Convert slots to calendar events
  const events = slots.map(slot => ({
    id: slot.id,
    title: slot.is_booked ? 'Booked' : 'Available',
    start: new Date(slot.start_time),
    end: new Date(slot.end_time),
    resource: slot,
  }));

  const handleSelectSlot = (slotInfo) => {
    setSelectedDate(slotInfo.start);
    setIsPanelOpen(true);
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setSelectedDate(null);
  };

  const eventStyleGetter = (event) => {
    const isBooked = event.resource?.is_booked;
    return {
      style: {
        backgroundColor: isBooked ? '#e5e7eb' : '#10b981',
        color: isBooked ? '#6b7280' : '#ffffff',
        border: 'none',
        borderRadius: '4px',
      },
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading availability...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarIcon className="w-8 h-8" />
              My Availability
            </h1>
            <p className="text-gray-600 mt-1">Manage your availability calendar</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 md:p-6">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 600 }}
            onSelectSlot={handleSelectSlot}
            selectable
            eventPropGetter={eventStyleGetter}
            views={['month']}
            defaultView="month"
          />
        </div>

        <SlotDetailPanel
          isOpen={isPanelOpen}
          onClose={handleClosePanel}
          selectedDate={selectedDate}
          slots={slots}
          caregiverId={caregiverProfileId}
        />
      </div>
    </div>
  );
}