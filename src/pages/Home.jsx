import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Calendar, CheckCircle, Shield, Award, Users, Star, MapPin } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [featuredCaregivers, setFeaturedCaregivers] = useState([]);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Check if user is authenticated (but don't block page if not)
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch {
        // User not authenticated - this is fine for public page
        setUser(null);
      } finally {
        setAuthChecked(true);
      }

      // Load featured caregivers (verified, published, limit 4)
      const caregivers = await base44.entities.CaregiverProfile.filter(
        { is_verified: true, is_published: true },
        '-average_rating',
        4
      );
      setFeaturedCaregivers(caregivers);

      // Get total verified caregiver count for trust signals
      const allVerified = await base44.entities.CaregiverProfile.filter(
        { is_verified: true, is_published: true }
      );
      setVerifiedCount(allVerified.length);
    } catch (err) {
      console.error('Error loading data:', err);
      setAuthChecked(true);
    }
  };

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (location) params.set('city', location);
    if (date) params.set('date', date);
    const url = params.toString()
      ? `${createPageUrl('FindCaregivers')}?${params.toString()}`
      : createPageUrl('FindCaregivers');
    navigate(url);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky Navigation Header */}
      <nav className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to={createPageUrl('Home')} className="flex items-center gap-2">
              <div className="text-2xl">🧡</div>
              <span className="text-xl font-bold text-gray-900">CareNest</span>
            </Link>

            {/* Navigation Links & Auth Buttons */}
            <div className="flex items-center gap-3">
              <Link 
                to={createPageUrl('FindCaregivers')} 
                className="text-gray-700 hover:text-[#C36239] font-medium hidden md:block"
              >
                Find a Caregiver
              </Link>
              
              {!authChecked ? (
                // Loading state
                <div className="h-9 w-32 bg-gray-200 animate-pulse rounded"></div>
              ) : user ? (
                // Authenticated - show role-based dashboard link
                <Button
                  variant="outline"
                  onClick={() => {
                    const dashboardPage = user.app_role === 'parent' ? 'ParentDashboard' : 
                                         user.app_role === 'caregiver' ? 'CaregiverDashboard' : 
                                         'AdminDashboard';
                    navigate(createPageUrl(dashboardPage));
                  }}
                >
                  My Dashboard
                </Button>
              ) : (
                // Unauthenticated - show Sign In and Register Now
                <>
                  <Button
                    variant="ghost"
                    onClick={() => base44.auth.redirectToLogin(createPageUrl('Home'))}
                  >
                    Sign In
                  </Button>
                  <Button
                    className="bg-[#C36239] hover:bg-[#75290F] text-white"
                    onClick={() => navigate(createPageUrl('Register'))}
                  >
                    Register Now
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div 
        className="relative h-[600px] bg-cover bg-center"
        style={{
          backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('https://images.unsplash.com/photo-1531983412531-1f49a365ffed?w=1600')"
        }}
      >
        <div className="container mx-auto px-4 h-full flex items-center">
          <div className="max-w-3xl text-white">
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

            {/* Search Bar */}
            <div className="bg-white rounded-lg shadow-xl p-4 mb-8">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 flex items-center gap-2 px-4 py-2 border rounded-lg bg-white">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Enter city or zip code"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="border-0 p-0 focus-visible:ring-0 text-gray-900"
                  />
                </div>
                <div className="flex-1 flex items-center gap-2 px-4 py-2 border rounded-lg bg-white">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="border-0 p-0 focus-visible:ring-0 text-gray-900"
                  />
                </div>
                <Button
                  size="lg"
                  className="bg-[#C36239] hover:bg-[#75290F] text-white px-8"
                  onClick={handleSearch}
                >
                  <Search className="w-5 h-5 mr-2" />
                  Search
                </Button>
              </div>
            </div>

            {/* Secondary CTAs */}
            {!user && (
              <div className="flex flex-wrap gap-4">
                <Button
                  size="lg"
                  className="bg-[#C36239] hover:bg-[#75290F] text-white px-8 h-12"
                  onClick={() => navigate(createPageUrl('Register'))}
                >
                  Register Now
                </Button>
              </div>
            )}
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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

      {/* Trust Signals Section */}
      <div className="bg-[#434C30] text-white py-12">
        <div className="container mx-auto px-4">
          {/* Trust Signals Bar */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-[#C36239] px-6 py-3 rounded-full mb-4">
              <Shield className="w-5 h-5" />
              <span className="text-lg font-bold">
                {verifiedCount}+ Verified Caregivers Ready to Help
              </span>
            </div>
            <p className="text-[#E5E2DC]">
              All caregivers are background-checked, verified, and reviewed by our team
            </p>
          </div>

          {/* Trust Badges Grid */}
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

            {/* Column 4 - Legal & Support */}
            <div>
              <h4 className="font-bold mb-3">Legal & Support</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#privacy" className="text-[#9C9F95] hover:text-white">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#terms" className="text-[#9C9F95] hover:text-white">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#contact" className="text-[#9C9F95] hover:text-white">
                    Contact Us
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright & Legal Links */}
          <div className="border-t border-[#434C30] pt-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-[#9C9F95]">
                © {new Date().getFullYear()} CareNest. All rights reserved.
              </p>
              <div className="flex gap-6 text-sm">
                <a href="#privacy" className="text-[#9C9F95] hover:text-white">
                  Privacy Policy
                </a>
                <a href="#terms" className="text-[#9C9F95] hover:text-white">
                  Terms of Service
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}