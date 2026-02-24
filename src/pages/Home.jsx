import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Calendar, CheckCircle, Shield, Award, Users, Star } from 'lucide-react';

export default function Home() {
  const [featuredCaregivers, setFeaturedCaregivers] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load current user
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // Load featured caregivers (verified, published, high ratings)
      const caregivers = await base44.entities.CaregiverProfile.filter(
        { is_verified: true, is_published: true },
        '-average_rating',
        3
      );
      setFeaturedCaregivers(caregivers);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div 
        className="relative h-[600px] bg-cover bg-center"
        style={{
          backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('https://images.unsplash.com/photo-1531983412531-1f49a365ffed?w=1600')"
        }}
      >
        <div className="container mx-auto px-4 h-full flex items-center">
          <div className="max-w-2xl text-white">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium">Vetted & Background-Checked Caregivers</span>
            </div>

            {/* Heading */}
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              Trusted care, <span className="text-orange-500">simplified</span>
            </h1>

            {/* Subheading */}
            <p className="text-xl mb-8 text-gray-100">
              Discover premier babysitters and nannies in your area. Browse profiles, 
              check availability, and book with confidence.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="bg-[#C36239] hover:bg-[#75290F] text-white px-8 h-12"
                onClick={() => window.location.href = createPageUrl('FindCaregivers')}
              >
                <Search className="w-5 h-5 mr-2" />
                Find a Caregiver
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 px-8 h-12"
                onClick={() => window.location.href = createPageUrl('CaregiverDashboard')}
              >
                I'm a Caregiver
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Caregivers Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Featured Caregivers</h2>
            <p className="text-gray-600">Top-rated professionals ready to help your family</p>
          </div>
          <Link 
            to={createPageUrl('FindCaregivers')} 
            className="text-[#C36239] hover:text-[#75290F] font-medium flex items-center gap-1"
          >
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredCaregivers.map((caregiver) => (
            <Card key={caregiver.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="relative">
                <img
                  src={caregiver.profile_photo_url || 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400'}
                  alt={caregiver.display_name}
                  className="w-full h-64 object-cover"
                />
                {caregiver.is_verified && (
                  <Badge className="absolute top-3 right-3 bg-green-600 text-white">
                    ✓ Verified
                  </Badge>
                )}
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-1">{caregiver.display_name}</h3>
                <p className="text-sm text-gray-600 mb-3">
                  📍 {caregiver.city}, {caregiver.state}
                </p>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium">{caregiver.average_rating || 5.0}</span>
                  </div>
                  <span className="font-bold text-gray-900">
                    ${(caregiver.hourly_rate_cents / 100).toFixed(0)}/hr
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-gray-50 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">How It Works</h2>
            <p className="text-gray-600">Finding trusted care for your family has never been easier</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <Card className="text-center p-8 hover:shadow-lg transition-shadow">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#E5E2DC] text-[#75290F] mb-6 mx-auto">
                <div className="absolute -mt-10 -ml-10 w-8 h-8 rounded-full bg-[#C36239] text-white flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Browse & Filter</h3>
              <p className="text-gray-600">
                Search through our curated list of vetted caregivers. Filter by location, experience, 
                specializations, and availability.
              </p>
            </Card>

            {/* Step 2 */}
            <Card className="text-center p-8 hover:shadow-lg transition-shadow">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#E5E2DC] text-[#75290F] mb-6 mx-auto">
                <div className="absolute -mt-10 -ml-10 w-8 h-8 rounded-full bg-[#C36239] text-white flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <Calendar className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Request to Book</h3>
              <p className="text-gray-600">
                Found the perfect match? Select your preferred date and time, then send a 
                booking request.
              </p>
            </Card>

            {/* Step 3 */}
            <Card className="text-center p-8 hover:shadow-lg transition-shadow">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#E5E2DC] text-[#75290F] mb-6 mx-auto">
                <div className="absolute -mt-10 -ml-10 w-8 h-8 rounded-full bg-[#C36239] text-white flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Get Confirmation</h3>
              <p className="text-gray-600">
                Once the caregiver confirms, you're all set! Receive updates and manage 
                bookings easily.
              </p>
            </Card>
          </div>
        </div>
      </div>

      {/* Trust Badges Section */}
      <div className="bg-[#434C30] text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Badge 1 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#C36239] flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold mb-1">Background Checked</h4>
                <p className="text-sm text-[#E5E2DC]">
                  Every caregiver passes comprehensive background verification
                </p>
              </div>
            </div>

            {/* Badge 2 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#C36239] flex items-center justify-center">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold mb-1">Verified Credentials</h4>
                <p className="text-sm text-[#E5E2DC]">
                  Certifications and qualifications manually reviewed
                </p>
              </div>
            </div>

            {/* Badge 3 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#C36239] flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold mb-1">Experienced Pros</h4>
                <p className="text-sm text-[#E5E2DC]">
                  Minimum 2 years experience and excellent references
                </p>
              </div>
            </div>

            {/* Badge 4 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#C36239] flex items-center justify-center">
                <Star className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold mb-1">Quality Guaranteed</h4>
                <p className="text-sm text-[#E5E2DC]">
                  Only the best qualify. Ongoing quality checks and reviews
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#0C2119] text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Column 1 - Logo & Tagline */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="text-2xl">🧡</div>
                <h3 className="text-xl font-bold">CareNest</h3>
              </div>
              <p className="text-sm text-[#9C9F95]">
                Connecting trusted, vetted caregivers in your area.
              </p>
            </div>

            {/* Column 2 - For Families */}
            <div>
              <h4 className="font-bold mb-3">For Families</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to={createPageUrl('FindCaregivers')} className="text-[#9C9F95] hover:text-white">
                    Find Caregivers
                  </Link>
                </li>
                <li>
                  <Link to={createPageUrl('MyBookings')} className="text-[#9C9F95] hover:text-white">
                    My Bookings
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3 - For Caregivers */}
            <div>
              <h4 className="font-bold mb-3">For Caregivers</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to={createPageUrl('CaregiverDashboard')} className="text-[#9C9F95] hover:text-white">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link to={createPageUrl('CaregiverProfile')} className="text-[#9C9F95] hover:text-white">
                    Create Profile
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4 - Support */}
            <div>
              <h4 className="font-bold mb-3">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="text-[#9C9F95] hover:text-white">
                    Help Center
                  </a>
                </li>
                <li>
                  <a href="mailto:support@carenest.com" className="text-[#9C9F95] hover:text-white">
                    Contact Us
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-[#434C30] pt-6 text-center">
            <p className="text-sm text-[#9C9F95]">
              © {new Date().getFullYear()} CareNest. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}