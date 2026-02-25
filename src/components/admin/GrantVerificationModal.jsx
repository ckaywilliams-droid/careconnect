import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';

/**
 * F-034 UI.2: GRANT VERIFICATION BADGE MODAL
 * 
 * Confirmation modal for granting background verified badge to a caregiver.
 * 
 * FEATURES:
 * - Mandatory reason field (min 10 chars)
 * - Describes verification performed
 * - Trust admin and super admin only
 * 
 * PROPS:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - caregiverProfile: { id, display_name, user_id }
 * - currentAdmin: { id, role }
 * - onSuccess: () => void
 */
export default function GrantVerificationModal({ open, onOpenChange, caregiverProfile, currentAdmin, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGrant = async () => {
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
      // F-034 Logic.1: Call backend grant function
      const response = await base44.functions.invoke('grantVerificationBadge', {
        caregiver_profile_id: caregiverProfile.id,
        reason: reason.trim(),
      });

      if (response.data.success) {
        onSuccess();
        onOpenChange(false);
        setReason('');
      } else {
        setError(response.data.error || 'Failed to grant verification badge');
      }
    } catch (err) {
      console.error('Grant verification failed:', err);
      setError(err.message || 'Failed to grant verification badge. Please try again.');
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
            <ShieldCheck className="w-5 h-5 text-green-600" />
            Grant Background Verified Badge
          </DialogTitle>
          <DialogDescription>
            F-034: Add verification badge to this caregiver's profile.
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
          </div>

          {/* F-034 UI.2: What this means */}
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 text-sm">
              <strong>Badge Effects:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Green checkmark badge appears on profile</li>
                <li>Profile becomes eligible for publication</li>
                <li>Celebration email sent to caregiver (F-034 Triggers.1)</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* F-034 UI.2: Reason field (required, min 10 chars) */}
          <div className="space-y-2">
            <Label htmlFor="grant_reason">
              Describe the Verification Performed *
            </Label>
            <Textarea
              id="grant_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., 'Background check completed through [provider], cleared on [date]' (minimum 10 characters)"
              rows={4}
              disabled={loading}
            />
            <p className="text-xs text-gray-500">
              {reason.length}/10 characters minimum. This will be logged to AdminActionLog.
            </p>
          </div>

          {/* F-034 Data.3: Verification method note */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-900 font-medium mb-1">Verification Method:</p>
            <p className="text-xs text-blue-800">
              The specific verification process is documented in the admin SOP. This badge confirms the caregiver has passed verification.
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
            onClick={handleGrant}
            disabled={loading || reason.trim().length < 10}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Granting Badge...
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Grant Badge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}