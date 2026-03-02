'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toastSuccess, toastError } from '@/lib/swal';
import { X, Calendar, Plus, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import type { Holiday } from '@/lib/types';

interface ManageHolidaysModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ManageHolidaysModal({ onClose, onSuccess }: ManageHolidaysModalProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchHolidays();
  }, []);

  async function fetchHolidays() {
    try {
      setLoading(true);
      const res = await fetch('/api/holidays');
      if (!res.ok) throw new Error('Failed to fetch holidays');
      const data = await res.json();
      setHolidays(data);
    } catch (error) {
      console.error(error);
      toastError('โหลดข้อมูลวันหยุดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !name) return;

    try {
      setAdding(true);
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, name }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add holiday');
      }

      toastSuccess('เพิ่มวันหยุดเรียบร้อยแล้ว');
      setDate('');
      setName('');
      fetchHolidays();
      onSuccess(); // Refresh calendar data
    } catch (error: any) {
      console.error(error);
      toastError(error.message || 'เพิ่มวันหยุดไม่สำเร็จ');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบวันหยุดนี้ใช่หรือไม่?')) return;

    try {
      setDeletingId(id);
      const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
      
      if (!res.ok) throw new Error('Failed to delete holiday');

      toastSuccess('ลบวันหยุดเรียบร้อยแล้ว');
      fetchHolidays();
      onSuccess(); // Refresh calendar data
    } catch (error) {
      console.error(error);
      toastError('ลบวันหยุดไม่สำเร็จ');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 text-violet-600 rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">จัดการวันหยุดนักขัตฤกษ์</h2>
              <p className="text-sm text-gray-500">เพิ่มหรือลบวันหยุดพิเศษ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
          
          {/* Add Form */}
          <form onSubmit={handleAdd} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-600" />
              เพิ่มวันหยุดใหม่
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">วันที่</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full text-sm border-gray-300 rounded-lg shadow-sm focus:border-violet-500 focus:ring-violet-500 bg-gray-50 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อวันหยุด / โอกาสพิเศษ</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น วันสงกรานต์, วันหยุดชดเชย..."
                  required
                  className="w-full text-sm border-gray-300 rounded-lg shadow-sm focus:border-violet-500 focus:ring-violet-500 px-3 py-2"
                />
              </div>
              <button
                type="submit"
                disabled={adding || !date || !name}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                บันทึกวันหยุด
              </button>
            </div>
          </form>

          {/* List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center justify-between">
              รายการวันหยุด
              <span className="bg-gray-200 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                {holidays.length} วัน
              </span>
            </h3>
            
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2 bg-white rounded-xl border border-gray-100">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">กำลังโหลดข้อมูล...</span>
              </div>
            ) : holidays.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-white rounded-xl border border-dashed border-gray-200">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">ยังไม่มีข้อมูลวันหยุด</p>
              </div>
            ) : (
              <div className="space-y-2">
                {holidays.map((h) => {
                  const dateObj = new Date(h.date);
                  const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
                  
                  return (
                    <div 
                      key={h.id} 
                      className={`flex items-center justify-between p-3 bg-white rounded-xl border ${isPast ? 'border-gray-100 opacity-60' : 'border-gray-200 shadow-sm'} transition-all`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{h.name}</p>
                        <p className="text-xs text-gray-500">
                          {format(dateObj, 'd MMMM yyyy', { locale: th })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(h.id)}
                        disabled={deletingId === h.id}
                        title="ลบวันหยุด"
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingId === h.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
