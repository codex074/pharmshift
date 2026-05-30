'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, UserCheck, Eye, EyeOff, Sparkles, ShieldCheck } from 'lucide-react';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Password strength
  const strength = password.length === 0 ? 0 : password.length < 4 ? 1 : password.length < 8 ? 2 : 3;
  const strengthColors = ['', 'bg-red-400', 'bg-amber-400', 'bg-emerald-400'];
  const strengthLabels = ['', 'อ่อน', 'ปานกลาง', 'แข็งแรง'];

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const { user } = await res.json();
          if (user) {
            setUserName(`${user.prefix || ''}${user.f_name || ''} ${user.l_name || ''}`.trim());
          }
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!currentPassword) {
      toast.error('กรุณากรอกรหัสผ่านปัจจุบัน');
      return;
    }
    if (password.length < 4) {
      toast.error('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
      return;
    }
    if (password !== confirm) {
      toast.error('รหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: currentPassword, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      toast.success('ตั้งค่าสำเร็จ! ยินดีต้อนรับ 🎉');
      router.push('/calendar');
    } catch (err: any) {
      toast.error('บันทึกไม่สำเร็จ', { description: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, hsl(252 80% 58%) 0%, hsl(271 81% 54%) 35%, hsl(230 72% 56%) 70%, hsl(252 80% 62%) 100%)' }}
    >
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full blur-[100px] animate-float"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full blur-[100px] animate-float"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)', animationDelay: '4s', animationDirection: 'reverse' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] animate-glow"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.08), transparent 60%)' }}
        />
      </div>

      <div className="relative w-full max-w-md px-5 animate-scale-in">
        <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.12)] border border-white/50">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-[0_8px_32px_rgba(251,191,36,0.25)] mb-4"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)' }}
            >
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">ยินดีต้อนรับ!</h1>
            {userName && (
              <p className="text-violet-600 font-semibold text-sm mt-1.5">{userName}</p>
            )}
            <p className="text-xs text-gray-400 mt-1.5 font-medium">
              กรุณาตั้งค่าบัญชีเล่นก่อนเข้าใช้งานระบบ
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-600 ml-0.5">
                รหัสผ่านปัจจุบัน <span className="text-red-400">*</span>
              </label>
              <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'current' ? 'ring-2 ring-violet-400/30' : ''}`}>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onFocus={() => setFocusedField('current')}
                  onBlur={() => setFocusedField(null)}
                  required
                  placeholder="รหัสผ่านเดิม"
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200/80 bg-gray-50/80 text-sm font-medium focus:outline-none focus:bg-white focus:border-violet-300 transition-all duration-300"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-violet-500 transition-colors duration-200"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-600 ml-0.5">
                รหัสผ่านใหม่ <span className="text-red-400">*</span>
              </label>
              <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'password' ? 'ring-2 ring-violet-400/30' : ''}`}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  required
                  minLength={4}
                  placeholder="อย่างน้อย 4 ตัวอักษร"
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200/80 bg-gray-50/80 text-sm font-medium focus:outline-none focus:bg-white focus:border-violet-300 transition-all duration-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-violet-500 transition-colors duration-200"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="flex items-center gap-2 mt-1.5 animate-slide-up-fade">
                  <div className="flex gap-1 flex-1">
                    {[1, 2, 3].map(level => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${strength >= level ? strengthColors[strength] : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className={`text-[10px] font-semibold ${strength === 1 ? 'text-red-500' : strength === 2 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {strengthLabels[strength]}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-600 ml-0.5">
                ยืนยันรหัสผ่าน
              </label>
              <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'confirm' ? 'ring-2 ring-violet-400/30' : ''}`}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                  required
                  placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200/80 bg-gray-50/80 text-sm font-medium focus:outline-none focus:bg-white focus:border-violet-300 transition-all duration-300"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-violet-500 transition-colors duration-200"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Match indicator */}
              {confirm.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1 animate-slide-up-fade">
                  {password === confirm ? (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[10px] font-semibold text-emerald-500">รหัสผ่านตรงกัน</span>
                    </>
                  ) : (
                    <span className="text-[10px] font-semibold text-red-400">รหัสผ่านไม่ตรงกัน</span>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-sm shadow-[0_4px_20px_rgba(124,58,237,0.3)] hover:shadow-[0_8px_32px_rgba(124,58,237,0.4)] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, hsl(252 80% 58%), hsl(271 81% 54%))' }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  เริ่มใช้งาน
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
