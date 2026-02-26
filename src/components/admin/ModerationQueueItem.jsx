import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, User, Calendar, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * F-040 UI.1: MODERATION QUEUE ITEM (Left Panel)
 * 
 * Displays a queue item in the list with preview and badges.
 * 
 * FEATURES:
 * - F-040 Logic.2: Content preview truncation (2 lines)
 * - F-040 Logic.3: Report count badge
 * - F-040 Logic.1: Severity badge (5+ reports = high)
 * - Time in queue display
 */
export default function ModerationQueueItem({ item, isSelected, onClick }) {
  const getIcon = () => {
    if (item.target_type === 'message') return MessageSquare;
    if (item.target_type.includes('profile')) return User;
    return User;
  };

  const Icon = getIcon();

  const getSeverityColor = () => {
    if (item.severity === 'high') return 'bg-red-100 text-red-800 border-red-300';
    if (item.severity === 'medium') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  // F-040 Logic.2: Content preview - get first report's reason detail
  const previewText = item.reports[0]?.reason_detail || item.reports[0]?.reason || 'No details';

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'border-blue-500 shadow-md bg-blue-50' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <Icon className="w-5 h-5 text-gray-600" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header badges */}
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs capitalize">
                {item.target_type.replace('_', ' ')}
              </Badge>
              
              {/* F-040 Logic.1, Logic.3: Report count + severity */}
              <Badge className={`text-xs border ${getSeverityColor()}`}>
                {item.report_count} {item.report_count === 1 ? 'report' : 'reports'}
              </Badge>

              {item.severity === 'high' && (
                <AlertCircle className="w-4 h-4 text-red-600" title="High severity: 5+ reports" />
              )}
            </div>

            {/* F-040 Logic.2: Content preview (2 lines, truncated) */}
            <p className="text-sm text-gray-700 mb-2 line-clamp-2">
              {previewText}
            </p>

            {/* Time in queue */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              <span>
                {formatDistanceToNow(new Date(item.first_reported), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}