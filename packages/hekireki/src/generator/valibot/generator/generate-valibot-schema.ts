import type { Config } from "..";
import { getVariableSchemaNameHelper } from "../../../common/helper/get-variable-schema-name-helper";

/**
 * Generate Valibot schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Valibot schema
 */
export function generateValibotSchema(
	modelName: string,
	fields: string,
	config: Config,
) {
	const schemaName = getVariableSchemaNameHelper(modelName, config);
	return `export const ${schemaName} = v.object({\n${fields}\n})`;
}
