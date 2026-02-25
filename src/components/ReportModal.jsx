import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, Flag } from 'lucide-react';
import { toast } from 'sonner';

/**
 * F-036 UI.2: REPORT MODAL
 * 
 * Modal for submitting reports on users, messages, profiles, etc.
 * 
 * FEATURES:
 * - Reason category dropdown (required)
 * - Optional detail text area (max 500 chars)
 * - Validation and error handling
 * - Toast confirmation on success
 * 
 * PROPS:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - targetType: 'user' | 'message' | 'caregiver_profile' | 'parent_profile' | 'review'
 * - targetId: string
 * - contentLabel: string (e.g., "this user", "this message")
 */
export default function ReportModal({ open, onOpenChange, targetType, targetId, contentLabel = 'this content' }) {
  const [reasonCategory, setReasonCategory] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    // F-036 UI.2: Reason category required
    if (!reasonCategory) {
      setError('Please select a report reason');
      return;
    }

    // F-036 Logic.3: Max 500 chars
    if (reasonDetail.length > 500) {
      setError('Detail must be 500 characters or less');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // F-036 Triggers.1: Submit report
      const response = await base44.functions.invoke('submitReport', {
        target_type: targetType,
        target_id: targetId,
        reason_category: reasonCategory,
        reason_detail: reasonDetail.trim(),
      });

      if (response.data.success) {
        // F-036 UI.3: Toast notification
        toast.success('Report submitted. Our team will review it.');
        
        // Reset and close
        setReasonCategory('');
        setReasonDetail('');
        onOpenChange(false);
      } else {
        setError(response.data.error || 'Failed to submit report');
      }
    } catch (err) {
      console.error('Report submission failed:', err);
      setError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setReasonCategory('');
      setReasonDetail('');
      setError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-600" />
            Report {contentLabel}
          </DialogTitle>
          <DialogDescription>
            F-036: Help us maintain a safe community by reporting policy violations.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* F-036 Logic.2: Reason category dropdown (required) */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Report Reason *
            </Label>
            <Select value={reasonCategory} onValueChange={setReasonCategory} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spam">Spam</SelectItem>
                <SelectItem value="harassment">Harassment</SelectItem>
                <SelectItem value="fake_profile">Fake Profile</SelectItem>
                <SelectItem value="inappropriate_content">Inappropriate Content</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* F-036 Logic.3: Optional detail (max 500 chars) */}
          <div className="space-y-2">
            <Label htmlFor="detail">
              Additional Details (Optional)
            </Label>
            <Textarea
              id="detail"
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Describe the issue — optional, max 500 characters"
              rows={4}
              disabled={loading}
            />
            <p className="text-xs text-gray-500">
              {reasonDetail.length}/500 characters
            </p>
          </div>

          {/* Info */}
          <Alert className="border-blue-200 bg-blue-50">
            <AlertDescription className="text-blue-800 text-xs">
              <strong>Privacy:</strong> Your report will be reviewed by our moderation team. 
              Your identity will not be shared with the reported user.
            </AlertDescription>
          </Alert>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            type="button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !reasonCategory}
            variant="destructive"
            type="submit"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Flag className="mr-2 h-4 w-4" />
                Submit Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}