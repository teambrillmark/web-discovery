import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Competitor Discovery',
  description: 'Persistent Competitor Discovery Intelligence System',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
        {children}
      </body>
    </html>
  );
}
