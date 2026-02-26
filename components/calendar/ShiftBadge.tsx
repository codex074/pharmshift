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

  return (
    <button
      onClick={() => onClick?.(shift)}
      className={cn(
        'shift-badge w-full text-left',
        deptClass(deptName),
        isMyShift && 'ring-2 ring-violet-500/40 font-semibold',
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
