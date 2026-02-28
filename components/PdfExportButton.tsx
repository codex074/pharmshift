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
        // Use 1400px to ensure the relative font sizes don't become microscopic when scaled down to A4
        windowWidth: 1400,
        // Wait for elements to be fully rendered
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById(targetId);
          if (el) {
            // Force the element to stay within the simulated wide window
            el.style.width = '1400px';
            el.style.maxWidth = '1400px';
          }
        }
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
      
      // Minimal margin (2mm each side) to fill A4 as requested
      const horizontalMargin = 4;
      const verticalMargin = 4;
      
      const ratio = Math.min((pdfWidth - horizontalMargin) / imgWidth, (pdfHeight - verticalMargin) / imgHeight);
      
      const adjustedWidth = imgWidth * ratio;
      const adjustedHeight = imgHeight * ratio;

      const imgX = (pdfWidth - adjustedWidth) / 2;
      const imgY = 2; // 2mm top margin

      pdf.addImage(imgData, 'JPEG', imgX, imgY, adjustedWidth, adjustedHeight);
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
