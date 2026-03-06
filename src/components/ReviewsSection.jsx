import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { format } from 'date-fns';

function StarDisplay({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-4 h-4 ${n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
        />
      ))}
    </div>
  );
}

export default function ReviewsSection({ caregiverProfileId }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caregiverProfileId) return;
    base44.entities.Review.filter(
      { caregiver_profile_id: caregiverProfileId, is_suppressed: false },
      '-created_date',
      20
    ).then(setReviews).finally(() => setLoading(false));
  }, [caregiverProfileId]);

  if (loading) return null;
  if (reviews.length === 0) return null;

  return (
    <Card className="mb-8 border-[#E5E2DC]">
      <CardHeader>
        <CardTitle className="text-[#0C2119]">Reviews ({reviews.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className="border-b border-[#E5E2DC] last:border-0 pb-4 last:pb-0">
            <div className="flex items-center justify-between mb-1">
              <StarDisplay rating={review.rating} />
              <span className="text-xs text-gray-400">
                {format(new Date(review.created_date), 'MMM d, yyyy')}
              </span>
            </div>
            {review.body && (
              <p className="text-sm text-[#643737] leading-relaxed mt-1">{review.body}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}