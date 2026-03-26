import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft } from 'lucide-react';

const formatValue = (key, value) => {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  const isDateKey = key.includes('time') || key.includes('date') || key.endsWith('_at');
  if (isDateKey && value) {
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleString();
    } catch {}
  }
  return String(value);
};

const formatLabel = (key) =>
  key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();

export default function BookingDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) {
      setError('No booking ID provided in the URL.');
      setLoading(false);
      return;
    }
    const fetchBooking = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await base44.entities.BookingRequest.filter({ id });
        if (result && result[0]) {
          setBooking(result[0]);
        } else {
          setError('Booking not found. It may have been deleted or you may not have access.');
        }
      } catch (err) {
        console.error('Error fetching booking:', err);
        setError('Failed to load booking details. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [id]);

  const BackButton = () => (
    <Button variant="outline" onClick={() => navigate(-1)} className="mb-6">
      <ArrowLeft className="w-4 h-4 mr-2" /> Back
    </Button>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <BackButton />
        <div className="text-center py-12 text-red-500">
          <p className="text-lg font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <BackButton />
        <div className="text-center py-12 text-gray-500">
          <p>No booking data available.</p>
        </div>
      </div>
    );
  }

  // Priority fields shown at top
  const priorityKeys = ['id', 'status', 'created_date', 'updated_date', 'created_by'];
  const allEntries = Object.entries(booking).filter(([key]) => !key.startsWith('_'));
  const priorityEntries = priorityKeys.map(k => [k, booking[k]]).filter(([, v]) => v !== undefined);
  const restEntries = allEntries.filter(([key]) => !priorityKeys.includes(key));

  return (
    <div className="max-w-4xl mx-auto p-6">
      <BackButton />

      <Card className="shadow-sm">
        <CardHeader className="border-b bg-gray-50">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">Booking Record</CardTitle>
              <p className="text-xs text-gray-400 mt-1 font-mono">{booking.id}</p>
            </div>
            <Badge className={
              booking.status === 'completed' ? 'bg-emerald-100 text-emerald-800 border-0' :
              booking.status === 'accepted' ? 'bg-green-100 text-green-800 border-0' :
              booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border-0' :
              'bg-gray-100 text-gray-700 border-0'
            }>
              {booking.status?.replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-8">
          {/* Built-in / priority fields */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Record Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {priorityEntries.map(([key, value]) => (
                <div key={key} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 capitalize">
                    {formatLabel(key)}
                  </p>
                  <p className="text-sm text-gray-800 font-mono break-all">{formatValue(key, value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* All other fields */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Booking Fields</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {restEntries.map(([key, value]) => (
                <div key={key} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 capitalize">
                    {formatLabel(key)}
                  </p>
                  <pre className="text-sm text-gray-800 break-words whitespace-pre-wrap font-sans">
                    {formatValue(key, value)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}