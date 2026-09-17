import * as z from 'zod'
import { create } from 'zustand'

import { loadString, saveString } from '../../lib/index.js'

// The Migrate page speaks English or Japanese: a migration is the one place Studio asks a person
// to decide what becomes of their data, and those decisions have to be read to be made. The rest
// of Studio stays in English.

const LanguageSchema = z.enum(['en', 'ja']).meta({
  description: 'The language of the Migrate page stored in localStorage',
  example: 'ja',
})

export type Language = z.infer<typeof LanguageSchema>

export const LANGUAGE_KEY = 'hekireki-studio:migrate-language'

/** The language chosen on the page before, else the browser's own when it is Japanese, else English. */
export function resolveLanguage(stored: string | null, browser: readonly string[]) {
  const result = LanguageSchema.safeParse(stored)
  if (result.success) return result.data
  return (browser[0] ?? '').toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

/**
 * The messages of the page, in English and in Japanese. The Japanese carry the same keys and the
 * same arguments as the English, so a message left untranslated does not compile.
 */
export function defineMessages<
  const M extends Readonly<Record<string, string | ((...args: never[]) => string)>>,
>(messages: {
  readonly en: M
  readonly ja: { readonly [K in keyof M]: M[K] extends string ? string : M[K] }
}) {
  return messages
}

/** The language the page speaks, switched on the page and kept in this browser. */
export const useLanguageStore = create<{
  readonly language: Language
  readonly toggle: () => void
}>()((set, get) => ({
  language: resolveLanguage(
    loadString(LANGUAGE_KEY),
    typeof navigator === 'undefined' ? [] : navigator.languages,
  ),
  toggle: () => {
    const language = get().language === 'ja' ? 'en' : 'ja'
    saveString(LANGUAGE_KEY, language)
    set({ language })
  },
}))

/** The language the page speaks. */
export function useLanguage() {
  return useLanguageStore((s) => s.language)
}

/** A group of messages in the language the page speaks. */
export function useMessages<M>(messages: { readonly en: M; readonly ja: M }) {
  return messages[useLanguage()]
}
