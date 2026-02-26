import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ProfileCompletion from './ProfileCompletion';

export default function ProfileEditSidebar({ profile }) {
  const publicUrl = profile?.slug ? `${window.location.origin}/caregiver/${profile.slug}` : null;

  return (
    <div className="sticky top-6 space-y-4">
      {/* Profile Completion Checklist */}
      <ProfileCompletion profile={profile} />

      {/* Public URL */}
      {publicUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Public Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600 mb-2">Your public profile URL:</p>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <code className="text-xs break-all text-slate-700">{publicUrl}</code>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(publicUrl);
              }}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Copy link
            </button>
          </CardContent>
        </Card>
      )}

      {/* Status Badge */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profile Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: profile?.is_published ? '#d1fae5' : '#fef3c7',
                color: profile?.is_published ? '#065f46' : '#92400e'
              }}>
              {profile?.is_published ? '✓ Published' : 'Draft'}
            </span>
            {!profile?.is_verified && (
              <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                Pending verification
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}