import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Users, AlertCircle, Loader2, Clock, AlertTriangle, ArrowRight, Minus, Plus } from 'lucide-react';

const RECAPTCHA_SITE_KEY = '6LfjY4EsAAAAAPp3xz-1_E4TOxFfr0tEutE5qp-j';
import { format, parseISO, differenceInMinutes } from 'date-fns';

// Group open slots by date
function groupSlotsByDate(slots) {
  const groups = {};
  slots.forEach(slot => {
    const d = slot.slot_date;
    if (!groups[d]) groups[d] = [];
    groups[d].push(slot);
  });
  return groups;
}

function formatSlotRange(slot) {
  return `${slot.start_time} – ${slot.end_time}`;
}

function estimatedCost(slot, hourlyRateCents) {
  if (!slot || !hourlyRateCents) return null;
  const [sh, sm] = slot.start_time.split(':').map(Number);
  const [eh, em] = slot.end_time.split(':').map(Number);
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) return null;
  const hours = minutes / 60;
  return (hours * hourlyRateCents / 100).toFixed(2);
}

// Conflict state — shows alternative slots
function ConflictView({ alternatives, profile, onSelectAlternative, onBrowseOthers }) {
  return (
    <div className="space-y-4">
      <Alert className="border-amber-300 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <strong>This slot was just taken.</strong> Another parent has requested this slot.
          {alternatives.length > 0
            ? ` Here are other times with ${profile.display_name}:`
            : ' No other slots are currently available.'}
        </AlertDescription>
      </Alert>

      {alternatives.length > 0 ? (
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
                    <Clock className="w-3.5 h-3.5" /> {formatSlotRange(slot)}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#C36239]" />
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <button
        className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
        onClick={onBrowseOthers}
      >
        Browse other caregivers
      </button>
    </div>
  );
}

export default function BookingRequestModal({ profile, availabilitySlots, preselectedSlot, onClose }) {
  const navigate = useNavigate();

  // Step: 'form' | 'conflict'
  const [step, setStep] = useState('form');
  const [selectedDate, setSelectedDate] = useState(preselectedSlot?.slot_date || '');
  const [selectedSlotId, setSelectedSlotId] = useState(preselectedSlot?.id || '');
  const [numChildren, setNumChildren] = useState(1);
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [conflictAlternatives, setConflictAlternatives] = useState([]);

  const [recaptchaToken, setRecaptchaToken] = useState('');
  const recaptchaRef = useRef(null);

  // Load reCAPTCHA script once
  useEffect(() => {
    if (document.getElementById('recaptcha-script')) return;
    const script = document.createElement('script');
    script.id = 'recaptcha-script';
    script.src = 'https://www.google.com/recaptcha/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Render reCAPTCHA widget after script loads
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
        if (window.grecaptcha) {
          clearInterval(interval);
          renderWidget();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  const slotsByDate = useMemo(() => groupSlotsByDate(availabilitySlots), [availabilitySlots]);
  const sortedDates = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate]);
  const slotsForDate = selectedDate ? (slotsByDate[selectedDate] || []) : [];
  const selectedSlot = availabilitySlots.find(s => s.id === selectedSlotId) || null;
  const estimate = estimatedCost(selectedSlot, profile.hourly_rate_cents);

  const canSubmit = selectedSlotId && numChildren >= 1 && recaptchaToken;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedSlotId) { setError('Please select a time slot.'); return; }
    if (!recaptchaToken) { setError('Please complete the reCAPTCHA verification.'); return; }

    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('submitBookingRequest', {
        availability_slot_id: selectedSlotId,
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
      } else if (errData?.existing_booking_id) {
        setError(`You already have a pending request with this caregiver. View it in My Bookings.`);
      } else {
        setError(errData?.error || 'Failed to submit request. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectAlternative = (slot) => {
    setSelectedDate(slot.slot_date);
    setSelectedSlotId(slot.id);
    setCaptchaValue('');
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
              ? `$${(profile.hourly_rate_cents / 100).toFixed(0)}/hr · Select an available time slot`
              : 'Select an available time slot'}
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
                      onClick={() => { setSelectedDate(d); setSelectedSlotId(''); }}
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

            {/* Slot chips */}
            {selectedDate && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Select Time
                </Label>
                <div className="flex flex-wrap gap-2">
                  {slotsForDate.map(slot => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedSlotId(slot.id)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        selectedSlotId === slot.id
                          ? 'border-[#C36239] bg-[#C36239] text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-[#C36239]'
                      }`}
                    >
                      {formatSlotRange(slot)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Estimated cost */}
            {estimate && selectedSlot && (
              <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3 text-sm text-gray-700">
                <span className="font-medium">Estimated cost: </span>
                <span className="text-[#C36239] font-semibold">${estimate}</span>
                <span className="text-gray-500 ml-1">
                  ({(() => {
                    const [sh, sm] = selectedSlot.start_time.split(':').map(Number);
                    const [eh, em] = selectedSlot.end_time.split(':').map(Number);
                    const mins = (eh * 60 + em) - (sh * 60 + sm);
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    return `${h}h${m ? ` ${m}m` : ''} @ $${(profile.hourly_rate_cents / 100).toFixed(0)}/hr`;
                  })()})
                </span>
                <p className="text-xs text-gray-400 mt-0.5">Estimate only — payment infrastructure coming soon.</p>
              </div>
            )}

            {/* Number of children stepper */}
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

            {/* CAPTCHA */}
            <div className="space-y-2">
              <Label htmlFor="captcha">
                Security check: What is {captchaQuestion.a} + {captchaQuestion.b}?
              </Label>
              <input
                id="captcha"
                type="number"
                value={captchaValue}
                onChange={e => setCaptchaValue(e.target.value)}
                className="w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C36239]"
                placeholder="Answer"
                autoComplete="off"
              />
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
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : 'Request Booking'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}