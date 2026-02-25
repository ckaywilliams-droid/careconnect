import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Flag } from 'lucide-react';
import ReportModal from './ReportModal';

/**
 * F-036 UI.1: REPORT BUTTON
 * 
 * Reusable button that opens the report modal.
 * 
 * USAGE:
 * Place on user profiles, message bubbles, caregiver public profiles, etc.
 * 
 * F-036 UI.1: Not prominently displayed — discoverable but not dominant.
 * 
 * PROPS:
 * - targetType: 'user' | 'message' | 'caregiver_profile' | 'parent_profile' | 'review'
 * - targetId: string
 * - contentLabel: string (e.g., "this user", "this message") - used in modal title
 * - variant?: 'ghost' | 'outline' | 'default' (default: 'ghost')
 * - size?: 'sm' | 'default' | 'lg' | 'icon' (default: 'sm')
 * - className?: string
 */
export default function ReportButton({ 
  targetType, 
  targetId, 
  contentLabel = 'this content',
  variant = 'ghost',
  size = 'sm',
  className = '',
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowModal(true)}
        className={`text-gray-500 hover:text-red-600 ${className}`}
        title="Report"
      >
        <Flag className="w-4 h-4" />
        {size !== 'icon' && <span className="ml-2">Report</span>}
      </Button>

      <ReportModal
        open={showModal}
        onOpenChange={setShowModal}
        targetType={targetType}
        targetId={targetId}
        contentLabel={contentLabel}
      />
    </>
  );
}