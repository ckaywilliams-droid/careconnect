import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, CheckCircle2, Trash2, ArrowUpCircle, User, Calendar } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * F-035 UI.2: MODERATION DETAIL MODAL
 * 
 * Detailed view of flagged content with action buttons.
 * 
 * FEATURES:
 * - Full content display
 * - All reports for this target (grouped)
 * - Reporter reasons
 * - Action buttons: Approve / Remove / Escalate
 * 
 * PERMISSIONS:
 * - support_admin: Approve, Escalate
 * - trust_admin: Approve, Remove, Escalate
 * - super_admin: All actions
 * 
 * PROPS:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - flag: FlaggedContent object
 * - currentAdmin: { id, role }
 * - onSuccess: () => void
 */
export default function ModerationDetailModal({ open, onOpenChange, flag, currentAdmin, onSuccess }) {
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Remove content state
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [violationCategory, setViolationCategory] = useState('');
  
  // Escalate state
  const [showEscalateConfirm, setShowEscalateConfirm] = useState(false);
  const [escalationNote, setEscalationNote] = useState('');

  const canRemove = ['trust_admin', 'super_admin'].includes(currentAdmin.role);
  const canEscalate = currentAdmin.role !== 'super_admin'; // super_admin can't escalate further

  const handleApprove = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('approveFlaggedContent', {
        flagged_content_id: flag.id,
      });

      if (response.data.success) {
        onSuccess();
      } else {
        setError(response.data.error || 'Failed to approve flag');
      }
    } catch (err) {
      console.error('Approve failed:', err);
      setError(err.message || 'Failed to approve. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!violationCategory || violationCategory.length < 10) {
      setError('Violation category must be at least 10 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('removeFlaggedContent', {
        flagged_content_id: flag.id,
        violation_category: violationCategory,
      });

      if (response.data.success) {
        onSuccess();
      } else {
        setError(response.data.error || 'Failed to remove content');
      }
    } catch (err) {
      console.error('Remove failed:', err);
      setError(err.message || 'Failed to remove. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!escalationNote || escalationNote.length < 10) {
      setError('Escalation note must be at least 10 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('escalateFlaggedContent', {
        flagged_content_id: flag.id,
        escalation_note: escalationNote,
      });

      if (response.data.success) {
        onSuccess();
      } else {
        setError(response.data.error || 'Failed to escalate');
      }
    } catch (err) {
      console.error('Escalate failed:', err);
      setError(err.message || 'Failed to escalate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setShowRemoveConfirm(false);
      setShowEscalateConfirm(false);
      setViolationCategory('');
      setEscalationNote('');
      setError('');
    }
  };

  // F-035 UI.3: Resolved items are read-only
  const isResolved = flag.status === 'resolved';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            Flagged Content Review
          </DialogTitle>
          <DialogDescription>
            F-035: Review and take action on this flagged content report.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {/* Flag Info */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {flag.target_type.replace('_', ' ')}
                </Badge>
                <Badge variant={flag.status === 'pending' ? 'default' : 'secondary'}>
                  {flag.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Target ID:</span>
                  <p className="font-mono text-xs">{flag.target_id}</p>
                </div>
                <div>
                  <span className="text-gray-600">Reported:</span>
                  <p className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(flag.created_date).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Report Reason */}
            <div>
              <Label className="text-sm font-semibold">Report Reason</Label>
              <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm">
                  <strong className="capitalize">{flag.reason.replace('_', ' ')}:</strong>
                  {flag.reason_detail && ` ${flag.reason_detail}`}
                </p>
              </div>
            </div>

            {/* Reporter Info */}
            <div>
              <Label className="text-sm font-semibold">Reporter</Label>
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                User ID: {flag.reporter_user_id}
              </div>
            </div>

            {/* Resolution Note (if resolved) */}
            {isResolved && flag.resolution_note && (
              <div>
                <Label className="text-sm font-semibold">Resolution</Label>
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{flag.resolution_note}</p>
                  {flag.reviewed_by_admin_id && (
                    <p className="text-xs text-gray-600 mt-2">
                      Reviewed by: {flag.reviewed_by_admin_id} on {new Date(flag.reviewed_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* F-035 Errors.1: Target may no longer exist */}
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription className="text-blue-800 text-xs">
                <strong>Note:</strong> The target content may have been deleted or modified since this report was filed.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="actions" className="space-y-4 mt-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* F-035 UI.3: Read-only if resolved */}
            {isResolved ? (
              <Alert className="border-gray-200 bg-gray-50">
                <AlertDescription className="text-gray-700">
                  This flag has been resolved. No further actions available.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {/* Approve Action */}
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Approve (Clear Flag)
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Content does not violate guidelines. Mark as reviewed with no action.
                  </p>
                  <Button
                    onClick={handleApprove}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Approve Content'}
                  </Button>
                </div>

                {/* Remove Action (trust_admin+) */}
                {canRemove && (
                  <div className="p-4 border border-red-200 rounded-lg">
                    <h3 className="font-semibold flex items-center gap-2 mb-2 text-red-900">
                      <Trash2 className="w-4 h-4 text-red-600" />
                      Remove Content
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Content violates guidelines. Remove and mark as resolved.
                    </p>
                    
                    {!showRemoveConfirm ? (
                      <Button
                        onClick={() => setShowRemoveConfirm(true)}
                        variant="destructive"
                      >
                        Remove Content
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Describe the violation (min 10 characters)..."
                          value={violationCategory}
                          onChange={(e) => setViolationCategory(e.target.value)}
                          rows={3}
                          disabled={loading}
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={handleRemove}
                            disabled={loading || violationCategory.length < 10}
                            variant="destructive"
                          >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Confirm Remove
                          </Button>
                          <Button
                            onClick={() => setShowRemoveConfirm(false)}
                            variant="outline"
                            disabled={loading}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Escalate Action */}
                {canEscalate && (
                  <div className="p-4 border border-amber-200 rounded-lg">
                    <h3 className="font-semibold flex items-center gap-2 mb-2 text-amber-900">
                      <ArrowUpCircle className="w-4 h-4 text-amber-600" />
                      Escalate
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Cannot resolve. Escalate to {currentAdmin.role === 'support_admin' ? 'trust_admin' : 'super_admin'}.
                    </p>
                    
                    {!showEscalateConfirm ? (
                      <Button
                        onClick={() => setShowEscalateConfirm(true)}
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        Escalate to Higher Tier
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Why are you escalating this? (min 10 characters)..."
                          value={escalationNote}
                          onChange={(e) => setEscalationNote(e.target.value)}
                          rows={3}
                          disabled={loading}
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={handleEscalate}
                            disabled={loading || escalationNote.length < 10}
                            className="bg-amber-600 hover:bg-amber-700"
                          >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Confirm Escalate
                          </Button>
                          <Button
                            onClick={() => setShowEscalateConfirm(false)}
                            variant="outline"
                            disabled={loading}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}