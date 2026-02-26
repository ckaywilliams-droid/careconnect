import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Save, 
  Upload, 
  Eye, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * F-048: Profile Edit Form
 * F-043: Publish Gate
 * F-044: Credentials & Documents
 * F-045: Photo Upload
 */
export default function ProfileTab({ user, profile, onProfileUpdate }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    display_name: '',
    bio: '',
    experience_years: 0,
    hourly_rate_cents: 0,
    services_offered: '',
    age_groups: '',
    languages: '',
    city: '',
    state: '',
    zip_code: '',
    profile_photo_url: '',
    header_image_url: ''
  });

  const [certifications, setCertifications] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        experience_years: profile.experience_years || 0,
        hourly_rate_cents: profile.hourly_rate_cents || 0,
        services_offered: profile.services_offered || '',
        age_groups: profile.age_groups || '',
        languages: profile.languages || '',
        city: profile.city || '',
        state: profile.state || '',
        zip_code: profile.zip_code || '',
        profile_photo_url: profile.profile_photo_url || '',
        header_image_url: profile.header_image_url || ''
      });
    }
  }, [profile]);

  useEffect(() => {
    const fetchCertifications = async () => {
      if (profile) {
        const certs = await base44.entities.Certification.filter({
          caregiver_profile_id: profile.id
        });
        setCertifications(certs);
      }
    };
    fetchCertifications();
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.CaregiverProfile.update(profile.id, data);
    },
    onSuccess: (updatedProfile) => {
      onProfileUpdate(updatedProfile);
      toast.success('Profile updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update profile');
    }
  });

  const togglePublishMutation = useMutation({
    mutationFn: async (shouldPublish) => {
      // F-043: Publish Gate - Check required fields
      if (shouldPublish) {
        const required = ['display_name', 'bio', 'city', 'state'];
        const missing = required.filter(field => !formData[field]);
        
        if (missing.length > 0) {
          throw new Error(`Required fields missing: ${missing.join(', ')}`);
        }

        if (!profile.is_verified) {
          throw new Error('Profile must be verified by admin before publishing');
        }
      }

      return await base44.entities.CaregiverProfile.update(profile.id, {
        is_published: shouldPublish
      });
    },
    onSuccess: (updatedProfile) => {
      onProfileUpdate(updatedProfile);
      toast.success(updatedProfile.is_published ? 'Profile published!' : 'Profile unpublished');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handlePhotoUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const updated = await base44.entities.CaregiverProfile.update(profile.id, {
        [type === 'profile' ? 'profile_photo_url' : 'header_image_url']: file_url
      });
      
      onProfileUpdate(updated);
      setFormData(prev => ({
        ...prev,
        [type === 'profile' ? 'profile_photo_url' : 'header_image_url']: file_url
      }));
      toast.success('Photo uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCertUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCert(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const newCert = await base44.entities.Certification.create({
        caregiver_profile_id: profile.id,
        cert_type: 'general',
        cert_name: file.name,
        cert_file_url: file_url,
        verification_status: 'pending'
      });
      
      setCertifications(prev => [...prev, newCert]);
      toast.success('Certification uploaded - pending admin review');
    } catch (error) {
      toast.error('Failed to upload certification');
    } finally {
      setUploadingCert(false);
    }
  };

  const handleSave = () => {
    updateProfileMutation.mutate(formData);
  };

  const handlePublishToggle = (checked) => {
    togglePublishMutation.mutate(checked);
  };

  const getCompletionPercentage = () => {
    const fields = [
      'display_name', 'bio', 'experience_years', 'hourly_rate_cents',
      'services_offered', 'age_groups', 'languages', 'city', 'state', 'profile_photo_url'
    ];
    const completed = fields.filter(field => formData[field]).length;
    return Math.round((completed / fields.length) * 100);
  };

  const certStatusConfig = {
    pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Pending Review' },
    verified: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', label: 'Verified' },
    rejected: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Rejected' },
    expired: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Expired' }
  };

  if (!profile) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No caregiver profile found. Please contact support.
        </AlertDescription>
      </Alert>
    );
  }

  const completion = getCompletionPercentage();

  return (
    <div className="space-y-6">
      {/* Profile Completion & Publish */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Profile Status</CardTitle>
              <CardDescription>
                Complete your profile to publish and start receiving booking requests
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{completion}%</div>
                <div className="text-xs text-gray-500">Complete</div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="publish-toggle">Published</Label>
                <Switch
                  id="publish-toggle"
                  checked={profile.is_published}
                  onCheckedChange={handlePublishToggle}
                  disabled={togglePublishMutation.isLoading || !profile.is_verified}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${completion}%` }}
            />
          </div>
          {!profile.is_verified && (
            <Alert className="mt-4 border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Your profile is pending admin verification. You cannot publish until verified.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Profile Photos */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Photos</CardTitle>
          <CardDescription>Upload a profile photo and header image</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Profile Photo</Label>
              <div className="flex items-center gap-4">
                {formData.profile_photo_url ? (
                  <img
                    src={formData.profile_photo_url}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                <div>
                  <input
                    type="file"
                    id="profile-photo"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e, 'profile')}
                    disabled={uploadingPhoto}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('profile-photo').click()}
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" /> Upload</>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Header Image</Label>
              <div className="space-y-2">
                {formData.header_image_url && (
                  <img
                    src={formData.header_image_url}
                    alt="Header"
                    className="w-full h-24 rounded object-cover"
                  />
                )}
                <input
                  type="file"
                  id="header-photo"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e, 'header')}
                  disabled={uploadingPhoto}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('header-photo').click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Upload</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your public profile details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name *</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="How you want to appear to parents"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience_years">Years of Experience *</Label>
              <Input
                id="experience_years"
                type="number"
                value={formData.experience_years}
                onChange={(e) => setFormData({ ...formData, experience_years: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hourly_rate">Hourly Rate ($) *</Label>
              <Input
                id="hourly_rate"
                type="number"
                step="0.01"
                value={formData.hourly_rate_cents / 100}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  hourly_rate_cents: Math.round(parseFloat(e.target.value) * 100) || 0 
                })}
                placeholder="25.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="languages">Languages</Label>
              <Input
                id="languages"
                value={formData.languages}
                onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                placeholder="English, Spanish"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio *</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={5}
              maxLength={500}
              placeholder="Tell parents about yourself, your experience, and your approach to childcare..."
            />
            <p className="text-xs text-gray-500">{formData.bio.length}/500 characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="services_offered">Services Offered</Label>
            <Input
              id="services_offered"
              value={formData.services_offered}
              onChange={(e) => setFormData({ ...formData, services_offered: e.target.value })}
              placeholder="babysitting,nanny_care,overnight_care (comma-separated)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="age_groups">Age Groups</Label>
            <Input
              id="age_groups"
              value={formData.age_groups}
              onChange={(e) => setFormData({ ...formData, age_groups: e.target.value })}
              placeholder="newborn_0_1,toddler_1_3,preschool_3_5 (comma-separated)"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="zip_code">Zip Code</Label>
              <Input
                id="zip_code"
                value={formData.zip_code}
                onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4">
            <Button
              onClick={handleSave}
              disabled={updateProfileMutation.isLoading}
              className="w-full md:w-auto"
            >
              {updateProfileMutation.isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="mr-2 h-4 w-4" /> Save Changes</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Certifications & Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Certifications & Documents</CardTitle>
          <CardDescription>
            Upload certifications, DBS checks, and other credentials for admin verification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <input
              type="file"
              id="cert-upload"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleCertUpload}
              disabled={uploadingCert}
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById('cert-upload').click()}
              disabled={uploadingCert}
            >
              {uploadingCert ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Upload Certificate</>
              )}
            </Button>
          </div>

          {certifications.length > 0 ? (
            <div className="space-y-2">
              {certifications.map((cert) => {
                const status = certStatusConfig[cert.verification_status] || certStatusConfig.pending;
                const StatusIcon = status.icon;
                
                return (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{cert.cert_name}</p>
                        <p className="text-xs text-gray-500">{cert.cert_type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${status.bg} ${status.color}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status.label}
                      </Badge>
                      {cert.cert_file_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={cert.cert_file_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No certifications uploaded yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}