import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Clock, Plus, Trash2 } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function SlotDetailPanel({ isOpen, onClose, selectedDate, slots, caregiverId }) {
  const [isMobile, setIsMobile] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const daySlots = selectedDate
    ? slots.filter(slot => isSameDay(new Date(slot.start_time), selectedDate))
    : [];

  const deleteSlotMutation = useMutation({
    mutationFn: async (slotId) => {
      await base44.asServiceRole.entities.AvailabilitySlot.delete(slotId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['availability-slots']);
    },
  });

  const handleDeleteSlot = async (slotId) => {
    if (confirm('Are you sure you want to delete this time slot?')) {
      await deleteSlotMutation.mutateAsync(slotId);
    }
  };

  // Desktop: slide-over from right
  // Mobile: bottom sheet
  const sheetSide = isMobile ? 'bottom' : 'right';

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side={sheetSide}
        className={isMobile ? 'h-[80vh]' : 'w-[400px] sm:w-[540px]'}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : 'Select a date'}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {daySlots.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No slots for this day</h3>
              <p className="text-gray-600 mb-4">Add availability slots to start accepting bookings.</p>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Time Slot
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  {daySlots.length} {daySlots.length === 1 ? 'Slot' : 'Slots'}
                </h3>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Slot
                </Button>
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {daySlots.map(slot => (
                  <div
                    key={slot.id}
                    className="border rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span className="font-medium">
                            {format(new Date(slot.start_time), 'h:mm a')} - {format(new Date(slot.end_time), 'h:mm a')}
                          </span>
                        </div>
                        <Badge variant={slot.is_booked ? 'secondary' : 'default'}>
                          {slot.is_booked ? 'Booked' : 'Available'}
                        </Badge>
                      </div>
                      {!slot.is_booked && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {slot.notes && (
                      <p className="text-sm text-gray-600 mt-2">{slot.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}