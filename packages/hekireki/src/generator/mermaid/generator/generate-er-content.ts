import { ER_FOOTER, ER_HEADER } from "..";
import { extractRelations } from "../validator/extract-relations";
import { generateModelInfo } from "../generator/generate-model-info";
import type { ERContent, Model } from "../type";
import { removeDuplicateRelations } from "../validator/remove-duplicate-relations";

/**
 * generate ER content
 * @function generateERContent
 * @param models
 * @returns ER content
 */
export function generateERContent(models: readonly Model[]): ERContent {
	// extract all relations
	const allRelations = models.flatMap(extractRelations);
	// remove duplicate relations
	const uniqueRelations = removeDuplicateRelations(allRelations);
	// collect all model info
	const modelInfos = models.flatMap(generateModelInfo);
	// build ER diagram
	return [...ER_HEADER, ...uniqueRelations, ...modelInfos, ...ER_FOOTER];
}
