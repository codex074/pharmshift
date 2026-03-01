'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Pill, Eye, EyeOff, User, Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [phaId, setPhaId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const loginId = phaId.trim().toLowerCase();

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phaId: loginId, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error('เข้าสู่ระบบไม่สำเร็จ', { description: data.error || 'โปรดตรวจสอบรหัสผู้ใช้งานและรหัสผ่าน' });
        return;
      }

      toast.success('เข้าสู่ระบบสำเร็จ', { description: 'กำลังพาทุกท่านเข้าสู่ระบบ...' });

      if (data.user) {
        if (data.user.must_change_password) {
          router.push('/change-password');
        } else {
          router.push('/calendar');
        }
      }
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด', { description: err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F0FF] relative overflow-hidden font-sans selection:bg-violet-200">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-violet-300/40 rounded-full blur-[100px] mix-blend-multiply animate-pulse" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-fuchsia-300/40 rounded-full blur-[100px] mix-blend-multiply animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative w-full max-w-md px-5 z-10">
        <div className="bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 sm:p-10 shadow-[0_8px_40px_-12px_rgba(139,92,246,0.15)] border border-white/60">

          {/* Header */}
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-violet-600 to-purple-500 shadow-xl shadow-violet-500/30 flex items-center justify-center mb-6 transform transition-transform hover:scale-105 duration-300">
              <Pill className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
              เวรดี๊ดี
            </h1>
            <p className="text-gray-500 font-medium text-[15px]">
              ระบบจัดการตารางเวรกลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="phaId" className="block text-sm font-semibold text-gray-700 ml-1">
                รหัสผู้ใช้งาน
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-violet-600 transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  id="phaId"
                  type="text"
                  value={phaId}
                  onChange={(e) => setPhaId(e.target.value)}
                  required
                  placeholder="เช่น pha208"
                  autoComplete="username"
                  className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200/80 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-[3px] focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300 text-[15px] font-medium shadow-sm hover:border-gray-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 ml-1">
                รหัสผ่าน
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-violet-600 transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-11 pr-12 py-3.5 bg-white border border-gray-200/80 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-[3px] focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300 text-sm font-medium tracking-wider shadow-sm hover:border-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-violet-600 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-8 relative group overflow-hidden rounded-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-violet-600 opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-center justify-center gap-2 px-6 py-4 text-white font-semibold text-[16px] shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed">
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>กำลังเข้าสู่ระบบ...</span>
                  </>
                ) : (
                  <span>เข้าสู่ระบบ</span>
                )}
              </div>
            </button>
          </form>

          {/* Footer Note */}
          <div className="mt-8 text-center pt-6">
            <p className="text-[13px] font-medium text-gray-400/80">
              กลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
