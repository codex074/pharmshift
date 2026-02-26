'use client';

import { useState } from 'react';
import { X, Loader2, Save, User as UserIcon, Lock, PenLine, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '@/lib/types';

interface UserProfileModalProps {
  currentUser: User;
  onClose: () => void;
  onSuccess: () => void;
}

export function UserProfileModal({ currentUser, onClose, onSuccess }: UserProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullname: currentUser.fullname || '',
    nickname: currentUser.nickname || '',
    password: '',
    confirmPassword: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    if (!formData.nickname.trim() || !formData.fullname.trim()) {
      toast.error('กรุณากรอกชื่อจริงและชื่อเล่นให้ครบถ้วน');
      return;
    }

    if (formData.password && formData.password !== formData.confirmPassword) {
      toast.error('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: formData.nickname.trim(),
          fullname: formData.fullname.trim(),
          password: formData.password || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');

      toast.success('อัปเดตข้อมูลส่วนตัวสำเร็จแล้ว');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gradient-header px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <UserIcon className="w-5 h-5" />
            <h2 className="text-xl font-bold">แก้ไขข้อมูลส่วนตัว</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">ชื่อ-นามสกุลจริง *</label>
              <div className="relative">
                <input
                  type="text"
                  name="fullname"
                  value={formData.fullname}
                  onChange={handleChange}
                  placeholder="เช่น สมปอง ใจดี"
                  className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-sm"
                />
                <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">ชื่อเล่น * (แสดงบนตารางเวร)</label>
              <div className="relative">
                <input
                  type="text"
                  name="nickname"
                  value={formData.nickname}
                  onChange={handleChange}
                  placeholder="เช่น ปอง"
                  className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-sm"
                />
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">เปลี่ยนรหัสผ่านใหม่ (ไม่บังคับ)</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="ปล่อยว่างไว้หากไม่ต้องการเปลี่ยน"
                  className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-10 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-sm"
                />
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {formData.password && (
              <div className="space-y-1.5 animate-fade-in">
                <label className="block text-sm font-medium text-gray-700">ยืนยันรหัสผ่านใหม่</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="กรุณากรอกรหัสผ่านใหม่อีกครั้ง"
                    className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-10 py-2.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-sm"
                  />
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-all"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
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
      </div>
    </div>
  );
}
