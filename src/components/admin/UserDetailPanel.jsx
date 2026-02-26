import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  Mail, 
  Calendar, 
  Shield, 
  Ban,
  Unlock,
  Lock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import SuspendUserModal from './SuspendUserModal';
import UnsuspendUserModal from './UnsuspendUserModal';
import LockUserModal from './LockUserModal';
import UnlockUserModal from './UnlockUserModal';
import GrantVerificationModal from './GrantVerificationModal';
import RevokeVerificationModal from './RevokeVerificationModal';
import { formatDistanceToNow } from 'date-fns';

/**
 * F-039 UI.3: USER DETAIL SIDE PANEL
 * 
 * Slide-in panel showing full user details.
 * 
 * FEATURES:
 * - Full profile summary
 * - F-039 Access.3: Full email (trust_admin+)
 * - Recent admin actions from AdminActionLog
 * - Action buttons (suspend, lock, verify, etc.)
 * - Current session info
 */
export default function UserDetailPanel({ open, onOpenChange, userId, currentAdmin, onUpdate }) {
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showUnsuspendModal, setShowUnsuspendModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showGrantVerifyModal, setShowGrantVerifyModal] = useState(false);
  const [showRevokeVerifyModal, setShowRevokeVerifyModal] = useState(false);

  // Fetch user details
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['user-detail', userId],
    queryFn: async () => {
      const users = await base44.entities.User.filter({ id: userId });
      const user = users[0];

      // If caregiver, fetch profile
      let profile = null;
      if (user.role === 'caregiver') {
        const profiles = await base44.entities.CaregiverProfile.filter({ user_id: userId });
        profile = profiles[0];
      }

      return { user, profile };
    },
    enabled: !!userId && open,
  });

  // Fetch admin actions on this user
  const { data: adminActions = [] } = useQuery({
    queryKey: ['admin-actions', userId],
    queryFn: async () => {
      const actions = await base44.entities.AdminActionLog.filter(
        { target_entity_id: userId },
        '-created_date',
        10
      );
      return actions || [];
    },
    enabled: !!userId && open,
  });

  const user = userData?.user;
  const profile = userData?.profile;

  // F-039 Access.3: Full email visible to trust_admin+
  const canViewFullEmail = ['trust_admin', 'super_admin'].includes(currentAdmin.role);

  // F-039 Access.2: Action availability
  const canSuspend = ['support_admin', 'trust_admin', 'super_admin'].includes(currentAdmin.role);
  const canLock = ['super_admin'].includes(currentAdmin.role);
  const canVerify = ['trust_admin', 'super_admin'].includes(currentAdmin.role);

  const isOwnAccount = userId === currentAdmin.id;

  const handleActionSuccess = () => {
    onUpdate();
    setShowSuspendModal(false);
    setShowUnsuspendModal(false);
    setShowLockModal(false);
    setShowUnlockModal(false);
    setShowGrantVerifyModal(false);
    setShowRevokeVerifyModal(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>User Details</SheetTitle>
            <SheetDescription>
              F-039: Full profile and admin actions
            </SheetDescription>
          </SheetHeader>

          {userLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
              <p className="text-gray-600">Loading user details...</p>
            </div>
          ) : !user ? (
            <Alert variant="destructive" className="mt-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>User not found</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6 mt-6">
              {/* Profile Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-semibold">
                    {user.full_name?.substring(0, 2).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{user.full_name || 'Unknown'}</h3>
                    <Badge className="capitalize">
                      {user.role.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    {/* F-039 Access.3: Full email for trust_admin+ */}
                    {canViewFullEmail ? (
                      <span>{user.email}</span>
                    ) : (
                      <span className="text-gray-500">Email masked (trust_admin+ only)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>Joined {formatDistanceToNow(new Date(user.created_date), { addSuffix: true })}</span>
                  </div>

                  {user.last_login_at && (
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <span>Last login {formatDistanceToNow(new Date(user.last_login_at), { addSuffix: true })}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                {user.is_suspended && (
                  <Badge variant="destructive">Suspended</Badge>
                )}
                {user.is_locked && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Locked
                  </Badge>
                )}
                {user.email_verified && (
                  <Badge className="bg-green-100 text-green-800">Email Verified</Badge>
                )}
                {user.role === 'caregiver' && profile?.is_verified && (
                  <Badge className="bg-blue-100 text-blue-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Background Verified
                  </Badge>
                )}
              </div>

              <Separator />

              {/* F-039 Edge.1: Disable actions on own account */}
              {isOwnAccount && (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    You cannot perform actions on your own account.
                  </AlertDescription>
                </Alert>
              )}

              {/* Actions */}
              {!isOwnAccount && (
                <div className="space-y-3">
                  <h4 className="font-semibold">Actions</h4>

                  {/* Suspend/Unsuspend */}
                  {canSuspend && (
                    user.is_suspended ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setShowUnsuspendModal(true)}
                      >
                        <Unlock className="w-4 h-4 mr-2" />
                        Unsuspend User
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        className="w-full justify-start"
                        onClick={() => setShowSuspendModal(true)}
                      >
                        <Ban className="w-4 h-4 mr-2" />
                        Suspend User
                      </Button>
                    )
                  )}

                  {/* Lock/Unlock (super_admin only) */}
                  {canLock && (
                    user.is_locked ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setShowUnlockModal(true)}
                      >
                        <Unlock className="w-4 h-4 mr-2" />
                        Unlock Account
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full justify-start border-amber-300 hover:bg-amber-50"
                        onClick={() => setShowLockModal(true)}
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Lock Account
                      </Button>
                    )
                  )}

                  {/* Verify/Revoke (caregiver only, trust_admin+) */}
                  {canVerify && user.role === 'caregiver' && profile && (
                    profile.is_verified ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start border-red-300 hover:bg-red-50"
                        onClick={() => setShowRevokeVerifyModal(true)}
                      >
                        <Ban className="w-4 h-4 mr-2" />
                        Revoke Verification
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full justify-start border-green-300 hover:bg-green-50"
                        onClick={() => setShowGrantVerifyModal(true)}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Grant Verification
                      </Button>
                    )
                  )}
                </div>
              )}

              <Separator />

              {/* Recent Admin Actions */}
              <div>
                <h4 className="font-semibold mb-3">Recent Admin Actions</h4>
                {adminActions.length === 0 ? (
                  <p className="text-sm text-gray-600">No admin actions on this user</p>
                ) : (
                  <div className="space-y-2">
                    {adminActions.map((action) => (
                      <div key={action.id} className="p-3 bg-gray-50 rounded text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-xs capitalize">
                            {action.action_type.replace('_', ' ')}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {formatDistanceToNow(new Date(action.created_date), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-gray-700">{action.reason}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          by {action.admin_role}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Modals */}
      {user && (
        <>
          <SuspendUserModal
            open={showSuspendModal}
            onOpenChange={setShowSuspendModal}
            user={user}
            onSuccess={handleActionSuccess}
          />

          <UnsuspendUserModal
            open={showUnsuspendModal}
            onOpenChange={setShowUnsuspendModal}
            user={user}
            onSuccess={handleActionSuccess}
          />

          <LockUserModal
            open={showLockModal}
            onOpenChange={setShowLockModal}
            user={user}
            onSuccess={handleActionSuccess}
          />

          <UnlockUserModal
            open={showUnlockModal}
            onOpenChange={setShowUnlockModal}
            user={user}
            onSuccess={handleActionSuccess}
          />

          {profile && (
            <>
              <GrantVerificationModal
                open={showGrantVerifyModal}
                onOpenChange={setShowGrantVerifyModal}
                caregiver={{ ...user, profile }}
                onSuccess={handleActionSuccess}
              />

              <RevokeVerificationModal
                open={showRevokeVerifyModal}
                onOpenChange={setShowRevokeVerifyModal}
                caregiver={{ ...user, profile }}
                onSuccess={handleActionSuccess}
              />
            </>
          )}
        </>
      )}
    </>
  );
}