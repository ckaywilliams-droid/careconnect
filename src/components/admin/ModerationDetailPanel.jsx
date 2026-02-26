import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, Trash2, ArrowUpCircle, AlertTriangle, User, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

/**
 * F-040 UI.1-2: MODERATION DETAIL PANEL (Right Panel)
 * 
 * Shows full content and all reports for selected item.
 * 
 * FEATURES:
 * - F-040 Logic.2: Full content display with "Show more" toggle
 * - F-040 UI.2: Action buttons (Approve, Remove, Escalate)
 * - F-040 UI.3: Read-only for resolved items
 * - All reports listed with masked reporter
 */
export default function ModerationDetailPanel({ item, currentAdmin, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // F-040 UI.2: Action states
  const [showRemoveForm, setShowRemoveForm] = useState(false);
  const [violationNote, setViolationNote] = useState('');
  
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [escalationNote, setEscalationNote] = useState('');

  // F-040 Logic.2: Show more toggle
  const [showFullContent, setShowFullContent] = useState(false);

  // F-040 Access.2: Action visibility
  const canRemove = ['trust_admin', 'super_admin'].includes(currentAdmin.role);
  const canEscalate = currentAdmin.role !== 'super_admin';

  const isResolved = item.status === 'resolved';

  // Get first report as primary
  const primaryReport = item.reports[0];

  const handleApprove = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('approveFlaggedContent', {
        flagged_content_id: primaryReport.id,
      });

      if (response.data.success) {
        toast.success('Content approved successfully');
        onSuccess();
      } else {
        setError(response.data.error || 'Failed to approve');
      }
    } catch (err) {
      console.error('Approve failed:', err);
      setError(err.message || 'Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!violationNote || violationNote.length < 10) {
      setError('Violation note must be at least 10 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('removeFlaggedContent', {
        flagged_content_id: primaryReport.id,
        violation_category: violationNote,
      });

      if (response.data.success) {
        toast.success('Content removed successfully');
        onSuccess();
      } else {
        setError(response.data.error || 'Failed to remove');
      }
    } catch (err) {
      console.error('Remove failed:', err);
      setError(err.message || 'Failed to remove');
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
        flagged_content_id: primaryReport.id,
        escalation_note: escalationNote,
      });

      if (response.data.success) {
        toast.success(`Escalated to ${response.data.escalated_to}`);
        onSuccess();
      } else {
        setError(response.data.error || 'Failed to escalate');
      }
    } catch (err) {
      console.error('Escalate failed:', err);
      setError(err.message || 'Failed to escalate');
    } finally {
      setLoading(false);
    }
  };

  // F-040 Logic.2: Content preview with truncation
  const contentPreview = primaryReport.reason_detail || primaryReport.reason || 'No details provided';
  const shouldTruncate = contentPreview.length > 200;
  const displayContent = showFullContent || !shouldTruncate 
    ? contentPreview 
    : contentPreview.substring(0, 200) + '...';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold mb-2">
          {item.target_type.replace('_', ' ').toUpperCase()}
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {item.target_type.replace('_', ' ')}
          </Badge>
          <Badge className={item.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
            {item.status}
          </Badge>
          <Badge>
            {item.report_count} {item.report_count === 1 ? 'report' : 'reports'}
          </Badge>
        </div>
      </div>

      <Separator />

      {/* F-040 Logic.2: Content preview with "Show more" */}
      <div>
        <h3 className="font-semibold mb-2">Content Preview</h3>
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {displayContent}
          </p>
          {shouldTruncate && (
            <Button
              variant="link"
              size="sm"
              className="mt-2 p-0 h-auto"
              onClick={() => setShowFullContent(!showFullContent)}
            >
              {showFullContent ? 'Show less' : 'Show more'}
            </Button>
          )}
        </div>
        {/* F-040 Errors.1: Target may not exist */}
        <p className="text-xs text-gray-500 mt-2">
          Note: If target content was deleted, it may no longer exist in the system.
        </p>
      </div>

      <Separator />

      {/* F-040 UI.1: All reports listed */}
      <div>
        <h3 className="font-semibold mb-3">All Reports ({item.report_count})</h3>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {item.reports.map((report, index) => (
            <div key={report.id} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-500">
                    Reporter {index + 1} (masked)
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(report.created_date), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm font-medium capitalize mb-1">
                {report.reason.replace('_', ' ')}
              </p>
              {report.reason_detail && (
                <p className="text-sm text-gray-600">{report.reason_detail}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* F-040 UI.3: Read-only for resolved */}
      {isResolved && primaryReport.resolution_note ? (
        <div>
          <h3 className="font-semibold mb-2">Resolution</h3>
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
            <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">
              {primaryReport.resolution_note}
            </p>
            {primaryReport.reviewed_by_admin_id && (
              <p className="text-xs text-gray-600">
                Resolved by admin on {new Date(primaryReport.reviewed_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* F-040 UI.2: Action buttons */
        <div className="space-y-3">
          <h3 className="font-semibold">Actions</h3>

          {/* F-040 UI.2: Approve - green */}
          <Button
            onClick={handleApprove}
            disabled={loading}
            className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Approve — No violation
          </Button>

          {/* F-040 UI.2, Access.2: Remove content - red (trust_admin+ only) */}
          {canRemove && (
            <div className="space-y-2">
              {!showRemoveForm ? (
                <Button
                  onClick={() => setShowRemoveForm(true)}
                  variant="destructive"
                  className="w-full justify-start"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove content
                </Button>
              ) : (
                <div className="p-4 border-2 border-red-200 rounded-lg space-y-3">
                  <Label>Violation Note (required, min 10 chars)</Label>
                  <Textarea
                    value={violationNote}
                    onChange={(e) => setViolationNote(e.target.value)}
                    placeholder="Describe the violation..."
                    rows={3}
                    disabled={loading}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleRemove}
                      disabled={loading || violationNote.length < 10}
                      variant="destructive"
                      className="flex-1"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Remove'}
                    </Button>
                    <Button
                      onClick={() => setShowRemoveForm(false)}
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

          {/* F-040 UI.2: Escalate - amber */}
          {canEscalate && (
            <div className="space-y-2">
              {!showEscalateForm ? (
                <Button
                  onClick={() => setShowEscalateForm(true)}
                  className="w-full justify-start bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <ArrowUpCircle className="w-4 h-4 mr-2" />
                  Escalate
                </Button>
              ) : (
                <div className="p-4 border-2 border-amber-200 rounded-lg space-y-3">
                  <Label>Escalation Note (required, min 10 chars)</Label>
                  <Textarea
                    value={escalationNote}
                    onChange={(e) => setEscalationNote(e.target.value)}
                    placeholder="Why are you escalating this?"
                    rows={3}
                    disabled={loading}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleEscalate}
                      disabled={loading || escalationNote.length < 10}
                      className="flex-1 bg-amber-600 hover:bg-amber-700"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Escalate'}
                    </Button>
                    <Button
                      onClick={() => setShowEscalateForm(false)}
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
    </div>
  );
}