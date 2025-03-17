/**
 * remove duplicate relations
 * @function removeDuplicateRelations
 * @param relations
 * @returns
 */
export function removeDuplicateRelations(
	relations: readonly string[],
): readonly string[] {
	return [...new Set(relations)];
}
