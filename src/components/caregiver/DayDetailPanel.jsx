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
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">
                      {slot.start_time} - {slot.end_time}
                    </div>
                    {status && (
                      <div className={cn('text-xs inline-block px-2 py-1 rounded mt-1', status.color)}>
                        {status.label}
                      </div>
                    )}
                  </div>

                  {/* Quick actions */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingSlot(slot)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Booking details if booked/soft-locked */}
                {booking && (
                  <div className="text-xs bg-muted p-2 rounded space-y-1">
                    <div><strong>Request from:</strong> {booking.parent_name || 'Parent'}</div>
                    {booking.status && <div><strong>Status:</strong> {booking.status}</div>}
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
      <Button
        className="w-full"
        variant="outline"
        onClick={() => {/* Trigger slot creation form */}}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Slot
      </Button>
    </div>
  );

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

      {/* Delete confirmation dialog */}
      {deletingSlot && (
        <Dialog open={!!deletingSlot} onOpenChange={() => setDeletingSlot(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Slot?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this time slot ({deletingSlot.start_time} - {deletingSlot.end_time})?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeletingSlot(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => handleDelete(deletingSlot)}>
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit slot form - would be modal */}
      {editingSlot && (
        <Dialog open={!!editingSlot} onOpenChange={() => setEditingSlot(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Slot</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Edit form would go here - connects to F-057 slot form
            </p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}