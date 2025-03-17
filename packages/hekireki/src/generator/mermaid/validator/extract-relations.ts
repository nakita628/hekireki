import { generateRelationLine } from "../generator/generate-relation-line";
import { parseRelation } from "./parse-relation";
import type { Model } from "../type";

/**
 * extract relations from model
 * @function extractRelations
 * @param model
 * @returns
 */
export function extractRelations(model: Model): readonly string[] {
	const relations: string[] = [];

	// @r annotation
	if (model.documentation) {
		const annotationRelations = model.documentation
			.split("\n")
			.map((line: string) => {
				const relation = parseRelation(line);

				return relation ? generateRelationLine(relation) : null;
			})
			.filter((line): line is string => line !== null);

		relations.push(...annotationRelations);
	}
	return relations;
}
