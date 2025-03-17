import type { Config } from "../../generator/zod";
import { getCamelCaseSchemaNameHelper } from "./get-camel-case-schema-name-helper";
import { getPascalCaseSchemaNameHelper } from "./get-pascal-case-schema-name-helper";

/**
 * Generates a variable schema name based on the given name and configuration.
 *
 * @param name - The original name.
 * @param config - The configuration.
 * @returns The variable schema name.
 */
export function getVariableSchemaNameHelper(
	name: string,
	config: Config,
): string {
	return config.schemaName === "camelCase"
		? getCamelCaseSchemaNameHelper(name)
		: getPascalCaseSchemaNameHelper(name);
}
