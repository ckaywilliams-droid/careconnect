import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  CheckCircle, XCircle, Calendar, Clock, Users, AlertTriangle,
  Loader2, Flag, ChevronRight, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  pending:                              { label: 'Pending',              color: 'bg-yellow-100 text-yellow-800' },
  accepted:                             { label: 'Confirmed',            color: 'bg-green-100 text-green-800' },
  declined:                             { label: 'Declined',             color: 'bg-red-100 text-red-800' },
  cancelled_by_parent:                  { label: 'Cancelled by Parent',  color: 'bg-gray-100 text-gray-700' },
  cancelled_by_caregiver:               { label: 'Cancelled by You',     color: 'bg-gray-100 text-gray-700' },
  cancellation_requested_by_caregiver:  { label: 'Cancel Requested',     color: 'bg-orange-100 text-orange-800' },
  expired:                              { label: 'Expired',              color: 'bg-gray-100 text-gray-500' },

  completed:                            { label: 'Completed',            color: 'bg-emerald-100 text-emerald-800' },
  no_show_reported:                     { label: 'No-Show Review',       color: 'bg-red-100 text-red-800' },
  under_review:                         { label: 'Under Review',         color: 'bg-purple-100 text-purple-800' },
  resolved:                             { label: 'Resolved',             color: 'bg-gray-100 text-gray-600' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  return <Badge className={`${cfg.color} border-0 text-xs font-medium`}>{cfg.label}</Badge>;
}

function BookingCard({ booking, onAction }) {
  const start = new Date(booking.start_time.slice(0, 19));
  const end = new Date(booking.end_time.slice(0, 19));
  const now = new Date();
  const isPast = start < now;
  const isAfterEnd = end < now;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">
            {format(start, 'EEEE, MMMM d, yyyy')}
          </p>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
          </p>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {booking.num_children} {booking.num_children === 1 ? 'child' : 'children'}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      {booking.special_requests && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
          <span className="font-medium text-gray-700">Notes: </span>
          {booking.special_requests}
        </div>
      )}

      {booking.cancellation_reason && booking.status === 'cancellation_requested_by_caregiver' && (
        <div className="mb-3 p-3 bg-orange-50 rounded-lg text-sm text-orange-700">
          <span className="font-medium">Cancel reason: </span>{booking.cancellation_reason}
        </div>
      )}

      {/* Action buttons keyed to state */}
      <div className="flex flex-wrap gap-2 mt-3">
        {booking.status === 'pending' && (
          <>
            <Button size="sm" className="bg-[#C36239] hover:bg-[#75290F] text-white"
              onClick={() => onAction('accept', booking)}>
              <CheckCircle className="w-4 h-4 mr-1" /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction('decline', booking)}>
              <XCircle className="w-4 h-4 mr-1" /> Decline
            </Button>
          </>
        )}
        {booking.status === 'accepted' && !isPast && (
          <Button size="sm" variant="outline" onClick={() => onAction('request_cancel', booking)}>
            Request Cancellation
          </Button>
        )}
        {booking.status === 'accepted' && isPast && (
          <Button size="sm" variant="outline" onClick={() => onAction('report_no_show', booking)}>
            <Flag className="w-4 h-4 mr-1" /> Report No-Show
          </Button>
        )}
        {booking.status === 'accepted' && isAfterEnd && (
          <p className="text-xs text-amber-600 font-medium w-full mt-1">
            Session ended — please mark as complete
          </p>
        )}
        {booking.status === 'accepted' && isAfterEnd ? (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onAction('mark_complete', booking)}>
            <CheckCircle className="w-4 h-4 mr-1" /> Mark as Complete
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/bookings/${booking.id}`}>
            View Details <ExternalLink className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function BookingsTab({ user, profile }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('needs_action');
  const [modal, setModal] = useState(null); // { type, booking }
  const [cancelReason, setCancelReason] = useState('');
  const [noShowDesc, setNoShowDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['caregiver-bookings', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      return await base44.entities.BookingRequest.filter(
        { caregiver_profile_id: profile.id },
        '-created_date'
      );
    },
    enabled: !!profile,
    refetchInterval: 30000
  });

  const filterMap = {
    needs_action: b => ['pending', 'cancellation_requested_by_caregiver'].includes(b.status),
    upcoming:     b => ['accepted'].includes(b.status),
    completed:    b => ['completed'].includes(b.status),
    cancelled:    b => ['declined', 'cancelled_by_parent', 'cancelled_by_caregiver', 'expired', 'no_show_reported', 'under_review', 'resolved'].includes(b.status),
  };

  const filtered = bookings.filter(filterMap[tab] || (() => true));

  const invoke = async (fnName, payload) => {
    const res = await base44.functions.invoke(fnName, payload);
    // base44.functions.invoke resolves even on 4xx — detect and throw
    const body = res?.data ?? res;
    if (body?.error || (res?.status && res.status >= 400)) {
      const err = new Error(body?.error || `${fnName} failed`);
      err.data = body;
      err.status = res?.status;
      throw err;
    }
    return body;
  };

  const handleAction = async (type, booking) => {
    if (type === 'accept') {
      setLoading(true);
      try {
        await base44.entities.BookingRequest.update(booking.id, { status: 'accepted' });
        toast.success('Booking accepted!');
        queryClient.invalidateQueries({ queryKey: ['caregiver-bookings', profile?.id] });
      } catch (e) {
        toast.error(e.response?.data?.error || 'Failed to accept booking');
      } finally { setLoading(false); }
      return;
    }
    if (type === 'decline') {
      setLoading(true);
      try {
        await base44.entities.BookingRequest.update(booking.id, { status: 'declined' });
        toast.success('Booking declined.');
        queryClient.invalidateQueries({ queryKey: ['caregiver-bookings', profile?.id] });
      } catch (e) {
        toast.error(e.response?.data?.error || 'Failed to decline booking');
      } finally { setLoading(false); }
      return;
    }
    if (type === 'mark_complete') {
      setLoading(true);
      try {
        // Proactive auth check — token may have expired during a long session
        const currentUser = await base44.auth.me();
        if (!currentUser) {
          toast.error('Your session has expired. Please reload the page to re-authenticate.');
          setLoading(false);
          return;
        }
        await invoke('markSessionComplete', { booking_request_id: booking.id });
        toast.success('Session marked as complete!');
        queryClient.invalidateQueries({ queryKey: ['caregiver-bookings', profile?.id] });
      } catch (e) {
        toast.error(e.data?.error || e.message || 'Failed to mark complete');
      } finally { setLoading(false); }
      return;
    }
    // Modals
    setCancelReason('');
    setNoShowDesc('');
    setModal({ type, booking });
  };

  const submitModal = async () => {
    if (!modal) return;
    setLoading(true);
    try {
      if (modal.type === 'request_cancel') {
        if (cancelReason.trim().length < 10) { toast.error('Reason must be at least 10 characters.'); setLoading(false); return; }
        await invoke('requestCaregiverCancellation', { booking_request_id: modal.booking.id, cancellation_reason: cancelReason });
        toast.success('Cancellation request submitted.');
      } else if (modal.type === 'report_no_show') {
        if (noShowDesc.trim().length < 10) { toast.error('Description must be at least 10 characters.'); setLoading(false); return; }
        await invoke('reportNoShow', { booking_request_id: modal.booking.id, description: noShowDesc });
        toast.success('No-show report submitted.');
      }
      queryClient.invalidateQueries({ queryKey: ['caregiver-bookings', profile?.id] });
      setModal(null);
    } catch (e) {
      toast.error(e.data?.error || e.message || 'Action failed');
    } finally { setLoading(false); }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Bookings</CardTitle>
          <CardDescription>Manage requests and track your sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-4">
              {['needs_action', 'upcoming', 'completed', 'cancelled'].map(t => (
                <TabsTrigger key={t} value={t} className="capitalize text-xs sm:text-sm">
                  {t.replace('_', ' ')}
                  {' '}({bookings.filter(filterMap[t]).length})
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={tab} className="mt-6">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Calendar className="w-10 h-10 mx-auto mb-3" />
                  <p>No bookings here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(b => (
                    <BookingCard key={b.id} booking={b} onAction={handleAction} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Cancellation Request Modal */}
      <Dialog open={modal?.type === 'request_cancel'} onOpenChange={() => setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Cancellation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Please provide a reason for your cancellation request (minimum 10 characters). 
            The parent will have 24 hours to approve or deny.
          </p>
          <Textarea
            placeholder="Reason for cancellation..."
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            maxLength={500}
            className="min-h-[100px]"
          />
          <p className="text-xs text-gray-400 text-right">{cancelReason.length}/500</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={submitModal} disabled={loading} className="bg-[#C36239] hover:bg-[#75290F] text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No-Show Report Modal */}
      <Dialog open={modal?.type === 'report_no_show'} onOpenChange={() => setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" /> Report No-Show / Issue
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Describe what happened. Our team will review and respond within 24–48 hours.
          </p>
          <Textarea
            placeholder="Describe the issue..."
            value={noShowDesc}
            onChange={e => setNoShowDesc(e.target.value)}
            maxLength={500}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={submitModal} disabled={loading} variant="destructive">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}