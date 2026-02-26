import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, AlertTriangle, Save, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import TagInput from './TagInput';
import FieldSaveIndicator from './FieldSaveIndicator';
import CertificationsSection from './CertificationsSection';

export default function ProfileEditForm({ profile, onProfileUpdate }) {
  const [formData, setFormData] = useState({});
  const [unsavedChanges, setUnsavedChanges] = useState({});
  const [fieldStatus, setFieldStatus] = useState({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
      setUnsavedChanges({});
    }
  }, [profile]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (Object.keys(unsavedChanges).length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedChanges]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setUnsavedChanges(prev => ({ ...prev, [field]: true }));
  };

  const saveField = async (field) => {
    if (!unsavedChanges[field]) return;

    setFieldStatus(prev => ({ ...prev, [field]: 'saving' }));
    
    try {
      const updateData = {};
      const value = formData[field];

      // Handle special field conversions
      if (field === 'hourly_rate_cents') {
        updateData[field] = Math.round(parseFloat(value) * 100);
      } else {
        updateData[field] = value;
      }

      // Validate before saving
      if (field === 'bio' && value.length > 500) {
        throw new Error('Bio must be 500 characters or fewer');
      }
      if (field === 'hourly_rate_cents' && parseFloat(value) < 0) {
        throw new Error('Hourly rate must be a positive number');
      }

      await base44.entities.CaregiverProfile.update(profile.id, updateData);
      
      setFieldStatus(prev => ({ ...prev, [field]: 'saved' }));
      setUnsavedChanges(prev => {
        const newChanges = { ...prev };
        delete newChanges[field];
        return newChanges;
      });

      // Refresh profile data
      const updated = await base44.entities.CaregiverProfile.read(profile.id);
      onProfileUpdate(updated);
    } catch (error) {
      setFieldStatus(prev => ({ ...prev, [field]: 'error' }));
      toast.error(error.message || 'Failed to save');
    }
  };

  const handlePhotoUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const fieldName = type === 'profile' ? 'profile_photo_url' : 'header_image_url';
      
      // Check if removing while published
      if (type === 'profile' && formData.profile_photo_url && profile.is_published) {
        const confirmed = window.confirm(
          'Removing your profile photo will unpublish your profile. Are you sure?'
        );
        if (!confirmed) {
          setUploadingPhoto(false);
          return;
        }
      }

      const updated = await base44.entities.CaregiverProfile.update(profile.id, {
        [fieldName]: file_url,
        ...(type === 'profile' && profile.is_published && { is_published: false })
      });

      onProfileUpdate(updated);
      setFormData(prev => ({ ...prev, [fieldName]: file_url }));
      setUnsavedChanges(prev => {
        const newChanges = { ...prev };
        delete newChanges[fieldName];
        return newChanges;
      });
      toast.success('Photo uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const saveAllChanges = async () => {
    const changedFields = Object.keys(unsavedChanges);
    for (const field of changedFields) {
      await saveField(field);
    }
  };

  const bioLength = formData.bio?.length || 0;
  const bioColor = bioLength >= 500 ? 'text-red-600' : bioLength >= 490 ? 'text-amber-600' : 'text-slate-500';

  return (
    <div className="space-y-6">
      {/* Profile Photo */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-6">
            {formData.profile_photo_url ? (
              <img
                src={formData.profile_photo_url}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center">
                <Upload className="w-8 h-8 text-slate-400" />
              </div>
            )}
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
              onClick={() => document.getElementById('profile-photo').click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Upload Photo</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About Me */}
      <Card>
        <CardHeader>
          <CardTitle>About Me</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => handleFieldChange('bio', e.target.value)}
              onBlur={() => saveField('bio')}
              maxLength={500}
              rows={4}
              placeholder="Tell parents about yourself, your experience, and approach..."
            />
            <div className={`text-xs mt-1 ${bioColor}`}>
              {bioLength}/500 characters
            </div>
            <FieldSaveIndicator status={fieldStatus.bio} message={fieldStatus.bio === 'saved' ? 'Saved' : 'Saving...'} />
          </div>

          <div>
            <Label htmlFor="experience">Years of Experience</Label>
            <Input
              id="experience"
              type="number"
              min="0"
              value={formData.experience_years}
              onChange={(e) => handleFieldChange('experience_years', parseInt(e.target.value) || 0)}
              onBlur={() => saveField('experience_years')}
            />
            <FieldSaveIndicator status={fieldStatus.experience_years} message={fieldStatus.experience_years === 'saved' ? 'Saved' : 'Saving...'} />
          </div>

          <div>
            <Label htmlFor="languages">Languages</Label>
            <Input
              id="languages"
              value={formData.languages}
              onChange={(e) => handleFieldChange('languages', e.target.value)}
              onBlur={() => saveField('languages')}
              placeholder="English, Spanish"
            />
            <FieldSaveIndicator status={fieldStatus.languages} message={fieldStatus.languages === 'saved' ? 'Saved' : 'Saving...'} />
          </div>
        </CardContent>
      </Card>

      {/* Services & Age Groups */}
      <Card>
        <CardHeader>
          <CardTitle>Services & Age Groups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="services">Services Offered</Label>
            <TagInput
              fieldType="services_offered"
              value={formData.services_offered}
              onChange={(val) => handleFieldChange('services_offered', val)}
              onBlur={() => saveField('services_offered')}
            />
            <FieldSaveIndicator status={fieldStatus.services_offered} message={fieldStatus.services_offered === 'saved' ? 'Saved' : 'Saving...'} />
          </div>

          <div>
            <Label htmlFor="age_groups">Age Groups</Label>
            <TagInput
              fieldType="age_groups"
              value={formData.age_groups}
              onChange={(val) => handleFieldChange('age_groups', val)}
              onBlur={() => saveField('age_groups')}
            />
            <FieldSaveIndicator status={fieldStatus.age_groups} message={fieldStatus.age_groups === 'saved' ? 'Saved' : 'Saving...'} />
          </div>
        </CardContent>
      </Card>

      {/* Hourly Rate */}
      <Card>
        <CardHeader>
          <CardTitle>Hourly Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="rate">Rate per Hour ($)</Label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-slate-500">$</span>
            <Input
              id="rate"
              type="number"
              step="0.01"
              min="0"
              max="999.99"
              value={formData.hourly_rate_cents / 100}
              onChange={(e) => handleFieldChange('hourly_rate_cents', parseFloat(e.target.value) || 0)}
              onBlur={() => saveField('hourly_rate_cents')}
              className="pl-6"
            />
          </div>
          <FieldSaveIndicator status={fieldStatus.hourly_rate_cents} message={fieldStatus.hourly_rate_cents === 'saved' ? 'Saved' : 'Saving...'} />
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => handleFieldChange('city', e.target.value)}
              onBlur={() => saveField('city')}
            />
            <FieldSaveIndicator status={fieldStatus.city} message={fieldStatus.city === 'saved' ? 'Saved' : 'Saving...'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => handleFieldChange('state', e.target.value)}
                onBlur={() => saveField('state')}
              />
              <FieldSaveIndicator status={fieldStatus.state} message={fieldStatus.state === 'saved' ? 'Saved' : 'Saving...'} />
            </div>

            <div>
              <Label htmlFor="zip">Zip Code</Label>
              <Input
                id="zip"
                value={formData.zip_code}
                onChange={(e) => handleFieldChange('zip_code', e.target.value)}
                onBlur={() => saveField('zip_code')}
              />
              <FieldSaveIndicator status={fieldStatus.zip_code} message={fieldStatus.zip_code === 'saved' ? 'Saved' : 'Saving...'} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Certifications */}
      {profile && (
        <CertificationsSection caregiverProfileId={profile.id} />
      )}

      {/* Unsaved Changes Warning */}
      {Object.keys(unsavedChanges).length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            You have unsaved changes. They will auto-save when you finish editing each field.
          </AlertDescription>
        </Alert>
      )}

      {/* Save All Button */}
      {Object.keys(unsavedChanges).length > 0 && (
        <Button onClick={saveAllChanges} className="w-full">
          <Save className="w-4 h-4 mr-2" />
          Save All Changes
        </Button>
      )}
    </div>
  );
}