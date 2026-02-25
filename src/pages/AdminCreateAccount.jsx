import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserPlus, AlertTriangle, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { isSuperAdmin } from '@/components/admin/PermissionMatrix';

/**
 * F-031 UI.1: ADMIN ACCOUNT CREATION FORM
 * 
 * Super admin only page for creating new admin accounts.
 * Admins do NOT go through public registration (F-031 Data.3).
 * 
 * WORKFLOW (F-031 Triggers.1):
 * 1. Super admin fills form (name, email, role, reason)
 * 2. Confirmation modal shows
 * 3. Backend creates User with admin role
 * 4. Generates temporary password (16 chars, F-026 compliant)
 * 5. Sends welcome email with temp password
 * 6. Logs to AdminActionLog
 * 
 * ACCESS CONTROL (F-031 Access.1):
 * - Super admin only
 * - Rate limit: 5 new admins per super admin per day (F-031 Abuse.1)
 */
export default function AdminCreateAccount() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'support_admin',
    reason: '',
  });

  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // F-031 Access.1: Super admin only
        if (!isSuperAdmin(currentUser)) {
          setError('Access denied. Only super administrators can create admin accounts.');
          setTimeout(() => navigate('/admin'), 2000);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setError('Authentication required.');
        setTimeout(() => base44.auth.redirectToLogin(), 2000);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [navigate]);

  const validateForm = () => {
    const errors = {};

    // Full name required
    if (!formData.full_name.trim()) {
      errors.full_name = 'Full name is required';
    }

    // Email validation
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }

    // F-031 Abuse.2: Optional domain restriction
    // Uncomment if company domain restriction is needed:
    // const companyDomain = '@yourcompany.com';
    // if (!formData.email.endsWith(companyDomain)) {
    //   errors.email = `Admin accounts must use ${companyDomain} email addresses`;
    // }

    // Role required
    if (!formData.role) {
      errors.role = 'Role selection is required';
    }

    // F-031 Logic.1: Reason required, min 10 chars
    if (!formData.reason.trim()) {
      errors.reason = 'Reason for account creation is required';
    } else if (formData.reason.trim().length < 10) {
      errors.reason = 'Reason must be at least 10 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // F-031 UI.1: Show confirmation modal
    setShowConfirmModal(true);
  };

  const handleConfirmCreate = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      // F-031 Triggers.1: Call backend function to create admin
      // TODO: Implement backend function createAdminAccount
      // const response = await base44.functions.invoke('createAdminAccount', formData);

      // Placeholder simulation
      console.log('Creating admin account:', formData);
      await new Promise(resolve => setTimeout(resolve, 1500));

      setSuccess(`Admin account created successfully! A welcome email with temporary password has been sent to ${formData.email}.`);
      
      // Reset form
      setFormData({
        full_name: '',
        email: '',
        role: 'support_admin',
        reason: '',
      });

      // Navigate back after success
      setTimeout(() => {
        navigate('/admin/users');
      }, 3000);

    } catch (error) {
      console.error('Failed to create admin:', error);
      
      // F-031 Errors.1: Duplicate email
      if (error.message?.includes('already exists')) {
        setError('An account already exists with this email.');
      } else {
        setError(error.message || 'Failed to create admin account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/users')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-6 h-6 text-red-600" />
                Create Admin Account
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                F-031: Create new administrator accounts (Super Admin only)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Warning */}
        <Alert className="mb-6 border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Critical Action:</strong> Admin accounts have elevated privileges. This action will be logged to AdminActionLog.
          </AlertDescription>
        </Alert>

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {error && user && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Admin Account Details</CardTitle>
            <CardDescription>
              Enter the information for the new admin account. A welcome email with temporary password will be sent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  placeholder="John Doe"
                  disabled={submitting}
                />
                {validationErrors.full_name && (
                  <p className="text-sm text-red-600">{validationErrors.full_name}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="admin@company.com"
                  disabled={submitting}
                />
                {validationErrors.email && (
                  <p className="text-sm text-red-600">{validationErrors.email}</p>
                )}
                <p className="text-xs text-gray-500">
                  F-031: Admin does not go through public registration. Email verification is bypassed.
                </p>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role">Admin Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({...formData, role: value})}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="support_admin">Support Admin (Read-only)</SelectItem>
                    <SelectItem value="trust_admin">Trust Admin (Moderation + Verification)</SelectItem>
                    <SelectItem value="super_admin">Super Admin (Full Control)</SelectItem>
                  </SelectContent>
                </Select>
                {validationErrors.role && (
                  <p className="text-sm text-red-600">{validationErrors.role}</p>
                )}
                <p className="text-xs text-gray-500">
                  See F-030 permission matrix for role capabilities.
                </p>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Account Creation *</Label>
                <Textarea
                  id="reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  placeholder="Why is this admin account being created? (min 10 characters)"
                  rows={3}
                  disabled={submitting}
                />
                {validationErrors.reason && (
                  <p className="text-sm text-red-600">{validationErrors.reason}</p>
                )}
                <p className="text-xs text-gray-500">
                  This reason will be logged to AdminActionLog for audit purposes.
                </p>
              </div>

              {/* Submit */}
              <div className="pt-4">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Admin Account...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Create Admin Account
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info Boxes */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Temporary Password</h3>
            <p className="text-xs text-blue-800">
              A 16-character temporary password will be generated and sent to the new admin's email.
              They must change it on first login (F-031 Logic.2).
            </p>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Rate Limiting</h3>
            <p className="text-xs text-blue-800">
              F-031 Abuse.1: Maximum 5 new admin accounts per super admin per day.
            </p>
          </div>
        </div>
      </div>

      {/* F-031 UI.1: Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Admin Account Creation</DialogTitle>
            <DialogDescription>
              You are about to create a new admin account. This action will be logged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Name:</span>
              <span className="font-medium">{formData.full_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Email:</span>
              <span className="font-medium">{formData.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Role:</span>
              <span className="font-medium capitalize">{formData.role.replace('_', ' ')}</span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreate}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Confirm Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}