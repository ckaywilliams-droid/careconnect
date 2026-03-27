import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function BookingStatsAgent() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const conv = await base44.agents.createConversation({
          agent_name: 'booking_stats_agent',
          metadata: { name: 'Booking Stats Session' }
        });
        setConversation(conv);
        setMessages(conv.messages || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsub = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      setSending(false);
    });
    return unsub;
  }, [conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !conversation || sending) return;
    setSending(true);
    const text = input.trim();
    setInput('');
    await base44.agents.addMessage(conversation, { role: 'user', content: text });
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const suggestions = [
    'How many BookingRequest records exist?',
    'Show me a breakdown by booking status',
    'How many caregivers are published?',
    'List the 5 most recent bookings',
  ];

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-[#C36239]" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#C36239] flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-gray-900">Booking Stats Assistant</h1>
          <p className="text-xs text-gray-500">Ask questions about bookings, caregivers, and platform data</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4 pt-4">
            <p className="text-center text-gray-500 text-sm">Ask me anything about your platform data.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-gray-200 hover:border-[#C36239] hover:bg-orange-50 transition-colors text-gray-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role !== 'user' && (
              <div className="w-7 h-7 rounded-full bg-[#C36239] flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}>
              {msg.role === 'user' ? (
                <p>{msg.content}</p>
              ) : (
                <ReactMarkdown className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-1">
                <User className="w-4 h-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-full bg-[#C36239] flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-200">
        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C36239] focus:border-transparent max-h-32"
            rows={1}
            placeholder="Ask about bookings, caregivers, stats..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || sending}
            className="bg-[#C36239] hover:bg-[#75290F] text-white rounded-xl px-4 py-2.5">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}