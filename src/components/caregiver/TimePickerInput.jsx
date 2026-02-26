import React, { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// F-057 Logic.1: 12-hour format with AM/PM
export default function TimePickerInput({ value, onChange, label, error, disabled }) {
  const [hour, setHour] = useState(value ? parseInt(value.split(':')[0]) : 9);
  const [minute, setMinute] = useState(value ? parseInt(value.split(':')[1]) : 0);
  const [period, setPeriod] = useState(value ? (hour >= 12 ? 'PM' : 'AM') : 'AM');

  const handleChange = (newHour, newMinute, newPeriod) => {
    setHour(newHour);
    setMinute(newMinute);
    setPeriod(newPeriod);

    // Convert to 24-hour format for storage
    let h24 = newHour;
    if (newPeriod === 'AM' && newHour === 12) h24 = 0;
    if (newPeriod === 'PM' && newHour !== 12) h24 += 12;

    const formatted = `${String(h24).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
    onChange(formatted);
  };

  const hours = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: (i + 1).toString(),
      label: String(i + 1).padStart(2, '0')
    }));
  }, []);

  const minutes = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => ({
      value: (i * 15).toString(),
      label: String(i * 15).padStart(2, '0')
    }));
  }, []);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2 items-center">
        <Select value={hour.toString()} onValueChange={(h) => handleChange(parseInt(h), minute, period)} disabled={disabled}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hours.map(h => (
              <SelectItem key={h.value} value={h.value}>
                {h.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-foreground font-medium">:</span>

        <Select value={minute.toString()} onValueChange={(m) => handleChange(hour, parseInt(m), period)} disabled={disabled}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {minutes.map(m => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={(p) => handleChange(hour, minute, p)} disabled={disabled}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}