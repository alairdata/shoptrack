import type { Metadata, Viewport } from 'next';
import './style.css';

export const metadata: Metadata = {
  title: 'ShopTrack',
  description: 'Simple inventory and POS',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'ShopTrack', statusBarStyle: 'default' },
};

// viewportFit lets the layout stay clear of phone notches and home bars.
// Zoom is left enabled on purpose so people can enlarge the text.
export const viewport: Viewport = {
  themeColor: '#173d32',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
