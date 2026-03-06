import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import TimePickerInput from './TimePickerInput';
import SlotConflictTimeline from './SlotConflictTimeline';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * F-057: Slot Entry Form
 * Create or edit availability slots with conflict detection
 */
export default function SlotEntryForm({
  initialSlot = null,
  date,
  existingSlots = [],
  caregiverProfileId,
  onSuccess,
  onCancel
}) {
  const isEditMode = !!initialSlot;
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    base44.auth.me().then(u => setUser(u));
  }, []);

  const [formData, setFormData] = useState({
    slot_date: format(date, 'yyyy-MM-dd'),
    start_time: initialSlot?.start_time || '09:00',
    end_time: initialSlot?.end_time || '10:00',
    notes: initialSlot?.notes || ''
  });

  const [errors, setErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // F-057 Logic.3: Character counter for notes
  const charCount = formData.notes.length;
  const charLimit = 200;

  // F-057 Logic.2: Validate minimum 30-minute duration
  const validateDuration = (start, end) => {
    if (!start || !end) return true;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    return (endMins - startMins) >= 30;
  };

  // F-057 Errors.1: Validate end time after start time
  const validateTimes = () => {
    const newErrors = {};

    if (formData.end_time <= formData.start_time) {
      newErrors.end_time = 'End time must be after start time.';
    }

    if (!validateDuration(formData.start_time, formData.end_time)) {
      newErrors.duration = 'Slots must be at least 30 minutes long.';
    }

    // F-057 Errors.3: Check for past date (not just past dates, but today if time has passed)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(formData.slot_date);
    
    if (selected < today) {
      newErrors.slot_date = 'You cannot add availability for past dates.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Create/update mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (isEditMode) {
        await base44.entities.AvailabilitySlot.update(initialSlot.id, data);
      } else {
        await base44.entities.AvailabilitySlot.create(data);
      }
    },
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (error) => {
      // F-057 Errors.4: Server-side conflict handling
      if (error.message.includes('conflict')) {
        setErrors({
          submit: 'This slot conflicts with an existing slot. Please adjust your times.'
        });
      } else {
        setErrors({
          submit: error.message || 'Failed to save slot. Please try again.'
        });
      }
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      // F-055: Validate before deletion
      const validation = await base44.functions.invoke('validateSlotDeletion', {
        slot_id: initialSlot.id
      });

      if (!validation.data.success) {
        throw new Error(validation.data.error);
      }

      await base44.entities.AvailabilitySlot.delete(initialSlot.id);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      onSuccess?.();
    },
    onError: (error) => {
      setErrors({
        delete: error.message || 'Failed to delete slot.'
      });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateTimes()) {
      return;
    }

    if (isEditMode) {
      createMutation.mutate({
        slot_date: formData.slot_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        notes: formData.notes || null
      });
    } else {
      createMutation.mutate({
        caregiver_profile_id: caregiverProfileId,
        slot_date: formData.slot_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        notes: formData.notes || null
      });
    }
  };

  const canDelete = !isEditMode || initialSlot.status !== 'soft_locked';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">
          {isEditMode ? 'Edit Slot' : 'Add Time Slot'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {format(date, 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Errors */}
      {errors.submit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errors.submit}</AlertDescription>
        </Alert>
      )}

      {errors.slot_date && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errors.slot_date}</AlertDescription>
        </Alert>
      )}

      {/* Time inputs */}
      <div className="grid grid-cols-2 gap-4">
        <TimePickerInput
          label="Start Time"
          value={formData.start_time}
          onChange={(val) => {
            setFormData(p => ({ ...p, start_time: val }));
            if (errors.end_time || errors.duration) setErrors(e => ({ ...e, end_time: '', duration: '' }));
          }}
          error={errors.start_time}
          disabled={createMutation.isPending || deleteMutation.isPending}
        />
        <TimePickerInput
          label="End Time"
          value={formData.end_time}
          onChange={(val) => {
            setFormData(p => ({ ...p, end_time: val }));
            if (errors.end_time || errors.duration) setErrors(e => ({ ...e, end_time: '', duration: '' }));
          }}
          error={errors.end_time || errors.duration}
          disabled={createMutation.isPending || deleteMutation.isPending}
        />
      </div>

      {/* Conflict timeline */}
      <SlotConflictTimeline
        existingSlots={existingSlots}
        proposedStart={formData.start_time}
        proposedEnd={formData.end_time}
        date={format(date, 'MMM d')}
      />

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Notes (Optional)</label>
        <Textarea
          placeholder="e.g., available for overnight if needed"
          value={formData.notes}
          onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value.slice(0, charLimit) }))}
          maxLength={charLimit}
          disabled={createMutation.isPending || deleteMutation.isPending}
          className="min-h-20"
        />
        <div className="text-xs text-muted-foreground text-right">
          {charCount}/{charLimit}
        </div>
      </div>

      {/* Delete button (edit mode only) */}
      {isEditMode && (
        <div className="pt-4 border-t">
          <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={!canDelete || deleteMutation.isPending}
                title={!canDelete ? 'Cannot delete slot with pending booking request' : ''}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Slot
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete This Slot?</DialogTitle>
                <DialogDescription>
                  This cannot be undone if the slot has no pending requests.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-3 justify-end mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {errors.delete && (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.delete}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1"
          disabled={createMutation.isPending || deleteMutation.isPending}
        >
          {createMutation.isPending ? 'Saving...' : isEditMode ? 'Save Changes' : 'Add Slot'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={createMutation.isPending || deleteMutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}