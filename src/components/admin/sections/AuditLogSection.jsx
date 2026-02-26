import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AuditLogSection({ user }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      // Fetch recent admin action logs
      const actionLogs = await base44.entities.AdminActionLog.list('-created_date', 50);
      return actionLogs;
    },
    enabled: !!user && user.role === 'super_admin'
  });

  if (user?.role !== 'super_admin') {
    return (
      <div className="text-center py-12">
        <Alert variant="destructive" className="max-w-md mx-auto">
          <AlertDescription>Access denied. Super Admin role required.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const getActionBadgeVariant = (actionType) => {
    if (actionType.includes('suspend') || actionType.includes('delete')) return 'destructive';
    if (actionType.includes('verify') || actionType.includes('approve')) return 'default';
    return 'secondary';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
        <Badge variant="secondary">Last 50 Actions</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin Action History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No audit logs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-gray-600">
                        {format(new Date(log.created_date), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {log.admin_user_id?.substring(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {log.admin_role?.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action_type)} className="capitalize">
                          {log.action_type?.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        <div className="capitalize">{log.target_entity_type}</div>
                        <div className="text-xs text-gray-400">{log.target_entity_id?.substring(0, 8)}...</div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                        {log.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}