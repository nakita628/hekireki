/**
 * Check if the documentation is a Valibot validation
 * @param documentation
 * @returns string | null
 */
export function isValibot(documentation?: string): string | null {
  if (!documentation) return null
  const match = documentation.match(/@v\.(.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}
