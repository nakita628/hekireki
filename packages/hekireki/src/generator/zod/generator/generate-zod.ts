import { isZodDocumentValidation } from "../validator/is-zod-documentation";
import { isZodValidation } from "../validator/is-zod-validation";

import type { Config } from "..";
import type { Model } from "../../../common/type";
import { isFieldsValidation } from "../../../common/validator/is-fields-validation";
import { groupByModelHelper } from "../../../common/helper/group-by-model-helper";
import { generateZodSchemas } from "./generate-zod-schemas";
import { generateZodInfer } from "./generate-zod-infer";

const ZOD_IMPORT = `import { z } from 'zod'\n` as const;

/**
 * Generate Zod schemas and types
 * @param models - The models to generate the Zod schemas and types for
 * @param config - The configuration for the generator
 * @returns The generated Zod schemas and types
 */
export function generateZod(models: readonly Model[], config: Config): string {
	const modelInfos = models.map((model) => {
		return {
			documentation: model.documentation ?? "",
			name: model.name,
			fields: model.fields,
		};
	});

	const modelFields = modelInfos.map((model) => {
		const fields = model.fields.map((field) => ({
			documentation: model.documentation,
			modelName: model.name,
			fieldName: field.name,
			comment: isZodDocumentValidation(field.documentation),
			validation: isZodValidation(field.documentation),
		}));
		return fields;
	});

	// null exclude
	const validFields = isFieldsValidation(modelFields);

	// group by model
	const groupedByModel = groupByModelHelper(validFields);

	const zods = Object.values(groupedByModel).map((fields) => {
		return {
			generateZodSchema: generateZodSchemas(fields, config),
			generateZodInfer:
				config.type === "true"
					? generateZodInfer(fields[0].modelName, config)
					: "",
		};
	});

	return [
		ZOD_IMPORT,
		"",
		zods
			.flatMap(({ generateZodSchema, generateZodInfer }) =>
				[generateZodSchema, generateZodInfer].filter(Boolean),
			)
			.join("\n\n"),
	].join("\n");
}
