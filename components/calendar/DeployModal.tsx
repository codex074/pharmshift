'use client';

import { useState } from 'react';
import { X, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { ROLE_LABELS, STAFF_ROLES, UserRole } from '@/lib/types';

interface DeployModalProps {
  initialYear: number;
  initialMonth: number;
  currentUser: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeployModal({ initialYear, initialMonth, currentUser, onClose, onSuccess }: DeployModalProps) {
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorDesc, setErrorDesc] = useState('');
  const [month, setMonth] = useState<number>(initialMonth);
  const [year, setYear] = useState<number>(initialYear);
  const [roleGroup, setRoleGroup] = useState<UserRole | 'all'>('all');

  const currentYear = new Date().getFullYear();

  const handleDeploy = async () => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast.error('ไม่มีสิทธิ์ดำเนินการ');
      return;
    }

    setLoading(true);
    setErrorDesc('');
    setSuccessMsg('');

    try {
      const monthYear = format(new Date(year, month - 1), 'yyyy-MM');
      
      // Fetch existing row first to merge if needed
      const { data: existingData } = await supabase
        .from('published_months')
        .select('*')
        .eq('month_year', monthYear)
        .maybeSingle();

      const updatePayload: any = {
        month_year: monthYear,
        published_at: new Date().toISOString(),
        published_by: currentUser.id,
      };

      if (roleGroup === 'all') {
        updatePayload.is_published = true;
        updatePayload.pharmacist_published = true;
        updatePayload.pharmacy_technician_published = true;
        updatePayload.officer_published = true;
      } else {
        // Keep existing `is_published` true if it was already true
        updatePayload.is_published = existingData?.is_published || false;
        
        // Preserve other roles' status, update the target role
        updatePayload.pharmacist_published = existingData?.pharmacist_published || false;
        updatePayload.pharmacy_technician_published = existingData?.pharmacy_technician_published || false;
        updatePayload.officer_published = existingData?.officer_published || false;

        if (roleGroup === 'pharmacist') updatePayload.pharmacist_published = true;
        if (roleGroup === 'pharmacy_technician') updatePayload.pharmacy_technician_published = true;
        if (roleGroup === 'officer') updatePayload.officer_published = true;
        
        // If all 3 roles are now published, set global is_published to true
        if (
          (roleGroup === 'pharmacist' || updatePayload.pharmacist_published) &&
          (roleGroup === 'pharmacy_technician' || updatePayload.pharmacy_technician_published) &&
          (roleGroup === 'officer' || updatePayload.officer_published)
        ) {
          updatePayload.is_published = true;
        }
      }

      const { error } = await supabase
        .from('published_months')
        .upsert(updatePayload);

      if (error) throw error;

      setSuccessMsg('ประกาศตารางเวรสำเร็จแล้ว!');
      toast.success('ประกาศตารางเวรสำเร็จแล้ว!');
      
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);

    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด: ' + err.message);
      setErrorDesc(err.message);
    } finally {
      setLoading(false);
    }
  };

  const thaiMonths = Array.from({ length: 12 }).map((_, i) => 
    new Date(2000, i, 1).toLocaleString('th-TH', { month: 'long' })
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-white/90" />
            ประกาศตารางเวร
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">เดือน</label>
              <select 
                value={month} 
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all shadow-sm"
              >
                {thaiMonths.map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">ปี</label>
              <select 
                value={year} 
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all shadow-sm"
              >
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
                  <option key={y} value={y}>{y + 543}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">ตำแหน่งที่ต้องการประกาศ</label>
            <select
              value={roleGroup}
              onChange={(e) => setRoleGroup(e.target.value as UserRole | 'all')}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all shadow-sm"
            >
              <option value="all">ทุกตำแหน่ง (All Roles)</option>
              {STAFF_ROLES.map(role => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </div>

          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex gap-2 items-center">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              {successMsg}
            </div>
          )}

          {errorDesc && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex flex-col gap-2">
              <div className="flex gap-2 items-center font-bold">
                <AlertCircle className="w-5 h-5 flex-shrink-0" /> พบข้อผิดพลาด
              </div>
              <p className="text-xs">{errorDesc}</p>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={handleDeploy}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังดำเนินการ...
                </>
              ) : (
                'ยืนยันประกาศตารางเวร'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
