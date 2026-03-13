'use client';

import { format } from 'date-fns';
import { DEPT_STYLES, SHIFT_STYLES, type Shift } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ShiftBadgeProps {
  shift: Shift;
  isMyShift?: boolean;
  onClick?: (shift: Shift) => void;
  compact?: boolean;
}

function deptClass(name?: string): string {
  if (!name) return 'dept-project';
  const key = name.trim();
  return DEPT_STYLES[key]?.bg || 'dept-project';
}

export function ShiftBadge({ shift, isMyShift, onClick, compact }: ShiftBadgeProps) {
  const deptName = (shift.department as { name: string })?.name || '';
  const userName = (shift.user as { nickname?: string; name: string })?.nickname ||
                   (shift.user as { name: string })?.name || '—';
  const shiftStyle = SHIFT_STYLES[shift.shift_type];

  if (isMyShift) {
    return (
      <button
        onClick={() => onClick?.(shift)}
        className={cn(
          'w-full text-left flex items-center gap-1 rounded-md font-bold transition-colors',
          'bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-300/50',
          compact ? 'text-[10px] py-0.5 px-1.5' : 'text-xs py-1 px-2'
        )}
        title={`${userName} — ${deptName} (${shift.shift_type})`}
      >
        <span>{shiftStyle?.icon}</span>
        {!compact && <span className="opacity-75 text-[10px]">{deptName}</span>}
        <span className="truncate">{userName}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onClick?.(shift)}
      className={cn(
        'shift-badge w-full text-left',
        deptClass(deptName),
        compact ? 'text-[10px] py-0.5 px-1.5' : ''
      )}
      title={`${userName} — ${deptName} (${shift.shift_type})`}
    >
      <span className="mr-0.5">{shiftStyle?.icon}</span>
      {!compact && (
        <span className="font-medium text-xs opacity-70 mr-1">{deptName}</span>
      )}
      <span className="truncate">{userName}</span>
    </button>
  );
}
