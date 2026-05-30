'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coins, Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  COMPENSATION_CATEGORIES,
  COMPENSATION_ROLE_LABELS,
  DEFAULT_COMPENSATION_RATES,
  STAFF_COMPENSATION_ROLES,
  compensationRatesToRows,
  normalizeCompensationRates,
  type CompensationCategoryKey,
  type CompensationRateRow,
  type CompensationRatesMap,
  type StaffCompensationRole,
} from '@/lib/compensation';

type DraftRates = Record<CompensationCategoryKey, Record<StaffCompensationRole, string>>;

function toDraftRates(rates: CompensationRatesMap): DraftRates {
  return COMPENSATION_CATEGORIES.reduce((acc, category) => {
    acc[category.key] = STAFF_COMPENSATION_ROLES.reduce((roleAcc, role) => {
      roleAcc[role] = String(rates[category.key][role]);
      return roleAcc;
    }, {} as Record<StaffCompensationRole, string>);
    return acc;
  }, {} as DraftRates);
}

function parseDraftRates(draft: DraftRates): CompensationRateRow[] {
  return COMPENSATION_CATEGORIES.flatMap((category) =>
    STAFF_COMPENSATION_ROLES.map((role) => {
      const rawRate = draft[category.key][role].trim();
      const rate = Number(rawRate);
      if (rawRate === '') {
        throw new Error(`กรุณากรอกอัตราของ ${category.name} / ${COMPENSATION_ROLE_LABELS[role]}`);
      }
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error(`กรุณาตรวจสอบอัตราของ ${category.name} / ${COMPENSATION_ROLE_LABELS[role]}`);
      }
      return {
        category: category.key,
        role,
        rate,
      };
    }),
  );
}

export function AdminCompensationSettingsModal() {
  const [draftRates, setDraftRates] = useState<DraftRates>(() =>
    toDraftRates(normalizeCompensationRates()),
  );
  const [savedRates, setSavedRates] = useState<DraftRates>(() =>
    toDraftRates(normalizeCompensationRates()),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(
    () => JSON.stringify(draftRates) !== JSON.stringify(savedRates),
    [draftRates, savedRates],
  );

  useEffect(() => {
    fetchRates();
  }, []);

  async function fetchRates() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/compensation-rates');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'โหลดอัตราค่าตอบแทนไม่สำเร็จ');

      const nextDraft = toDraftRates(normalizeCompensationRates(data.rates));
      setDraftRates(nextDraft);
      setSavedRates(nextDraft);
    } catch (error: any) {
      toast.error(error.message || 'โหลดอัตราค่าตอบแทนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function updateRate(
    category: CompensationCategoryKey,
    role: StaffCompensationRole,
    value: string,
  ) {
    setDraftRates((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [role]: value,
      },
    }));
  }

  function resetToDefaults() {
    setDraftRates(toDraftRates(DEFAULT_COMPENSATION_RATES));
  }

  async function handleSave() {
    let rows: CompensationRateRow[];
    try {
      rows = parseDraftRates(draftRates);
    } catch (error: any) {
      toast.error(error.message);
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/admin/compensation-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates: rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'บันทึกอัตราค่าตอบแทนไม่สำเร็จ');

      const nextDraft = toDraftRates(normalizeCompensationRates(data.rates));
      setDraftRates(nextDraft);
      setSavedRates(nextDraft);
      toast.success('บันทึกอัตราค่าตอบแทนแล้ว');
    } catch (error: any) {
      toast.error(error.message || 'บันทึกอัตราค่าตอบแทนไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const defaultRows = compensationRatesToRows(DEFAULT_COMPENSATION_RATES);

  return (
    <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Coins className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-800">อัตราค่าตอบแทนเวร</h3>
              <p className="text-xs text-gray-500 truncate">กำหนดแยกตามประเภทเวรและ role</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={resetToDefaults}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              ค่าเริ่มต้น
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || !isDirty}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              บันทึก
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">กำลังโหลดอัตราค่าตอบแทน...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold w-56">ประเภทเวร</th>
                  <th className="px-4 py-3 text-left font-semibold w-32">หน่วย</th>
                  {STAFF_COMPENSATION_ROLES.map((role) => (
                    <th key={role} className="px-4 py-3 text-left font-semibold w-48">
                      {COMPENSATION_ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {COMPENSATION_CATEGORIES.map((category) => (
                  <tr key={category.key} className="bg-white">
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold text-gray-800">{category.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {category.unitValue.toLocaleString('th-TH')} {category.unitLabel}/รายการ
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-600">{category.rateLabel}</td>
                    {STAFF_COMPENSATION_ROLES.map((role) => {
                      const defaultRate = defaultRows.find(
                        (row) => row.category === category.key && row.role === role,
                      )?.rate;

                      return (
                        <td key={role} className="px-4 py-3 align-top">
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draftRates[category.key][role]}
                              onChange={(event) => updateRate(category.key, role, event.target.value)}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">บาท</span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-1">
                            ค่าเริ่มต้น {defaultRate?.toLocaleString('th-TH') ?? '-'} บาท
                          </p>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
