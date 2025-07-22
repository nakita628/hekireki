/**
 * Parses documentation lines and filters out Valibot validation entries.
 *
 * Lines containing "@v." will be excluded.
 *
 * @param documentation - The raw documentation string.
 * @returns An array of non-Valibot documentation lines.
 */
export function isValibotDocument(documentation?: string): string[] {
  return (
    documentation
      ?.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.includes('@v.')) ?? []
  )
}

/**
 * Extracts the Valibot validation expression from a documentation string.
 *
 * Searches for a line starting with "@v." and returns the expression that follows.
 *
 * @param documentation - The documentation string to search.
 * @returns The Valibot expression without "@v." prefix, or null if not found.
 */
export function isValibot(documentation?: string): string | null {
  if (!documentation) return null
  const match = documentation.match(/@v\.(.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}
