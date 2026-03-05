import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, MessageSquare, User, Calendar, CheckCircle2, Loader2 } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import ModerationQueueItem from '@/components/admin/ModerationQueueItem';
import ModerationDetailPanel from '@/components/admin/ModerationDetailPanel';
import { formatDistanceToNow } from 'date-fns';

/**
 * F-040: MODERATION QUEUE UI
 * 
 * Split-panel layout with queue items and detail view.
 * 
 * FEATURES:
 * - F-040 UI.1: Left panel (40%) - queue items list
 * - F-040 UI.1: Right panel (60%) - detail view
 * - F-040 States.1: Tabs for Pending/Reviewed/Resolved
 * - F-040 Logic.1: Severity-based sorting (5+ reports first)
 * - F-040 Logic.3: Grouped by target_id
 * - F-040 Errors.3: Empty state with green checkmark
 */
export default function ModerationQueue() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  // F-040 States.1: Tabs for queue states
  const [activeTab, setActiveTab] = useState('pending');

  // F-040 UI.1: Selected item for detail view
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // F-040 Access.1: Admin access required
        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        if (!adminRoles.includes(currentUser.app_role)) {
          setError('Access denied. Admin access required for moderation queue.');
          setTimeout(() => window.location.href = '/', 2000);
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
  }, []);

  // Fetch flagged content
  const { data: flags = [], isLoading: flagsLoading, refetch } = useQuery({
    queryKey: ['flagged-content', activeTab],
    queryFn: async () => {
      const query = {};
      
      // F-040 States.1: Filter by tab
      if (activeTab === 'pending') {
        query.status = 'pending';
      } else if (activeTab === 'reviewed') {
        query.status = 'reviewed';
      } else if (activeTab === 'resolved') {
        query.status = 'resolved';
      }

      const results = await base44.entities.FlaggedContent.filter(query, '-created_date');
      return results || [];
    },
    enabled: !!user,
  });

  // F-040 Logic.3: Group by target_id
  const groupedFlags = flags.reduce((acc, flag) => {
    const key = `${flag.target_type}-${flag.target_id}`;
    if (!acc[key]) {
      acc[key] = {
        target_type: flag.target_type,
        target_id: flag.target_id,
        reports: [],
        first_reported: flag.created_date,
        status: flag.status,
      };
    }
    acc[key].reports.push(flag);
    return acc;
  }, {});

  // Convert to array and sort by severity
  const queueItems = Object.values(groupedFlags).map(item => ({
    ...item,
    report_count: item.reports.length,
    // F-040 Logic.1: Severity = report count
    severity: item.reports.length >= 5 ? 'high' : item.reports.length >= 3 ? 'medium' : 'low',
  })).sort((a, b) => {
    // F-040 Logic.1: Severity first, then oldest
    if (a.severity !== b.severity) {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return new Date(a.first_reported) - new Date(b.first_reported);
  });

  // F-040 Abuse.1: Pending count badge
  const pendingCount = flags.filter(f => f.status === 'pending').length;

  const handleActionSuccess = () => {
    refetch();
    setSelectedItem(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-gray-400 animate-spin" />
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
      {/* F-040: Sidebar with pending badge */}
      <AdminSidebar user={user} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} pendingCount={pendingCount} />

      <div className="lg:ml-64 min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-6 h-6 text-blue-600" />
                Moderation Queue
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                F-040: Review flagged content and take action
              </p>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {pendingCount} pending
            </Badge>
          </div>
        </div>

        {/* F-040 States.1: Tabs */}
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="pending">
                Pending
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-2">{pendingCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
              <TabsTrigger value="resolved">Resolved (Archived)</TabsTrigger>
            </TabsList>

            {/* F-040 UI.1: Split panel layout */}
            <div className="flex gap-6 h-[calc(100vh-250px)]">
              {/* F-040 UI.1: Left panel (40%) - Queue items list */}
              <div className="w-2/5 overflow-y-auto space-y-2 pr-2">
                {flagsLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
                    <p className="text-sm text-gray-600">Loading...</p>
                  </div>
                ) : queueItems.length === 0 ? (
                  // F-040 Errors.3: Empty state with green checkmark
                  <div className="text-center py-12">
                    <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-gray-900 mb-2">
                      No {activeTab} reports
                    </p>
                    <p className="text-gray-600">
                      {activeTab === 'pending' ? 'All caught up!' : 'No items to display'}
                    </p>
                  </div>
                ) : (
                  queueItems.map((item, index) => (
                    <ModerationQueueItem
                      key={`${item.target_type}-${item.target_id}`}
                      item={item}
                      isSelected={selectedItem?.target_id === item.target_id && selectedItem?.target_type === item.target_type}
                      onClick={() => setSelectedItem(item)}
                    />
                  ))
                )}
              </div>

              {/* F-040 UI.1: Right panel (60%) - Detail view */}
              <div className="w-3/5 bg-white rounded-lg shadow-sm border overflow-y-auto">
                {!selectedItem ? (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p>Select an item to view details</p>
                    </div>
                  </div>
                ) : (
                  <ModerationDetailPanel
                    item={selectedItem}
                    currentAdmin={user}
                    onSuccess={handleActionSuccess}
                  />
                )}
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}