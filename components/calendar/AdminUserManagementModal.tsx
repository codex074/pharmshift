'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  X, Loader2, Save, Search, Users, UserCog, PenLine, KeyRound,
  ChevronLeft, Shield, Hash,
} from 'lucide-react';
import type { User, UserRole } from '@/lib/types';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AdminUserManagementModalProps {
  onClose: () => void;
}

type ViewMode = 'list' | 'edit';

const ALL_ROLES: UserRole[] = ['pharmacist', 'pharmacy_technician', 'officer', 'admin'];

export function AdminUserManagementModal({ onClose }: AdminUserManagementModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Edit form state
  const [formData, setFormData] = useState({
    fullname: '',
    nickname: '',
    salary_number: '',
    role: '' as UserRole,
    is_sub_admin: false,
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      toast.error('โหลดรายชื่อผู้ใช้ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setFormData({
      fullname: user.fullname || '',
      nickname: user.nickname || '',
      salary_number: user.salary_number || '',
      role: user.role,
      is_sub_admin: user.is_sub_admin ?? false,
    });
    setView('edit');
  }

  function backToList() {
    setView('list');
    setEditingUser(null);
  }

  async function handleSave() {
    if (!editingUser) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          fullname: formData.fullname.trim(),
          nickname: formData.nickname.trim(),
          salary_number: formData.salary_number.trim(),
          role: formData.role,
          is_sub_admin: STAFF_ROLES.includes(formData.role as any) ? formData.is_sub_admin : false,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }

      toast.success('อัปเดตข้อมูลผู้ใช้สำเร็จ');
      await fetchUsers();
      backToList();
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!editingUser) return;
    if (!confirm(`ยืนยันรีเซ็ตรหัสผ่านของ ${editingUser.fullname || editingUser.name}?\n\nรหัสผ่านใหม่จะถูกตั้งเป็น "${editingUser.pha_id}" และผู้ใช้จะต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป`)) {
      return;
    }

    setResetting(true);
    try {
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editingUser.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Reset failed');
      }

      const data = await res.json();
      toast.success(`รีเซ็ตรหัสผ่านสำเร็จ — รหัสผ่านใหม่: ${data.defaultPassword}`);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setResetting(false);
    }
  }

  // Filtered users
  const filtered = users.filter((u) => {
    const matchRole = filterRole === 'all' || u.role === filterRole;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.fullname || '').toLowerCase().includes(q) ||
      (u.nickname || '').toLowerCase().includes(q) ||
      (u.pha_id || '').toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const roleColor: Record<UserRole, string> = {
    pharmacist: 'bg-emerald-100 text-emerald-700',
    pharmacy_technician: 'bg-violet-100 text-violet-700',
    officer: 'bg-sky-100 text-sky-700',
    admin: 'bg-rose-100 text-rose-700',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50 to-white">
          <div className="flex items-center gap-3">
            {view === 'edit' && (
              <button
                onClick={backToList}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors mr-1"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="p-2 bg-teal-100 text-teal-600 rounded-xl">
              {view === 'list' ? <Users className="w-5 h-5" /> : <UserCog className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {view === 'list' ? 'จัดการผู้ใช้' : `แก้ไขข้อมูล — ${editingUser?.fullname || editingUser?.name}`}
              </h2>
              <p className="text-sm text-gray-500">
                {view === 'list'
                  ? `ทั้งหมด ${users.length} คน`
                  : `รหัส: ${editingUser?.pha_id}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
          {view === 'list' ? (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ, รหัส..."
                  className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm text-sm"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>

              {/* Role filter */}
              <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
                <button
                  onClick={() => setFilterRole('all')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all',
                    filterRole === 'all'
                      ? 'bg-gray-800 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  )}
                >
                  ทั้งหมด
                </button>
                {ALL_ROLES.map((role) => (
                  <button
                    key={role}
                    onClick={() => setFilterRole(role)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all',
                      filterRole === role
                        ? role === 'pharmacist'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : role === 'pharmacy_technician'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : role === 'officer'
                              ? 'bg-sky-500 text-white shadow-sm'
                              : 'bg-rose-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>

              {/* User list */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">กำลังโหลดข้อมูล...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-200">
                  <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => openEdit(user)}
                      className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all text-left group"
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white shadow-inner">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {user.fullname || user.name}
                          {user.nickname ? ` (${user.nickname})` : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{user.pha_id}</span>
                          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', roleColor[user.role])}>
                            {ROLE_LABELS[user.role]}
                          </span>
                          {user.is_sub_admin && user.role !== 'admin' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                              Sub-Admin
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Arrow */}
                      <PenLine className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Edit view */
            <div className="space-y-5">
              {/* Fullname */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">ชื่อ-นามสกุล</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.fullname}
                    onChange={(e) => setFormData((p) => ({ ...p, fullname: e.target.value }))}
                    placeholder="เช่น สมปอง ใจดี"
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm"
                  />
                  <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* Nickname */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">ชื่อเล่น (แสดงบนตารางเวร)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={(e) => setFormData((p) => ({ ...p, nickname: e.target.value }))}
                    placeholder="เช่น ปอง"
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm"
                  />
                  <UserCog className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* Salary number */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">เลขที่รับเงินเดือน</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.salary_number}
                    onChange={(e) => setFormData((p) => ({ ...p, salary_number: e.target.value }))}
                    placeholder="กรอกเลขที่รับเงินเดือน"
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm"
                  />
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">ตำแหน่ง / Role</label>
                <div className="relative">
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value as UserRole;
                      setFormData((p) => ({
                        ...p,
                        role: newRole,
                        is_sub_admin: newRole === 'admin' ? false : p.is_sub_admin,
                      }));
                    }}
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm appearance-none"
                  >
                    {ALL_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                  <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* Sub-admin toggle — only for staff roles */}
              {STAFF_ROLES.includes(formData.role as any) && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">ผู้ช่วยดูแล (Sub-Admin)</label>
                  <div className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                    formData.is_sub_admin
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-gray-50 border-gray-200'
                  )}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.is_sub_admin}
                      onClick={() => setFormData(p => ({ ...p, is_sub_admin: !p.is_sub_admin }))}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                        formData.is_sub_admin ? 'bg-yellow-500' : 'bg-gray-200'
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform',
                          formData.is_sub_admin ? 'translate-x-5' : 'translate-x-0'
                        )}
                      />
                    </button>
                    <div className="text-sm">
                      <p className={cn('font-semibold', formData.is_sub_admin ? 'text-yellow-700' : 'text-gray-500')}>
                        {formData.is_sub_admin ? 'เปิดใช้งาน' : 'ปิดอยู่'}
                      </p>
                      <p className="text-xs text-gray-500">
                        เมื่อเปิด ผู้ใช้สามารถอัปโหลดเวร, แก้ไข, ประกาศตารางเวรสำหรับตำแหน่ง{ROLE_LABELS[formData.role as UserRole]}ได้
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Reset password */}
              <div className="border-t border-gray-200 pt-4">
                <button
                  onClick={handleResetPassword}
                  disabled={resetting}
                  className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold py-2.5 px-4 rounded-xl border border-amber-200 transition-all disabled:opacity-50"
                >
                  {resetting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  รีเซ็ตรหัสผ่าน (ตั้งเป็นรหัสพนักงาน)
                </button>
                <p className="text-xs text-gray-400 mt-1.5 text-center">
                  รหัสผ่านจะถูกตั้งเป็นรหัสพนักงาน ({editingUser?.pha_id}) และผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป
                </p>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={backToList}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      บันทึกข้อมูล
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
