import React from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, FileText, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function CertificationsList({ caregiverProfileId }) {
    const queryClient = useQueryClient();

    const { data: certifications = [], isLoading } = useQuery({
        queryKey: ['certifications', caregiverProfileId],
        queryFn: () => base44.entities.Certification.filter({ caregiver_profile_id: caregiverProfileId }),
    });

    const deleteMutation = useMutation({
        mutationFn: (certId) => base44.entities.Certification.update(certId, { is_deleted: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['certifications', caregiverProfileId] });
        },
    });

    const visibleCertifications = certifications.filter(cert => !cert.is_deleted && !cert.is_suppressed);

    if (isLoading) {
        return <div className="text-sm text-slate-500">Loading certifications...</div>;
    }

    if (visibleCertifications.length === 0) {
        return <div className="text-sm text-slate-500">No certifications uploaded yet.</div>;
    }

    return (
        <div className="space-y-3">
            {visibleCertifications.map((cert) => (
                <div key={cert.id} className="border rounded-lg p-4 flex items-start justify-between hover:bg-slate-50">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-sm">{cert.cert_type}</span>
                            {cert.expiry_date && (
                                <Badge variant="outline" className="text-xs">
                                    Expires {format(new Date(cert.expiry_date), 'MMM yyyy')}
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-slate-500">
                            Uploaded {format(new Date(cert.created_date), 'MMM d, yyyy')}
                        </p>
                        {cert.verification_status === 'pending' && (
                            <div className="flex items-center gap-1 mt-2">
                                <AlertCircle className="w-3 h-3 text-amber-500" />
                                <span className="text-xs text-amber-700">Pending verification</span>
                            </div>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(cert.id)}
                        disabled={deleteMutation.isPending}
                        className="text-red-600 hover:text-red-700"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            ))}
        </div>
    );
}