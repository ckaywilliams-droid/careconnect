/**
 * F-093: Message Thread UI
 * F-094: Redaction Indicator UI
 * Full booking-scoped thread component.
 */

import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Lock, Info, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import FlagMessageModal from './FlagMessageModal';

function formatMessageTime(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true });
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

// F-094: Redaction Indicator
function RedactedSegment() {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 italic text-sm">
      <Lock className="w-3 h-3 flex-shrink-0" />
      <span>Contact info hidden until booking is confirmed</span>
      <button
        type="button"
        className="relative"
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onClick={() => setTooltipOpen(v => !v)}
      >
        <Info className="w-3 h-3 text-gray-400 hover:text-gray-600" />
        {tooltipOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-50">
            To protect your privacy, contact details like phone numbers, emails, and social handles are hidden until a booking is confirmed. Once your booking is accepted, you can share this information freely.
          </div>
        )}
      </button>
    </span>
  );
}

// F-094 Logic.3: Render body with inline redaction indicators for partial redactions
function MessageBody({ content, isFiltered, isRemoved }) {
  if (isRemoved) {
    return <p className="italic text-gray-400 text-sm">This message has been removed for violating platform guidelines.</p>;
  }
  if (!isFiltered || !content) {
    return <p className="text-sm whitespace-pre-wrap break-words">{content}</p>;
  }
  // Split on [Contact info hidden] and replace each segment
  const PLACEHOLDER = '[Contact info hidden]';
  const parts = content.split(PLACEHOLDER);
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && <RedactedSegment />}
        </React.Fragment>
      ))}
    </p>
  );
}

// F-093 Logic.1: Message bubble
function MessageBubble({ message, isMine, onFlag }) {
  const [hovered, setHovered] = useState(false);
  const isRemoved = message.is_deleted;
  const isFiltered = message.deletion_reason === 'filtered'; // stored in deletion_reason as marker

  return (
    <div
      className={`flex gap-2 group ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-[#E5E2DC] flex items-center justify-center flex-shrink-0 text-xs font-semibold text-[#643737] mt-1">
        {message.sender_initial || '?'}
      </div>

      <div className={`max-w-[70%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
        {/* Bubble */}
        <div className={`rounded-2xl px-4 py-2.5 ${
          isRemoved
            ? 'bg-gray-100 border border-gray-200'
            : isFiltered
            ? 'bg-gray-100 border border-gray-200'
            : isMine
            ? 'bg-[#C36239] text-white'
            : 'bg-white border border-gray-200'
        }`}>
          <MessageBody content={message.content} isFiltered={!!message.body_original || isFiltered} isRemoved={isRemoved} />
        </div>

        {/* Timestamp + read receipt + flag button */}
        <div className={`flex items-center gap-2 mt-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs text-gray-400">{formatMessageTime(message.sent_at || message.created_date)}</span>
          {isMine && message.is_read && <span className="text-xs text-[#C36239]">✓✓</span>}
          {!isRemoved && hovered && !isMine && (
            <button
              type="button"
              onClick={() => onFlag(message)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-0.5"
              title="Report this message"
            >
              <AlertTriangle className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// F-093 Triggers.1: Closed thread banner
function ClosedBanner({ bookingStatus }) {
  const messages = {
    declined: 'This booking was declined.',
    cancelled_by_parent: 'This booking was cancelled.',
    cancelled_by_caregiver: 'This booking was cancelled.',
    expired: 'This booking expired.',
    completed: 'This booking is complete.',
    resolved: 'This booking was resolved by the platform team.',
  };
  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center">
      <p className="text-sm text-gray-500 font-medium">🔒 This conversation is closed.</p>
      {messages[bookingStatus] && (
        <p className="text-xs text-gray-400 mt-0.5">{messages[bookingStatus]}</p>
      )}
    </div>
  );
}

export default function MessageThread({ booking, currentUser }) {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [confirmBanner, setConfirmBanner] = useState(null);
  const [flagModal, setFlagModal] = useState(null); // { message }
  const bottomRef = useRef(null);

  const loadThread = async () => {
    setError(null);
    try {
      const threads = await base44.entities.MessageThread.filter({ booking_id: booking.id });
      const t = threads[0];
      if (!t) { setLoading(false); return; }
      setThread(t);

      const msgs = await base44.entities.Message.filter({ thread_id: t.id });
      const sorted = [...msgs].sort((a, b) => new Date(a.sent_at || a.created_date) - new Date(b.sent_at || b.created_date));
      setMessages(sorted);
    } catch {
      setError('Unable to load this conversation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThread();
  }, [booking.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || !thread) return;
    setSendError(null);
    const optimisticMsg = {
      id: `opt-${Date.now()}`,
      thread_id: thread.id,
      sender_user_id: currentUser.id,
      content: inputValue.trim(),
      sent_at: new Date().toISOString(),
      is_read: false,
      _optimistic: true
    };
    setMessages(prev => [...prev, optimisticMsg]);
    const sentValue = inputValue;
    setInputValue('');
    setSending(true);

    try {
      const res = await base44.functions.invoke('sendMessage', {
        thread_id: thread.id,
        content: sentValue
      });
      // Replace optimistic message with real one
      await loadThread();
    } catch (err) {
      // Don't remove the optimistic message - keep it so user can retry
      const errMsg = err.response?.data?.error || 'Your message could not be sent. Please try again.';
      if (err.response?.status === 409) {
        // Thread was closed
        setThread(prev => ({ ...prev, is_active: false }));
        setSendError('This conversation has been closed.');
        // Only remove optimistic message if thread is closed
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      } else {
        // Keep the draft in the input field so user can edit and retry
        setInputValue(sentValue);
        setSendError(errMsg);
        // Remove optimistic message from display
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      }
    } finally {
      setSending(false);
    }
  };

  const handleFlagSubmitted = () => {
    setFlagModal(null);
    setConfirmBanner('Your report has been submitted and will be reviewed.');
    setTimeout(() => setConfirmBanner(null), 5000);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <p className="text-sm text-gray-500">{error}</p>
      <Button variant="outline" size="sm" onClick={loadThread}>Try again</Button>
    </div>
  );

  if (!thread) return (
    <div className="py-8 text-center text-sm text-gray-400">No conversation thread found for this booking.</div>
  );

  const isClosed = !thread.is_active;
  const otherPartyId = booking.parent_user_id === currentUser.id ? booking.caregiver_user_id : booking.parent_user_id;

  return (
    <div className="flex flex-col h-full max-h-[600px] bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Confirmation banner */}
      {confirmBanner && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 text-sm text-green-800 text-center">
          {confirmBanner}
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">No messages yet. Start the conversation!</p>
        )}
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={{ ...msg, sender_initial: msg.sender_user_id === currentUser.id ? 'You'[0] : '?' }}
            isMine={msg.sender_user_id === currentUser.id}
            onFlag={(m) => setFlagModal({ message: m })}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input or closed banner */}
      {isClosed ? (
        <ClosedBanner bookingStatus={booking.status} />
      ) : (
        <div className="border-t border-gray-200 px-4 py-3">
          {sendError && (
            <p className="text-xs text-red-500 mb-2">{sendError}</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={`Message...`}
              maxLength={2000}
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C36239]"
            />
            <Button
              type="button"
              size="icon"
              className="bg-[#C36239] hover:bg-[#75290F] text-white rounded-full"
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* F-095: Flag message modal */}
      {flagModal && (
        <FlagMessageModal
          message={flagModal.message}
          onClose={() => setFlagModal(null)}
          onSuccess={handleFlagSubmitted}
        />
      )}
    </div>
  );
}