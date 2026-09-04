import { create } from 'zustand'

import { loadString, saveString } from './storage.js'
import { nextTheme, resolveTheme, THEME_KEY } from './theme.js'
import type { Theme } from './theme.js'

type Connection = 'connecting' | 'live' | 'offline'

type UiStore = {
  readonly theme: Theme
  readonly connection: Connection
  readonly legendOpen: boolean
  readonly toggleTheme: () => void
  readonly setConnection: (connection: Connection) => void
  readonly setLegendOpen: (open: boolean) => void
}

// The key to the diagram is open until someone folds it away, and then it stays folded.
const LEGEND_KEY = 'hekireki-studio:legend'

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
  legendOpen: loadString(LEGEND_KEY) !== 'closed',
  toggleTheme: () => {
    const theme = nextTheme(get().theme)
    saveString(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  setConnection: (connection) => {
    set({ connection })
  },
  setLegendOpen: (open) => {
    saveString(LEGEND_KEY, open ? 'open' : 'closed')
    set({ legendOpen: open })
  },
}))
