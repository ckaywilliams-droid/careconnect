import React from 'react';
import { format, isToday } from 'date-fns';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';

export default function CalendarDayCell({ date, slots, isToday: isTodayDay, isPast, onSelect, preselectedDate }) {
  const isSelected = preselectedDate && dayjs(date).isSame(dayjs(preselectedDate), 'day');
  // F-058 Logic.1: Status color and icon based on slot status and is_blocked
  const getSlotDisplay = (slot) => {
    if (slot.is_blocked) {
      return {
        color: 'bg-slate-300',
        icon: <XCircle className="h-3 w-3" />,
      };
    }
    
    switch (slot.status) {
      case 'open':
        return { color: 'bg-green-600', icon: <CheckCircle2 className="h-3 w-3" /> };
      case 'soft_locked':
        return { color: 'bg-amber-600', icon: <Clock className="h-3 w-3" /> };
      case 'booked':
        return { color: 'bg-slate-700', icon: <Lock className="h-3 w-3" /> };
      default:
        return { color: 'bg-slate-400', icon: null };
    }
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
        isTodayDay && 'ring-2 ring-primary ring-offset-0 border-primary',
        isSelected && 'ring-2 ring-[#C36239] bg-orange-50'
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

      {/* F-058 Slot indicators with status colors and icons */}
      <div className="mt-1 space-y-1">
        {displaySlots.map((slot, idx) => {
          const display = getSlotDisplay(slot);
          return (
            <div key={idx} className={cn('flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-white text-xs font-medium', display.color)}>
              <span className="truncate">{slot.start_time}</span>
              {display.icon}
            </div>
          );
        })}

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