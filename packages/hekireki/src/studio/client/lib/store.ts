import { create } from 'zustand'

import { loadString, saveString } from './storage.js'
import { nextTheme, resolveTheme, THEME_KEY } from './theme.js'
import type { Theme } from './theme.js'

export type Connection = 'connecting' | 'live' | 'offline'

export type UiStore = {
  readonly theme: Theme
  readonly connection: Connection
  readonly toggleTheme: () => void
  readonly setConnection: (connection: Connection) => void
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

function initialTheme() {
  const prefersDark =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = resolveTheme(loadString(THEME_KEY), prefersDark)
  applyTheme(theme)
  return theme
}

export const useUiStore = create<UiStore>()((set, get) => ({
  theme: initialTheme(),
  connection: 'connecting',
  toggleTheme: () => {
    const theme = nextTheme(get().theme)
    saveString(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  setConnection: (connection) => {
    set({ connection })
  },
}))
