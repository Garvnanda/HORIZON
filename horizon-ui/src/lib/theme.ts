import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'horizon.theme'

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* private mode */
  }
  return 'light'
}

let theme: Theme = read()
const listeners = new Set<() => void>()

function apply() {
  try {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  } catch {
    /* SSR / thumbnail */
  }
}
apply()

export function getTheme(): Theme {
  return theme
}

export function setTheme(t: Theme) {
  if (t === theme) return
  theme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
  apply()
  listeners.forEach((l) => l())
}

export function toggleTheme() {
  setTheme(theme === 'light' ? 'dark' : 'light')
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Re-renders the calling component on theme change. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme)
}
