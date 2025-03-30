import { CARDINALITY_MAP } from "..";
import type { Relation } from "../type";

/**
 * generate relation line
 * @param { Relation } relation
 * @returns { string } relation line
 */
export function generateRelationLine(relation: Relation): string {
	const cardinality = CARDINALITY_MAP[relation.type];
	if (!cardinality) {
		throw new Error(`Unknown relation type: ${relation.type}`);
	}

	return `    ${relation.fromModel} ${cardinality} ${relation.toModel} : "(${relation.fromField}) - (${relation.toField})"`;
}
