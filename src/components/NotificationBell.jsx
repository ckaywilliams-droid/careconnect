import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';

const TYPE_ICONS = {
  booking_request_received:    '📋',
  booking_accepted:            '✅',
  booking_declined:            '❌',
  booking_cancelled_by_parent: '🚫',
};

function NotificationItem({ notification, onRead }) {
  const navigate = useNavigate();

  const handleClick = async () => {
    if (!notification.is_read) {
      await base44.entities.Notification.update(notification.id, { is_read: true }).catch(() => {});
      onRead();
    }
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${
        notification.is_read ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5 flex-shrink-0">
          {TYPE_ICONS[notification.type] || '🔔'}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm text-gray-900 truncate ${!notification.is_read ? 'font-semibold' : ''}`}>
            {notification.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(notification.created_date).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            })}
          </p>
        </div>
        {!notification.is_read && (
          <span className="w-2 h-2 rounded-full bg-[#C36239] flex-shrink-0 mt-1.5" />
        )}
      </div>
    </button>
  );
}

export default function NotificationBell({ user }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => base44.entities.Notification.filter({ user_id: user.id }, '-created_date'),
    enabled: !!user,
    refetchInterval: 30000
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    await Promise.allSettled(
      unread.map(n => base44.entities.Notification.update(n.id, { is_read: true }))
    );
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };

  const handleRead = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#C36239] text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-[#C36239] hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No notifications yet</div>
          ) : (
            notifications.slice(0, 20).map(n => (
              <NotificationItem key={n.id} notification={n} onRead={handleRead} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}