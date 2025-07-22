/**
 * Remove duplicate relations and exclude any that are many-to-one.
 *
 * @param relations - An array of Mermaid ER diagram relation lines.
 * @returns A filtered array excluding 'many-to-one' relations.
 */
export function excludeManyToOneRelations(relations: readonly string[]): readonly string[] {
  return [...new Set(relations)].filter((r) => !r.includes('many-to-one'))
}
