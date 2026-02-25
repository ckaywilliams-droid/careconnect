import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, ShieldCheck, Info } from 'lucide-react';

/**
 * F-032 UI.3: UNSUSPEND USER CONFIRMATION MODAL
 * 
 * Confirmation modal for removing suspension from a user account.
 * 
 * FEATURES:
 * - Mandatory reason field (min 10 chars)
 * - Warning about profile remaining unpublished
 * - Note about manual re-verification requirement
 * 
 * PROPS:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - user: { id, full_name, email, role, suspension_reason }
 * - currentAdmin: { id, role }
 * - onSuccess: () => void
 */
export default function UnsuspendUserModal({ open, onOpenChange, user, currentAdmin, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUnsuspend = async () => {
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
      // F-032 Logic.3: Call backend unsuspension function
      const response = await base44.functions.invoke('unsuspendUser', {
        user_id: user.id,
        reason: reason.trim(),
      });

      if (response.data.success) {
        onSuccess();
        onOpenChange(false);
        setReason('');
      } else {
        setError(response.data.error || 'Failed to unsuspend user');
      }
    } catch (err) {
      console.error('Unsuspension failed:', err);
      setError(err.message || 'Failed to unsuspend user. Please try again.');
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
            Remove Suspension
          </DialogTitle>
          <DialogDescription>
            F-032 UI.3: Restore account access for this user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* User Info */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-1">
            <p className="text-sm">
              <span className="text-gray-600">User:</span>{' '}
              <span className="font-medium">{user.full_name}</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-600">Email:</span>{' '}
              <span className="font-medium">{user.email}</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-600">Role:</span>{' '}
              <span className="font-medium capitalize">{user.role}</span>
            </p>
          </div>

          {/* F-032 UI.3: Warning about profile republishing */}
          {user.role === 'caregiver' && (
            <Alert className="border-blue-200 bg-blue-50">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                <strong>Note:</strong> Their profile will remain unpublished until they re-submit for verification.
                Manual review and re-verification required before profile goes live.
              </AlertDescription>
            </Alert>
          )}

          {/* Show original suspension reason if available */}
          {user.suspension_reason && (
            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <p className="text-xs text-red-800 font-medium mb-1">Original Suspension Reason:</p>
              <p className="text-xs text-red-700">{user.suspension_reason}</p>
            </div>
          )}

          {/* Reason field (required, min 10 chars) */}
          <div className="space-y-2">
            <Label htmlFor="unsuspend_reason">
              Reason for Unsuspension *
            </Label>
            <Textarea
              id="unsuspend_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this suspension being lifted? (minimum 10 characters)"
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
            onClick={handleUnsuspend}
            disabled={loading || reason.trim().length < 10}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removing Suspension...
              </>
            ) : (
              'Confirm Unsuspension'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}