import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * F-057 Triggers.1: Real-time conflict preview timeline
 * Shows existing slots and proposed new slot with visual overlap detection
 */
export default function SlotConflictTimeline({ existingSlots, proposedStart, proposedEnd, date }) {
  // Business hours: 6 AM to 11 PM (18 hours)
  const DAY_START = 6; // 6 AM
  const DAY_END = 23; // 11 PM
  const TOTAL_HOURS = DAY_END - DAY_START;

  const timeToPercent = (timeStr) => {
    if (!timeStr) return null;
    const [hours, mins] = timeStr.split(':').map(Number);
    const totalMins = (hours - DAY_START) * 60 + mins;
    return (totalMins / (TOTAL_HOURS * 60)) * 100;
  };

  const proposedStartPercent = timeToPercent(proposedStart);
  const proposedEndPercent = timeToPercent(proposedEnd);

  // Check for conflicts
  const hasConflict = useMemo(() => {
    if (!proposedStart || !proposedEnd) return false;

    return existingSlots.some(slot => {
      const slotStart = timeToPercent(slot.start_time);
      const slotEnd = timeToPercent(slot.end_time);
      
      if (slotStart === null || slotEnd === null) return false;

      // Check overlap
      return !(proposedEndPercent <= slotStart || proposedStartPercent >= slotEnd);
    });
  }, [existingSlots, proposedStartPercent, proposedEndPercent]);

  // Get conflicting slot for error message
  const conflictingSlot = useMemo(() => {
    if (!hasConflict) return null;
    return existingSlots.find(slot => {
      const slotStart = timeToPercent(slot.start_time);
      const slotEnd = timeToPercent(slot.end_time);
      if (slotStart === null || slotEnd === null) return false;
      return !(proposedEndPercent <= slotStart || proposedStartPercent >= slotEnd);
    });
  }, [hasConflict, existingSlots, proposedStartPercent, proposedEndPercent]);

  // Filter out blocked slots for timeline display
  const displaySlots = existingSlots.filter(s => !s.is_blocked);

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Timeline for {date}</div>

      {/* Timeline container */}
      <div className="bg-muted rounded-lg p-4 space-y-3">
        {/* Hour labels */}
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>{DAY_START}AM</span>
          <span>12PM</span>
          <span>{DAY_END - 12}PM</span>
        </div>

        {/* Timeline bar */}
        <div className="relative h-12 bg-white border border-border rounded">
          {/* Existing slots */}
          {displaySlots.map((slot, idx) => {
            const start = timeToPercent(slot.start_time);
            const end = timeToPercent(slot.end_time);

            if (start === null || end === null) return null;

            const statusColor = slot.status === 'open'
              ? 'bg-green-300'
              : slot.status === 'soft_locked'
              ? 'bg-amber-300'
              : 'bg-slate-400';

            return (
              <div
                key={`${slot.id}-${idx}`}
                className={cn('absolute top-0 bottom-0 opacity-70 border border-black/10', statusColor)}
                style={{
                  left: `${start}%`,
                  right: `${100 - end}%`
                }}
                title={`${slot.start_time} - ${slot.end_time}`}
              />
            );
          })}

          {/* Proposed slot */}
          {proposedStartPercent !== null && proposedEndPercent !== null && (
            <div
              className={cn(
                'absolute top-0 bottom-0 border-2 opacity-60',
                hasConflict
                  ? 'bg-red-200 border-red-500'
                  : 'bg-blue-200 border-blue-500'
              )}
              style={{
                left: `${proposedStartPercent}%`,
                right: `${100 - proposedEndPercent}%`
              }}
            />
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-300 rounded" />
            <span>Open</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-300 rounded" />
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-slate-400 rounded" />
            <span>Booked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn('w-3 h-3 rounded', hasConflict ? 'bg-red-200 border border-red-500' : 'bg-blue-200 border border-blue-500')} />
            <span>Your slot</span>
          </div>
        </div>

        {/* Conflict warning */}
        {hasConflict && conflictingSlot && (
          <div className="bg-destructive/10 border border-destructive/50 rounded p-2 text-sm text-destructive">
            ⚠️ Conflicts with {conflictingSlot.start_time} - {conflictingSlot.end_time}
          </div>
        )}
      </div>
    </div>
  );
}