import type { Config } from "../../generator/zod";
import { capitalize } from "../text/capitalize";
import { decapitalize } from "../text/decapitalize";

/**
 * Generates a variable name based on the given name and configuration.
 *
 * @param name - The original name.
 * @param config - The configuration.
 * @returns The variable name.
 */
export function getVariableNameHelper(name: string, config: Config): string {
	return config.typeName === "camelCase"
		? decapitalize(name)
		: capitalize(name);
}
