import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, Loader2 } from 'lucide-react';

export default function FieldSaveIndicator({ status, message }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (!visible) return null;

  const icons = {
    saving: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
    saved: <Check className="w-4 h-4 text-green-500" />,
    error: <AlertCircle className="w-4 h-4 text-red-500" />
  };

  const colors = {
    saving: 'text-blue-600',
    saved: 'text-green-600',
    error: 'text-red-600'
  };

  return (
    <div className={`flex items-center gap-1 text-xs ${colors[status] || ''}`}>
      {icons[status]}
      <span>{message}</span>
    </div>
  );
}