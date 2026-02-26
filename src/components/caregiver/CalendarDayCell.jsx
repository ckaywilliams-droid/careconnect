import React from 'react';
import { format, isToday } from 'date-fns';
import { cn } from '@/lib/utils';

export default function CalendarDayCell({ date, slots, isToday: isTodayDay, isPast, onSelect }) {
  // F-056 Logic.2 & Logic.3: Status color coding and overflow handling
  const getStatusColor = (status) => {
    if (status === 'open') return 'bg-green-500';
    if (status === 'soft_locked') return 'bg-amber-500';
    if (status === 'booked') return 'bg-slate-500';
    return 'bg-gray-400';
  };

  const hasBlockout = slots.some(s => s.is_blocked);
  const displaySlots = slots.filter(s => !s.is_blocked).slice(0, 2);
  const overflowCount = Math.max(0, slots.filter(s => !s.is_blocked).length - 2);

  return (
    <button
      onClick={onSelect}
      disabled={isPast}
      className={cn(
        'relative rounded-lg border-2 p-2 text-left transition-colors',
        isPast
          ? 'bg-muted/50 border-transparent cursor-default'
          : 'bg-white border-border hover:bg-accent cursor-pointer',
        isTodayDay && 'ring-2 ring-primary ring-offset-0 border-primary'
      )}
    >
      {/* F-056 Logic.3: Blocked day diagonal stripe pattern */}
      {hasBlockout && (
        <div className="absolute inset-0 rounded-lg opacity-20 bg-gradient-to-br from-transparent from-45% to-transparent to-55%" 
             style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000, #000 2px, transparent 2px, transparent 10px)' }} />
      )}

      {/* Date number */}
      <div className={cn(
        'text-sm font-semibold',
        isPast ? 'text-muted-foreground' : 'text-foreground'
      )}>
        {format(date, 'd')}
      </div>

      {/* Slot indicators */}
      <div className="mt-1 space-y-1">
        {displaySlots.map((slot, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <div className={cn('h-1.5 w-1.5 rounded-full', getStatusColor(slot.status))} />
            <span className="text-xs text-muted-foreground truncate">
              {slot.start_time}
            </span>
          </div>
        ))}

        {/* F-056 Logic.2: Overflow indicator */}
        {overflowCount > 0 && (
          <div className="text-xs text-muted-foreground font-medium">
            +{overflowCount} more
          </div>
        )}
      </div>
    </button>
  );
}