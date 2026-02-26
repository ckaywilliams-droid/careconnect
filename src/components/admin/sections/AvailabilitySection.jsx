import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Unlock, AlertTriangle } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';

export default function AvailabilitySection({ user }) {
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['admin-availability-slots'],
    queryFn: async () => {
      // Fetch all availability slots
      const allSlots = await base44.entities.AvailabilitySlot.list();
      
      // Filter for orphaned soft-locks (locked > 2h with no booking)
      const now = new Date();
      const orphanedSlots = allSlots.filter(slot => {
        if (!slot.soft_lock_expiry) return false;
        const lockTime = new Date(slot.soft_lock_expiry);
        const hoursSinceLock = differenceInHours(now, lockTime);
        return hoursSinceLock > 2 && !slot.is_booked;
      });
      
      // Fetch caregiver details for each slot
      const slotsWithCaregivers = await Promise.all(
        orphanedSlots.map(async (slot) => {
          const caregiver = await base44.entities.CaregiverProfile.filter({ 
            id: slot.caregiver_profile_id 
          });
          return { ...slot, caregiver: caregiver[0] };
        })
      );
      
      return slotsWithCaregivers;
    },
    enabled: !!user
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Availability Overrides</h2>
        <Badge variant="secondary">{slots.length} Orphaned Locks</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orphaned Soft-Locked Slots (> 2 hours)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Loading slots...</p>
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">No orphaned slots detected</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caregiver</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Lock Expiry</TableHead>
                    <TableHead>Hours Locked</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slots.map((slot) => {
                    const hoursSinceLock = differenceInHours(
                      new Date(), 
                      new Date(slot.soft_lock_expiry)
                    );
                    
                    return (
                      <TableRow key={slot.id}>
                        <TableCell className="font-medium">
                          {slot.caregiver?.display_name}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {format(new Date(slot.start_time), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {format(new Date(slot.start_time), 'h:mm a')} - {format(new Date(slot.end_time), 'h:mm a')}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {format(new Date(slot.soft_lock_expiry), 'MMM d, h:mm a')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={hoursSinceLock > 6 ? 'destructive' : 'secondary'}>
                            {hoursSinceLock}h
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon">
                            <Unlock className="w-4 h-4 text-green-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}