'use client';

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';

interface PdfExportButtonProps {
  targetId: string;
  filename: string;
}

export function PdfExportButton({ targetId, filename }: PdfExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    const element = document.getElementById(targetId);
    if (!element) {
      toast.error('ไม่พบส่วนที่ต้องการส่งออก');
      return;
    }

    try {
      setLoading(true);

      // Add a specific class to body for printing styles if needed
      document.body.classList.add('exporting-pdf');

      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200, // Force a desktop width layout
      });

      document.body.classList.remove('exporting-pdf');

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // A4 format is 210x297mm. We use landscape: 297x210
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10; // small top margin

      pdf.addImage(imgData, 'JPEG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`${filename}.pdf`);
      
      toast.success('ส่งออก PDF เรียบร้อยแล้ว');
    } catch (err) {
      console.error(err);
      document.body.classList.remove('exporting-pdf');
      toast.error('ไม่สามารถส่งออก PDF ได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm font-semibold shadow-md shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-200"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
      Export PDF
    </button>
  );
}
