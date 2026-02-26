import React, { useState } from 'react';
import { format } from 'date-fns';
import { X, Edit2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import SlotEntryForm from './SlotEntryForm';
import SlotStatusBadge from './SlotStatusBadge';

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-green-100 text-green-800' },
  soft_locked: { label: 'Pending', color: 'bg-amber-100 text-amber-800' },
  booked: { label: 'Booked', color: 'bg-slate-100 text-slate-800' }
};

export default function DayDetailPanel({ date, slots, onClose, caregiverProfileId }) {
  const [editingSlot, setEditingSlot] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDesktop] = useState(window.innerWidth >= 1024);

  // Fetch booking details for soft-locked and booked slots
  const { data: bookingDetails } = useQuery({
    queryKey: ['dayDetailBookings', slots.map(s => s.id)],
    queryFn: async () => {
      const bookingSlotIds = slots
        .filter(s => ['soft_locked', 'booked'].includes(s.status))
        .map(s => s.id);

      if (bookingSlotIds.length === 0) return {};

      const bookings = await Promise.all(
        bookingSlotIds.map(async (slotId) => {
          const results = await base44.entities.BookingRequest.filter({ slot_id: slotId });
          return { slotId, booking: results[0] || null };
        })
      );

      return Object.fromEntries(bookings.map(b => [b.slotId, b.booking]));
    }
  });

  const handleFormSuccess = () => {
    // Form handles optimistic updates via subscription
    if (editingSlot) {
      setEditingSlot(null);
    } else {
      setIsCreating(false);
    }
  };

  const slotContent = (
    <div className="space-y-3">
      <h3 className="font-semibold">{format(date, 'EEEE, MMMM d, yyyy')}</h3>

      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No slots for this date.</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {slots.map(slot => {
            const booking = bookingDetails?.[slot.id];
            const status = STATUS_CONFIG[slot.status];

            return (
              <div
                key={slot.id}
                className="border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-semibold text-base">
                      {slot.start_time} - {slot.end_time}
                    </div>
                    <SlotStatusBadge slot={slot} parentName={booking?.parent_name} showLabel={true} />
                  </div>

                  {/* Quick edit */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingSlot(slot)}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* F-058 UI.3: Soft-locked slot details */}
                {slot.status === 'soft_locked' && booking && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <p className="text-sm font-medium text-amber-900">
                      Request from {booking.parent_name || 'Parent'}
                    </p>
                    {booking.created_date && (
                      <p className="text-xs text-amber-700 mt-1">
                        Requested {format(new Date(booking.created_date), 'MMM d, yyyy')}
                      </p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700">
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        Decline
                      </Button>
                    </div>
                  </div>
                )}

                {slot.notes && (
                  <div className="text-xs text-muted-foreground italic">
                    {slot.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add slot button */}
      {!isCreating && (
        <Button
          className="w-full"
          variant="outline"
          onClick={() => setIsCreating(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Slot
        </Button>
      )}
    </div>
  );

  // Show form if creating or editing
  if (isCreating || editingSlot) {
    const formContent = (
      <SlotEntryForm
        initialSlot={editingSlot}
        date={date}
        existingSlots={slots}
        caregiverProfileId={caregiverProfileId}
        onSuccess={handleFormSuccess}
        onCancel={() => {
          setIsCreating(false);
          setEditingSlot(null);
        }}
      />
    );

    if (!isDesktop) {
      return (
        <Sheet open={true} onOpenChange={onClose}>
          <SheetContent side="bottom" className="rounded-t-xl max-h-[90vh]">
            <div className="mt-4 pb-6 overflow-y-auto">
              {formContent}
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <>
        <div className="fixed right-0 top-0 h-full w-96 bg-white border-l shadow-lg z-40 flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="font-semibold">
              {editingSlot ? 'Edit Slot' : 'Add Slot'}
            </h2>
            <Button size="icon" variant="ghost" onClick={() => {
              setIsCreating(false);
              setEditingSlot(null);
            }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {formContent}
          </div>
        </div>
        <div className="fixed inset-0 bg-black/20 z-30" onClick={() => {
          setIsCreating(false);
          setEditingSlot(null);
        }} />
      </>
    );
  }

  // Mobile: Bottom sheet, Desktop: Side panel
  if (!isDesktop) {
    return (
      <Sheet open={true} onOpenChange={onClose}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle>{format(date, 'EEEE, MMMM d')}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 pb-6">
            {slotContent}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Side panel
  return (
    <>
      <div className="fixed right-0 top-0 h-full w-96 bg-white border-l shadow-lg z-40 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="font-semibold">{format(date, 'EEEE, MMMM d')}</h2>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {slotContent}
        </div>
      </div>
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />
    </>
  );
}