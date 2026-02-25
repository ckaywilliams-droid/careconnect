import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * F-038: METRIC CARD COMPONENT
 * 
 * Displays a single dashboard metric.
 * 
 * FEATURES:
 * - Icon
 * - Number (large, formatted)
 * - Label
 * - Loading state
 * - Error state (F-038 Errors.1)
 * - F-038 Edge.1: Handles large numbers (12.8K format)
 * 
 * PROPS:
 * - icon: Lucide icon component
 * - value: number | null
 * - label: string
 * - loading: boolean
 * - onClick: () => void (optional)
 */

function formatNumber(num) {
  // F-038 Edge.1: Abbreviated notation above 9,999
  if (num === null || num === undefined) return '—';
  if (num >= 10000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

export default function MetricCard({ icon: Icon, value, label, loading, onClick }) {
  return (
    <Card 
      className={`${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                <span className="text-sm text-gray-500">Loading...</span>
              </div>
            ) : value === null ? (
              // F-038 Errors.1: Show error indicator if metric failed
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-8 h-8 text-red-500" />
                <span className="text-sm text-red-600">Error</span>
              </div>
            ) : (
              <>
                <div className="text-3xl font-bold text-gray-900">
                  {formatNumber(value)}
                </div>
                <p className="text-sm text-gray-600 mt-1">{label}</p>
              </>
            )}
          </div>
          
          {Icon && (
            <div className="ml-4">
              <Icon className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}