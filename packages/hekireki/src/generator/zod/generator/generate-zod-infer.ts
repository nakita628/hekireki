import type { Config } from "..";
import { getVariableNameHelper } from "../../../common/helper/get-variable-name-helper";
import { getVariableSchemaNameHelper } from "../../../common/helper/get-variable-schema-name-helper";

/**
 * Generate Zod infer
 * @param modelName - The name of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod infer
 */
export function generateZodInfer(modelName: string, config: Config) {
	const typeName = getVariableNameHelper(modelName, config);
	const schemaName = getVariableSchemaNameHelper(modelName, config);
	return `export type ${typeName} = z.infer<typeof ${schemaName}>`;
}
