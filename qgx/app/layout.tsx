'use client'
import './globals.css'
import { useState, createContext, useContext, useEffect } from 'react'

// ─── Theme Context ────────────────────────────────────────────────────────────
export const ThemeCtx = createContext<{
  theme: 'dark' | 'light'
  toggleTheme: () => void
}>({ theme: 'dark', toggleTheme: () => {} })

export function useTheme() { return useContext(ThemeCtx) }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', theme === 'light')
  }, [theme])

  return (
    <html lang="en">
      <head>
        <title>QGX — Query Gen X</title>
        <meta name="description" content="QGX Learning Management System" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <ThemeCtx.Provider value={{ theme, toggleTheme: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>
          {children}
        </ThemeCtx.Provider>
      </body>
    </html>
  )
}
