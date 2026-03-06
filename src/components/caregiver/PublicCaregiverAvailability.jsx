import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isBefore, isToday, format, startOfDay } from 'date-fns';
import CalendarDayCell from './CalendarDayCell';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function endOfDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

// Read-only calendar for public caregiver profile — shows only open slots,
// clicking a day with slots triggers the booking modal pre-selecting that date.
export default function PublicCaregiverAvailability({ openSlots, onSelectSlotForBooking }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const canGoBack = !isBefore(currentMonth, addMonths(startOfMonth(new Date()), 1));
  const canGoForward = isBefore(currentMonth, addMonths(new Date(), 6));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const monthSlots = useMemo(() => {
    return openSlots.filter(slot => {
      const d = new Date(slot.slot_date);
      return d >= monthStart && d <= monthEnd;
    });
  }, [openSlots, currentMonth]);

  const slotsByDate = useMemo(() => {
    const grouped = {};
    monthSlots.forEach(slot => {
      if (!grouped[slot.slot_date]) grouped[slot.slot_date] = [];
      grouped[slot.slot_date].push(slot);
    });
    return grouped;
  }, [monthSlots]);

  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  return (
    <div className="flex flex-col gap-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#0C2119]">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} disabled={!canGoBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} disabled={!canGoForward}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-[#643737]">
        <span className="inline-block w-3 h-3 rounded-sm bg-green-600" />
        <span>Available — click a date to book</span>
      </div>

      {/* Calendar grid */}
      <div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-muted/30 rounded-lg" style={{ minHeight: 60 }} />
          ))}

          {calendarDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const daySlots = slotsByDate[dateStr] || [];
            const isPastDay = isBefore(endOfDay(day), startOfDay(new Date()));

            return (
              <CalendarDayCell
                key={dateStr}
                date={day}
                slots={daySlots}
                isToday={isToday(day)}
                isPast={isPastDay}
                onSelect={() => {
                  if (!isPastDay && daySlots.length > 0) {
                    onSelectSlotForBooking(day);
                  }
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {monthSlots.length === 0 && (
        <p className="text-center text-sm text-[#643737] py-4">
          No availability this month — check the next month or contact the caregiver directly.
        </p>
      )}
    </div>
  );
}
