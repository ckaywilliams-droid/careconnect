import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Users, AlertCircle, Loader2 } from 'lucide-react';

export default function BookingRequestModal({ profile, availabilitySlots, preselectedSlot, onClose }) {
  const navigate = useNavigate();
  const [selectedSlotId, setSelectedSlotId] = useState(preselectedSlot?.id || '');
  const [numChildren, setNumChildren] = useState('1');
  const [specialRequests, setSpecialRequests] = useState('');
  const [captchaValue, setCaptchaValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Simple math CAPTCHA
  const [captchaQuestion] = useState(() => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    return { num1, num2, answer: num1 + num2 };
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!selectedSlotId) {
      setError('Please select a time slot.');
      return;
    }

    if (!numChildren || numChildren < 1 || numChildren > 10) {
      setError('Number of children must be between 1 and 10.');
      return;
    }

    if (specialRequests.length > 500) {
      setError('Special requests must be 500 characters or less.');
      return;
    }

    // CAPTCHA validation
    if (parseInt(captchaValue) !== captchaQuestion.answer) {
      setError('CAPTCHA answer is incorrect. Please try again.');
      setCaptchaValue('');
      return;
    }

    try {
      setSubmitting(true);

      // Get current user
      const user = await base44.auth.me();
      if (!user) {
        setError('You must be logged in to request a booking.');
        return;
      }

      // Get the selected slot details
      const selectedSlot = availabilitySlots.find(s => s.id === selectedSlotId);
      if (!selectedSlot) {
        setError('Selected time slot is no longer available.');
        return;
      }

      // Create booking request
      const bookingData = {
        caregiver_profile_id: profile.id,
        caregiver_user_id: profile.user_id,
        parent_id: user.id,
        availability_slot_id: selectedSlotId,
        start_datetime: selectedSlot.start_datetime,
        end_datetime: selectedSlot.end_datetime,
        num_children: parseInt(numChildren),
        special_requests: specialRequests || null,
        status: 'pending',
        hourly_rate_cents: profile.hourly_rate_cents
      };

      await base44.entities.BookingRequest.create(bookingData);

      // Success - redirect to My Bookings
      navigate(createPageUrl('MyBookings'));
    } catch (err) {
      console.error('Error creating booking request:', err);
      setError(err.message || 'Failed to submit booking request. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Request Booking with {profile.display_name}</DialogTitle>
          <DialogDescription>
            Fill out the form below to request a booking. The caregiver will review and respond to your request.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Slot Selection */}
          <div className="space-y-2">
            <Label htmlFor="slot" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Select Time Slot *
            </Label>
            <Select value={selectedSlotId} onValueChange={setSelectedSlotId} required>
              <SelectTrigger id="slot">
                <SelectValue placeholder="Choose an available time slot" />
              </SelectTrigger>
              <SelectContent>
                {availabilitySlots.map((slot) => (
                  <SelectItem key={slot.id} value={slot.id}>
                    {new Date(slot.start_datetime).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })} • {new Date(slot.start_datetime).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit' 
                    })} - {new Date(slot.end_datetime).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit' 
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Number of Children */}
          <div className="space-y-2">
            <Label htmlFor="numChildren" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Number of Children *
            </Label>
            <Select value={numChildren} onValueChange={setNumChildren} required>
              <SelectTrigger id="numChildren">
                <SelectValue placeholder="Select number" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                  <SelectItem key={num} value={num.toString()}>
                    {num} {num === 1 ? 'child' : 'children'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Special Requests */}
          <div className="space-y-2">
            <Label htmlFor="specialRequests">
              Special Requests (Optional)
              <span className="text-sm text-gray-500 ml-2">{specialRequests.length}/500</span>
            </Label>
            <Textarea
              id="specialRequests"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value.slice(0, 500))}
              placeholder="Any special requirements or notes for the caregiver..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* CAPTCHA */}
          <div className="space-y-2">
            <Label htmlFor="captcha">
              Security Check: What is {captchaQuestion.num1} + {captchaQuestion.num2}? *
            </Label>
            <Input
              id="captcha"
              type="number"
              value={captchaValue}
              onChange={(e) => setCaptchaValue(e.target.value)}
              placeholder="Enter the answer"
              required
            />
          </div>

          {/* Booking Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-gray-900">Booking Summary</h4>
            <div className="text-sm text-gray-700 space-y-1">
              <div className="flex justify-between">
                <span>Hourly Rate:</span>
                <span className="font-semibold">${(profile.hourly_rate_cents / 100).toFixed(0)}/hr</span>
              </div>
              <div className="flex justify-between">
                <span>Number of Children:</span>
                <span className="font-semibold">{numChildren}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-[#C36239] hover:bg-[#75290F] text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}