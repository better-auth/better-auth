import { Navbar } from '@/components/nav-bar';
import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { NavbarProvider } from '@/components/nav-mobile';

const inter = Inter({
  subsets: ['latin'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body>
        <RootProvider>
          <NavbarProvider>
            <Navbar />
            {children}
          </NavbarProvider>
        </RootProvider>
      </body>
    </html>
  );
}
