import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-xl border border-gray-100/60 p-8 space-y-5">
        <div className="text-6xl font-extrabold text-violet-600 tracking-tight">404</div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">ไม่พบหน้าที่ต้องการ</h1>
          <p className="text-sm text-gray-500 leading-relaxed">หน้านี้อาจถูกย้ายหรือไม่มีอยู่จริง</p>
        </div>
        <Link
          href="/calendar"
          className="inline-flex text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all items-center gap-2 active:scale-95 shadow-lg hover:shadow-xl"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
        >
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
