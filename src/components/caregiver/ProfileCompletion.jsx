import React, { useState, useEffect } from 'react';
import { computeCompletionPct } from '@/lib/profileCompletion';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle, Lock } from 'lucide-react';

export default function ProfileCompletion({ profile }) {
    const completionPct = computeCompletionPct(profile);
    const storageKey = `profileCompleteBanner_${profile?.id}`;

    const [showBanner, setShowBanner] = useState(() => {
        if (typeof window === 'undefined' || !profile?.id) return false;
        return localStorage.getItem(`profileCompleteBanner_${profile?.id}`) !== 'dismissed';
    });

    // HARD GATE: never render if profile is missing or already published
    if (!profile) return null;
    if (profile.is_published) return null;

    // Reset dismissal if completion drops below 100% again
    useEffect(() => {
        if (completionPct < 100) {
            localStorage.removeItem(storageKey);
            setShowBanner(true);
        }
    }, [completionPct]);

    // Auto-dismiss after 60 seconds, then persist
    useEffect(() => {
        if (completionPct === 100 && showBanner) {
            const timer = setTimeout(() => {
                setShowBanner(false);
                localStorage.setItem(storageKey, 'dismissed');
            }, 60000);
            return () => clearTimeout(timer);
        }
    }, [completionPct, showBanner]);

    // Determine which fields are complete
    const fields = [
        { label: 'Profile photo', completed: !!profile?.profile_photo_url, icon: 'photo' },
        { label: 'About me', completed: !!profile?.bio && profile.bio.trim().length > 0, icon: 'about' },
        { label: 'Hourly rate', completed: !!profile?.hourly_rate_cents && profile.hourly_rate_cents > 0, icon: 'rate' },
        { label: 'Services offered', completed: !!profile?.services_offered && profile.services_offered.split(',').some(s => s.trim()), icon: 'services' },
        { label: 'Age groups', completed: !!profile?.age_groups && profile.age_groups.split(',').some(g => g.trim()), icon: 'ages' },
        { label: 'Background verified', completed: profile?.is_verified === true, icon: 'verified', locked: true }
    ];

    const getProgressColor = () => {
        if (completionPct < 50) return 'bg-red-500';
        if (completionPct < 100) return 'bg-amber-500';
        return 'bg-green-500';
    };

    const getProgressBarColor = () => {
        if (completionPct < 50) return 'from-red-50 to-red-100';
        if (completionPct < 100) return 'from-amber-50 to-amber-100';
        return 'from-green-50 to-green-100';
    };

    if (completionPct === 100) {
        if (!showBanner) return null;
        return (
            <div className={`bg-gradient-to-r ${getProgressBarColor()} border border-green-200 rounded-lg p-6 text-center`}>
                <h3 className="text-lg font-semibold text-green-900 mb-2">
                    ✓ Profile complete!
                </h3>
                <p className="text-sm text-green-700">
                    You can now publish your profile and start accepting bookings.
                </p>
            </div>
        );
    }

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="space-y-4">
                    {/* Progress Bar */}
                    <div className={`bg-gradient-to-r ${getProgressBarColor()} rounded-lg p-4`}>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-semibold text-sm">Profile Completion</h3>
                            <span className="text-sm font-bold">{completionPct}%</span>
                        </div>
                        <Progress value={completionPct} className="h-2" />
                    </div>

                    {/* Checklist */}
                    <div className="space-y-2">
                        {fields.map((field, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-2">
                                {field.completed ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                ) : field.locked ? (
                                    <Lock className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                ) : (
                                    <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />
                                )}
                                <span className={`text-sm ${field.completed ? 'text-slate-900' : 'text-slate-500'}`}>
                                    {field.label}
                                </span>
                                {field.locked && !field.completed && (
                                    <span className="text-xs text-slate-400 ml-auto">Set by admin</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}