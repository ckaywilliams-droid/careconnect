import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { XCircle, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function BookingControlsSection({ user }) {
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = useState(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['admin-booking-controls'],
    queryFn: async () => {
      const nonTerminalBookings = await base44.entities.BookingRequest.filter({
        status: { $in: ['pending', 'accepted'] }
      });
      
      // Fetch related data
      const bookingsWithDetails = await Promise.all(
        nonTerminalBookings.map(async (booking) => {
          const [parent, caregiver] = await Promise.all([
            base44.entities.ParentProfile.filter({ id: booking.parent_profile_id }),
            base44.entities.CaregiverProfile.filter({ id: booking.caregiver_profile_id })
          ]);
          return { ...booking, parent: parent[0], caregiver: caregiver[0] };
        })
      );
      
      return bookingsWithDetails;
    },
    enabled: !!user && user.app_role === 'super_admin'
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId) => {
      await base44.entities.BookingRequest.update(bookingId, {
        status: 'cancelled',
        cancelled_by_role: 'admin',
        cancellation_reason: 'Admin override cancellation'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-booking-controls']);
      setCancellingId(null);
    }
  });

  if (user?.app_role !== 'super_admin') {
    return (
      <div className="text-center py-12">
        <Alert variant="destructive" className="max-w-md mx-auto">
          <AlertDescription>Access denied. Super Admin role required.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleCancel = async (bookingId) => {
    if (confirm('Are you sure you want to cancel this booking? This action cannot be undone.')) {
      setCancellingId(bookingId);
      await cancelMutation.mutateAsync(bookingId);
    }
  };

  const getStatusBadgeVariant = (status) => {
    if (status === 'accepted') return 'default';
    if (status === 'pending') return 'secondary';
    return 'outline';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Booking Controls</h2>
        <Badge variant="secondary">{bookings.length} Active</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Non-Terminal Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Loading bookings...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No active bookings</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parent</TableHead>
                    <TableHead>Caregiver</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">{booking.parent?.display_name}</TableCell>
                      <TableCell>{booking.caregiver?.display_name}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {format(new Date(booking.requested_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {booking.requested_start_time} - {booking.requested_end_time}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(booking.status)} className="capitalize">
                          {booking.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        ${(booking.total_amount_cents / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleCancel(booking.id)}
                            disabled={cancellingId === booking.id}
                          >
                            <XCircle className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}