import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Heart } from 'lucide-react';

/**
 * F-021: ROLE SELECTION SCREEN (UI.1)
 * 
 * First screen in split registration flow.
 * User selects role (Parent or Caregiver) before seeing the registration form.
 * 
 * SECURITY: Role stored in navigation state, validated server-side at registration.
 */
export default function RoleSelection() {
  const navigate = useNavigate();

  const selectRole = (role) => {
    // F-021 Logic.1: Role selection before registration form
    // Pass role via navigation state (validated server-side)
    navigate('/register', { state: { role } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-5xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Join Our Caregiving Community
          </h1>
          <p className="text-lg text-gray-600">
            Choose how you'd like to get started
          </p>
        </div>

        {/* F-021 UI.1: Two large cards side by side */}
        <div className="grid md:grid-cols-2 gap-6">
          
          {/* Parent Card */}
          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 border-2 hover:border-blue-500"
            onClick={() => selectRole('parent')}
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <CardTitle className="text-2xl mb-2">I need a babysitter</CardTitle>
              <CardDescription className="text-base">
                Find trusted caregivers for your family
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                size="lg" 
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={(e) => {
                  e.stopPropagation();
                  selectRole('parent');
                }}
              >
                Get Started as a Parent
              </Button>
              <ul className="mt-4 text-sm text-gray-600 space-y-2 text-left">
                <li>✓ Browse verified caregiver profiles</li>
                <li>✓ Read reviews from other families</li>
                <li>✓ Book trusted babysitters instantly</li>
              </ul>
            </CardContent>
          </Card>

          {/* Caregiver Card */}
          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 border-2 hover:border-indigo-500"
            onClick={() => selectRole('caregiver')}
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                <Heart className="w-8 h-8 text-indigo-600" />
              </div>
              <CardTitle className="text-2xl mb-2">I am a babysitter</CardTitle>
              <CardDescription className="text-base">
                Connect with families in your area
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                size="lg" 
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                onClick={(e) => {
                  e.stopPropagation();
                  selectRole('caregiver');
                }}
              >
                Get Started as a Caregiver
              </Button>
              <ul className="mt-4 text-sm text-gray-600 space-y-2 text-left">
                <li>✓ Create your professional profile</li>
                <li>✓ Set your own rates and availability</li>
                <li>✓ Build your reputation with reviews</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-600">
          Already have an account?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:text-blue-700 font-medium underline"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}