import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * F-037 UI.2: DISPUTE DETAIL PAGE
 * 
 * Full dispute case view with actions.
 * 
 * FEATURES:
 * - Booking summary
 * - Status timeline
 * - Evidence panel
 * - Actions: Request evidence, Issue ruling
 * - Ruling form with validation
 */
export default function DisputeDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Get dispute_id from URL
  const params = new URLSearchParams(window.location.search);
  const disputeId = params.get('id');

  // Ruling state
  const [showRulingForm, setShowRulingForm] = useState(false);
  const [ruling, setRuling] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Failed to fetch user:', error);
        base44.auth.redirectToLogin();
      }
    };

    checkAccess();
  }, []);

  // Fetch dispute
  const { data: dispute, isLoading: disputeLoading, refetch } = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: async () => {
      const disputes = await base44.entities.DisputeCase.filter({ id: disputeId });
      return disputes[0] || null;
    },
    enabled: !!disputeId && !!user,
  });

  // Fetch evidence
  const { data: evidence = [] } = useQuery({
    queryKey: ['dispute-evidence', disputeId],
    queryFn: async () => {
      const results = await base44.entities.DisputeEvidence.filter({ dispute_id: disputeId }, '-created_date');
      return results || [];
    },
    enabled: !!disputeId && !!user,
  });

  const handleRequestEvidence = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('requestEvidence', {
        dispute_id: disputeId,
        request_from_parent: true,
        request_from_caregiver: true,
      });

      if (response.data.success) {
        toast.success('Evidence requests sent to both parties');
        refetch();
      } else {
        setError(response.data.error || 'Failed to request evidence');
      }
    } catch (err) {
      console.error('Request evidence failed:', err);
      setError(err.message || 'Failed to request evidence');
    } finally {
      setLoading(false);
    }
  };

  const handleIssueRuling = async () => {
    if (!ruling || !resolutionNote || resolutionNote.length < 20) {
      setError('Please complete all required fields (resolution note min 20 characters)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('issueRuling', {
        dispute_id: disputeId,
        ruling,
        resolution_note: resolutionNote,
      });

      if (response.data.success) {
        toast.success('Ruling issued successfully');
        setShowRulingForm(false);
        refetch();
        queryClient.invalidateQueries({ queryKey: ['disputes'] });
      } else {
        setError(response.data.error || 'Failed to issue ruling');
      }
    } catch (err) {
      console.error('Issue ruling failed:', err);
      setError(err.message || 'Failed to issue ruling');
    } finally {
      setLoading(false);
    }
  };

  if (!disputeId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Alert variant="destructive">
          <AlertDescription>Invalid dispute ID</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (disputeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading dispute details...</p>
        </div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Alert variant="destructive">
          <AlertDescription>Dispute not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const canIssueRuling = user && ['trust_admin', 'super_admin'].includes(user.app_role);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Dispute Case: {dispute.id.substring(0, 8)}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {dispute.dispute_type.replace('_', ' ')} • Booking: {dispute.booking_id.substring(0, 8)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Status */}
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="text-lg px-4 py-2">
              {dispute.status.replace('_', ' ')}
            </Badge>
          </CardContent>
        </Card>

        {/* Evidence */}
        <Card>
          <CardHeader>
            <CardTitle>Evidence ({evidence.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {evidence.length === 0 ? (
              <p className="text-gray-600 text-sm">No evidence submitted yet</p>
            ) : (
              <div className="space-y-3">
                {evidence.map((item) => (
                  <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="capitalize">
                        {item.evidence_type.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(item.created_date).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {dispute.status !== 'resolved' && (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dispute.status === 'open' || dispute.status === 'frozen' ? (
                <Button
                  onClick={handleRequestEvidence}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Request Evidence from Parties
                </Button>
              ) : null}

              {canIssueRuling && !showRulingForm && (
                <Button
                  onClick={() => setShowRulingForm(true)}
                  variant="destructive"
                  className="w-full"
                >
                  Issue Ruling
                </Button>
              )}

              {showRulingForm && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <h3 className="font-semibold">Issue Ruling</h3>
                  
                  <div className="space-y-2">
                    <Label>Ruling *</Label>
                    <Select value={ruling} onValueChange={setRuling} disabled={loading}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ruling..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uphold_parent">Uphold Parent</SelectItem>
                        <SelectItem value="uphold_caregiver">Uphold Caregiver</SelectItem>
                        <SelectItem value="split">Split Decision</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Resolution Note * (min 20 chars)</Label>
                    <Textarea
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      rows={4}
                      disabled={loading}
                      placeholder="Explain your decision..."
                    />
                    <p className="text-xs text-gray-500">{resolutionNote.length} characters</p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleIssueRuling}
                      disabled={loading || !ruling || resolutionNote.length < 20}
                      variant="destructive"
                    >
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Confirm Ruling
                    </Button>
                    <Button
                      onClick={() => setShowRulingForm(false)}
                      variant="outline"
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Resolution (if resolved) */}
        {dispute.status === 'resolved' && (
          <Card>
            <CardHeader>
              <CardTitle>Resolution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <strong>Ruling:</strong> <Badge>{dispute.ruling?.replace('_', ' ')}</Badge>
                </div>
                <div>
                  <strong>Note:</strong>
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{dispute.resolution_note}</p>
                </div>
                <div className="text-xs text-gray-500">
                  Resolved: {dispute.resolved_at ? new Date(dispute.resolved_at).toLocaleString() : 'N/A'}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}