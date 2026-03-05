import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, ArrowLeft, Calendar, User } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * F-037 UI.1: ADMIN DISPUTE DASHBOARD
 * 
 * List of all dispute cases with filters.
 * 
 * FEATURES:
 * - Status badges
 * - Booking reference
 * - Dispute type
 * - Assigned admin
 * - Days open
 * - Filters: status, type, assigned admin
 * 
 * ACCESS (F-037 Access.1):
 * - support_admin, trust_admin, super_admin
 */
export default function AdminDisputeDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        if (!adminRoles.includes(currentUser.role)) {
          setError('Access denied. Admin access required.');
          setTimeout(() => navigate('/'), 2000);
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

  // Fetch disputes
  const { data: disputes = [], isLoading: disputesLoading, refetch } = useQuery({
    queryKey: ['disputes', statusFilter, typeFilter],
    queryFn: async () => {
      const query = {};
      
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }
      
      if (typeFilter !== 'all') {
        query.dispute_type = typeFilter;
      }

      const results = await base44.entities.DisputeCase.filter(query, '-created_date');
      return results || [];
    },
    enabled: !!user,
  });

  const getStatusColor = (status) => {
    const colors = {
      open: 'bg-blue-100 text-blue-800',
      frozen: 'bg-purple-100 text-purple-800',
      evidence_requested: 'bg-yellow-100 text-yellow-800',
      ruling_pending: 'bg-orange-100 text-orange-800',
      resolved: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getDaysOpen = (openedAt) => {
    const days = Math.floor((Date.now() - new Date(openedAt)) / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading dispute dashboard...</p>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/AdminDashboard')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-red-600" />
                  Dispute Dashboard
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  F-037: Manage dispute cases and resolutions
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {disputes.filter(d => d.status !== 'resolved').length} open
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* F-037 UI.1: Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              <div className="w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="frozen">Frozen</SelectItem>
                    <SelectItem value="evidence_requested">Evidence Requested</SelectItem>
                    <SelectItem value="ruling_pending">Ruling Pending</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-48">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="payment_dispute">Payment Dispute</SelectItem>
                    <SelectItem value="safety_concern">Safety Concern</SelectItem>
                    <SelectItem value="no_show">No Show</SelectItem>
                    <SelectItem value="misconduct">Misconduct</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dispute List */}
        {disputesLoading ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-600">Loading disputes...</p>
          </div>
        ) : disputes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No disputes found with current filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {disputes.map((dispute) => (
              <Card
                key={dispute.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(createPageUrl('DisputeDetail') + `?id=${dispute.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getStatusColor(dispute.status)}>
                          {dispute.status.replace('_', ' ')}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {dispute.dispute_type.replace('_', ' ')}
                        </Badge>
                      </div>

                      <p className="text-sm text-gray-700 mb-2">
                        <strong>Booking:</strong> {dispute.booking_id}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Opened: {new Date(dispute.created_date).toLocaleDateString()}
                        </span>
                        <span>
                          Days open: {getDaysOpen(dispute.created_date)}
                        </span>
                        {dispute.assigned_to && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Assigned: {dispute.assigned_to.substring(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {dispute.status !== 'resolved' && (
                        <Badge variant="destructive">Action Required</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}