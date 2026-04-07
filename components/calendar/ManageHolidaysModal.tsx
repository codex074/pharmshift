'use client';

import { useState, useEffect } from 'react';
import { toastSuccess, toastError } from '@/lib/swal';
import { X, Calendar, Plus, Trash2, Loader2, Download, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import type { Holiday } from '@/lib/types';

interface ManageHolidaysModalProps {
  onClose: () => void;
  onSuccess: () => void;
  embedded?: boolean;
}

export function ManageHolidaysModal({ onClose, onSuccess, embedded }: ManageHolidaysModalProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);

  // Form state
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [adding, setAdding] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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

  function resetAddForm() {
    setDate('');
    setName('');
  }

  function closeEditModal() {
    setEditingHoliday(null);
    setEditDate('');
    setEditName('');
  }

  function startEditingHoliday(holiday: Holiday) {
    setEditingHoliday(holiday);
    setEditDate(holiday.date);
    setEditName(holiday.name);
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
      resetAddForm();
      await fetchHolidays();
      onSuccess(); // Refresh calendar data
    } catch (error: any) {
      console.error(error);
      toastError(error.message || 'เพิ่มวันหยุดไม่สำเร็จ');
    } finally {
      setAdding(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingHoliday || !editDate || !editName) return;

    try {
      setSavingEdit(true);
      const res = await fetch(`/api/holidays/${editingHoliday.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: editDate, name: editName }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update holiday');
      }

      toastSuccess('แก้ไขวันหยุดเรียบร้อยแล้ว');
      closeEditModal();
      await fetchHolidays();
      onSuccess(); // Refresh calendar data
    } catch (error: any) {
      console.error(error);
      toastError(error.message || 'แก้ไขวันหยุดไม่สำเร็จ');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบวันหยุดนี้ใช่หรือไม่?')) return;

    try {
      setDeletingId(id);
      const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
      
      if (!res.ok) throw new Error('Failed to delete holiday');

      toastSuccess('ลบวันหยุดเรียบร้อยแล้ว');
      if (editingHoliday?.id === id) {
        closeEditModal();
      }
      await fetchHolidays();
      onSuccess(); // Refresh calendar data
    } catch (error) {
      console.error(error);
      toastError('ลบวันหยุดไม่สำเร็จ');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleImportFromJson() {
    if (!confirm('ยืนยันการนำเข้าข้อมูลวันหยุดจากไฟล์ holidays.json ใช่หรือไม่?\\n(ข้อมูลที่มีในไฟล์จะถูกเพิ่ม หรืออัปเดตหากวันที่ซ้ำกัน)')) return;

    try {
      setImporting(true);
      const res = await fetch('/api/holidays/import', { method: 'POST' });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import holidays');
      }

      toastSuccess(data.message || 'นำเข้าข้อมูลวันหยุดสำเร็จ');
      fetchHolidays();
      onSuccess(); // Refresh calendar data
    } catch (error: any) {
      console.error('Import error:', error);
      toastError(error.message || 'นำเข้าข้อมูลวันหยุดไม่สำเร็จ');
    } finally {
      setImporting(false);
    }
  }

  const bodyContent = (
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
          
          {/* Add Form */}
          <form onSubmit={handleAdd} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Plus className="w-4 h-4 text-violet-600" />
                เพิ่มวันหยุดทีละวัน
              </h3>
              <button
                type="button"
                onClick={handleImportFromJson}
                disabled={importing || adding || savingEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                นำเข้าจาก holidays.json
              </button>
            </div>

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
              <>
                <div className="space-y-2">
                  {holidays.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((h) => {
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditingHoliday(h)}
                            disabled={adding || savingEdit || deletingId === h.id}
                            title="แก้ไขวันหยุด"
                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(h.id)}
                            disabled={deletingId === h.id || adding || savingEdit}
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
                      </div>
                    );
                  })}
                </div>
                {holidays.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
                    <button
                      onClick={() => setPage(p => p - 1)}
                      disabled={page === 0}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      ◀ ก่อนหน้า
                    </button>
                    <span className="text-[11px] text-gray-400">
                      {page + 1} / {Math.ceil(holidays.length / PAGE_SIZE)}
                    </span>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={(page + 1) * PAGE_SIZE >= holidays.length}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      ถัดไป ▶
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {editingHoliday && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/55 backdrop-blur-[1px]">
              <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-amber-100 p-2 text-amber-600">
                      <Pencil className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900">แก้ไขข้อมูลวันหยุด</h3>
                      <p className="text-xs text-gray-500">แก้ไขชื่อวันหยุดหรือวันที่ที่เลือก</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeEditModal}
                    disabled={savingEdit}
                    className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleEdit} className="space-y-4 p-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">วันที่</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      required
                      className="w-full rounded-lg border-gray-300 bg-gray-50 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">ชื่อวันหยุด / โอกาสพิเศษ</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="เช่น วันสงกรานต์, วันหยุดชดเชย..."
                      required
                      className="w-full rounded-lg border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:ring-amber-500"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeEditModal}
                      disabled={savingEdit}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit || !editDate || !editName}
                      className="flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                      บันทึกการแก้ไข
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
  );

  if (embedded) return bodyContent;

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
              <p className="text-sm text-gray-500">เพิ่ม แก้ไข หรือลบวันหยุดพิเศษ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {bodyContent}
      </div>
    </div>
  );
}
