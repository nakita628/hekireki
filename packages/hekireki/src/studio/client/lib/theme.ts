import * as z from 'zod'

const ThemeSchema = z
  .enum(['light', 'dark'])
  .meta({ description: 'The colour theme stored in localStorage', example: 'dark' })

export type Theme = z.infer<typeof ThemeSchema>

export const THEME_KEY = 'hekireki-studio:theme'

export function resolveTheme(stored: string | null, prefersDark: boolean) {
  const result = ThemeSchema.safeParse(stored)
  if (result.success) return result.data
  return prefersDark ? 'dark' : 'light'
}

export function nextTheme(theme: Theme) {
  return theme === 'dark' ? 'light' : 'dark'
}
