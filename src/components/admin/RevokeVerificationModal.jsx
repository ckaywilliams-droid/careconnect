import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, ShieldX } from 'lucide-react';

/**
 * F-034 UI.3: REVOKE VERIFICATION BADGE MODAL
 * 
 * Confirmation modal for revoking background verified badge from a caregiver.
 * 
 * FEATURES:
 * - Mandatory reason field (min 10 chars)
 * - Warning about automatic profile unpublishing
 * - Trust admin and super admin only
 * 
 * PROPS:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - caregiverProfile: { id, display_name, user_id, is_published }
 * - currentAdmin: { id, role }
 * - onSuccess: () => void
 */
export default function RevokeVerificationModal({ open, onOpenChange, caregiverProfile, currentAdmin, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRevoke = async () => {
    // Validation
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }

    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // F-034 Logic.2: Call backend revoke function
      const response = await base44.functions.invoke('revokeVerificationBadge', {
        caregiver_profile_id: caregiverProfile.id,
        reason: reason.trim(),
      });

      if (response.data.success) {
        onSuccess();
        onOpenChange(false);
        setReason('');
      } else {
        setError(response.data.error || 'Failed to revoke verification badge');
      }
    } catch (err) {
      console.error('Revoke verification failed:', err);
      setError(err.message || 'Failed to revoke verification badge. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setReason('');
      setError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldX className="w-5 h-5 text-red-600" />
            Revoke Background Verified Badge
          </DialogTitle>
          <DialogDescription>
            F-034: Remove verification badge from this caregiver's profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Caregiver Info */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-1">
            <p className="text-sm">
              <span className="text-gray-600">Caregiver:</span>{' '}
              <span className="font-medium">{caregiverProfile.display_name}</span>
            </p>
            <p className="text-sm text-gray-600">
              Profile ID: {caregiverProfile.id}
            </p>
            {caregiverProfile.is_published && (
              <p className="text-sm">
                <span className="text-gray-600">Current Status:</span>{' '}
                <span className="text-green-600 font-medium">Published</span>
              </p>
            )}
          </div>

          {/* F-034 UI.3: Warning about unpublishing */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Warning:</strong> Their profile will be unpublished immediately (F-034 States.2, Triggers.3).
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Profile removed from search results</li>
                <li>Badge removed from profile</li>
                <li>Notification email sent to caregiver</li>
                <li>Cannot republish without re-verification</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Reason field (required, min 10 chars) */}
          <div className="space-y-2">
            <Label htmlFor="revoke_reason">
              Reason for Revocation *
            </Label>
            <Textarea
              id="revoke_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this verification badge being revoked? (minimum 10 characters)"
              rows={4}
              disabled={loading}
            />
            <p className="text-xs text-gray-500">
              {reason.length}/10 characters minimum. This will be logged to AdminActionLog.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={loading || reason.trim().length < 10}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Revoking Badge...
              </>
            ) : (
              <>
                <ShieldX className="mr-2 h-4 w-4" />
                Revoke Badge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}