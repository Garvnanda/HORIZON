import { useSyncExternalStore } from 'react'

const KEY = 'horizon.seenIntro'

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let open = !seen()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openIntro() {
  open = true
  emit()
}

export function closeIntro() {
  open = false
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* ignore */
  }
  emit()
}

export function useIntroOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
    () => open,
  )
}
