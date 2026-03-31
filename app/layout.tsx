import type { Metadata } from 'next';
import { Inter, Sarabun } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { PWAProvider } from '@/components/pwa/PWAProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'เวรดี๊ดี — ระบบจัดการตารางเวร',
  description: 'ระบบจัดการตารางเวร โรงพยาบาลอุตรดิตถ์',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'เวรดี๊ดี',
  },
};

export const viewport = {
  themeColor: '#8b5cf6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={`${inter.variable} ${sarabun.variable}`}>
      <body className="min-h-screen bg-background antialiased">
        {children}
        <Toaster richColors position="top-right" />
        <PWAProvider />
      </body>
    </html>
  );
}
