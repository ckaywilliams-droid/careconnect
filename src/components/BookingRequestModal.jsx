import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Users, AlertCircle, Loader2, Clock, AlertTriangle, ArrowRight, Minus, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const RECAPTCHA_SITE_KEY = '6LfjY4EsAAAAAPp3xz-1_E4TOxFfr0tEutE5qp-j';

// ── Time helpers ──────────────────────────────────────────────────────────────
function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function formatTime12h(t) {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function groupSlotsByDate(slots) {
  const groups = {};
  slots.forEach(slot => {
    const d = slot.slot_date;
    if (!groups[d]) groups[d] = [];
    groups[d].push(slot);
  });
  return groups;
}

// ── Conflict view ─────────────────────────────────────────────────────────────
function ConflictView({ alternatives, profile, onSelectAlternative, onBrowseOthers }) {
  return (
    <div className="space-y-4">
      <Alert className="border-amber-300 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <strong>This time is already booked.</strong> Another parent has an overlapping request.
          {alternatives.length > 0
            ? ` Other available windows with ${profile.display_name}:`
            : ' No other windows are currently available.'}
        </AlertDescription>
      </Alert>

      {alternatives.length > 0 && (
        <div className="space-y-2">
          {alternatives.map(slot => (
            <button
              key={slot.id}
              className="w-full text-left border border-gray-200 rounded-xl p-4 hover:border-[#C36239] hover:bg-orange-50 transition-colors"
              onClick={() => onSelectAlternative(slot)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {format(parseISO(slot.slot_date), 'EEEE, MMMM d')}
                  </p>
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime12h(slot.start_time)} – {formatTime12h(slot.end_time)}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#C36239]" />
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
        onClick={onBrowseOthers}
      >
        Browse other caregivers
      </button>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function BookingRequestModal({ profile, availabilitySlots, preselectedSlot, onClose }) {
  const navigate = useNavigate();
  const minHours = profile.minimum_hours || 2;

  const [step, setStep] = useState('form');
  const [selectedDate, setSelectedDate] = useState(preselectedSlot?.slot_date || '');
  const [selectedWindowId, setSelectedWindowId] = useState('');
  const [startTimeVal, setStartTimeVal] = useState('');
  const [durationHours, setDurationHours] = useState(minHours);
  const [numChildren, setNumChildren] = useState(1);
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [conflictAlternatives, setConflictAlternatives] = useState([]);
  const [recaptchaToken, setRecaptchaToken] = useState('');
  const recaptchaRef = useRef(null);

  // reCAPTCHA script
  useEffect(() => {
    if (document.getElementById('recaptcha-script')) return;
    const script = document.createElement('script');
    script.id = 'recaptcha-script';
    script.src = 'https://www.google.com/recaptcha/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const renderWidget = () => {
      if (window.grecaptcha && recaptchaRef.current && !recaptchaRef.current.dataset.rendered) {
        recaptchaRef.current.dataset.rendered = 'true';
        window.grecaptcha.render(recaptchaRef.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          callback: (token) => setRecaptchaToken(token),
          'expired-callback': () => setRecaptchaToken(''),
        });
      }
    };
    if (window.grecaptcha) {
      renderWidget();
    } else {
      const interval = setInterval(() => {
        if (window.grecaptcha) { clearInterval(interval); renderWidget(); }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  // Sync preselectedSlot changes
  useEffect(() => {
    if (preselectedSlot?.slot_date) {
      setSelectedDate(preselectedSlot.slot_date);
      setSelectedWindowId('');
      setStartTimeVal('');
      setDurationHours(minHours);
    }
  }, [preselectedSlot]);

  const slotsByDate = useMemo(() => groupSlotsByDate(availabilitySlots), [availabilitySlots]);
  const sortedDates = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate]);
  const slotsForDate = selectedDate ? (slotsByDate[selectedDate] || []) : [];
  const selectedWindow = slotsForDate.find(s => s.id === selectedWindowId) || null;

  // Auto-select the window when there's only one on the date
  useEffect(() => {
    if (slotsForDate.length === 1) {
      setSelectedWindowId(slotsForDate[0].id);
    } else {
      setSelectedWindowId('');
    }
    setStartTimeVal('');
    setDurationHours(minHours);
  }, [selectedDate]);

  // Reset time picks when window changes
  useEffect(() => {
    setStartTimeVal('');
    setDurationHours(minHours);
  }, [selectedWindowId]);

  // Clamp duration if start time changes and current duration would exceed window
  useEffect(() => {
    if (selectedWindow && startTimeVal) {
      const windowEndMins = timeToMins(selectedWindow.end_time);
      const startMins = timeToMins(startTimeVal);
      const maxDurMins = windowEndMins - startMins;
      if (durationHours * 60 > maxDurMins) {
        setDurationHours(Math.max(minHours, Math.floor(maxDurMins / 30) * 30 / 60));
      }
    }
  }, [startTimeVal, selectedWindow]);

  // Valid start times: 30-min increments, must leave room for minimum duration
  const validStartTimes = useMemo(() => {
    if (!selectedWindow) return [];
    const windowStartMins = timeToMins(selectedWindow.start_time);
    const windowEndMins = timeToMins(selectedWindow.end_time);
    const minDurMins = minHours * 60;
    const times = [];
    for (let t = windowStartMins; t + minDurMins <= windowEndMins; t += 30) {
      times.push(minsToTime(t));
    }
    return times;
  }, [selectedWindow, minHours]);

  // Valid durations: 30-min increments from minHours to max possible
  const validDurationOptions = useMemo(() => {
    if (!selectedWindow || !startTimeVal) return [];
    const windowEndMins = timeToMins(selectedWindow.end_time);
    const startMins = timeToMins(startTimeVal);
    const minDurMins = minHours * 60;
    const maxDurMins = windowEndMins - startMins;
    const options = [];
    for (let d = minDurMins; d <= maxDurMins; d += 30) {
      const h = Math.floor(d / 60);
      const m = d % 60;
      options.push({ value: d / 60, label: m === 0 ? `${h}h` : `${h}h 30m` });
    }
    return options;
  }, [selectedWindow, startTimeVal, minHours]);

  const endTimeVal = useMemo(() => {
    if (!startTimeVal || !durationHours) return null;
    return minsToTime(timeToMins(startTimeVal) + durationHours * 60);
  }, [startTimeVal, durationHours]);

  const estimatedCost = useMemo(() => {
    if (!durationHours || !profile.hourly_rate_cents) return null;
    return ((durationHours * profile.hourly_rate_cents) / 100).toFixed(2);
  }, [durationHours, profile.hourly_rate_cents]);

  const canSubmit = selectedWindowId && startTimeVal && endTimeVal && numChildren >= 1 && recaptchaToken;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedWindowId) { setError('Please select an availability window.'); return; }
    if (!startTimeVal) { setError('Please select a start time.'); return; }
    if (!recaptchaToken) { setError('Please complete the reCAPTCHA verification.'); return; }

    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('submitBookingRequest', {
        availability_slot_id: selectedWindowId,
        requested_start_time: startTimeVal,
        requested_end_time: endTimeVal,
        num_children: numChildren,
        special_requests: specialRequests || undefined,
        captcha_token: recaptchaToken,
      });

      if (res.data?.success) {
        navigate(createPageUrl('ParentBookings'));
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.error === 'slot_conflict') {
        setConflictAlternatives(errData.alternative_slots || []);
        setStep('conflict');
      } else {
        setError(errData?.error || errData?.message || 'Failed to submit request. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectAlternative = (slot) => {
    setSelectedDate(slot.slot_date);
    setSelectedWindowId(slot.id);
    setStartTimeVal('');
    setDurationHours(minHours);
    setRecaptchaToken('');
    if (window.grecaptcha) window.grecaptcha.reset();
    setStep('form');
    setError(null);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Booking with {profile.display_name}</DialogTitle>
          <DialogDescription>
            {profile.hourly_rate_cents
              ? `$${(profile.hourly_rate_cents / 100).toFixed(0)}/hr · `
              : ''}
            Minimum booking: {minHours} hour{minHours === 1 ? '' : 's'}
          </DialogDescription>
        </DialogHeader>

        {step === 'conflict' ? (
          <ConflictView
            alternatives={conflictAlternatives}
            profile={profile}
            onSelectAlternative={handleSelectAlternative}
            onBrowseOthers={() => { onClose(); navigate(createPageUrl('FindCaregivers')); }}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 mt-2">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Date selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> Select Date
              </Label>
              {sortedDates.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                  No upcoming availability. Check back later.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sortedDates.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        selectedDate === d
                          ? 'border-[#C36239] bg-[#C36239] text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-[#C36239]'
                      }`}
                    >
                      {format(parseISO(d), 'EEE, MMM d')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Window selection (only shown when multiple windows exist for the date) */}
            {selectedDate && slotsForDate.length > 1 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Select Availability Window
                </Label>
                <div className="flex flex-wrap gap-2">
                  {slotsForDate.map(slot => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedWindowId(slot.id)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        selectedWindowId === slot.id
                          ? 'border-[#C36239] bg-[#C36239] text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-[#C36239]'
                      }`}
                    >
                      {formatTime12h(slot.start_time)} – {formatTime12h(slot.end_time)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Single window info banner */}
            {selectedDate && slotsForDate.length === 1 && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                Available: <span className="font-medium">{formatTime12h(slotsForDate[0].start_time)} – {formatTime12h(slotsForDate[0].end_time)}</span>
              </div>
            )}

            {/* Start time picker */}
            {selectedWindowId && (
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Select value={startTimeVal} onValueChange={setStartTimeVal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose start time..." />
                  </SelectTrigger>
                  <SelectContent>
                    {validStartTimes.map(t => (
                      <SelectItem key={t} value={t}>{formatTime12h(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Duration picker */}
            {startTimeVal && (
              <div className="space-y-2">
                <Label>
                  Duration{' '}
                  <span className="text-gray-400 font-normal text-xs">(min {minHours}h)</span>
                </Label>
                <Select
                  value={String(durationHours)}
                  onValueChange={(v) => setDurationHours(parseFloat(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose duration..." />
                  </SelectTrigger>
                  <SelectContent>
                    {validDurationOptions.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Summary: time range + cost */}
            {startTimeVal && endTimeVal && (
              <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 font-medium">
                    {formatTime12h(startTimeVal)} → {formatTime12h(endTimeVal)}
                  </span>
                  {estimatedCost && (
                    <span className="text-[#C36239] font-semibold">${estimatedCost}</span>
                  )}
                </div>
                {estimatedCost && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {durationHours}h @ ${(profile.hourly_rate_cents / 100).toFixed(0)}/hr · Estimate only
                  </p>
                )}
              </div>
            )}

            {/* Number of children */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Users className="w-4 h-4" /> Number of Children
              </Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setNumChildren(n => Math.max(1, n - 1))}
                  className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-10 text-center font-semibold text-gray-900">{numChildren}</span>
                <button
                  type="button"
                  onClick={() => setNumChildren(n => Math.min(10, n + 1))}
                  className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm text-gray-500">{numChildren === 1 ? 'child' : 'children'}</span>
              </div>
            </div>

            {/* Special requests */}
            <div className="space-y-2">
              <Label htmlFor="sr">
                Special Requests <span className="text-gray-400 font-normal">(optional)</span>
                <span className="ml-2 text-xs text-gray-400">{specialRequests.length}/500</span>
              </Label>
              <Textarea
                id="sr"
                value={specialRequests}
                onChange={e => setSpecialRequests(e.target.value.slice(0, 500))}
                placeholder="Allergies, routines, any special instructions..."
                rows={3}
                className="resize-none"
              />
            </div>

            {/* reCAPTCHA */}
            <div>
              <div ref={recaptchaRef} />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting} className="flex-1">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !canSubmit}
                className="flex-1 bg-[#C36239] hover:bg-[#75290F] text-white"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                  : 'Request Booking'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}