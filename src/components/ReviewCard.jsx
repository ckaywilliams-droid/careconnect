import React from 'react';
import { Star } from 'lucide-react';
import { format } from 'date-fns';

export default function ReviewCard({ review }) {
  return (
    <div className="p-4 bg-[#F9F7F4] rounded-lg border border-[#E5E2DC]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex">
          {[1, 2, 3, 4, 5].map(i => (
            <Star
              key={i}
              className={`w-4 h-4 ${i <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
            />
          ))}
        </div>
        <span className="text-xs text-gray-400">
          {review.created_date ? format(new Date(review.created_date), 'MMM d, yyyy') : ''}
        </span>
      </div>
      {review.comment && (
        <p className="text-sm text-[#643737] leading-relaxed">{review.comment}</p>
      )}
    </div>
  );
}