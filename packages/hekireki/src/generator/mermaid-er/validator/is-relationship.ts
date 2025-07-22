/**
 * Check if the given key is a valid relationship type.
 *
 * @param key - The key to check.
 * @returns `true` if the key is one of the valid relationship types, otherwise `false`.
 */
export function isRelationship(key: string): key is 'zero-one' | 'one' | 'zero-many' | 'many' {
  return ['zero-one', 'one', 'zero-many', 'many'].includes(key)
}
