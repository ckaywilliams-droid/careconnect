import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle, 
  XCircle, 
  MessageSquare, 
  Calendar, 
  Clock,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

/**
 * F-079: Caregiver Booking View
 * F-086: Accept/Decline Actions
 * F-085: Cancel Request
 * F-080/F-081R: Check-in/Check-out
 */
export default function BookingsTab({ user, profile }) {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState('needs_action');

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['caregiver-bookings', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      return await base44.entities.BookingRequest.filter({
        caregiver_profile_id: profile.id
      }, '-created_date');
    },
    enabled: !!profile
  });

  const acceptMutation = useMutation({
    mutationFn: async (bookingId) => {
      return await base44.entities.BookingRequest.update(bookingId, {
        status: 'accepted'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['caregiver-bookings']);
      toast.success('Booking accepted!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to accept booking');
    }
  });

  const declineMutation = useMutation({
    mutationFn: async (bookingId) => {
      return await base44.entities.BookingRequest.update(bookingId, {
        status: 'declined_by_caregiver'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['caregiver-bookings']);
      toast.success('Booking declined');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to decline booking');
    }
  });

  const filterBookings = (status) => {
    switch (status) {
      case 'needs_action':
        return bookings.filter(b => 
          b.status === 'pending' || b.status === 'cancellation_requested'
        );
      case 'upcoming':
        return bookings.filter(b => 
          b.status === 'accepted' && new Date(b.start_time) > new Date()
        );
      case 'completed':
        return bookings.filter(b => 
          b.status === 'completed' || b.status === 'no_show_caregiver' || b.status === 'no_show_parent'
        );
      case 'cancelled':
        return bookings.filter(b => 
          b.status === 'cancelled' || b.status === 'declined_by_caregiver' || b.status === 'declined_by_parent'
        );
      default:
        return bookings;
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      pending: { variant: 'default', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
      accepted: { variant: 'default', label: 'Accepted', color: 'bg-green-100 text-green-800' },
      in_progress: { variant: 'default', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
      completed: { variant: 'default', label: 'Completed', color: 'bg-gray-100 text-gray-800' },
      cancelled: { variant: 'destructive', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
      declined_by_caregiver: { variant: 'destructive', label: 'Declined', color: 'bg-red-100 text-red-800' },
      cancellation_requested: { variant: 'default', label: 'Cancel Requested', color: 'bg-orange-100 text-orange-800' }
    };
    
    const { label, color } = config[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    return <Badge className={color}>{label}</Badge>;
  };

  const filteredBookings = filterBookings(selectedStatus);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Bookings</CardTitle>
          <CardDescription>
            Manage booking requests and track your upcoming sessions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="needs_action">
                Needs Action ({filterBookings('needs_action').length})
              </TabsTrigger>
              <TabsTrigger value="upcoming">
                Upcoming ({filterBookings('upcoming').length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed ({filterBookings('completed').length})
              </TabsTrigger>
              <TabsTrigger value="cancelled">
                Cancelled ({filterBookings('cancelled').length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={selectedStatus} className="mt-6">
              {filteredBookings.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No bookings in this category</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-medium text-gray-900">
                            Booking Request
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Requested {format(new Date(booking.created_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        {getStatusBadge(booking.status)}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">
                            {format(new Date(booking.start_time), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">
                            {format(new Date(booking.start_time), 'h:mm a')} - 
                            {format(new Date(booking.end_time), 'h:mm a')}
                          </span>
                        </div>
                      </div>

                      {booking.parent_notes && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs font-medium text-gray-700 mb-1">Parent Notes:</p>
                          <p className="text-sm text-gray-600">{booking.parent_notes}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {booking.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => acceptMutation.mutate(booking.id)}
                              disabled={acceptMutation.isLoading}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => declineMutation.mutate(booking.id)}
                              disabled={declineMutation.isLoading}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Decline
                            </Button>
                          </>
                        )}
                        
                        <Button size="sm" variant="ghost">
                          <MessageSquare className="w-4 h-4 mr-2" />
                          View Conversation
                        </Button>

                        {booking.status === 'cancellation_requested' && (
                          <Badge className="ml-auto bg-orange-100 text-orange-800">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Cancellation Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}