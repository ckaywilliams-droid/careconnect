import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, Flag, Calendar } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function OverviewSection({ user }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-overview-stats'],
    queryFn: async () => {
      // Fetch collection counts in parallel
      const [users, caregivers, flags, bookings] = await Promise.all([
        base44.entities.User.list(),
        base44.entities.CaregiverProfile.filter({ is_published: true }),
        base44.entities.FlaggedContent.filter({ status: 'pending' }),
        base44.entities.BookingRequest.filter({ 
          status: { $in: ['pending', 'accepted'] } 
        })
      ]);

      // Get new registrations in last 24h
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const newUsers = users.filter(u => new Date(u.created_date) > new Date(yesterday));

      return {
        totalUsers: users.length,
        activeCaregivers: caregivers.length,
        pendingFlags: flags.length,
        activeBookings: bookings.length,
        newRegistrations: newUsers.length
      };
    },
    enabled: !!user,
    refetchInterval: 30000 // Refresh every 30s
  });

  const statCards = [
    { icon: Users, label: 'Total Users', value: stats?.totalUsers || 0, color: 'text-blue-600' },
    { icon: UserCheck, label: 'Active Caregivers', value: stats?.activeCaregivers || 0, color: 'text-green-600' },
    { icon: Flag, label: 'Pending Flags', value: stats?.pendingFlags || 0, color: 'text-red-600' },
    { icon: Calendar, label: 'Active Bookings', value: stats?.activeBookings || 0, color: 'text-purple-600' }
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.label}
                </CardTitle>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-8 bg-gray-200 animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Registrations (Last 24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-gray-900">
            {isLoading ? (
              <div className="h-10 bg-gray-200 animate-pulse rounded w-20" />
            ) : (
              stats?.newRegistrations || 0
            )}
          </div>
          <p className="text-sm text-gray-600 mt-2">Users who joined in the last 24 hours</p>
        </CardContent>
      </Card>
    </div>
  );
}