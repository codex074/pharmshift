'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, ArrowRightLeft, GitBranch, UserCheck, History } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface HistoryUser {
  id: string;
  f_name: string | null;
  nickname: string | null;
}

interface HistoryEntry {
  id: string;
  requestType: 'swap' | 'transfer' | 'cover';
  status: 'pending' | 'accepted' | 'rejected';
  isCounterOffer: boolean;
  fromUser: HistoryUser | null;
  toUser: HistoryUser | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABEL: Record<HistoryEntry['requestType'], string> = {
  swap: 'แลกเวร',
  transfer: 'โอนเวร',
  cover: 'อยู่เวรแทน',
};
const TYPE_ICON: Record<HistoryEntry['requestType'], React.ReactNode> = {
  swap: <ArrowRightLeft className="w-3.5 h-3.5" />,
  transfer: <GitBranch className="w-3.5 h-3.5" />,
  cover: <UserCheck className="w-3.5 h-3.5" />,
};
const STATUS_LABEL: Record<HistoryEntry['status'], string> = {
  pending: 'รอดำเนินการ',
  accepted: 'สำเร็จ',
  rejected: 'ถูกปฏิเสธ',
};
const STATUS_COLOR: Record<HistoryEntry['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-gray-100 text-gray-500 border-gray-200',
};

function userLabel(u: HistoryUser | null) {
  if (!u) return 'ไม่ทราบผู้ใช้';
  return u.nickname || u.f_name || 'ไม่ทราบผู้ใช้';
}

function formatDate(value: string) {
  try {
    return format(new Date(value), 'd MMM yyyy HH:mm', { locale: th });
  } catch {
    return value;
  }
}

export function ShiftHistoryModal({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [originalOwner, setOriginalOwner] = useState<string | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/shifts/history?shiftId=${shiftId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setOriginalOwner(body.originalOwner ?? null);
        setEntries(body.requests ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'โหลดประวัติล้มเหลว');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shiftId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-slide-up max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-800">ประวัติเวร</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            </div>
          )}

          {error && !loading && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-gray-400">เจ้าของเดิมตอนประกาศตาราง</p>
                <p className="text-sm font-medium text-slate-700">{originalOwner || 'ไม่มีข้อมูล'}</p>
              </div>

              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 text-gray-400 gap-1.5">
                  <span className="text-2xl">📋</span>
                  <p className="text-xs">ไม่มีประวัติการแลก/โอน/รับเวรแทน</p>
                </div>
              ) : (
                entries.map(entry => (
                  <div key={entry.id} className="p-3 rounded-xl border border-gray-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                        {TYPE_ICON[entry.requestType]}
                        {TYPE_LABEL[entry.requestType]}
                        {entry.isCounterOffer && <span className="text-[10px] text-gray-400 font-normal">(ฝั่งแลกเปลี่ยน)</span>}
                      </span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', STATUS_COLOR[entry.status])}>
                        {STATUS_LABEL[entry.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      {userLabel(entry.fromUser)} → {userLabel(entry.toUser)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {formatDate(entry.status === 'pending' ? entry.createdAt : entry.updatedAt)}
                    </p>
                  </div>
                ))
              )}

              <p className="text-[10px] text-gray-400 pt-1">
                ไม่รวมการแก้ไขประเภทเวร/แผนก/ตำแหน่งจากแอดมิน (ยังไม่มีการบันทึกประวัติส่วนนี้)
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
