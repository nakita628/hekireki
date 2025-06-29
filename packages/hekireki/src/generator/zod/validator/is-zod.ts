/**
 * Is Zod validation
 * @param documentation - The documentation of the field
 * @returns The Zod validation
 */
export function isZod(documentation?: string): string | null {
  if (!documentation) return null
  const match = documentation.match(/@z\.(.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}
