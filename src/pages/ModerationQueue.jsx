import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Flag, MessageSquare, User, Calendar, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ModerationDetailModal from '@/components/admin/ModerationDetailModal';

/**
 * F-035 UI.1: MODERATION QUEUE PAGE
 * 
 * Displays pending flagged content for admin review.
 * 
 * FEATURES:
 * - Sortable table of FlaggedContent items
 * - Filters: status, target_type
 * - Default sort: oldest pending first
 * - Click item to open detail panel
 * 
 * ACCESS (F-035 Access.1):
 * - support_admin: view and action pending items
 * - trust_admin: view, action, escalate
 * - super_admin: full access including resolved items
 */
export default function ModerationQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');

  // Detail modal
  const [selectedFlag, setSelectedFlag] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // F-035 Access.1: Admin access required
        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        if (!adminRoles.includes(currentUser.role)) {
          setError('Access denied. Admin access required for moderation queue.');
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

  // Fetch flagged content
  const { data: flags = [], isLoading: flagsLoading, refetch } = useQuery({
    queryKey: ['flagged-content', statusFilter, typeFilter],
    queryFn: async () => {
      const query = {};
      
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }
      
      if (typeFilter !== 'all') {
        query.target_type = typeFilter;
      }

      const results = await base44.entities.FlaggedContent.filter(query, '-created_date');
      return results || [];
    },
    enabled: !!user,
  });

  // F-035 Edge.1: Alert if queue exceeds 500 unresolved items
  const unresolvedCount = flags.filter(f => f.status !== 'resolved').length;

  const handleItemClick = (flag) => {
    setSelectedFlag(flag);
    setShowDetailModal(true);
  };

  const handleActionSuccess = () => {
    refetch();
    setShowDetailModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading moderation queue...</p>
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
                onClick={() => navigate('/admin')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-blue-600" />
                  Content Moderation Queue
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  F-035: Review flagged content and take action
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {unresolvedCount} pending
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* F-035 Edge.1: Alert if queue exceeds 500 */}
        {unresolvedCount > 500 && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Alert:</strong> Moderation queue exceeds 500 unresolved items ({unresolvedCount} pending). 
              This may indicate a coordinated attack or under-resourced moderation team.
            </AlertDescription>
          </Alert>
        )}

        {/* F-035 UI.1: Filters */}
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="resolved">Resolved (Archived)</SelectItem>
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
                    <SelectItem value="message">Messages</SelectItem>
                    <SelectItem value="caregiver_profile">Caregiver Profiles</SelectItem>
                    <SelectItem value="parent_profile">Parent Profiles</SelectItem>
                    <SelectItem value="user">Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Queue Items */}
        {flagsLoading ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-600">Loading flagged content...</p>
          </div>
        ) : flags.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Flag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No flagged content found with current filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {flags.map((flag) => (
              <Card
                key={flag.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleItemClick(flag)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {/* Icon */}
                      <div className="mt-1">
                        {flag.target_type === 'message' && <MessageSquare className="w-5 h-5 text-blue-600" />}
                        {flag.target_type.includes('profile') && <User className="w-5 h-5 text-purple-600" />}
                        {flag.target_type === 'user' && <User className="w-5 h-5 text-gray-600" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="capitalize">
                            {flag.target_type.replace('_', ' ')}
                          </Badge>
                          <Badge 
                            variant={flag.status === 'pending' ? 'default' : 'secondary'}
                            className={flag.status === 'pending' ? 'bg-yellow-500' : ''}
                          >
                            {flag.status}
                          </Badge>
                        </div>

                        <p className="text-sm text-gray-700 mb-2">
                          <strong>Reason:</strong> {flag.reason} 
                          {flag.reason_detail && ` — ${flag.reason_detail.substring(0, 80)}${flag.reason_detail.length > 80 ? '...' : ''}`}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(flag.created_date).toLocaleDateString()}
                          </span>
                          <span>
                            Pending: {Math.floor((Date.now() - new Date(flag.created_date)) / (1000 * 60 * 60))}h
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Indicator */}
                    <div>
                      {flag.status === 'pending' && (
                        <Badge variant="destructive">Action Required</Badge>
                      )}
                      {flag.status === 'resolved' && flag.resolution_note && (
                        <Badge variant="secondary">Resolved</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* F-035 UI.2: Detail Modal */}
      {selectedFlag && (
        <ModerationDetailModal
          open={showDetailModal}
          onOpenChange={setShowDetailModal}
          flag={selectedFlag}
          currentAdmin={user}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
}