import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar, Clock, Users, LogIn, LogOut, XCircle, Flag,
  AlertTriangle, Loader2, CheckCircle, ArrowRight, Star
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import LeaveReviewModal from '@/components/LeaveReviewModal';
import MessageThread from '@/components/messaging/MessageThread';

const STATUS_CONFIG = {
  pending:                              { label: 'Pending Response',      color: 'bg-yellow-100 text-yellow-800' },
  accepted:                             { label: 'Confirmed',             color: 'bg-green-100 text-green-800' },
  declined:                             { label: 'Declined',              color: 'bg-red-100 text-red-800' },
  cancelled_by_parent:                  { label: 'Cancelled by You',      color: 'bg-gray-100 text-gray-600' },
  cancelled_by_caregiver:               { label: 'Cancelled by Caregiver',color: 'bg-gray-100 text-gray-600' },
  cancellation_requested_by_caregiver:  { label: '⚠ Cancel Requested',    color: 'bg-orange-100 text-orange-800' },
  expired:                              { label: 'Expired',               color: 'bg-gray-100 text-gray-500' },
  in_progress:                          { label: 'In Progress',           color: 'bg-blue-100 text-blue-800' },
  completed:                            { label: 'Completed',             color: 'bg-emerald-100 text-emerald-800' },
  no_show_reported:                     { label: 'Under Review',          color: 'bg-red-100 text-red-800' },
  under_review:                         { label: 'Under Review',          color: 'bg-purple-100 text-purple-800' },
  resolved:                             { label: 'Resolved',              color: 'bg-gray-100 text-gray-600' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  return <Badge className={`${cfg.color} border-0 text-xs font-medium`}>{cfg.label}</Badge>;
}

function CancellationRequestBanner({ booking, onRespond }) {
  const deadline = booking.cancellation_response_deadline
    ? new Date(booking.cancellation_response_deadline)
    : null;
  return (
    <Alert className="border-orange-300 bg-orange-50 mb-3">
      <AlertTriangle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="text-orange-800">
        <strong>Your caregiver has requested to cancel this booking.</strong>
        {deadline && <span className="ml-1">Respond by {format(deadline, 'MMM d, h:mm a')}.</span>}
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="destructive" onClick={() => onRespond('approve')}>
            Allow Cancellation
          </Button>
          <Button size="sm" variant="outline" onClick={() => onRespond('deny')}>
            Keep Booking
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function BookingCard({ booking, cgProfiles, onAction, reviewed }) {
  const cgProfile = cgProfiles[booking.caregiver_profile_id];
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const isPast = start < new Date();

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-gray-300 transition-colors">
      {/* Cancellation request banner */}
      {booking.status === 'cancellation_requested_by_caregiver' && (
        <CancellationRequestBanner booking={booking} onRespond={(action) => onAction('review_cancel', booking, action)} />
      )}

      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">
            {cgProfile?.display_name || 'Caregiver'}
          </p>
          <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
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

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mt-3">
        {/* Cancel pending or accepted */}
        {(booking.status === 'pending' || booking.status === 'accepted') && (
          <Button size="sm" variant="outline" onClick={() => onAction('cancel', booking)}>
            <XCircle className="w-4 h-4 mr-1" /> Cancel Request
          </Button>
        )}
        {/* Check-in confirmation */}
        {booking.status === 'accepted' && (
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => onAction('check_in', booking)}>
            <LogIn className="w-4 h-4 mr-1" /> Confirm Check-In
          </Button>
        )}
        {/* Check-out confirmation */}
        {booking.status === 'in_progress' && (
          <>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onAction('check_out', booking)}>
              <LogOut className="w-4 h-4 mr-1" /> Confirm Check-Out
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction('report_no_show', booking)}>
              <Flag className="w-4 h-4 mr-1" /> Report Issue
            </Button>
          </>
        )}
        {/* Report no-show after booking was supposed to start */}
        {booking.status === 'accepted' && isPast && (
          <Button size="sm" variant="outline" onClick={() => onAction('report_no_show', booking)}>
            <Flag className="w-4 h-4 mr-1" /> Report No-Show
          </Button>
        )}
        {/* Leave a review for completed bookings */}
        {booking.status === 'completed' && !reviewed && (
          <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-white"
            onClick={() => onAction('leave_review', booking)}>
            <Star className="w-4 h-4 mr-1" /> Leave Review
          </Button>
        )}
        {/* View conversation */}
        {(booking.status !== 'declined' && booking.status !== 'expired') && (
          <Button size="sm" variant="outline" onClick={() => onAction('view_thread', booking)}>
            View Conversation
          </Button>
        )}
        {/* View caregiver profile */}
        {cgProfile?.slug && (
          <Button size="sm" variant="ghost" asChild>
            <a href={createPageUrl('PublicCaregiverProfile') + '?slug=' + cgProfile.slug}>
              View Profile <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ParentBookings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState('active');
  const [modal, setModal] = useState(null); // { type, booking, extra }
  const [cancelReason, setCancelReason] = useState('');
  const [noShowDesc, setNoShowDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewModal, setReviewModal] = useState(null); // { booking, caregiverName }
  const [threadModal, setThreadModal] = useState(null); // { booking }

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        if (u.app_role !== 'parent') { navigate(createPageUrl('Home')); return; }
        setUser(u);
      } catch {
        base44.auth.redirectToLogin(createPageUrl('ParentBookings'));
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ['parent-bookings', user?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ parent_user_id: user.id }, '-created_date'),
    enabled: !!user,
    refetchInterval: 30000
  });

  // Fetch caregiver profiles for all bookings (deduplicated)
  const cgProfileIds = [...new Set(bookings.map(b => b.caregiver_profile_id).filter(Boolean))];
  const { data: cgProfilesList = [] } = useQuery({
    queryKey: ['cg-profiles-for-bookings', cgProfileIds.join(',')],
    queryFn: async () => {
      if (!cgProfileIds.length) return [];
      const results = await Promise.all(
        cgProfileIds.map(id => base44.entities.CaregiverProfile.filter({ id }).then(r => r[0]).catch(() => null))
      );
      return results.filter(Boolean);
    },
    enabled: cgProfileIds.length > 0
  });
  const cgProfiles = Object.fromEntries(cgProfilesList.map(p => [p.id, p]));

  // Track already-reviewed bookings for the current user
  const completedIds = bookings.filter(b => b.status === 'completed').map(b => b.id);
  const { data: existingReviews = [], refetch: refetchReviews } = useQuery({
    queryKey: ['my-reviews', user?.id],
    queryFn: () => base44.entities.Review.filter({ parent_user_id: user.id }),
    enabled: !!user && completedIds.length > 0,
  });
  const reviewedBookingIds = new Set(existingReviews.map(r => r.booking_request_id));

  const filterMap = {
    active:    b => ['pending', 'accepted', 'in_progress', 'cancellation_requested_by_caregiver'].includes(b.status),
    completed: b => ['completed'].includes(b.status),
    cancelled: b => ['declined', 'cancelled_by_parent', 'cancelled_by_caregiver', 'expired', 'no_show_reported', 'under_review', 'resolved'].includes(b.status),
  };

  const invoke = async (fnName, payload) => {
    const res = await base44.functions.invoke(fnName, payload);
    return res.data;
  };

  const handleAction = async (type, booking, extra) => {
    if (type === 'check_in') {
      setSubmitting(true);
      try {
        const res = await invoke('checkIn', { booking_request_id: booking.id });
        toast.success(res.step === 'both_confirmed' ? 'Session started!' : res.message || 'Check-in recorded.');
        queryClient.invalidateQueries(['parent-bookings']);
      } catch (e) {
        toast.error(e.response?.data?.error || 'Check-in failed');
      } finally { setSubmitting(false); }
      return;
    }
    if (type === 'check_out') {
      setSubmitting(true);
      try {
        const res = await invoke('checkOut', { booking_request_id: booking.id });
        toast.success(res.step === 'both_confirmed' ? 'Session complete! Thank you.' : res.message || 'Check-out recorded.');
        queryClient.invalidateQueries(['parent-bookings']);
      } catch (e) {
        toast.error(e.response?.data?.error || 'Check-out failed');
      } finally { setSubmitting(false); }
      return;
    }
    if (type === 'review_cancel') {
      setSubmitting(true);
      try {
        await invoke('reviewCancellationRequest', { booking_request_id: booking.id, action: extra });
        toast.success(extra === 'approve' ? 'Cancellation approved.' : 'Booking kept — cancellation denied.');
        queryClient.invalidateQueries(['parent-bookings']);
      } catch (e) {
        toast.error(e.response?.data?.error || 'Failed to respond');
      } finally { setSubmitting(false); }
      return;
    }
    // View message thread
    if (type === 'view_thread') {
      setThreadModal({ booking });
      return;
    }
    // Leave review modal
    if (type === 'leave_review') {
      const cgProfile = cgProfilesList.find(p => p.id === booking.caregiver_profile_id);
      setReviewModal({ booking, caregiverName: cgProfile?.display_name || 'Caregiver' });
      return;
    }
    // Modals
    setCancelReason('');
    setNoShowDesc('');
    setModal({ type, booking, extra });
  };

  const submitModal = async () => {
    if (!modal) return;
    setSubmitting(true);
    try {
      if (modal.type === 'cancel') {
        await invoke('cancelBookingParent', { booking_request_id: modal.booking.id, cancellation_reason: cancelReason || undefined });
        toast.success('Booking cancelled.');
      } else if (modal.type === 'report_no_show') {
        if (noShowDesc.trim().length < 10) { toast.error('Description must be at least 10 characters.'); setSubmitting(false); return; }
        await invoke('reportNoShow', { booking_request_id: modal.booking.id, description: noShowDesc });
        toast.success('Report submitted. Our team will review shortly.');
      }
      queryClient.invalidateQueries(['parent-bookings']);
      setModal(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed');
    } finally { setSubmitting(false); }
  };

  if (!authReady || bookingsLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );

  // Count pending action items
  const needsActionCount = bookings.filter(b => b.status === 'cancellation_requested_by_caregiver').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage your care sessions</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {needsActionCount > 0 && (
          <Alert className="border-orange-300 bg-orange-50 mb-6">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              You have {needsActionCount} booking{needsActionCount > 1 ? 's' : ''} requiring your response.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="pt-6">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="active">
                  Active ({bookings.filter(filterMap.active).length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({bookings.filter(filterMap.completed).length})
                </TabsTrigger>
                <TabsTrigger value="cancelled">
                  Past ({bookings.filter(filterMap.cancelled).length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value={tab} className="mt-6">
                {bookings.filter(filterMap[tab]).length === 0 ? (
                  <div className="text-center py-14 text-gray-400">
                    <Calendar className="w-10 h-10 mx-auto mb-3" />
                    <p className="font-medium">No bookings here</p>
                    {tab === 'active' && (
                      <Button className="mt-4 bg-[#C36239] hover:bg-[#75290F] text-white"
                        onClick={() => navigate(createPageUrl('FindCaregivers'))}>
                        Find a Caregiver
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookings.filter(filterMap[tab]).map(b => (
                      <BookingCard key={b.id} booking={b} cgProfiles={cgProfiles} onAction={handleAction} reviewed={reviewedBookingIds.has(b.id)} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Cancel Modal */}
      <Dialog open={modal?.type === 'cancel'} onOpenChange={() => setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to cancel this booking? This cannot be undone.
          </p>
          <Textarea
            placeholder="Optional: reason for cancellation"
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            maxLength={500}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Keep Booking</Button>
            <Button variant="destructive" onClick={submitModal} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Thread Modal */}
      {threadModal && (
        <Dialog open={true} onOpenChange={() => setThreadModal(null)}>
          <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
            <DialogHeader className="px-4 pt-4 pb-2 border-b border-gray-100 flex-shrink-0">
              <DialogTitle className="text-base">
                Conversation — {cgProfiles[threadModal.booking.caregiver_profile_id]?.display_name || 'Caregiver'}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden p-4">
              <MessageThread booking={threadModal.booking} currentUser={user} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Leave Review Modal */}
      {reviewModal && (
        <LeaveReviewModal
          booking={reviewModal.booking}
          caregiverName={reviewModal.caregiverName}
          onClose={() => setReviewModal(null)}
          onSuccess={() => {
            setReviewModal(null);
            refetchReviews();
          }}
        />
      )}

      {/* No-Show Report Modal */}
      <Dialog open={modal?.type === 'report_no_show'} onOpenChange={() => setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" /> Report Issue
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Describe what happened. Our team will review and get back to you within 24–48 hours.
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
            <Button variant="destructive" onClick={submitModal} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}