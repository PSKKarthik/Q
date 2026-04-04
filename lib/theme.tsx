'use client'
import { createContext, useContext, useState, useEffect } from 'react'

export const ThemeCtx = createContext<{
  theme: 'dark' | 'light'
  toggleTheme: () => void
}>({ theme: 'dark', toggleTheme: () => {} })

export function useTheme() { return useContext(ThemeCtx) }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('qgx-theme') as 'dark' | 'light' | null
    if (stored) {
      setTheme(stored)
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light')
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', theme === 'light')
    localStorage.setItem('qgx-theme', theme)
  }, [theme])

  return (
    <ThemeCtx.Provider value={{ theme, toggleTheme: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeCtx.Provider>
  )
}
