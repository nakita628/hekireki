/**
 * Parses documentation and removes Zod validation lines.
 *
 * Lines containing "@z." are excluded from the result.
 *
 * @param documentation - The documentation string to parse.
 * @returns An array of non-Zod documentation lines.
 */
export function isZodDocument(documentation?: string): string[] {
  return (
    documentation
      ?.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.includes('@z.')) ?? []
  )
}

/**
 * Extracts the Zod validation expression from documentation.
 *
 * Searches for a line starting with "@z." and returns the expression part.
 *
 * @param documentation - The documentation string to parse.
 * @returns The Zod validation string without the "@z." prefix, or null if not found.
 */
export function isZod(documentation?: string): string | null {
  if (!documentation) return null
  const match = documentation.match(/@z\.(.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}
