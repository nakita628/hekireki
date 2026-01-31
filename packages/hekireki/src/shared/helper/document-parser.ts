/**
 * All annotation prefixes used by hekireki generators.
 */
const ANNOTATION_PREFIXES = ['@z.', '@v.', '@a.', '@e.'] as const

/**
 * Parse documentation and filter out all annotation lines.
 * This ensures that annotations from other libraries don't appear in comments.
 *
 * @param documentation - The documentation string from Prisma field
 * @returns Array of comment lines without any annotations
 */
export function parseDocumentWithoutAnnotations(
  documentation: string | undefined,
): readonly string[] {
  if (!documentation) return []

  return documentation
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      // Filter out lines that start with any annotation prefix
      return !ANNOTATION_PREFIXES.some((prefix) => line.startsWith(prefix))
    })
    .filter((line) => line.length > 0)
}
