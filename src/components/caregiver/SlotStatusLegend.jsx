import React from 'react';
import { CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';

export default function SlotStatusLegend() {
  const statuses = [
    {
      icon: <CheckCircle2 className="h-3 w-3" />,
      color: 'bg-green-600',
      label: 'Open',
    },
    {
      icon: <Clock className="h-3 w-3" />,
      color: 'bg-amber-600',
      label: 'Pending request',
    },
    {
      icon: <Lock className="h-3 w-3" />,
      color: 'bg-slate-700',
      label: 'Booked',
    },
    {
      icon: <XCircle className="h-3 w-3" />,
      color: 'bg-slate-400',
      label: 'Blocked',
    },
  ];

  return (
    <div className="flex flex-wrap gap-4 px-4 py-3 bg-slate-50 border-t border-slate-200">
      {statuses.map((status) => (
        <div key={status.label} className="flex items-center gap-2">
          <div className={`${status.color} h-3 w-3 rounded-full flex items-center justify-center`}>
            <span className="text-white text-xs">{status.icon}</span>
          </div>
          <span className="text-sm text-slate-600">{status.label}</span>
        </div>
      ))}
    </div>
  );
}