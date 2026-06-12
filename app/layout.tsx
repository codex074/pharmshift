import type { Metadata } from 'next';
import { Inter, Sarabun } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { PWAProvider } from '@/components/pwa/PWAProvider';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

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
        {/* ดักจับ beforeinstallprompt ก่อน React hydrate — ไม่งั้น event ที่ยิงเร็วจะหายไป */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaInstallEvent=e;window.dispatchEvent(new Event('pwa-install-ready'));});`,
          }}
        />
        <OfflineBanner />
        {children}
        <Toaster richColors position="top-right" />
        <PWAProvider />
      </body>
    </html>
  );
}
