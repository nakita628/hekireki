import { describe, expect, it } from "vitest";
import type { Config } from "../../generator/zod";
import { getVariableNameHelper } from "./get-variable-name-helper";

const camelCaseConfig: Config = {
	typeName: "camelCase",
};

const pascalCaseConfig: Config = {
	typeName: "PascalCase",
};

const getVariableNameHelperTestCases = [
	{
		name: "User",
		config: camelCaseConfig,
		expected: "user",
	},
	{
		name: "Post",
		config: pascalCaseConfig,
		expected: "Post",
	},
];

describe("getVariableNameHelper", () => {
	it.concurrent.each(getVariableNameHelperTestCases)(
		"getVariableNameHelper($name, $config) -> $expected",
		({ name, config, expected }) => {
			const result = getVariableNameHelper(name, config);
			expect(result).toBe(expected);
		},
	);
});
