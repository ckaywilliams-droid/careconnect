import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, Eye } from 'lucide-react';
import { format } from 'date-fns';

export default function VerificationQueueSection({ user }) {
  const { data: pendingProfiles = [], isLoading } = useQuery({
    queryKey: ['admin-verification-queue'],
    queryFn: async () => {
      const profiles = await base44.entities.CaregiverProfile.filter({ 
        is_verified: false 
      });
      
      // Fetch user data for each profile
      const profilesWithUsers = await Promise.all(
        profiles.map(async (profile) => {
          const userData = await base44.entities.User.filter({ id: profile.user_id });
          return { ...profile, user: userData[0] };
        })
      );
      
      return profilesWithUsers;
    },
    enabled: !!user && ['trust_admin', 'super_admin'].includes(user.app_role)
  });

  if (!['trust_admin', 'super_admin'].includes(user?.app_role)) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Access denied. Trust Admin or Super Admin role required.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Verification Queue</h2>
        <Badge variant="secondary">{pendingProfiles.length} Pending</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Caregiver Profiles Pending Verification</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Loading queue...</p>
            </div>
          ) : pendingProfiles.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">No profiles pending verification</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Experience</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingProfiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.display_name}</TableCell>
                      <TableCell>{profile.user?.email}</TableCell>
                      <TableCell>{profile.experience_years || 0} years</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {format(new Date(profile.created_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={profile.completion_pct >= 80 ? 'default' : 'secondary'}>
                          {profile.completion_pct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <XCircle className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
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