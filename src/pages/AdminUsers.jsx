import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  MoreVertical,
  AlertTriangle,
  Loader2,
  Shield,
  CheckCircle2,
  XCircle,
  Lock
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import UserDetailPanel from '@/components/admin/UserDetailPanel';
import { formatDistanceToNow } from 'date-fns';

/**
 * F-039: USER MANAGEMENT TABLE
 * 
 * Admin table for managing users with search, filters, pagination.
 * 
 * FEATURES:
 * - F-039 UI.1: Table with avatar, name, email (masked), role, status, verified, joined, actions
 * - F-039 Logic.1-2: Server-side search and filters
 * - F-039 States.1: Pagination (50 per page)
 * - F-039 States.2: URL query string preservation
 * - F-039 UI.3: User detail side panel
 */
export default function AdminUsers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  // F-039 States.2: Filters from URL
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') || 'all');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [verifiedFilter, setVerifiedFilter] = useState(searchParams.get('verified') || 'all');
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'joined');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));

  // User detail panel
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserDetail, setShowUserDetail] = useState(false);

  // F-039 Abuse.1: Search debounce
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        const adminRoles = ['support_admin', 'trust_admin', 'super_admin'];
        if (!adminRoles.includes(currentUser.app_role)) {
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

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (verifiedFilter !== 'all') params.set('verified', verifiedFilter);
    if (sortBy !== 'joined') params.set('sortBy', sortBy);
    if (page !== 1) params.set('page', page.toString());
    
    setSearchParams(params);
  }, [debouncedSearch, roleFilter, statusFilter, verifiedFilter, sortBy, page, setSearchParams]);

  // Fetch users
  const { data: usersData, isLoading: usersLoading, refetch } = useQuery({
    queryKey: ['users-table', debouncedSearch, roleFilter, statusFilter, verifiedFilter, sortBy, page],
    queryFn: async () => {
      const response = await base44.functions.invoke('getUsersTable', {
        search: debouncedSearch,
        role: roleFilter !== 'all' ? roleFilter : '',
        status: statusFilter !== 'all' ? statusFilter : '',
        verified: verifiedFilter !== 'all' ? verifiedFilter : '',
        sortBy,
        sortOrder: 'desc',
        page,
        perPage: 50,
      });
      return response.data;
    },
    enabled: !!user,
  });

  const users = usersData?.users || [];
  const pagination = usersData?.pagination || { page: 1, totalPages: 1, totalCount: 0 };

  const getRoleBadgeColor = (role) => {
    const colors = {
      parent: 'bg-blue-100 text-blue-800',
      caregiver: 'bg-purple-100 text-purple-800',
      support_admin: 'bg-yellow-100 text-yellow-800',
      trust_admin: 'bg-orange-100 text-orange-800',
      super_admin: 'bg-red-100 text-red-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (user) => {
    if (user.is_locked) {
      return <Badge variant="destructive" className="flex items-center gap-1"><Lock className="w-3 h-3" />Locked</Badge>;
    }
    if (user.is_suspended) {
      return <Badge variant="destructive">Suspended</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">Active</Badge>;
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
      <AdminSidebar user={user} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div className="lg:ml-64 min-h-screen">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-600 mt-1">
              F-039: Manage users, roles, and permissions
            </p>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
            <div className="flex flex-wrap gap-4">
              {/* F-039 Logic.1: Search */}
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by name or email (min 2 chars)..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* F-039 Logic.2: Role filter */}
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="caregiver">Caregiver</SelectItem>
                  <SelectItem value="support_admin">Support Admin</SelectItem>
                  <SelectItem value="trust_admin">Trust Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>

              {/* F-039 Logic.2: Status filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>

              {/* F-039 Logic.2: Verified filter (caregiver) */}
              <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verified</SelectItem>
                  <SelectItem value="true">Verified</SelectItem>
                  <SelectItem value="false">Unverified</SelectItem>
                </SelectContent>
              </Select>

              {/* F-039 Logic.3: Sort */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="joined">Newest First</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                  <SelectItem value="last_login">Last Login</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {usersLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600">Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              // F-039 Errors.1: No results
              <div className="text-center py-12">
                <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">
                  No users found{search ? ` matching "${search}"` : ''}
                </p>
                {search && (
                  <Button variant="outline" onClick={() => setSearch('')}>
                    Clear Search
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verified</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((tableUser) => {
                      const isOwnAccount = tableUser.id === user.id;
                      
                      return (
                        <TableRow 
                          key={tableUser.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => {
                            setSelectedUser(tableUser);
                            setShowUserDetail(true);
                          }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold">
                                {tableUser.full_name?.substring(0, 2).toUpperCase() || 'U'}
                              </div>
                              <span className="font-medium">{tableUser.full_name || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-600 text-sm">
                            {tableUser.email_masked}
                          </TableCell>
                          <TableCell>
                            <Badge className={getRoleBadgeColor(tableUser.role)}>
                              {tableUser.role.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(tableUser)}
                          </TableCell>
                          <TableCell>
                            {tableUser.role === 'caregiver' ? (
                              tableUser.is_verified ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                              ) : (
                                <XCircle className="w-5 h-5 text-gray-400" />
                              )
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {formatDistanceToNow(new Date(tableUser.created_date), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="text-right">
                            {/* F-039 Edge.1: Disable own account */}
                            {isOwnAccount ? (
                              <span className="text-xs text-gray-400" title="Cannot perform actions on your own account">
                                —
                              </span>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedUser(tableUser);
                                  setShowUserDetail(true);
                                }}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* F-039 States.1: Pagination */}
                <div className="border-t px-6 py-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, pagination.totalCount)} of {pagination.totalCount} users
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-gray-600 px-4 py-2">
                      Page {page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= pagination.totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* F-039 UI.3: User Detail Panel */}
      {selectedUser && (
        <UserDetailPanel
          open={showUserDetail}
          onOpenChange={setShowUserDetail}
          userId={selectedUser.id}
          currentAdmin={user}
          onUpdate={() => {
            refetch();
            queryClient.invalidateQueries({ queryKey: ['user-detail', selectedUser.id] });
          }}
        />
      )}
    </div>
  );
}