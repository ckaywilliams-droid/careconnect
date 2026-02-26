import React from 'react';
import { CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export default function SlotStatusBadge({ slot, parentName, showLabel = true }) {
  if (slot.is_blocked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600">
              <XCircle className="h-3.5 w-3.5" />
              {showLabel && <span className="text-xs font-medium">Blocked</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent>Blocked</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const statusConfig = {
    open: {
      bg: 'bg-green-50 text-green-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: 'Open',
      tooltip: 'Open',
    },
    soft_locked: {
      bg: 'bg-amber-50 text-amber-700',
      icon: <Clock className="h-3.5 w-3.5" />,
      label: 'Pending request',
      tooltip: parentName ? `Pending: ${parentName}` : 'Pending request',
    },
    booked: {
      bg: 'bg-slate-100 text-slate-700',
      icon: <Lock className="h-3.5 w-3.5" />,
      label: 'Booked',
      tooltip: 'Booked',
    },
  };

  const config = statusConfig[slot.status] || statusConfig.open;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full', config.bg)}>
            {config.icon}
            {showLabel && <span className="text-xs font-medium">{config.label}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>{config.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}