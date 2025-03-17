import { describe, expect, it } from "vitest";
import type { Config } from "../../generator/zod";
import { getVariableSchemaNameHelper } from "./get-variable-schema-name-helper";

const camelCaseConfig: Config = {
	schemaName: "camelCase",
};

const pascalCaseConfig: Config = {
	schemaName: "PascalCase",
};

const getVariableSchemaNameHelperTestCases = [
	{
		name: "User",
		config: camelCaseConfig,
		expected: "userSchema",
	},
	{
		name: "Post",
		config: pascalCaseConfig,
		expected: "PostSchema",
	},
];

describe("getVariableSchemaNameHelper", () => {
	it.concurrent.each(getVariableSchemaNameHelperTestCases)(
		"getVariableSchemaNameHelper($name, $config) -> $expected",
		({ name, config, expected }) => {
			const result = getVariableSchemaNameHelper(name, config);
			expect(result).toBe(expected);
		},
	);
});
