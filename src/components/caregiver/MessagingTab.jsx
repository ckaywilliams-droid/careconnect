/**
 * Caregiver Messaging/Inbox Component
 * Lists all conversation threads for the caregiver with booking context
 */

import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Calendar, User } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import MessageThread from '@/components/messaging/MessageThread';

function ConversationPreview({ thread, booking, onClick, isSelected }) {
  const [lastMessage, setLastMessage] = useState(null);
  const [parentName, setParentName] = useState('Parent');

  useEffect(() => {
    const loadPreview = async () => {
      try {
        // Fetch last message
        const messages = await base44.entities.Message.filter({ thread_id: thread.id });
        const sorted = messages.sort((a, b) => new Date(b.sent_at || b.created_date) - new Date(a.sent_at || a.created_date));
        if (sorted.length > 0) setLastMessage(sorted[0]);

        // Fetch parent name
        const parents = await base44.entities.ParentProfile.filter({ user_id: thread.parent_user_id });
        if (parents[0]?.display_name) {
          setParentName(parents[0].display_name);
        } else {
          const users = await base44.entities.User.filter({ id: thread.parent_user_id });
          if (users[0]) setParentName(users[0].full_name || 'Parent');
        }
      } catch (err) {
        console.error('Failed to load conversation preview:', err);
      }
    };
    loadPreview();
  }, [thread.id]);

  const hasUnread = lastMessage && !lastMessage.is_read && lastMessage.sender_user_id !== thread.caregiver_user_id;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 border rounded-lg transition-all hover:shadow-md ${
        isSelected ? 'border-[#C36239] bg-[#FEF7F5]' : 'border-gray-200 bg-white'
      } ${hasUnread ? 'font-semibold' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-medium text-gray-900 truncate">{parentName}</span>
            {hasUnread && (
              <span className="bg-[#C36239] text-white text-xs px-2 py-0.5 rounded-full">New</span>
            )}
          </div>
          
          {booking && (
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <Calendar className="w-3 h-3" />
              <span>
                {format(new Date(booking.start_time), 'MMM d, yyyy • h:mm a')}
              </span>
            </div>
          )}

          {lastMessage && (
            <p className="text-sm text-gray-600 truncate">
              {lastMessage.sender_user_id === thread.caregiver_user_id ? 'You: ' : ''}
              {lastMessage.content}
            </p>
          )}
        </div>

        {thread.last_message_at && (
          <span className="text-xs text-gray-400 flex-shrink-0">
            {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}
          </span>
        )}
      </div>
    </button>
  );
}

export default function MessagingTab({ user, profile }) {
  const [threads, setThreads] = useState([]);
  const [bookings, setBookings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const loadConversations = async () => {
    setError(null);
    setLoading(true);
    try {
      // Fetch all threads where caregiver is a participant
      const allThreads = await base44.entities.MessageThread.filter({ 
        caregiver_user_id: user.id 
      });

      // Sort by last message timestamp
      const sorted = allThreads.sort((a, b) => {
        const aTime = a.last_message_at ? new Date(a.last_message_at) : new Date(0);
        const bTime = b.last_message_at ? new Date(b.last_message_at) : new Date(0);
        return bTime - aTime;
      });

      setThreads(sorted);

      // Fetch associated bookings
      const bookingIds = sorted.map(t => t.booking_id).filter(Boolean);
      if (bookingIds.length > 0) {
        const allBookings = await base44.asServiceRole.entities.BookingRequest.filter({});
        const bookingMap = {};
        allBookings.forEach(b => {
          if (bookingIds.includes(b.id)) {
            bookingMap[b.id] = b;
          }
        });
        setBookings(bookingMap);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError('Unable to load conversations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user?.id]);

  const handleSelectThread = (thread) => {
    setSelectedThread(thread);
    setSelectedBooking(bookings[thread.booking_id] || null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={loadConversations}>
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (threads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Messages Yet</h3>
            <p className="text-sm text-gray-500">
              Once you receive booking requests, you can message parents here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Conversations List */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Messages ({threads.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
            {threads.map(thread => (
              <ConversationPreview
                key={thread.id}
                thread={thread}
                booking={bookings[thread.booking_id]}
                onClick={() => handleSelectThread(thread)}
                isSelected={selectedThread?.id === thread.id}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Message Thread */}
      <div className="lg:col-span-2">
        {selectedThread && selectedBooking ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Booking on {format(new Date(selectedBooking.start_time), 'MMMM d, yyyy')}
              </CardTitle>
              <p className="text-sm text-gray-500">
                {format(new Date(selectedBooking.start_time), 'h:mm a')} - {format(new Date(selectedBooking.end_time), 'h:mm a')}
              </p>
            </CardHeader>
            <CardContent>
              <MessageThread booking={selectedBooking} currentUser={user} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm text-gray-500">
                  Select a conversation to view messages
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}