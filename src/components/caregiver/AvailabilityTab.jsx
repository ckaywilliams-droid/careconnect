import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Info } from 'lucide-react';

/**
 * F-058, F-059, F-060, F-061: Availability Management
 * 
 * This tab provides availability management for caregivers.
 * Full implementation is in CaregiverAvailability page.
 * This is a simplified view for the dashboard.
 */
export default function AvailabilityTab({ user, profile }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Manage Your Availability
          </CardTitle>
          <CardDescription>
            Set your available time slots and manage your schedule
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              For full calendar management, visit the dedicated Availability page from your navigation menu.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-green-900">Open</span>
                </div>
                <p className="text-xs text-green-700">Available for booking</p>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm font-medium text-amber-900">Soft Locked</span>
                </div>
                <p className="text-xs text-amber-700">Pending booking request</p>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-gray-500" />
                  <span className="text-sm font-medium text-gray-900">Booked</span>
                </div>
                <p className="text-xs text-gray-700">Confirmed booking</p>
              </div>
            </div>

            <div className="pt-4">
              <p className="text-sm text-gray-600 mb-4">
                Navigate to the full Availability page to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
                <li>Add new availability slots</li>
                <li>View your weekly schedule</li>
                <li>Block specific dates</li>
                <li>See slot statuses and booking details</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}