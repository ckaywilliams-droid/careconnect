import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isBefore, isToday, format, startOfDay } from 'date-fns';
import CalendarDayCell from './CalendarDayCell';
import DayDetailPanel from './DayDetailPanel';
import SlotStatusLegend from './SlotStatusLegend';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AvailabilityCalendar({ slots, onRefresh, isLoading, caregiverProfileId }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // F-056 Logic.1: Month navigation constraints
  const canGoBack = !isBefore(currentMonth, addMonths(startOfMonth(new Date()), 1));
  const canGoForward = isBefore(currentMonth, addMonths(new Date(), 6));

  const handlePrevMonth = () => {
    if (canGoBack) setCurrentMonth(addMonths(currentMonth, -1));
  };

  const handleNextMonth = () => {
    if (canGoForward) setCurrentMonth(addMonths(currentMonth, 1));
  };

  // F-056 Triggers.1: Get all slots for the displayed month
  const monthSlots = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return slots.filter(slot => {
      const slotDate = new Date(slot.slot_date);
      return slotDate >= monthStart && slotDate <= monthEnd;
    });
  }, [slots, currentMonth]);

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const grouped = {};
    monthSlots.forEach(slot => {
      if (!grouped[slot.slot_date]) {
        grouped[slot.slot_date] = [];
      }
      grouped[slot.slot_date].push(slot);
    });
    return grouped;
  }, [monthSlots]);

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevMonth}
            disabled={!canGoBack}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextMonth}
            disabled={!canGoForward}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Past month banner */}
      {isBefore(monthEnd, new Date()) && (
        <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
          Past months are read-only.
        </div>
      )}

      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1 flex-1">
          {/* Empty cells for days before month starts */}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`empty-start-${i}`} className="bg-muted/30 rounded-lg" />
          ))}

          {/* Day cells */}
          {calendarDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const daySlots = slotsByDate[dateStr] || [];
            const isPastDay = isBefore(endOfDay(day), startOfDay(new Date()));
            const isTodayDay = isToday(day);

            return (
              <CalendarDayCell
                key={dateStr}
                date={day}
                slots={daySlots}
                isToday={isTodayDay}
                isPast={isPastDay}
                onSelect={() => !isPastDay && setSelectedDate(day)}
              />
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {monthSlots.length === 0 && !isBefore(monthEnd, new Date()) && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No availability set for this month.</p>
          <p className="text-sm">Click any date to add a slot.</p>
        </div>
      )}

      {/* Day detail panel */}
      {selectedDate && (
        <DayDetailPanel
          date={selectedDate}
          slots={slotsByDate[format(selectedDate, 'yyyy-MM-dd')] || []}
          onClose={() => setSelectedDate(null)}
          caregiverProfileId={caregiverProfileId}
        />
      )}
    </div>
  );
}

function endOfDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}