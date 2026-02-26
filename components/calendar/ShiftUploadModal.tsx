'use client';

import { useState } from 'react';
import { X, Upload, FileDown, Loader2, CheckCircle2, AlertCircle, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ShiftUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ShiftUploadModal({ onClose, onSuccess }: ShiftUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorDesc, setErrorDesc] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  // Overwrite confirmation state
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const currentYear = new Date().getFullYear();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setErrorDesc([]);
      setSuccessMsg('');
      setShowOverwriteConfirm(false);
      setPassword1('');
      setPassword2('');
      setPasswordError('');
    }
  };

  const doUpload = async (overwrite = false, adminPassword?: string) => {
    if (!file) {
      toast.error('กรุณาเลือกไฟล์ Excel ก่อน');
      return;
    }

    setLoading(true);
    setErrorDesc([]);
    setSuccessMsg('');
    setPasswordError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('month', month.toString());
    formData.append('year', year.toString());
    if (overwrite) {
      formData.append('overwrite', 'true');
      formData.append('admin_password', adminPassword || '');
    }

    try {
      const res = await fetch('/api/shifts/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      // Handle "month already has data" response
      if (res.status === 409 && data.error === 'MONTH_HAS_DATA') {
        setExistingCount(data.existingCount);
        setShowOverwriteConfirm(true);
        setLoading(false);
        return;
      }

      // Handle wrong password
      if (res.status === 403) {
        setPasswordError(data.error || 'รหัสผ่านไม่ถูกต้อง');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการอัปโหลด');
      }

      setSuccessMsg(data.message);
      setShowOverwriteConfirm(false);
      if (data.errors && data.errors.length > 0) {
        setErrorDesc(data.errors);
        toast.warning('อัปโหลดสำเร็จบางส่วน มีบางแถวที่ผิดพลาด');
      } else {
        toast.success('อัปโหลดสำเร็จแล้ว');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      toast.error(err.message);
      setErrorDesc([err.message]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = () => doUpload(false);

  const handleOverwriteConfirm = () => {
    setPasswordError('');
    if (!password1 || !password2) {
      setPasswordError('กรุณากรอกรหัสผ่านทั้ง 2 ช่อง');
      return;
    }
    if (password1 !== password2) {
      setPasswordError('รหัสผ่านทั้ง 2 ช่องไม่ตรงกัน');
      return;
    }
    doUpload(true, password1);
  };

  const thaiMonths = Array.from({ length: 12 }).map((_, i) => 
    new Date(2000, i, 1).toLocaleString('th-TH', { month: 'long' })
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="gradient-header px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">เพิ่มเวร (Excel)</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border border-blue-100 flex items-start gap-3">
            <FileDown className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
            <div>
              <p className="font-semibold mb-1">ดาวน์โหลดไฟล์ตัวอย่าง</p>
              <p className="text-blue-700/80 mb-2">ใช้ไฟล์นี้เป็นแบบฟอร์มเพื่อกรอกข้อมูลเวรที่จะโยนเข้าระบบ (ใส่ชื่อเวรย่อในแต่ละวัน)</p>
              <a href="/sample_shifts.xlsx" download className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-blue-700 font-medium hover:bg-blue-50 transition-colors shadow-sm">
                <FileDown className="w-4 h-4" />
                ดาวน์โหลด Excel
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">เดือน</label>
              <select 
                value={month} 
                onChange={(e) => { setMonth(parseInt(e.target.value)); setShowOverwriteConfirm(false); }}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-sm"
              >
                {thaiMonths.map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">ปี</label>
              <select 
                value={year} 
                onChange={(e) => { setYear(parseInt(e.target.value)); setShowOverwriteConfirm(false); }}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-sm"
              >
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
                  <option key={y} value={y}>{y + 543}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">อัปโหลดไฟล์ Excel (.xlsx)</label>
            <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-6 hover:bg-gray-50 transition-colors text-center cursor-pointer">
              <input 
                type="file" 
                accept=".xlsx" 
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2 pointer-events-none">
                <Upload className={cn("w-8 h-8", file ? "text-violet-500" : "text-gray-400")} />
                {file ? (
                  <p className="text-sm font-medium text-violet-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700">คลิก หรือ ลากไฟล์ลงที่นี่</p>
                    <p className="text-xs text-gray-500">รองรับเฉพาะไฟล์ .xlsx</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Overwrite Confirmation Section ── */}
          {showOverwriteConfirm && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-amber-50 border-2 border-amber-300 text-amber-800 rounded-xl">
                <div className="flex gap-2 items-center font-bold text-base mb-2">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  ⚠️ พบข้อมูลเวรเดิมในเดือนนี้
                </div>
                <p className="text-sm mb-1">
                  เดือน <strong>{thaiMonths[month - 1]} {year + 543}</strong> มีเวรอยู่แล้ว <strong className="text-red-600">{existingCount} รายการ</strong>
                </p>
                <p className="text-sm text-amber-700">
                  หากยืนยัน ข้อมูลเวรเดิมทั้งหมดจะถูก <strong className="text-red-600">ลบทิ้ง</strong> และแทนที่ด้วยข้อมูลจากไฟล์ใหม่ <strong>การกระทำนี้ไม่สามารถย้อนกลับได้</strong>
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700">กรุณาใส่รหัสผ่าน Admin 2 ครั้ง เพื่อยืนยัน</p>
                
                <div className="space-y-1">
                  <label className="block text-xs text-gray-500">รหัสผ่าน Admin (ครั้งที่ 1)</label>
                  <div className="relative">
                    <input
                      type={showPassword1 ? 'text' : 'password'}
                      value={password1}
                      onChange={(e) => { setPassword1(e.target.value); setPasswordError(''); }}
                      placeholder="ใส่รหัสผ่าน..."
                      className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 pr-10 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400 transition-all shadow-sm"
                    />
                    <button type="button" onClick={() => setShowPassword1(!showPassword1)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-gray-500">รหัสผ่าน Admin (ครั้งที่ 2)</label>
                  <div className="relative">
                    <input
                      type={showPassword2 ? 'text' : 'password'}
                      value={password2}
                      onChange={(e) => { setPassword2(e.target.value); setPasswordError(''); }}
                      placeholder="ใส่รหัสผ่านอีกครั้ง..."
                      className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 pr-10 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400 transition-all shadow-sm"
                    />
                    <button type="button" onClick={() => setShowPassword2(!showPassword2)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {passwordError && (
                  <p className="text-sm text-red-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> {passwordError}
                  </p>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex gap-2 items-center">
              <CheckCircle2 className="w-5 h-5" />
              {successMsg}
            </div>
          )}

          {errorDesc.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex flex-col gap-2 max-h-32 overflow-y-auto">
              <div className="flex gap-2 items-center font-bold">
                <AlertCircle className="w-5 h-5" /> พบข้อผิดพลาด
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                {errorDesc.map((e, idx) => <li key={idx}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="pt-2">
            {showOverwriteConfirm ? (
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowOverwriteConfirm(false); setPassword1(''); setPassword2(''); setPasswordError(''); }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-xl shadow-sm transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleOverwriteConfirm}
                  disabled={loading || !password1 || !password2}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      กำลังวางทับ...
                    </>
                  ) : (
                    '🗑️ ยืนยันวางทับ'
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    กำลังอัปโหลด...
                  </>
                ) : (
                  'ยืนยันการเพิ่มเวร'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
