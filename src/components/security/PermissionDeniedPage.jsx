/**
 * F-003 UI.1: Generic Permission Denied Page
 * 
 * Shown for all 403 Forbidden responses from middleware.
 * MUST NOT reveal which authorization gate failed or why.
 * MUST NOT distinguish between "record does not exist" and "record not owned".
 */

import React from 'react';
import { ShieldX, Home, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { createPageUrl } from '@/utils';

export default function PermissionDeniedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-red-100 rounded-full">
              <ShieldX className="w-12 h-12 text-red-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Access Denied
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">
            You do not have permission to access this resource.
          </p>
          
          {/* F-003 UI.1: Generic message - do NOT reveal which gate failed */}
          <p className="text-sm text-gray-500">
            If you believe this is an error, please contact support.
          </p>
          
          <div className="flex flex-col gap-3 mt-6">
            <Button
              onClick={() => window.history.back()}
              variant="outline"
              className="w-full"
            >
              Go Back
            </Button>
            
            <Button
              onClick={() => window.location.href = createPageUrl('Home')}
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2" />
              Return to Home
            </Button>
            
            <Button
              variant="ghost"
              className="w-full text-gray-600"
              onClick={() => window.location.href = 'mailto:support@caregivermarketplace.com'}
            >
              <Mail className="w-4 h-4 mr-2" />
              Contact Support
            </Button>
          </div>
          
          {/* 
            F-003 Security Principle (Abuse.2):
            Do NOT show different messages for:
            - "Record does not exist"
            - "Record exists but you cannot access it"
            - "Insufficient role permissions"
            - "User is suspended"
            
            All show the same generic "Access Denied" page.
          */}
        </CardContent>
      </Card>
    </div>
  );
}