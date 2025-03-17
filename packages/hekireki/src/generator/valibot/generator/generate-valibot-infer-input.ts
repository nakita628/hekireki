import type { Config } from "..";
import { getVariableNameHelper } from "../../../common/helper/get-variable-name-helper";
import { getVariableSchemaNameHelper } from "../../../common/helper/get-variable-schema-name-helper";

/**
 * Generate the infer input type for the model
 * @param modelName - The name of the model
 * @param config - The configuration for the generator
 * @returns The generated infer input type
 */
export function generateValibotInferInput(modelName: string, config: Config) {
	const typeName = getVariableNameHelper(modelName, config);
	const schemaName = getVariableSchemaNameHelper(modelName, config);
	return `export type ${typeName} = v.InferInput<typeof ${schemaName}>`;
}
