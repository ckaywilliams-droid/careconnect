import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LeaveReviewModal({ open, onClose, booking, caregiverName, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rating) { toast.error('Please select a star rating.'); return; }
    setSubmitting(true);
    try {
      await base44.functions.invoke('submitReview', {
        booking_request_id: booking.id,
        rating,
        comment
      });
      toast.success('Review submitted — thank you!');
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave a Review</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500">
          How was your experience with <strong>{caregiverName || 'your caregiver'}</strong>?
        </p>

        {/* Star Picker */}
        <div className="flex items-center gap-1 my-2">
          {[1, 2, 3, 4, 5].map(i => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(0)}
              className="focus:outline-none"
            >
              <Star
                className={`w-8 h-8 transition-colors ${
                  i <= (hover || rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-2 text-sm text-gray-500">
              {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
            </span>
          )}
        </div>

        <Textarea
          placeholder="Share your experience (optional)..."
          value={comment}
          onChange={e => setComment(e.target.value)}
          maxLength={1000}
          className="min-h-[100px]"
        />
        <p className="text-xs text-gray-400 text-right">{comment.length}/1000</p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Skip</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !rating}
            className="bg-[#C36239] hover:bg-[#75290F] text-white"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}