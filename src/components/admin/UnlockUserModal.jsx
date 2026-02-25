import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, Unlock, Info } from 'lucide-react';

/**
 * F-033: UNLOCK USER CONFIRMATION MODAL
 * 
 * Super admin only modal for removing account lock after investigation.
 * 
 * F-033 Edge.2: Investigation completes with no evidence found.
 * 
 * PROPS:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - user: { id, full_name, email, role, locked_reason }
 * - currentAdmin: { id, role }
 * - onSuccess: () => void
 */
export default function UnlockUserModal({ open, onOpenChange, user, currentAdmin, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUnlock = async () => {
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
      // Call backend unlock function
      const response = await base44.functions.invoke('unlockUser', {
        user_id: user.id,
        reason: reason.trim(),
      });

      if (response.data.success) {
        onSuccess();
        onOpenChange(false);
        setReason('');
      } else {
        setError(response.data.error || 'Failed to unlock user');
      }
    } catch (err) {
      console.error('Unlock failed:', err);
      setError(err.message || 'Failed to unlock user. Please try again.');
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
            <Unlock className="w-5 h-5 text-green-600" />
            Remove Account Lock
          </DialogTitle>
          <DialogDescription>
            F-033 Edge.2: Restore write access to this account.
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

          {/* Show original lock reason if available */}
          {user.locked_reason && (
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-800 font-medium mb-1">Original Lock Reason:</p>
              <p className="text-xs text-amber-700">{user.locked_reason}</p>
            </div>
          )}

          {/* Info about unlock */}
          <Alert className="border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 text-sm">
              <strong>After Unlock:</strong> User will regain full write access immediately. All admin actions remain in AdminActionLog permanently.
            </AlertDescription>
          </Alert>

          {/* Reason field (required, min 10 chars) */}
          <div className="space-y-2">
            <Label htmlFor="unlock_reason">
              Reason for Unlock *
            </Label>
            <Textarea
              id="unlock_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this lock being removed? (e.g., 'Investigation completed, no evidence found') - minimum 10 characters"
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
            onClick={handleUnlock}
            disabled={loading || reason.trim().length < 10}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Unlocking...
              </>
            ) : (
              <>
                <Unlock className="mr-2 h-4 w-4" />
                Unlock Account
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}