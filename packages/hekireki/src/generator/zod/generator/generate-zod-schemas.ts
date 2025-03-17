import type { Config } from "..";
import { generateZodProperties } from "./generate-zod-properties";
import { generateZodSchema } from "./generate-zod-schema";

/**
 * Generate Zod schemas
 * @param modelFields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod schemas
 */
export function generateZodSchemas(
	modelFields: {
		documentation: string;
		modelName: string;
		fieldName: string;
		validation: string | null;
		comment: string[];
	}[],
	config: Config,
) {
	const modelName = modelFields[0].modelName;
	const modelDoc = modelFields[0].documentation || "";

	const fields = generateZodProperties(modelFields, config);

	if (!(modelDoc || !config?.comment)) {
		return generateZodSchema(modelName, fields, config);
	}

	return `${generateZodSchema(modelName, fields, config)}`;
}
