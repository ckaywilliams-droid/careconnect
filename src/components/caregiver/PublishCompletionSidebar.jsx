import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Circle, Info, Globe, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';

export default function PublishCompletionSidebar({ profile, onPublishChange }) {
  const [showError, setShowError] = useState(null);

  // Determine completion checklist items
  const checklistItems = [
    {
      id: 'photo',
      label: 'Add a profile photo (JPEG or PNG, min 400x400px)',
      complete: !!profile.profile_photo_url,
      isVerification: false
    },
    {
      id: 'bio',
      label: 'Write a bio (at least 1 character)',
      complete: profile.bio && profile.bio.trim().length > 0,
      isVerification: false
    },
    {
      id: 'rate',
      label: 'Set your hourly rate (must be greater than $0)',
      complete: profile.hourly_rate_cents && profile.hourly_rate_cents > 0,
      isVerification: false
    },
    {
      id: 'services',
      label: 'Select at least one service',
      complete: profile.services_offered && profile.services_offered.trim().length > 0,
      isVerification: false
    },
    {
      id: 'ageGroups',
      label: 'Select at least one age group',
      complete: profile.age_groups && profile.age_groups.trim().length > 0,
      isVerification: false
    },
    {
      id: 'verification',
      label: 'Background verification required',
      complete: profile.is_verified,
      isVerification: true,
      helpUrl: '#'
    }
  ];

  const allComplete = checklistItems.every(item => item.complete);
  const completionPercent = profile.completion_pct || 0;

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('publishCaregiverProfile', {
        profileId: profile.id
      });

      if (response.status >= 400) {
        throw new Error(response.data?.error || 'Failed to publish profile');
      }

      return response.data;
    },
    onSuccess: () => {
      setShowError(null);
      onPublishChange?.();
    },
    onError: (error) => {
      setShowError(error.message);
    }
  });

  // Unpublish mutation
  const unpublishMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.asServiceRole.entities.CaregiverProfile.update(
        profile.id,
        { is_published: false }
      );
      return response;
    },
    onSuccess: () => {
      setShowError(null);
      onPublishChange?.();
    },
    onError: (error) => {
      setShowError(error.message);
    }
  });

  const isPublishing = publishMutation.isPending;
  const isUnpublishing = unpublishMutation.isPending;

  // Published state
  if (profile.is_published) {
    return (
      <Card className="sticky top-4 border-[#E5E2DC] bg-white">
        <CardHeader>
          <CardTitle className="text-[#0C2119] text-sm uppercase tracking-wide">
            Profile Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Published Badge */}
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-700 flex items-center gap-1">
              <Globe className="w-3 h-3" />
              Published
            </Badge>
          </div>

          {/* View Public Profile Link */}
          <Button
            variant="outline"
            size="sm"
            className="w-full border-[#C36239] text-[#C36239] hover:bg-[#FFF5F1]"
            onClick={() => window.open(`/caregivers/${profile.slug}`, '_blank')}
          >
            View Public Profile
            <ExternalLink className="w-3 h-3 ml-2" />
          </Button>

          {/* Unpublish Button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[#643737] hover:bg-red-50"
            onClick={() => unpublishMutation.mutate()}
            disabled={isUnpublishing}
          >
            {isUnpublishing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isUnpublishing ? 'Unpublishing...' : 'Unpublish'}
          </Button>

          {/* Warning Text */}
          <p className="text-xs text-[#643737] text-center">
            Unpublishing will hide you from search results immediately.
          </p>

          {/* Error Message */}
          {showError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{showError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  // Incomplete state
  if (!allComplete) {
    return (
      <Card className="sticky top-4 border-[#E5E2DC] bg-white">
        <CardHeader>
          <CardTitle className="text-[#0C2119] text-sm uppercase tracking-wide mb-4">
            Profile Status
          </CardTitle>
          <Progress value={completionPercent} className="h-2" />
          <p className="text-xs text-[#643737] mt-2">{completionPercent}% complete</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <h4 className="font-semibold text-[#0C2119] text-sm">To publish your profile:</h4>

          {/* Checklist */}
          <div className="space-y-2">
            {checklistItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                {item.isVerification ? (
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                ) : item.complete ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className={`text-sm ${
                    item.complete ? 'text-[#643737] line-through' : 'text-[#643737]'
                  }`}>
                    {item.label}
                  </p>
                  {item.isVerification && (
                    <a
                      href={item.helpUrl}
                      className="text-xs text-[#C36239] hover:underline"
                    >
                      How to get verified →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Error Message */}
          {showError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{showError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  // Complete state - show publish button
  return (
    <Card className="sticky top-4 border-[#E5E2DC] bg-white">
      <CardHeader>
        <CardTitle className="text-[#0C2119] text-sm uppercase tracking-wide mb-4">
          Profile Status
        </CardTitle>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center mb-4">
          <p className="text-sm font-semibold text-green-700 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Profile Complete
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Publish Button */}
        <Button
          size="lg"
          className="w-full bg-[#C36239] hover:bg-[#75290F] text-white"
          onClick={() => publishMutation.mutate()}
          disabled={isPublishing}
        >
          {isPublishing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isPublishing ? 'Publishing...' : 'Publish Profile'}
        </Button>

        {/* Help Text */}
        <p className="text-xs text-[#643737] text-center">
          Once published, your profile will be visible to parents in search results.
        </p>

        {/* Error Message */}
        {showError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{showError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}