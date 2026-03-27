'use client';

import { useState } from 'react';
import {
  X, ChevronDown, ChevronUp, BookOpen, Smartphone, Bell,
  ArrowRightLeft, Shield, CalendarDays, Upload, UserCog,
  Download, Globe, LayoutDashboard, Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpGuideModalProps {
  onClose: () => void;
  isAdmin?: boolean;
}

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

function AccordionItem({ section, isOpen, onToggle }: { section: Section; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden transition-all">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-all',
          isOpen ? 'bg-violet-50' : 'bg-white hover:bg-gray-50'
        )}
      >
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isOpen ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-500'
        )}>
          {section.icon}
        </div>
        <span className={cn(
          'text-sm font-semibold flex-1',
          isOpen ? 'text-violet-800' : 'text-gray-700'
        )}>
          {section.title}
        </span>
        {isOpen
          ? <ChevronUp className="w-4 h-4 text-violet-500" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-2 bg-white text-sm text-gray-600 space-y-3 animate-fade-in">
          {section.content}
        </div>
      )}
    </div>
  );
}

/* ── small helpers ── */
function Tip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className={`p-3 rounded-xl border text-xs ${color}`}>{children}</div>
  );
}
function Step({ n, color, children }: { n: number; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${color}`}>{n}</span>
      <p className="text-xs text-gray-600">{children}</p>
    </div>
  );
}

export function HelpGuideModal({ onClose, isAdmin }: HelpGuideModalProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['login']));

  function toggleSection(id: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const sections: Section[] = [

    /* ── 0. Login ── */
    {
      id: 'login',
      icon: <Globe className="w-4 h-4" />,
      title: 'เข้าสู่ระบบครั้งแรก',
      content: (
        <>
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1.5">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest">เว็บแอป</p>
            <a href="https://utth-shift.vercel.app/" target="_blank" rel="noopener noreferrer"
              className="block font-bold text-indigo-700 underline underline-offset-2 break-all">
              https://utth-shift.vercel.app/
            </a>
            <p className="text-xs text-gray-500">ใช้งานได้ทั้ง 💻 PC และ 📱 มือถือ — ไม่ต้องติดตั้งโปรแกรม</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-indigo-700 mb-1">🪪 Username</p>
              <p className="text-xs text-gray-700"><strong>Pha ID</strong> ประจำตัวของแต่ละท่าน</p>
              <p className="text-[11px] text-gray-400">เช่น PHA001, PHA123</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs font-bold text-amber-700 mb-1">🔑 Password ครั้งแรก</p>
              <p className="text-xs text-gray-700">ใช้รหัส <strong className="text-amber-700">1234</strong></p>
              <p className="text-[11px] text-gray-400">ระบบจะให้ตั้งรหัสใหม่ทันที</p>
            </div>
          </div>
          <Tip color="bg-red-50 border-red-200 text-red-700">
            ⚠️ หลังตั้งรหัสผ่านใหม่แล้ว <strong>อย่าลืมจำรหัสที่ตั้งไว้</strong> หากลืมให้ติดต่อผู้ดูแลระบบเพื่อ reset
          </Tip>
        </>
      ),
    },

    /* ── 1. PWA ── */
    {
      id: 'pwa',
      icon: <Smartphone className="w-4 h-4" />,
      title: 'เพิ่มเว็บแอปลงหน้าจอ (บันทึกไว้ใช้ง่าย)',
      content: (
        <>
          <p className="text-xs text-gray-500">ไม่ต้องโหลดจาก App Store — เปิดเบราว์เซอร์แล้วบันทึกลงหน้าจอหลักได้เลย</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-700">🍎 iPhone / iPad</p>
              <p className="text-[11px] text-red-600 font-medium">⚠️ ต้องใช้ Safari เท่านั้น</p>
              <div className="space-y-1.5">
                <Step n={1} color="bg-indigo-100 text-indigo-700">เปิดเว็บผ่าน <strong>Safari</strong></Step>
                <Step n={2} color="bg-indigo-100 text-indigo-700">กดปุ่ม <strong>"แชร์" (□↑)</strong> ด้านล่างหน้าจอ</Step>
                <Step n={3} color="bg-indigo-100 text-indigo-700">เลือก <strong>"เพิ่มไปยังหน้าจอโฮม"</strong></Step>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-700">🤖 Android</p>
              <div className="space-y-1.5">
                <Step n={1} color="bg-green-100 text-green-700">เปิดเว็บผ่าน <strong>Chrome</strong></Step>
                <Step n={2} color="bg-green-100 text-green-700">กด <strong>⋮</strong> มุมขวาบน</Step>
                <Step n={3} color="bg-green-100 text-green-700">เลือก <strong>"เพิ่มลงในหน้าจอหลัก"</strong></Step>
              </div>
            </div>
          </div>
          <Tip color="bg-green-50 border-green-200 text-green-700">
            💡 เมื่อเพิ่มลงหน้าจอแล้ว ระบบจะเก็บ login ไว้ ไม่ต้อง login ใหม่ทุกครั้ง และจะได้รับการแจ้งเตือนแม้ปิดแอปแล้ว
          </Tip>
        </>
      ),
    },

    /* ── 2. Header ── */
    {
      id: 'header',
      icon: <LayoutDashboard className="w-4 h-4" />,
      title: 'แถบด้านบน — ปุ่มที่ใช้บ่อย',
      content: (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '◀▶', bg: 'bg-slate-50 border-slate-200', label: 'เลื่อนดูเดือน', desc: 'กดซ้าย/ขวาสลับเดือนที่ต้องการดู' },
              { icon: '⇄', bg: 'bg-slate-50 border-slate-200', label: 'สลับมุมมอง', desc: 'ทุกเวร = ปฏิทินรวม | ของฉัน = เฉพาะเวรตัวเอง' },
              { icon: '↻', bg: 'bg-sky-50 border-sky-200', label: 'Refresh ข้อมูล', desc: 'กดเพื่อโหลดข้อมูลล่าสุดทันที', labelColor: 'text-sky-700' },
              { icon: '🔔', bg: 'bg-orange-50 border-orange-200', label: 'การแจ้งเตือน', desc: 'ตัวเลขแดง = มีการแจ้งเตือนที่ยังไม่ได้อ่าน', labelColor: 'text-orange-700' },
            ].map(b => (
              <div key={b.label} className={`flex items-start gap-2.5 p-3 rounded-xl border ${b.bg}`}>
                <span className="text-lg mt-0.5 flex-shrink-0">{b.icon}</span>
                <div>
                  <p className={`text-xs font-semibold ${b.labelColor || 'text-slate-700'}`}>{b.label}</p>
                  <p className="text-[11px] text-gray-500">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      ),
    },

    /* ── 3. Calendar ── */
    {
      id: 'calendar',
      icon: <CalendarDays className="w-4 h-4" />,
      title: 'ดูตารางเวร (มุมมองทุกคน)',
      content: (
        <>
          <p className="text-xs text-gray-500">ปฏิทินรวมของทุกคน แยกสีตามช่วงเวลา</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { emoji: '☀️', label: 'เช้า', time: '08:30–16:30', bg: '#E8F9FA', border: '#9FDCE0', color: '#134e4a' },
              { emoji: '🌤️', label: 'บ่าย', time: '16:30–00:00', bg: '#F3EDF8', border: '#9E76B4', color: '#581c87' },
              { emoji: '🌙', label: 'ดึก', time: '00:00–08:30', bg: '#EEF0FF', border: '#99ABFF', color: '#312e81' },
              { emoji: '🌅', label: 'รุ่งอรุณ', time: '07:00–08:30', bg: '#FEF3DC', border: '#FFCA72', color: '#78350f' },
            ].map(s => (
              <div key={s.label} className="text-center p-2.5 rounded-xl border"
                style={{ background: s.bg, borderColor: s.border }}>
                <p className="text-xl mb-1">{s.emoji}</p>
                <p className="text-xs font-bold" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[10px] text-gray-500">{s.time}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Tip color="bg-emerald-50 border-emerald-200 text-emerald-800">
              🖱️ <strong>กดที่วันในปฏิทิน</strong> เพื่อดูว่าใครขึ้นเวรในวันนั้นบ้าง
            </Tip>
            <Tip color="bg-slate-50 border-slate-200 text-slate-700">
              👆 <strong>กดที่ชื่อเพื่อนร่วมงาน</strong> เพื่อส่งคำขออยู่เวรแทน หรือแลกเวรกัน
            </Tip>
          </div>
        </>
      ),
    },

    /* ── 4. My Calendar ── */
    {
      id: 'myshift',
      icon: <CalendarDays className="w-4 h-4" />,
      title: 'มุมมอง "เวรของฉัน"',
      content: (
        <>
          <p className="text-xs text-gray-500">ดูเฉพาะเวรของตัวเอง พร้อมสรุปรายเดือน</p>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">สรุปเวรเดือนนี้ (Stats Bar)</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '☀️ เช้า ×3', bg: '#E8F9FA', border: '#9FDCE0', color: '#134e4a' },
                { label: '🌤️ บ่าย ×5', bg: '#F3EDF8', border: '#9E76B4', color: '#581c87' },
                { label: '🌙 ดึก ×4', bg: '#EEF0FF', border: '#99ABFF', color: '#312e81' },
                { label: '🌅 รุ่งอรุณ ×1', bg: '#FEF3DC', border: '#FFCA72', color: '#78350f' },
              ].map(p => (
                <span key={p.label} className="text-xs font-semibold px-2.5 py-1 rounded-lg border"
                  style={{ background: p.bg, borderColor: p.border, color: p.color }}>
                  {p.label}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-violet-50 border border-violet-200">
              <p className="text-xs font-semibold text-violet-800 mb-1">👆 กดที่แถบเวร</p>
              <p className="text-[11px] text-gray-500">เพื่อดูรายละเอียดว่าเวรนี้ได้มาจากไหน (มอบหมายตั้งแต่ต้น หรือแลก/รับมา)</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs font-semibold text-amber-800 mb-1">🟡 จุดสีเหลืองกะพริบ</p>
              <p className="text-[11px] text-gray-500">บอกว่ามีคำขอแลกเวรที่รอการตอบรับอยู่สำหรับเวรนี้</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-violet-200 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">ที่มาของเวร (3 แบบ)</p>
            <div className="p-2.5 rounded-lg border text-xs font-semibold text-slate-700"
              style={{ background: '#F8F5FC', borderColor: '#D8C8EC' }}>
              📋 ได้รับมอบหมายตั้งแต่ประกาศตารางเวร
            </div>
            <div className="p-2.5 rounded-lg border flex items-center gap-2 text-xs"
              style={{ background: '#EEF0FF', borderColor: '#99ABFF' }}>
              <span>🔀</span>
              <div>
                <p className="font-bold" style={{ color: '#4338ca' }}>แลกเวร</p>
                <p className="text-gray-500">เมื่อวันที่ ...</p>
              </div>
            </div>
            <div className="p-2.5 rounded-lg border flex items-center gap-2 text-xs"
              style={{ background: '#ecfdf5', borderColor: '#6ee7b7' }}>
              <span>✅</span>
              <div>
                <p className="font-bold text-emerald-700">รับเวร</p>
                <p className="text-gray-500">เมื่อวันที่ ...</p>
              </div>
            </div>
          </div>
        </>
      ),
    },

    /* ── 5. Swap ── */
    {
      id: 'swap',
      icon: <ArrowRightLeft className="w-4 h-4" />,
      title: 'ส่งคำขอแลกเวร / อยู่เวรแทน',
      content: (
        <>
          <p className="text-xs text-gray-500">มี 2 รูปแบบ เลือกได้ตามความต้องการ</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 space-y-2">
              <p className="font-bold text-emerald-800 text-xs">🙋 อยู่เวรแทน</p>
              <p className="text-[11px] text-gray-600">เรารับเวรของคนอื่น (คนอื่นต้องการให้ช่วย)</p>
              <div className="space-y-1.5">
                <Step n={1} color="bg-emerald-200 text-emerald-800">กดที่วันเวรของคนที่ต้องการช่วย</Step>
                <Step n={2} color="bg-emerald-200 text-emerald-800">กดที่ <strong>ชื่อเขา</strong> ในปฏิทิน</Step>
                <Step n={3} color="bg-emerald-200 text-emerald-800">เลือก <strong>"อยู่เวรแทน"</strong> แล้วกดส่ง</Step>
                <Step n={4} color="bg-emerald-200 text-emerald-800">รอเจ้าของเวรกด <strong>ยืนยัน</strong></Step>
              </div>
            </div>
            <div className="p-3 rounded-xl border-2 border-blue-200 bg-blue-50 space-y-2">
              <p className="font-bold text-blue-800 text-xs">⇄ แลกเวร</p>
              <p className="text-[11px] text-gray-600">สลับเวรกัน 2 ฝ่าย (ข้ามเดือนได้)</p>
              <div className="space-y-1.5">
                <Step n={1} color="bg-blue-200 text-blue-800">กดที่วันที่และเวรของคนที่ต้องการแลก</Step>
                <Step n={2} color="bg-blue-200 text-blue-800">เลือก <strong>"แลกเวร"</strong></Step>
                <Step n={3} color="bg-blue-200 text-blue-800">เลือกวันที่ของเราที่จะให้เขาอยู่แทน (เลื่อนเดือนได้)</Step>
                <Step n={4} color="bg-blue-200 text-blue-800">กดส่ง รออีกฝ่ายกด <strong>ยืนยัน</strong></Step>
              </div>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 text-center uppercase tracking-wide">ตัวอย่าง popup ที่จะเด้งขึ้นมา</p>
            <div className="max-w-[200px] mx-auto bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-100 px-3 py-2 flex justify-between">
                <p className="text-xs font-bold text-slate-700">ส่งคำขอ</p>
                <span className="text-slate-400 text-xs">✕</span>
              </div>
              <p className="text-[11px] text-gray-500 text-center px-3 py-2">เลือกประเภทสำหรับเวร <strong>บ่าย MED</strong></p>
              <div className="px-3 pb-3 flex gap-2">
                <div className="flex-1 border-2 border-emerald-200 bg-emerald-50 rounded-xl p-2 text-center">
                  <p className="text-base">🙋</p>
                  <p className="text-[10px] font-semibold text-emerald-700">อยู่เวรแทน</p>
                </div>
                <div className="flex-1 border-2 border-blue-200 bg-blue-50 rounded-xl p-2 text-center">
                  <p className="text-base">⇄</p>
                  <p className="text-[10px] font-semibold text-blue-700">แลกเวร</p>
                </div>
              </div>
            </div>
          </div>
        </>
      ),
    },

    /* ── 6. Notifications ── */
    {
      id: 'notifications',
      icon: <Bell className="w-4 h-4" />,
      title: 'การแจ้งเตือน & ตอบรับคำขอ',
      content: (
        <>
          <p className="text-xs text-gray-500">ระบบจะแจ้งเตือนทุกครั้งที่มีคำขอใหม่หรือเวรเปลี่ยนแปลง</p>
          <div className="space-y-1.5">
            {[
              { icon: '⇄', bg: 'bg-blue-50 border-blue-200', label: 'แลกเวร', labelColor: 'text-blue-700', desc: 'A เสนอแลกเวร...ของเขา กับเวร...ของคุณ' },
              { icon: '🙋', bg: 'bg-emerald-50 border-emerald-200', label: 'อยู่เวรแทน', labelColor: 'text-emerald-700', desc: 'A ต้องการขออยู่เวร...แทนคุณ' },
              { icon: '📤', bg: 'bg-purple-50 border-purple-200', label: 'โอนเวร', labelColor: 'text-purple-700', desc: 'A ต้องการยกเวร...ให้คุณ' },
              { icon: '📋', bg: 'bg-amber-50 border-amber-200', label: 'Admin มอบหมาย', labelColor: 'text-amber-700', desc: 'Admin เพิ่ม/เปลี่ยนเวรให้คุณ พร้อมรายละเอียดเวร' },
            ].map(n => (
              <div key={n.label} className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs ${n.bg}`}>
                <span className="text-base flex-shrink-0">{n.icon}</span>
                <div>
                  <span className={`font-semibold ${n.labelColor}`}>{n.label}</span>
                  <span className="text-gray-500"> — {n.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">วิธีตอบรับ / ปฏิเสธ</p>
            <div className="flex items-start gap-2 text-xs">
              <span>⇄</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-700">A ขอแลกเวร — บ่าย MED 5 เม.ย. 69</p>
                <div className="flex gap-2 mt-1.5">
                  <span className="px-3 py-1 bg-emerald-500 text-white rounded-full text-[11px] font-semibold">ยืนยัน</span>
                  <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-[11px] font-semibold">ปฏิเสธ</span>
                </div>
              </div>
            </div>
          </div>
          <Tip color="bg-rose-50 border-rose-200 text-rose-700">
            💡 กด <strong>"อนุญาต"</strong> ตอนที่เบราว์เซอร์ถามเรื่องการแจ้งเตือน เพื่อรับ push notification ทันทีแม้ไม่ได้เปิดแอปอยู่
          </Tip>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700">📱 เปิด push notification บนมือถือ</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-700">Android (Chrome)</p>
                <p className="text-gray-500">กด 🔒 ข้าง URL → สิทธิ์ → การแจ้งเตือน → อนุญาต → รีเฟรช</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-700">iPhone (iOS 16.4+)</p>
                <p className="text-gray-500">เพิ่มลงหน้าจอก่อน → ตั้งค่า → การแจ้งเตือน → เวรดี๊ดี → เปิด</p>
              </div>
            </div>
          </div>
        </>
      ),
    },

    /* ── 7. Profile ── */
    {
      id: 'profile',
      icon: <UserCog className="w-4 h-4" />,
      title: 'โปรไฟล์ & ตั้งค่าบัญชี',
      content: (
        <>
          <p className="text-xs text-gray-500">กดรูปโปรไฟล์ (วงกลมมุมขวาบน) เพื่อแก้ไขข้อมูลส่วนตัว</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '✏️', bg: 'bg-slate-50 border-slate-200', label: 'คำนำหน้า / ชื่อ / นามสกุล', desc: 'แก้ไขชื่อที่แสดงในระบบ', labelColor: 'text-slate-700' },
              { icon: '🏷️', bg: 'bg-violet-50 border-violet-200', label: 'ชื่อเล่น', desc: 'ชื่อที่แสดงบนตารางเวร', labelColor: 'text-violet-800' },
              { icon: '💼', bg: 'bg-blue-50 border-blue-200', label: 'เลขที่รับเงินเดือน', desc: 'ตรวจสอบและแก้ไขให้ถูกต้อง', labelColor: 'text-blue-800' },
              { icon: '🔐', bg: 'bg-amber-50 border-amber-200', label: 'เปลี่ยนรหัสผ่าน', desc: 'ปล่อยว่างถ้าไม่ต้องการเปลี่ยน', labelColor: 'text-amber-800' },
            ].map(f => (
              <div key={f.label} className={`flex items-center gap-2 p-2.5 rounded-xl border ${f.bg}`}>
                <span className="text-base flex-shrink-0">{f.icon}</span>
                <div>
                  <p className={`text-xs font-semibold ${f.labelColor}`}>{f.label}</p>
                  <p className="text-[11px] text-gray-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Tip color="bg-blue-50 border-blue-200 text-blue-800">
            💼 <strong>เลขที่เงินเดือน</strong> ใช้สำหรับออกหลักฐานเบิกค่าตอบแทน กรุณาตรวจสอบให้ถูกต้องทุกครั้ง
          </Tip>
          <Tip color="bg-red-50 border-red-200 text-red-700">
            🚪 <strong>ออกจากระบบ</strong> — กดปุ่มออกจากระบบในแถบบน ระบบจะถามยืนยัน 1 ครั้งก่อนออก
          </Tip>
        </>
      ),
    },

    /* ── 8. Export ── */
    {
      id: 'export',
      icon: <Printer className="w-4 h-4" />,
      title: 'ตารางเวร Excel & ค่าตอบแทน',
      content: (
        <>
          <p className="text-xs text-gray-500">ปุ่มอยู่บน Header ฝั่งขวา ใช้ได้ในหน้าปฏิทินรวม</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border-2 border-green-200 bg-green-50 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <p className="text-xs font-bold text-green-800">ตารางเวร Excel</p>
              </div>
              <p className="text-[11px] text-gray-600">ดาวน์โหลดตารางเวรเป็นไฟล์ <strong>.xlsx</strong> สำหรับปริ้นติดบอร์ดหรือเก็บเป็นไฟล์สำรอง</p>
            </div>
            <div className="p-3 rounded-xl border-2 border-amber-200 bg-amber-50 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">💰</span>
                <p className="text-xs font-bold text-amber-800">ค่าตอบแทน</p>
              </div>
              <p className="text-[11px] text-gray-600">ดูสรุปค่าตอบแทนของตัวเอง — เวรประเภทไหน วันที่เท่าไหร่ ระบบคำนวณให้อัตโนมัติ</p>
            </div>
          </div>
          <Tip color="bg-amber-50 border-amber-200 text-amber-800">
            ⚠️ ตรวจสอบ <strong>ชื่อ-นามสกุล</strong> และ <strong>เลขที่เงินเดือน</strong> ในโปรไฟล์ให้ถูกต้องเสมอ เพราะข้อมูลนี้ใช้เป็นหลักฐานเบิกค่าตอบแทน
          </Tip>
        </>
      ),
    },
  ];

  // Admin sections
  if (isAdmin) {
    sections.push(
      {
        id: 'admin-upload',
        icon: <Upload className="w-4 h-4" />,
        title: '(Admin) อัปโหลดตารางเวร',
        content: (
          <>
            <div className="space-y-2">
              <p className="font-medium text-gray-800 text-xs">📤 อัปโหลดจาก Excel</p>
              <div className="space-y-1.5">
                <Step n={1} color="bg-gray-100 text-gray-700">กดเมนู <strong>"อัปโหลดเวร"</strong></Step>
                <Step n={2} color="bg-gray-100 text-gray-700">เลือกเดือน/ปี และตำแหน่ง</Step>
                <Step n={3} color="bg-gray-100 text-gray-700">เลือกไฟล์ Excel (.xlsx) ที่จัดเตรียมไว้</Step>
                <Step n={4} color="bg-gray-100 text-gray-700">ตรวจสอบข้อมูลแล้วกด <strong>"อัปโหลด"</strong></Step>
              </div>
            </div>
            <Tip color="bg-blue-50 border-blue-200 text-blue-700">
              📋 ตรวจสอบตัวย่อเวรของแต่ละตำแหน่งได้ใน Modal อัปโหลดเวร กดที่ <strong>"📋 ตัวย่อเวรแต่ละตำแหน่ง"</strong>
            </Tip>
          </>
        ),
      },
      {
        id: 'admin-manage',
        icon: <Shield className="w-4 h-4" />,
        title: '(Admin) จัดการผู้ใช้ / ประกาศเวร / แก้ไขเวร',
        content: (
          <>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1.5">👥 จัดการผู้ใช้</p>
                <ul className="space-y-1 text-[11px] text-gray-600 list-disc list-inside pl-1">
                  <li>เพิ่ม / แก้ไข / เปิด-ปิดสถานะผู้ใช้</li>
                  <li>รีเซ็ตรหัสผ่านเป็น <code className="bg-gray-100 px-1 rounded">1234</code></li>
                  <li>ตั้งค่า Sub-Admin ได้</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1.5">📢 ประกาศตารางเวร</p>
                <ul className="space-y-1 text-[11px] text-gray-600 list-disc list-inside pl-1">
                  <li>กดเมนู <strong>"ประกาศเวร"</strong> → เลือกเดือน/ปี และตำแหน่ง</li>
                  <li>กด <strong>"ยืนยันประกาศ"</strong> — ระบบจะแจ้งเตือนทุกคนอัตโนมัติ</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1.5">✏️ แก้ไขเวรในปฏิทิน</p>
                <ul className="space-y-1 text-[11px] text-gray-600 list-disc list-inside pl-1">
                  <li>กดเปิดโหมด <strong>"แก้ไข"</strong> → กดชื่อเพื่อเปลี่ยนคน / ลบ / เพิ่มเวรใหม่</li>
                  <li>กด <strong>"ยืนยันการเปลี่ยนแปลง"</strong> พร้อมใส่รหัสผ่าน</li>
                </ul>
              </div>
            </div>
          </>
        ),
      },
      {
        id: 'admin-export',
        icon: <Download className="w-4 h-4" />,
        title: '(Admin) Export หลักฐาน / ไฟล์เซ็นเวร',
        content: (
          <>
            <div className="space-y-2 text-xs text-gray-600">
              <p className="font-semibold text-gray-700">📄 ประเภท Export</p>
              <ul className="space-y-1.5 list-disc list-inside pl-1">
                <li><strong>ตารางเวร Excel</strong> — ตารางรวมทุกคน สำหรับปริ้นติดบอร์ด</li>
                <li><strong>ไฟล์เซ็นเวร</strong> — ใบเซ็นชื่อแยกแผนก</li>
                <li><strong>หลักฐานการจัดตาราง</strong> — ใช้ยื่นค่าตอบแทน</li>
                <li><strong>ค่าตอบแทน</strong> — สรุปค่าตอบแทนรายบุคคล</li>
              </ul>
            </div>
          </>
        ),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag indicator */}
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">วิธีการใช้งานเบื้องต้น</h2>
              <p className="text-[10px] text-gray-400">เวรดี๊ดี — Pharmacy Shift Management</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {sections.map(section => (
            <AccordionItem
              key={section.id}
              section={section}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}

          {/* Tips summary */}
          <div className="rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 p-4 text-white">
            <p className="text-xs font-bold mb-3 text-center">⭐ เทคนิคที่ควรรู้</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                'กด ↻ Refresh ถ้าตารางดูไม่อัปเดต',
                'แลกเวรข้ามเดือนได้! เลื่อนเดือนในปฏิทินเล็กได้เลย',
                'จุดสีเหลือง 🟡 = มีคำขอรอ ต้องรีบตอบ',
                'กดที่แถบเวรใน "เวรของฉัน" เพื่อดูว่าเวรมาจากไหน',
                'การแลก/โอน/รับเวรจะอัปเดตตารางทันทีหลังยืนยัน',
                'กดปุ่ม ? ใน header เพื่อดูวิธีใช้ได้ตลอด',
              ].map(tip => (
                <div key={tip} className="flex items-start gap-1.5">
                  <span className="text-yellow-300 flex-shrink-0">✦</span>
                  <p>{tip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[10px] text-center text-gray-400">
            กลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์ © {new Date().getFullYear() + 543}
          </p>
        </div>
      </div>
    </div>
  );
}
