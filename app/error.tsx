'use client';

import { useEffect } from 'react';
import { RotateCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-xl border border-gray-100/60 p-8 space-y-5">
        <div className="text-5xl">⚠️</div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">เกิดข้อผิดพลาด</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง หากยังเป็นอยู่ให้แจ้งผู้ดูแลระบบ
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            onClick={() => reset()}
            className="text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2 active:scale-95 shadow-lg hover:shadow-xl"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
          >
            <RotateCw className="w-4 h-4" />
            ลองใหม่
          </button>
          <button
            onClick={() => { window.location.href = '/calendar'; }}
            className="bg-gray-900 text-white hover:bg-gray-800 font-bold px-5 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2 active:scale-95 shadow-md"
          >
            <Home className="w-4 h-4" />
            หน้าหลัก
          </button>
        </div>
      </div>
    </div>
  );
}
