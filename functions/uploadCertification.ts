import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

/**
 * F-046: Certification Document Upload Security
 * Handles caregiver certification file uploads with validation and rate limiting
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get caregiver profile
        const profiles = await base44.entities.CaregiverProfile.filter({ user_id: user.id });
        if (!profiles || profiles.length === 0) {
            return Response.json({ error: 'Caregiver profile not found' }, { status: 404 });
        }

        const profile = profiles[0];
        const formData = await req.formData();
        const file = formData.get('file');
        const certType = formData.get('cert_type');
        const expiryDate = formData.get('expiry_date');

        // Validate inputs
        if (!file || !certType) {
            return Response.json({ error: 'File and certification type required' }, { status: 400 });
        }

        if (certType.trim().length === 0 || certType.trim().length > 100) {
            return Response.json({ error: 'Certification type must be 1-100 characters' }, { status: 400 });
        }

        // Check rate limit: max 10 uploads per caregiver per hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const recentUploads = await base44.entities.Certification.filter({
            caregiver_user_id: user.id
        });
        const uploadsThisHour = recentUploads.filter(cert => 
            new Date(cert.created_date) > new Date(oneHourAgo)
        ).length;

        if (uploadsThisHour >= 10) {
            return Response.json({ 
                error: 'Upload limit exceeded. Maximum 10 certifications per hour.' 
            }, { status: 429 });
        }

        // Validate file
        const buffer = await file.arrayBuffer();
        const byteArray = new Uint8Array(buffer);

        if (buffer.byteLength > 10 * 1024 * 1024) {
            return Response.json({ 
                error: 'Your document exceeds the 10MB limit. Please compress or split the document and try again.' 
            }, { status: 400 });
        }

        // Magic byte validation
        const mimeType = file.type;
        let isValid = false;
        let detectedMimeType = null;

        // JPEG: FF D8 FF
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
            isValid = byteArray[0] === 0xFF && byteArray[1] === 0xD8 && byteArray[2] === 0xFF;
            detectedMimeType = 'image/jpeg';
        }
        // PNG: 89 50 4E 47
        else if (mimeType.includes('png')) {
            isValid = byteArray[0] === 0x89 && byteArray[1] === 0x50 && byteArray[2] === 0x4E && byteArray[3] === 0x47;
            detectedMimeType = 'image/png';
        }
        // PDF: %PDF (25 50 44 46)
        else if (mimeType.includes('pdf')) {
            isValid = byteArray[0] === 0x25 && byteArray[1] === 0x50 && byteArray[2] === 0x44 && byteArray[3] === 0x46;
            detectedMimeType = 'application/pdf';
        } else {
            return Response.json({ 
                error: 'This file type is not supported. Please upload a JPEG, PNG, or PDF document.' 
            }, { status: 400 });
        }

        if (!isValid) {
            if (detectedMimeType === 'application/pdf') {
                return Response.json({ 
                    error: 'The PDF file appears to be corrupted or invalid. Please re-export the document and try again.' 
                }, { status: 400 });
            } else {
                return Response.json({ 
                    error: 'This file type is not supported. Please upload a JPEG, PNG, or PDF document.' 
                }, { status: 400 });
            }
        }

        // Generate sanitized filename
        const fileExt = detectedMimeType === 'image/jpeg' ? 'jpg' 
            : detectedMimeType === 'image/png' ? 'png' 
            : 'pdf';
        const uuid = crypto.randomUUID();
        const sanitizedFilename = `${profile.id}-cert-${uuid}.${fileExt}`;

        // Upload to private storage
        const fileBlob = new Blob([byteArray], { type: detectedMimeType });
        const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ 
            file: fileBlob 
        });

        // Create Certification record
        const certification = await base44.entities.Certification.create({
            caregiver_profile_id: profile.id,
            caregiver_user_id: user.id,
            cert_type: certType.trim(),
            cert_name: certType.trim(),
            issuing_organization: '', // Optional, can be updated later
            issue_date: new Date().toISOString().split('T')[0],
            expiry_date: expiryDate || null,
            cert_file_url: file_uri,
            is_suppressed: false,
            verification_status: 'pending'
        });

        // Log to audit
        await base44.entities.AdminActionLog.create({
            admin_user_id: user.id,
            admin_role: user.app_role,
            action_type: 'other',
            target_entity_type: 'Certification',
            target_entity_id: certification.id,
            reason: `Caregiver uploaded certification: ${certType.trim()}`,
            payload: JSON.stringify({
                file_size_bytes: buffer.byteLength,
                mime_type: detectedMimeType,
                cert_type: certType.trim()
            }),
            ip_address: req.headers.get('x-forwarded-for') || 'unknown',
            action_timestamp: new Date().toISOString()
        });

        return Response.json({
            success: true,
            certification_id: certification.id,
            message: 'Certification uploaded successfully'
        }, { status: 201 });

    } catch (error) {
        console.error('Certification upload error:', error);
        return Response.json({ 
            error: error.message || 'Upload failed' 
        }, { status: 500 });
    }
});