import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, Lock, Info } from 'lucide-react';

/**
 * F-033 UI.1: LOCK USER CONFIRMATION MODAL
 * 
 * Super admin only modal for locking user accounts pending investigation.
 * 
 * LOCK vs SUSPENSION (F-033 Data.2):
 * - Lock: User can READ but not WRITE
 * - Suspension: User blocked from everything
 * 
 * FEATURES:
 * - Mandatory reason field (min 10 chars)
 * - Warning about read-only state
 * - Super admin only (hidden for other roles)
 * 
 * PROPS:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - user: { id, full_name, email, role }
 * - currentAdmin: { id, role }
 * - onSuccess: () => void
 */
export default function LockUserModal({ open, onOpenChange, user, currentAdmin, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLock = async () => {
    // Validation
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }

    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters');
      return;
    }

    // Prevent self-lock
    if (user.id === currentAdmin.id) {
      setError('You cannot lock your own account');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // F-033 Triggers.1: Call backend lock function
      const response = await base44.functions.invoke('lockUser', {
        user_id: user.id,
        reason: reason.trim(),
      });

      if (response.data.success) {
        onSuccess();
        onOpenChange(false);
        setReason('');
      } else {
        setError(response.data.error || 'Failed to lock user');
      }
    } catch (err) {
      console.error('Lock failed:', err);
      setError(err.message || 'Failed to lock user. Please try again.');
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
            <Lock className="w-5 h-5 text-amber-600" />
            Lock Account Pending Investigation
          </DialogTitle>
          <DialogDescription>
            F-033: The user will be able to view their account but cannot make any changes.
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

          {/* F-033 UI.1: Lock effects explanation */}
          <Alert className="border-amber-200 bg-amber-50">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 text-sm">
              <strong>Lock Effects (F-033 Access.1-2):</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>User can VIEW their dashboard, profile, bookings</li>
                <li>User CANNOT update profile, send messages, create bookings</li>
                <li>All write actions blocked with 403</li>
                <li>User remains logged in (F-033 Logic.3)</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* F-033 Data.2: Distinction from suspension */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-900 font-medium mb-1">Lock vs Suspension:</p>
            <p className="text-xs text-blue-800">
              Lock = read-only investigation hold. Suspension = full account block. 
              Use lock when you need time to investigate before deciding on suspension.
            </p>
          </div>

          {/* Reason field (required, min 10 chars) */}
          <div className="space-y-2">
            <Label htmlFor="lock_reason">
              Reason for Lock *
            </Label>
            <Textarea
              id="lock_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this account is being locked pending investigation... (minimum 10 characters)"
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
            onClick={handleLock}
            disabled={loading || reason.trim().length < 10}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Locking...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Lock Account
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}