const VALIDATION_PATTERNS = ['@z.'] as const

/**
 * Is Zod documentation
 * @param documentation - The documentation of the field
 * @returns The Zod documentation
 */
export function isZodDocumentValidation(documentation?: string): string[] {
  if (!documentation) return []

  return documentation
    .split('\n')
    .filter((line) => !VALIDATION_PATTERNS.some((pattern) => line.includes(pattern)))
    .map((line) => line.trim())
    .filter(Boolean)
}
