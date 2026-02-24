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
    <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center p-4">
      <div className="max-w-5xl w-full">
        {/* F-028 UI.1: Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[#0C2119] mb-3">
            Join as a...
          </h1>
          <p className="text-lg text-[#643737]">
            Choose your role to get started
          </p>
        </div>

        {/* F-028 UI.1: Two cards side by side */}
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Parent Card */}
          <Card 
            className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 hover:border-[#C36239] bg-white"
            onClick={() => selectRole('parent')}
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-[#E5E2DC] flex items-center justify-center">
                <Users className="w-10 h-10 text-[#643737]" />
              </div>
              <CardTitle className="text-2xl mb-2 text-[#0C2119]">Parent / Guardian</CardTitle>
              <CardDescription className="text-base text-[#643737]">
                Find trusted babysitters near you
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                size="lg" 
                className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  selectRole('parent');
                }}
              >
                Get started
              </Button>
            </CardContent>
          </Card>

          {/* Caregiver Card */}
          <Card 
            className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 hover:border-[#C36239] bg-white"
            onClick={() => selectRole('caregiver')}
          >
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-[#E5E2DC] flex items-center justify-center">
                <Heart className="w-10 h-10 text-[#643737]" />
              </div>
              <CardTitle className="text-2xl mb-2 text-[#0C2119]">Babysitter / Caregiver</CardTitle>
              <CardDescription className="text-base text-[#643737]">
                Offer your childcare services
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                size="lg" 
                className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  selectRole('caregiver');
                }}
              >
                Get started
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-[#643737]">
          Already have an account?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-[#C36239] hover:text-[#75290F] font-medium underline"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}