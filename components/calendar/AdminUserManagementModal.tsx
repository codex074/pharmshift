'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  X, Loader2, Save, Search, Users, UserCog, PenLine, KeyRound,
  ChevronLeft, Shield, Hash, UserPlus, ToggleLeft, ToggleRight,
} from 'lucide-react';
import type { User, UserRole } from '@/lib/types';
import { ROLE_LABELS, STAFF_ROLES, userFullName } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AdminUserManagementModalProps {
  onClose: () => void;
}

type ViewMode = 'list' | 'edit' | 'add';

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
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);

  // Edit/Add form state
  const [formData, setFormData] = useState({
    pha_id: '',
    prefix: '',
    f_name: '',
    l_name: '',
    nickname: '',
    salary_number: '',
    role: 'pharmacist' as UserRole,
    is_sub_admin: false,
    is_active: true,
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
      pha_id: user.pha_id || '',
      prefix: user.prefix || '',
      f_name: user.f_name || '',
      l_name: user.l_name || '',
      nickname: user.nickname || '',
      salary_number: user.salary_number || '',
      role: user.role,
      is_sub_admin: user.is_sub_admin ?? false,
      is_active: user.is_active !== false,
    });
    setView('edit');
  }

  function openAdd() {
    setEditingUser(null);
    setFormData({ pha_id: '', prefix: '', f_name: '', l_name: '', nickname: '', salary_number: '', role: 'pharmacist', is_sub_admin: false, is_active: true });
    setView('add');
  }

  function backToList() {
    setView('list');
    setEditingUser(null);
  }

  async function handleCreate() {
    if (!formData.f_name.trim() || !formData.l_name.trim()) {
      toast.error('กรุณากรอกชื่อและนามสกุล');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pha_id: formData.pha_id.trim() || null,
          prefix: formData.prefix.trim(),
          f_name: formData.f_name.trim(),
          l_name: formData.l_name.trim(),
          nickname: formData.nickname.trim(),
          salary_number: formData.salary_number.trim(),
          role: formData.role,
          is_sub_admin: STAFF_ROLES.includes(formData.role as any) ? formData.is_sub_admin : false,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Create failed');
      }
      toast.success('เพิ่มผู้ใช้สำเร็จ — รหัสผ่านเริ่มต้น: 1234');
      await fetchUsers();
      backToList();
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
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
          prefix: formData.prefix.trim(),
          f_name: formData.f_name.trim(),
          l_name: formData.l_name.trim(),
          nickname: formData.nickname.trim(),
          salary_number: formData.salary_number.trim(),
          role: formData.role,
          is_sub_admin: STAFF_ROLES.includes(formData.role as any) ? formData.is_sub_admin : false,
          is_active: formData.is_active,
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
    if (!confirm(`ยืนยันรีเซ็ตรหัสผ่านของ ${userFullName(editingUser)}?\n\nรหัสผ่านใหม่จะถูกตั้งเป็น "1234" และผู้ใช้จะต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป`)) {
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

  async function handleToggleActive(user: User, e: React.MouseEvent) {
    e.stopPropagation(); // prevent opening edit view
    setTogglingId(user.id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, is_active: !user.is_active }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }
      toast.success(user.is_active ? `ระงับบัญชี ${userFullName(user)} แล้ว` : `เปิดใช้งานบัญชี ${userFullName(user)} แล้ว`);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setTogglingId(null);
    }
  }

  // Filtered users
  const filtered = users.filter((u) => {
    const matchRole = filterRole === 'all' || u.role === filterRole;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (u.f_name || '').toLowerCase().includes(q) ||
      (u.l_name || '').toLowerCase().includes(q) ||
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
            {(view === 'edit' || view === 'add') && (
              <button
                onClick={backToList}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors mr-1"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="p-2 bg-teal-100 text-teal-600 rounded-xl">
              {view === 'list' ? <Users className="w-5 h-5" /> : view === 'add' ? <UserPlus className="w-5 h-5" /> : <UserCog className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {view === 'list' ? 'จัดการผู้ใช้' : view === 'add' ? 'เพิ่มผู้ใช้ใหม่' : `แก้ไขข้อมูล — ${editingUser ? userFullName(editingUser) : ''}`}
              </h2>
              <p className="text-sm text-gray-500">
                {view === 'list'
                  ? `ทั้งหมด ${users.length} คน`
                  : view === 'add'
                    ? 'รหัสผ่านเริ่มต้น: 1234'
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
              {/* Add user button */}
              <button
                onClick={openAdd}
                className="w-full flex items-center justify-center gap-2 mb-4 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-sm transition-all"
              >
                <UserPlus className="w-4 h-4" />
                เพิ่มผู้ใช้ใหม่
              </button>

              {/* Search */}
              <div className="relative mb-4">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder="ค้นหาชื่อ, รหัส..."
                  className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm text-sm"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>

              {/* Role filter */}
              <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
                <button
                  onClick={() => { setFilterRole('all'); setPage(0); }}
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
                    onClick={() => { setFilterRole(role); setPage(0); }}
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
                <>
                  <div className="space-y-2">
                    {filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((user) => (
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
                            {userFullName(user)}
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
                            {user.is_active === false && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                                Inactive
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Toggle active + edit arrow */}
                        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleToggleActive(user, e)}
                            disabled={togglingId === user.id}
                            title={user.is_active !== false ? 'ระงับการเข้าสู่ระบบ' : 'เปิดใช้งาน'}
                            className={cn(
                              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50',
                              user.is_active !== false ? 'bg-green-500' : 'bg-gray-300'
                            )}
                          >
                            {togglingId === user.id ? (
                              <Loader2 className="w-3 h-3 animate-spin text-white m-auto" />
                            ) : (
                              <span className={cn(
                                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform',
                                user.is_active !== false ? 'translate-x-4' : 'translate-x-0'
                              )} />
                            )}
                          </button>
                          <PenLine className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                  {filtered.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
                      <button
                        onClick={() => setPage(p => p - 1)}
                        disabled={page === 0}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        ◀ ก่อนหน้า
                      </button>
                      <span className="text-[11px] text-gray-400">
                        {page + 1} / {Math.ceil(filtered.length / PAGE_SIZE)}
                        <span className="ml-1 text-gray-300">({filtered.length} คน)</span>
                      </span>
                      <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={(page + 1) * PAGE_SIZE >= filtered.length}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        ถัดไป ▶
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : view === 'add' ? (
            /* Add view */
            <div className="space-y-5">
              {/* pha_id */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">รหัสพนักงาน <span className="text-gray-400 font-normal">(ไม่บังคับ)</span></label>
                <div className="relative">
                  <input type="text" value={formData.pha_id} onChange={(e) => setFormData(p => ({ ...p, pha_id: e.target.value }))}
                    placeholder="เช่น PH001" className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm" />
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              {/* Prefix */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">คำนำหน้า</label>
                <div className="relative">
                  <input type="text" value={formData.prefix} onChange={(e) => setFormData(p => ({ ...p, prefix: e.target.value }))}
                    placeholder="เช่น ภก. / ภญ." className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm" />
                  <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              {/* First name */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">ชื่อ <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type="text" value={formData.f_name} onChange={(e) => setFormData(p => ({ ...p, f_name: e.target.value }))}
                    placeholder="เช่น สมปอง" className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm" />
                  <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              {/* Last name */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">นามสกุล <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type="text" value={formData.l_name} onChange={(e) => setFormData(p => ({ ...p, l_name: e.target.value }))}
                    placeholder="เช่น ใจดี" className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm" />
                  <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              {/* Nickname */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">ชื่อเล่น <span className="text-gray-400 font-normal">(แสดงบนตารางเวร)</span></label>
                <div className="relative">
                  <input type="text" value={formData.nickname} onChange={(e) => setFormData(p => ({ ...p, nickname: e.target.value }))}
                    placeholder="เช่น ปอง" className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm" />
                  <UserCog className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              {/* Salary number */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">เลขที่รับเงินเดือน</label>
                <div className="relative">
                  <input type="text" value={formData.salary_number} onChange={(e) => setFormData(p => ({ ...p, salary_number: e.target.value }))}
                    placeholder="กรอกเลขที่รับเงินเดือน" className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm" />
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              {/* Role */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">ตำแหน่ง / Role <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select value={formData.role} onChange={(e) => { const r = e.target.value as UserRole; setFormData(p => ({ ...p, role: r, is_sub_admin: r === 'admin' ? false : p.is_sub_admin })); }}
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm appearance-none">
                    {ALL_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                  <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              {/* Sub-admin toggle */}
              {STAFF_ROLES.includes(formData.role as any) && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">ผู้ช่วยดูแล (Sub-Admin)</label>
                  <div className={cn('flex items-center gap-3 p-3 rounded-xl border transition-colors', formData.is_sub_admin ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200')}>
                    <button type="button" role="switch" aria-checked={formData.is_sub_admin} onClick={() => setFormData(p => ({ ...p, is_sub_admin: !p.is_sub_admin }))}
                      className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors', formData.is_sub_admin ? 'bg-yellow-500' : 'bg-gray-200')}>
                      <span className={cn('pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform', formData.is_sub_admin ? 'translate-x-5' : 'translate-x-0')} />
                    </button>
                    <p className={cn('text-sm font-semibold', formData.is_sub_admin ? 'text-yellow-700' : 'text-gray-500')}>{formData.is_sub_admin ? 'เปิดใช้งาน' : 'ปิดอยู่'}</p>
                  </div>
                </div>
              )}
              {/* Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                🔑 รหัสผ่านเริ่มต้นจะถูกตั้งเป็น <strong>1234</strong> และผู้ใช้จะต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก
              </div>
              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button onClick={backToList} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-all">ยกเลิก</button>
                <button onClick={handleCreate} disabled={saving || !formData.f_name.trim() || !formData.l_name.trim()}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-5 h-5 animate-spin" />กำลังสร้าง...</> : <><UserPlus className="w-5 h-5" />เพิ่มผู้ใช้</>}
                </button>
              </div>
            </div>
          ) : (
            /* Edit view */
            <div className="space-y-5">
              {/* Prefix */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">คำนำหน้า</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.prefix}
                    onChange={(e) => setFormData((p) => ({ ...p, prefix: e.target.value }))}
                    placeholder="เช่น ภก. / ภญ."
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm"
                  />
                  <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* First name */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">ชื่อ</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.f_name}
                    onChange={(e) => setFormData((p) => ({ ...p, f_name: e.target.value }))}
                    placeholder="เช่น สมปอง"
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm"
                  />
                  <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* Last name */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">นามสกุล</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.l_name}
                    onChange={(e) => setFormData((p) => ({ ...p, l_name: e.target.value }))}
                    placeholder="เช่น ใจดี"
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

              {/* Active/Inactive toggle — only for staff roles */}
              {STAFF_ROLES.includes(formData.role as any) && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">สถานะผู้ใช้</label>
                  <div className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                    formData.is_active
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  )}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.is_active}
                      onClick={() => setFormData(p => ({ ...p, is_active: !p.is_active }))}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                        formData.is_active ? 'bg-green-500' : 'bg-red-400'
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform',
                          formData.is_active ? 'translate-x-5' : 'translate-x-0'
                        )}
                      />
                    </button>
                    <div className="text-sm">
                      <p className={cn('font-semibold', formData.is_active ? 'text-green-700' : 'text-red-600')}>
                        {formData.is_active ? 'Active — ใช้งานปกติ' : 'Inactive — ระงับการใช้งาน'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formData.is_active
                          ? 'ผู้ใช้สามารถถูกเพิ่มเวร, แลกเวร, ซื้อขายเวรได้ตามปกติ'
                          : 'ผู้ใช้จะไม่สามารถถูกเพิ่มเวร, แลกเวร, ซื้อขายเวรได้ ดูตารางเวรอย่างเดียว'}
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
                  รีเซ็ตรหัสผ่าน (ตั้งเป็น 1234)
                </button>
                <p className="text-xs text-gray-400 mt-1.5 text-center">
                  รหัสผ่านจะถูกตั้งเป็น 1234 และผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป
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
