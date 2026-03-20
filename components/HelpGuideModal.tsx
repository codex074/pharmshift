'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronUp, BookOpen, Smartphone, Bell, ArrowRightLeft, Shield, CalendarDays, Upload, UserCog, Download, HelpCircle } from 'lucide-react';
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
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-violet-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-2 bg-white text-sm text-gray-600 space-y-3 animate-fade-in">
          {section.content}
        </div>
      )}
    </div>
  );
}

export function HelpGuideModal({ onClose, isAdmin }: HelpGuideModalProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['basic']));

  function toggleSection(id: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sections: Section[] = [
    {
      id: 'basic',
      icon: <CalendarDays className="w-4 h-4" />,
      title: 'การดูตารางเวร',
      content: (
        <>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">📅 มุมมองปฏิทิน</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>หน้าหลักจะแสดงตารางเวรเป็นรายเดือน</li>
              <li>กดปุ่ม <strong>◀ ▶</strong> เพื่อเปลี่ยนเดือน</li>
              <li>กดที่ <strong>วันที่</strong> เพื่อดูรายละเอียดเวรของวันนั้น</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">👀 สลับมุมมอง</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>"ทุกเวร"</strong> — ดูเวรของทุกคน</li>
              <li><strong>"เวรของฉัน"</strong> — ดูเฉพาะเวรของตัวเองแบบ Timeline</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">📋 เวรของฉัน (Timeline)</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>กดที่วันที่ในมุมมอง "เวรของฉัน" จะเห็นเวรแบบ Timeline เรียงตามช่วงเวลา</li>
              <li>ลำดับ: รุ่งอรุณ → เช้า → SMC → บ่าย → ดึก</li>
              <li>แต่ละเวรจะแสดงชื่อแผนก สีแยกตำแหน่ง และรายชื่อผู้อยู่เวร</li>
            </ul>
          </div>
        </>
      ),
    },
    {
      id: 'swap',
      icon: <ArrowRightLeft className="w-4 h-4" />,
      title: 'การขอให้อยู่แทน / ขออยู่เวรแทน',
      content: (
        <>
          <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
            <p className="font-medium text-violet-800 mb-1">📌 ขอให้ผู้อื่นมาอยู่เวรแทน</p>
            <ol className="list-decimal list-inside space-y-1 text-violet-700 text-xs">
              <li>กดที่วันที่ → กดชื่อ <strong>ตัวเอง</strong> ในรายละเอียดเวร</li>
              <li>เลือกชื่อผู้ที่ต้องการให้มาอยู่แทน</li>
              <li>เพิ่มหมายเหตุ (ถ้ามี) แล้วกด <strong>"ส่งคำขอให้อยู่แทน"</strong></li>
              <li>ระบบจะแจ้งเตือนไปยังปลายทาง รอให้อีกฝ่ายกดยอมรับ</li>
            </ol>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="font-medium text-amber-800 mb-1">🙋 ขอมาอยู่เวรแทนผู้อื่น</p>
            <ol className="list-decimal list-inside space-y-1 text-amber-700 text-xs">
              <li>กดที่วันที่ → กดชื่อ <strong>คนอื่น</strong> ที่ต้องการอยู่แทน</li>
              <li>เพิ่มหมายเหตุ (ถ้ามี) แล้วกด <strong>"ส่งคำขออยู่เวรแทน"</strong></li>
              <li>ระบบจะแจ้งเตือนเจ้าของเวร รอให้เจ้าของเวรกดยอมรับ</li>
            </ol>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">📬 การตอบรับ/ปฏิเสธคำขอ</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>เมื่อมีคำขอเข้ามา จะเห็นจุดแดงที่ 🔔 แจ้งเตือน</li>
              <li>กดเปิดแจ้งเตือน → กด <strong>"ยอมรับ"</strong> หรือ <strong>"ปฏิเสธ"</strong></li>
              <li>หากมีเวรทับซ้อน ระบบจะเตือนก่อน แต่ยังสามารถยืนยันได้</li>
              <li>เมื่อยอมรับแล้ว คำขออื่นที่เหลือของเวรเดียวกันจะถูกยกเลิกอัตโนมัติ</li>
            </ul>
          </div>
        </>
      ),
    },
    {
      id: 'notifications',
      icon: <Bell className="w-4 h-4" />,
      title: 'การแจ้งเตือน',
      content: (
        <>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">🔔 ประเภทการแจ้งเตือน</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong>คำขอให้อยู่แทน / ขออยู่เวรแทน</strong> — เมื่อมีคนส่งคำขอ</li>
              <li><strong>ตอบรับ / ปฏิเสธ</strong> — ผลลัพธ์คำขอของคุณ</li>
              <li><strong>ประกาศตารางเวร</strong> — เมื่อ Admin ประกาศเวรใหม่</li>
              <li><strong>เตือนเวร</strong> — แจ้งเตือนวันนี้/พรุ่งนี้คุณมีเวร</li>
              <li><strong>เวรถูกแก้ไข / ลบ / เพิ่ม</strong> — เมื่อ Admin แก้ไขเวร</li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
            <p className="font-medium text-blue-800">📱 เปิดใช้งานการแจ้งเตือนบนมือถือ</p>
            <p className="text-xs text-blue-700">ระบบจะขออนุญาตแจ้งเตือนเมื่อล็อกอินครั้งแรก หากกด "ไม่อนุญาต" ไปแล้ว สามารถแก้ไขได้ดังนี้:</p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">Android (Chrome)</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-xs">
              <li>เปิด Chrome → แตะ <strong>🔒 ไอคอนแม่กุญแจ</strong> ข้าง URL</li>
              <li>แตะ <strong>"สิทธิ์"</strong> หรือ <strong>"การอนุญาต"</strong></li>
              <li>เปลี่ยน <strong>การแจ้งเตือน → อนุญาต</strong></li>
              <li>รีเฟรชหน้าเว็บ</li>
            </ol>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">iPhone / iPad (iOS 16.4+)</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-xs">
              <li>ต้อง <strong>เพิ่มเว็บแอปลงหน้าจอ</strong> ก่อน (ดูหัวข้อ "เพิ่มลงหน้าจอ")</li>
              <li>ไปที่ <strong>ตั้งค่า → การแจ้งเตือน</strong></li>
              <li>เลื่อนหาชื่อ <strong>"เวรดี๊ดี"</strong></li>
              <li>เปิด <strong>อนุญาตการแจ้งเตือน</strong></li>
            </ol>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">คอมพิวเตอร์ (Chrome / Edge)</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-xs">
              <li>คลิก <strong>🔒 ไอคอนแม่กุญแจ</strong> ข้าง URL</li>
              <li>คลิก <strong>"Site settings"</strong></li>
              <li>หา <strong>Notifications → Allow</strong></li>
              <li>รีเฟรชหน้าเว็บ</li>
            </ol>
          </div>
        </>
      ),
    },
    {
      id: 'pwa',
      icon: <Smartphone className="w-4 h-4" />,
      title: 'เพิ่มเว็บแอปลงหน้าจอ (PWA)',
      content: (
        <>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">📱 Android</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-xs">
              <li>เปิดเว็บแอปใน <strong>Chrome</strong></li>
              <li>แตะ <strong>⋮</strong> (จุด 3 จุด) มุมขวาบน</li>
              <li>แตะ <strong>"เพิ่มลงในหน้าจอหลัก"</strong> หรือ <strong>"ติดตั้งแอป"</strong></li>
              <li>กด <strong>"ติดตั้ง"</strong> หรือ <strong>"เพิ่ม"</strong></li>
              <li>ไอคอน <strong>"เวรดี๊ดี"</strong> จะปรากฏที่หน้าจอหลัก</li>
            </ol>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">🍎 iPhone / iPad</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-xs">
              <li>เปิดเว็บแอปใน <strong>Safari</strong> (ต้องใช้ Safari เท่านั้น)</li>
              <li>แตะไอคอน <strong>แชร์</strong> (กล่องมีลูกศรขึ้น) ด้านล่าง</li>
              <li>เลื่อนลงแล้วแตะ <strong>"เพิ่มในหน้าจอโฮม"</strong></li>
              <li>กด <strong>"เพิ่ม"</strong></li>
              <li>เปิดจากหน้าจอหลัก — จะได้แอปแบบเต็มจอไม่มี address bar</li>
            </ol>
          </div>
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <p className="text-xs text-green-700">
              💡 <strong>เคล็ดลับ:</strong> เมื่อเพิ่มลงหน้าจอแล้ว ระบบจะเก็บ login ไว้ ไม่ต้อง login ใหม่ทุกครั้ง และจะได้รับการแจ้งเตือนแม้ปิดแอปไปแล้ว
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'profile',
      icon: <UserCog className="w-4 h-4" />,
      title: 'แก้ไขข้อมูลส่วนตัว / เปลี่ยนรหัสผ่าน',
      content: (
        <>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">👤 แก้ไขข้อมูลส่วนตัว</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-xs">
              <li>กดที่ <strong>ชื่อของคุณ</strong> หรือ <strong>ไอคอนโปรไฟล์</strong> ที่มุมขวาบน</li>
              <li>แก้ไขชื่อ นามสกุล ชื่อเล่น หรืออัปโหลดรูปโปรไฟล์</li>
              <li>กด <strong>"บันทึก"</strong></li>
            </ol>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-800">🔑 เปลี่ยนรหัสผ่าน</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-xs">
              <li>กดที่โปรไฟล์ → กด <strong>"เปลี่ยนรหัสผ่าน"</strong></li>
              <li>กรอกรหัสผ่านเดิม และรหัสผ่านใหม่ 2 ครั้ง</li>
              <li>กด <strong>"ยืนยัน"</strong></li>
            </ol>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-700">
              ⚠️ <strong>รหัสผ่านเริ่มต้น:</strong> <code className="bg-amber-100 px-1 rounded">1234</code> — ระบบจะบังคับให้เปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก
            </p>
          </div>
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
              <p className="font-medium text-gray-800">📤 อัปโหลดจาก Excel</p>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-xs">
                <li>กดเมนู <strong>"อัปโหลดเวร"</strong></li>
                <li>เลือกเดือน/ปี และตำแหน่ง</li>
                <li>เลือกไฟล์ Excel (.xlsx) ที่จัดเตรียมไว้</li>
                <li>ตรวจสอบข้อมูลแล้วกด <strong>"อัปโหลด"</strong></li>
              </ol>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-gray-800">📝 ตัวย่อเวรในไฟล์ Excel</p>
              <p className="text-xs">ตรวจสอบตัวย่อเวรของแต่ละตำแหน่งได้ใน Modal อัปโหลดเวร กดที่ <strong>"📋 ตัวย่อเวรแต่ละตำแหน่ง"</strong></p>
            </div>
          </>
        ),
      },
      {
        id: 'admin-manage',
        icon: <Shield className="w-4 h-4" />,
        title: '(Admin) จัดการผู้ใช้ / ประกาศเวร',
        content: (
          <>
            <div className="space-y-2">
              <p className="font-medium text-gray-800">👥 จัดการผู้ใช้</p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-xs">
                <li>เพิ่ม / แก้ไข / เปิด-ปิดสถานะผู้ใช้</li>
                <li>รีเซ็ตรหัสผ่านเป็น <code className="bg-gray-100 px-1 rounded">1234</code></li>
                <li>ตั้งค่า Sub-Admin ได้</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-gray-800">📢 ประกาศตารางเวร</p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-xs">
                <li>กดเมนู <strong>"ประกาศเวร"</strong></li>
                <li>เลือกเดือน/ปี และตำแหน่ง</li>
                <li>กด <strong>"ยืนยันประกาศ"</strong> — ระบบจะแจ้งเตือนทุกคนอัตโนมัติ</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-gray-800">✏️ แก้ไขเวรในปฏิทิน</p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-xs">
                <li>กดเปิดโหมด <strong>"แก้ไข"</strong> ในปฏิทิน</li>
                <li>กดชื่อเพื่อเปลี่ยนคน / กดลบเวร / กดเพิ่มเวรใหม่</li>
                <li>ตรวจสอบแล้วกด <strong>"ยืนยันการเปลี่ยนแปลง"</strong> พร้อมใส่รหัสผ่าน</li>
                <li>ระบบจะแจ้งเตือนผู้ที่ได้รับผลกระทบอัตโนมัติ</li>
              </ul>
            </div>
          </>
        ),
      },
      {
        id: 'admin-export',
        icon: <Download className="w-4 h-4" />,
        title: '(Admin) Export ตารางเวร',
        content: (
          <>
            <div className="space-y-2">
              <p className="font-medium text-gray-800">📄 Export PDF</p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-xs">
                <li>กดเมนู <strong>"Export"</strong></li>
                <li>เลือกประเภท: <strong>ไฟล์เซ็นเวร</strong> หรือ <strong>หลักฐานการจัดตาราง</strong></li>
                <li>เลือกเดือน/ปี แล้วกด <strong>"Export"</strong></li>
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
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-slide-up"
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
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
          >
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
