import { generateModelFields } from "./generate-model-fields";
import type { Model } from "../type";

/**
 * generate model info
 * @function generateModelInfo
 * @param model
 * @returns
 */
export function generateModelInfo(model: Model): readonly string[] {
	return [
		`    ${model.name} {`,
		...generateModelFields(model),
		"    }",
	] as const;
}
