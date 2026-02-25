import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';

/**
 * F-032 UI.1: SUSPEND USER CONFIRMATION MODAL
 * 
 * Confirmation modal for suspending a user account.
 * 
 * FEATURES:
 * - Mandatory reason field (min 10 chars)
 * - Warning about immediate account lockout
 * - Prevents self-suspension
 * - Shows pending bookings warning if applicable
 * 
 * PROPS:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - user: { id, full_name, email, role }
 * - currentAdmin: { id, role }
 * - onSuccess: () => void
 */
export default function SuspendUserModal({ open, onOpenChange, user, currentAdmin, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSuspend = async () => {
    // Validation
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }

    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters');
      return;
    }

    // F-032 Abuse.1: Self-suspension prevention (UI layer)
    if (user.id === currentAdmin.id) {
      setError('You cannot suspend your own account');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // F-032 Triggers.1: Call backend suspension function
      const response = await base44.functions.invoke('suspendUser', {
        user_id: user.id,
        reason: reason.trim(),
      });

      if (response.data.success) {
        onSuccess();
        onOpenChange(false);
        setReason('');
      } else {
        setError(response.data.error || 'Failed to suspend user');
      }
    } catch (err) {
      console.error('Suspension failed:', err);
      setError(err.message || 'Failed to suspend user. Please try again.');
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
            <ShieldAlert className="w-5 h-5 text-red-600" />
            Suspend User Account
          </DialogTitle>
          <DialogDescription>
            This will immediately lock the user's account and end all active sessions.
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

          {/* F-032 UI.1: Warning */}
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 text-sm">
              <strong>Immediate Effects:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Account locked immediately</li>
                <li>All active sessions invalidated</li>
                {user.role === 'caregiver' && <li>Profile unpublished from search</li>}
                {user.role === 'caregiver' && <li>Affected parents will be notified</li>}
              </ul>
            </AlertDescription>
          </Alert>

          {/* F-032 UI.1: Reason field (required, min 10 chars) */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason for Suspension *
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for suspension... (minimum 10 characters)"
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
            onClick={handleSuspend}
            disabled={loading || reason.trim().length < 10}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Suspending...
              </>
            ) : (
              'Confirm Suspension'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}