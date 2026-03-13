import { useState } from 'react';
import { Download } from 'lucide-react';
import { CompensationExportModal } from './calendar/CompensationExportModal';

interface Props {
  year: number;
  month: number;
}

export function ExcelExportButton({ year, month }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 font-medium px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-1.5"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Excel (ค่าตอบแทน)</span>
        <span className="sm:hidden">Excel</span>
      </button>

      {showModal && (
        <CompensationExportModal
          defaultMonth={month}
          defaultYear={year}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
