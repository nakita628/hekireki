/**
 * remove duplicate relations
 * @param { readonly string[] } relations
 * @returns { readonly string[] }
 */
export function removeDuplicateRelations(relations: readonly string[]): readonly string[] {
  return [...new Set(relations)]
}
