import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileUp, X, AlertCircle } from 'lucide-react';

export default function CertificationUploadWidget({ onSuccess }) {
    const [certType, setCertType] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
            if (!validTypes.some(type => selectedFile.type.includes(type))) {
                setError('Invalid file type. Please upload JPEG, PNG, or PDF.');
                setFile(null);
                return;
            }
            setFile(selectedFile);
            setError('');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        handleFileSelect({ target: { files: e.dataTransfer.files } });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || !certType.trim()) {
            setError('Please select a file and enter a certification type.');
            return;
        }

        setUploading(true);
        setProgress(0);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('cert_type', certType.trim());
            if (expiryDate) formData.append('expiry_date', expiryDate);

            const response = await base44.functions.invoke('uploadCertification', {});
            
            // Simulate progress (since FormData upload doesn't give us real progress)
            for (let i = 0; i <= 100; i += 10) {
                setProgress(i);
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (response.data.success) {
                setCertType('');
                setExpiryDate('');
                setFile(null);
                setError('');
                onSuccess?.(response.data.certification_id);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
            setProgress(0);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
            <div>
                <label className="text-sm font-medium">Certification Type</label>
                <Input
                    placeholder="e.g., CPR, First Aid, Background Check"
                    value={certType}
                    onChange={(e) => setCertType(e.target.value)}
                    disabled={uploading}
                />
            </div>

            <div>
                <label className="text-sm font-medium">Expiry Date (Optional)</label>
                <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={uploading}
                />
            </div>

            <div>
                <label className="text-sm font-medium">Document</label>
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-slate-400 transition"
                >
                    <FileUp className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-600">
                        {file ? file.name : 'Drag and drop or click to select'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">PDF, JPEG, or PNG • Max 10MB</p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={uploading}
                    />
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {uploading && (
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span>Uploading...</span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                </div>
            )}

            <div className="flex gap-2">
                <Button type="submit" disabled={uploading || !file}>
                    {uploading ? 'Uploading...' : 'Upload Certification'}
                </Button>
                {file && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFile(null)}
                        disabled={uploading}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </form>
    );
}