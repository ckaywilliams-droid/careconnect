import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Trash2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function ModerationQueueSection({ user }) {
  const [activeTab, setActiveTab] = useState('all');

  const { data: flaggedContent = [], isLoading } = useQuery({
    queryKey: ['admin-flagged-content'],
    queryFn: () => base44.entities.FlaggedContent.filter({ status: 'pending' }),
    enabled: !!user && ['trust_admin', 'super_admin'].includes(user.app_role)
  });

  if (!['trust_admin', 'super_admin'].includes(user?.app_role)) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Access denied. Trust Admin or Super Admin role required.</p>
      </div>
    );
  }

  const filteredContent = activeTab === 'all' 
    ? flaggedContent 
    : flaggedContent.filter(item => item.target_type === activeTab);

  const getReasonBadgeVariant = (reason) => {
    if (['harassment', 'safety_concern'].includes(reason)) return 'destructive';
    if (['inappropriate_content', 'spam'].includes(reason)) return 'default';
    return 'secondary';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Moderation Queue</h2>
        <Badge variant="secondary">{flaggedContent.length} Pending</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Flagged Content</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All ({flaggedContent.length})</TabsTrigger>
              <TabsTrigger value="message">Messages ({flaggedContent.filter(f => f.target_type === 'message').length})</TabsTrigger>
              <TabsTrigger value="user">Users ({flaggedContent.filter(f => f.target_type === 'user').length})</TabsTrigger>
              <TabsTrigger value="caregiver_profile">Profiles ({flaggedContent.filter(f => f.target_type === 'caregiver_profile').length})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                  <p className="text-sm text-gray-600 mt-2">Loading queue...</p>
                </div>
              ) : filteredContent.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No flagged content in this category</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Reporter</TableHead>
                        <TableHead>Reported</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContent.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {item.target_type.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getReasonBadgeVariant(item.reason)} className="capitalize">
                              {item.reason.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {item.reporter_user_id.substring(0, 8)}...
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {format(new Date(item.created_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                            {item.reason_detail || 'No details provided'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon">
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}