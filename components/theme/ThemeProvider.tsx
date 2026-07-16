'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: ThemeChoice
  setTheme: (t: ThemeChoice) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  isDark: false,
})

export function useTheme() {
  return useContext(ThemeContext)
}

function resolveTheme(choice: ThemeChoice): boolean {
  if (choice === 'dark') return true
  if (choice === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>('system')
  const [isDark, setIsDark] = useState(false)

  const applyTheme = useCallback((choice: ThemeChoice) => {
    const dark = resolveTheme(choice)
    document.documentElement.classList.toggle('dark', dark)
    setIsDark(dark)
  }, [])

  useEffect(() => {
    const stored = (localStorage.getItem('theme') ?? 'system') as ThemeChoice
    setThemeState(stored)
    applyTheme(stored)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const current = (localStorage.getItem('theme') ?? 'system') as ThemeChoice
      if (current === 'system') applyTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [applyTheme])

  const setTheme = useCallback((choice: ThemeChoice) => {
    localStorage.setItem('theme', choice)
    setThemeState(choice)
    applyTheme(choice)
  }, [applyTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}
