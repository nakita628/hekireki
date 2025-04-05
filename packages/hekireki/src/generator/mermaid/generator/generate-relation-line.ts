import type { Relation } from "../type";
import { generateRelationLineFromString } from "../relationship";

/**
 * generate relation line
 * @param { Relation } relation
 * @returns { string } relation line
 */
export function generateRelationLine(relation: Relation): string {
	const cardinality = generateRelationLineFromString(relation.type);

	if (!cardinality) {
		throw new Error(`Unknown relation type: ${relation.type}`);
	}

	return `    ${relation.fromModel} ${cardinality} ${relation.toModel} : "(${relation.fromField}) - (${relation.toField})"`;
}
