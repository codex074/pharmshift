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
        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 font-medium px-4 py-2 rounded-xl text-sm transition-colors shadow-sm flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Excel (ค่าตอบแทน)
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
