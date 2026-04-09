'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react';
import { LoadingOverlay } from '@/components/ui/loading-overlay';

function SessionExpiredToast() {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('reason') === 'session_expired') {
      toast.warning('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
  }, [searchParams]);
  return null;
}

function LoginForm() {
  const router = useRouter();
  const [phaId, setPhaId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    import('@/lib/pushNotifications')
      .then(({ unsubscribeFromPush }) => unsubscribeFromPush())
      .catch(() => {});
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const loginId = phaId.trim().toLowerCase();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaId: loginId, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error('เข้าสู่ระบบไม่สำเร็จ', { description: data.error || 'โปรดตรวจสอบรหัสผู้ใช้งานและรหัสผ่าน' });
        setLoading(false);
        return;
      }

      if (data.user) {
        if (!data.user.must_change_password) {
          import('@/lib/pushNotifications').then(({ subscribeToPush, isPushSupported, isMobilePushDevice }) => {
            if (isPushSupported() && isMobilePushDevice()) subscribeToPush(data.user.id).catch(() => {});
          });
        }
        router.push(data.user.must_change_password ? '/change-password' : '/calendar');
      }
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด', { description: err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex font-sans">
      {loading && <LoadingOverlay />}

      {/* Left Panel — Dark Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1a1145 30%, #2d1b69 60%, #1e1250 100%)' }}
      >
        {/* Animated gradient orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[10%] right-[10%] w-[350px] h-[350px] rounded-full opacity-30 animate-float"
            style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)' }} />
          <div className="absolute bottom-[15%] left-[5%] w-[300px] h-[300px] rounded-full opacity-20 animate-float"
            style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)', animationDelay: '4s', animationDirection: 'reverse' }} />
          <div className="absolute top-[50%] left-[40%] w-[200px] h-[200px] rounded-full opacity-15 animate-glow"
            style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }} />
          {/* Grid pattern overlay */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        </div>

        <div className="relative z-10 px-12 max-w-lg">
          <div className="w-24 h-24 rounded-3xl shadow-2xl overflow-hidden mb-8 ring-2 ring-white/10"
            style={{ boxShadow: '0 0 60px rgba(124,58,237,0.3)' }}
          >
            <Image src="/icon.png" alt="Logo" width={96} height={96} className="w-full h-full object-cover" priority />
          </div>

          <h1 className="text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
            เวรดี๊ดี
          </h1>
          <p className="text-violet-300/80 text-lg font-medium leading-relaxed mb-8">
            ระบบจัดการตารางเวรออนไลน์
            <br />
            <span className="text-violet-400/60 text-base">กลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์</span>
          </p>

          {/* Feature highlights */}
          <div className="space-y-4 mt-12">
            {[
              { emoji: '📅', text: 'จัดการตารางเวรง่าย ดูได้ทุกที่' },
              { emoji: '🔄', text: 'ขอแลกเวร / โอนเวร ได้ทันที' },
              { emoji: '🔔', text: 'แจ้งเตือนทุกการเปลี่ยนแปลง' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-white/60 text-sm font-medium">
                <div className="w-9 h-9 rounded-xl bg-white/[0.06] backdrop-blur-sm flex items-center justify-center text-base border border-white/[0.08]">
                  {item.emoji}
                </div>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex flex-col lg:items-center lg:justify-center relative overflow-y-auto"
        style={{ background: 'linear-gradient(180deg, #f5f3ff 0%, #fafafa 40%, #f5f3ff 100%)' }}
      >

        {/* ── Mobile Hero (hidden on desktop) ─────────────────────── */}
        <div className="lg:hidden relative flex flex-col items-center pt-14 pb-10 px-6"
          style={{ background: 'linear-gradient(160deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%)' }}
        >
          {/* Dot-grid overlay */}
          <div className="absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

          {/* Glowing orb */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full opacity-30 blur-2xl"
            style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }} />

          {/* Logo */}
          <div className="relative z-10 w-24 h-24 rounded-3xl shadow-2xl overflow-hidden mb-5
                          ring-4 ring-white/20"
            style={{ boxShadow: '0 0 48px rgba(167,139,250,0.4)' }}
          >
            <Image src="/icon.png" alt="Logo" width={96} height={96} className="w-full h-full object-cover" priority />
          </div>

          <h1 className="relative z-10 text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
            เวรดี๊ดี
          </h1>
          <p className="relative z-10 text-violet-200/80 text-sm font-medium mt-2 text-center leading-snug">
            ระบบจัดการตารางเวร<br />
            <span className="text-violet-300/60 text-xs">กลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์</span>
          </p>

          {/* Feature pills */}
          <div className="relative z-10 flex flex-wrap justify-center gap-2 mt-5">
            {['📅 ดูตาราง', '🔄 แลกเวร', '🔔 แจ้งเตือน'].map((t) => (
              <span key={t}
                className="text-[11px] font-semibold text-white/80 bg-white/10 border border-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                {t}
              </span>
            ))}
          </div>

          {/* Wave bottom */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 390 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 28 C100 0 290 28 390 0 L390 28 Z" fill="#fafafa"/>
          </svg>
        </div>

        {/* ── Form Card ────────────────────────────────────────────── */}
        <div className="w-full max-w-[420px] mx-auto px-6 sm:px-8 lg:px-0 py-8 lg:py-0 animate-slide-up-fade">

          {/* Welcome text — desktop only badge + heading */}
          <div className="mb-8">
            <div className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 text-violet-600 text-xs font-bold mb-4 tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              ระบบจัดการตารางเวร
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
              เข้าสู่ระบบ
            </h2>
            <p className="text-gray-400 mt-1.5 text-sm sm:text-base font-medium">
              เข้าใช้งานด้วยรหัสผู้ใช้งานของคุณ
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="phaId" className="block text-sm font-bold text-gray-700 mb-2">
                รหัสผู้ใช้งาน
              </label>
              <input
                id="phaId"
                type="text"
                value={phaId}
                onChange={(e) => setPhaId(e.target.value)}
                required
                placeholder="เช่น pha208"
                autoComplete="username"
                className="w-full px-4 py-3.5 bg-white border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all duration-200 text-[15px] font-medium tracking-wide"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-2">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-3.5 pr-12 bg-white border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all duration-200 text-[15px] font-medium tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-violet-500 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl text-white font-bold text-[15px] tracking-wide transition-all duration-300 shadow-[0_8px_32px_rgba(124,58,237,0.3)] hover:shadow-[0_12px_48px_rgba(124,58,237,0.4)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed group flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)' }}
            >
              <span>เข้าสู่ระบบ</span>
              <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-[11px] text-gray-400 font-medium">
              กลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์ — เวรดี๊ดี v2.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <SessionExpiredToast />
      <LoginForm />
    </Suspense>
  );
}
