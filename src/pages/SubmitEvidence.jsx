import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * F-037 UI.3: PARTY-FACING EVIDENCE SUBMISSION PAGE
 * 
 * Minimal, clean page for parties to submit evidence.
 * 
 * FEATURES:
 * - Token-based access (24h expiry)
 * - Text statement (max 2000 chars)
 * - Evidence type selection
 * - Confirmation after submission
 * 
 * SECURITY:
 * - F-037 Triggers.1: Single-use, time-limited URL
 * - F-037 Abuse.2: Max 3 submissions per party
 */
export default function SubmitEvidence() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Get params from URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const disputeId = params.get('dispute_id');

  // Form state
  const [evidenceType, setEvidenceType] = useState('text_statement');
  const [content, setContent] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!content || content.length === 0) {
      setError('Please provide your statement');
      return;
    }

    if (evidenceType === 'text_statement' && content.length > 2000) {
      setError('Statement must be 2000 characters or less');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await base44.functions.invoke('submitEvidence', {
        token,
        dispute_id: disputeId,
        evidence_type: evidenceType,
        content,
      });

      if (response.data.success) {
        setSubmitted(true);
      } else {
        setError(response.data.error || 'Failed to submit evidence');
      }
    } catch (err) {
      console.error('Submit evidence failed:', err);
      setError(err.message || 'Failed to submit evidence. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token || !disputeId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Invalid or missing submission link</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Evidence Submitted
            </h2>
            <p className="text-gray-600">
              Thank you for your submission. Our team will review the evidence and reach a decision.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="text-center">
            Submit your statement for dispute #{disputeId.substring(0, 8)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription className="text-blue-800 text-sm">
                <strong>Important:</strong> This link expires in 24 hours. You can submit up to 3 pieces of evidence.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="type">Evidence Type</Label>
              <Select value={evidenceType} onValueChange={setEvidenceType} disabled={loading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text_statement">Text Statement</SelectItem>
                  <SelectItem value="screenshot">Screenshot</SelectItem>
                  <SelectItem value="message_log">Message Log</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">
                Your Statement * (max 2000 characters)
              </Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                placeholder="Provide your detailed account of what happened..."
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                {content.length}/2000 characters
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading || !content}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Evidence'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}