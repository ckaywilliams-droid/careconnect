import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import CertificationUploadWidget from './CertificationUploadWidget';
import CertificationsList from './CertificationsList';

export default function CertificationsSection({ caregiverProfileId, displayOnly = false }) {
    const [showUploadForm, setShowUploadForm] = useState(false);

    const handleUploadSuccess = () => {
        setShowUploadForm(false);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Certifications</CardTitle>
                        <CardDescription>Upload and manage your professional certifications</CardDescription>
                    </div>
                    {!displayOnly && (
                        <Button
                            size="sm"
                            onClick={() => setShowUploadForm(!showUploadForm)}
                            variant={showUploadForm ? 'outline' : 'default'}
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            {showUploadForm ? 'Cancel' : 'Add Certification'}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {showUploadForm && (
                    <CertificationUploadWidget onSuccess={handleUploadSuccess} />
                )}
                <CertificationsList caregiverProfileId={caregiverProfileId} />
            </CardContent>
        </Card>
    );
}