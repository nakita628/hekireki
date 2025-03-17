/**
 * exclude many-to-one relations
 * @function excludeManyToOneRelations
 * @param relations
 * @returns
 */
export function excludeManyToOneRelations(
	relations: readonly string[],
): readonly string[] {
	return [...new Set(relations)].filter((r) => !r.includes("many-to-one"));
}
