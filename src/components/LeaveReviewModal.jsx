import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LeaveReviewModal({ booking, caregiverName, onClose, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) { toast.error('Please select a star rating.'); return; }
    setSubmitting(true);
    try {
      await base44.functions.invoke('submitReview', {
        booking_request_id: booking.id,
        rating,
        body: body.trim() || undefined,
      });
      toast.success('Review submitted!');
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leave a Review</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600">
          How was your experience with <strong>{caregiverName}</strong>?
        </p>

        {/* Star Selector */}
        <div className="flex gap-1 my-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(n)}
              className="focus:outline-none"
            >
              <Star
                className={`w-8 h-8 transition-colors ${
                  n <= (hovered || rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>

        <Textarea
          placeholder="Share your experience (optional)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          className="min-h-[100px]"
        />
        <p className="text-xs text-gray-400 text-right">{body.length}/1000</p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            className="bg-[#C36239] hover:bg-[#75290F] text-white"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}