/**
 * F-095: Flag & Report Button UI — REVISED
 * Message flag modal: reason_category dropdown + reason_note textarea (min 20 chars) + live counter.
 * Submit disabled until both conditions met simultaneously.
 */

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const REASON_CATEGORIES = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'other', label: 'Other' },
];

export default function FlagMessageModal({ message, onClose, onSuccess }) {
  const [reasonCategory, setReasonCategory] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const trimmedNote = reasonNote.trim();
  const noteLength = trimmedNote.length;
  const isUnderMin = noteLength < 20;
  const isOverMax = noteLength > 1000;
  const canSubmit = reasonCategory && !isUnderMin && !isOverMax && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await base44.functions.invoke('flagMessage', {
        message_id: message.id,
        reason_category: reasonCategory,
        reason_note: trimmedNote
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Report a message</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Reason category */}
          <div className="space-y-1.5">
            <Label>Reason <span className="text-red-500">*</span></Label>
            <Select value={reasonCategory} onValueChange={setReasonCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {REASON_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason note */}
          <div className="space-y-1.5">
            <Label>
              Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={reasonNote}
              onChange={e => setReasonNote(e.target.value.slice(0, 1000))}
              placeholder="Please describe why you are reporting this message."
              rows={4}
              className="resize-none"
            />
            {/* F-095 Logic.3: Live character counter */}
            <p className={`text-xs ${isOverMax || isUnderMin ? 'text-red-500' : 'text-gray-400'}`}>
              {noteLength} / 1,000 characters
              {isUnderMin && noteLength > 0 && (
                <span className="ml-1">(minimum 20 characters required)</span>
              )}
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} disabled={submitting} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 bg-[#C36239] hover:bg-[#75290F] text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}