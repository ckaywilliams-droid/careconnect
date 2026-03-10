import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

export default function BookingSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);

  const bookingId = queryParams.get('id');
  const caregiverName = queryParams.get('cg');
  const slotDate = queryParams.get('date');

  const handleCopyId = () => {
    if (bookingId) {
      navigator.clipboard.writeText(bookingId);
      toast.success('Booking ID copied to clipboard!');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md w-full">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
        <p className="text-gray-600 mb-6">
          Your booking with {caregiverName || 'a caregiver'} for {slotDate || 'the requested date'} has been successfully placed.
        </p>

        {bookingId && (
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700">Booking Reference ID:</p>
            <div className="flex items-center justify-center bg-gray-100 rounded-md px-4 py-2 mt-2">
              <span className="font-mono text-lg text-gray-800 break-all">{bookingId}</span>
              <Button variant="ghost" size="sm" onClick={handleCopyId} className="ml-2">
                Copy ID
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Button
            className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
            onClick={() => navigate(createPageUrl('ParentBookings'))}
          >
            Go to My Bookings
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate(createPageUrl('Home'))}
          >
            Return Home
          </Button>
        </div>
      </div>
    </div>
  );
}