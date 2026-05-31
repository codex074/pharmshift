'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="th">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f1f3f9' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '420px', textAlign: 'center', background: '#fff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', padding: '32px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#111827', margin: '0 0 6px' }}>ระบบขัดข้อง</h1>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 20px', lineHeight: 1.6 }}>
              เกิดข้อผิดพลาดร้ายแรง กรุณาลองใหม่อีกครั้ง
            </p>
            <button
              onClick={() => reset()}
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', fontWeight: 700, padding: '10px 20px', borderRadius: '12px', border: 'none', fontSize: '14px', cursor: 'pointer' }}
            >
              ลองใหม่
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
