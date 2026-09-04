import * as v from 'valibot'

const ThemeSchema = v.pipe(
  v.picklist(['light', 'dark']),
  v.description('The colour theme stored in localStorage'),
)

export type Theme = v.InferOutput<typeof ThemeSchema>

export const THEME_KEY = 'hekireki-studio:theme'

export function resolveTheme(stored: string | null, prefersDark: boolean) {
  const parsed = v.safeParse(ThemeSchema, stored)
  if (parsed.success) return parsed.output
  return prefersDark ? 'dark' : 'light'
}

export function nextTheme(theme: Theme) {
  return theme === 'dark' ? 'light' : 'dark'
}
