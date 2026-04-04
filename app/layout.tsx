import './globals.css'
import { ThemeProvider } from '@/lib/theme'
import { ToastProvider } from '@/lib/toast'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'QGX — Query Gen X',
  description: 'A next-gen Learning Management System with AI tutoring, gamified XP, anti-cheat testing, and real-time collaboration for schools & institutions.',
  manifest: '/manifest.json',
  metadataBase: new URL('https://qgx-nextjs.vercel.app'),
  openGraph: {
    title: 'QGX — Query Gen X',
    description: 'A next-gen Learning Management System with AI tutoring, gamified XP, anti-cheat testing, and real-time collaboration.',
    siteName: 'QGX',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QGX — Query Gen X',
    description: 'A next-gen Learning Management System with AI tutoring, gamified XP, anti-cheat testing, and real-time collaboration.',
  },
  keywords: ['LMS', 'Learning Management System', 'Education', 'AI Tutor', 'Gamification', 'Next.js', 'Supabase'],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QGX',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
