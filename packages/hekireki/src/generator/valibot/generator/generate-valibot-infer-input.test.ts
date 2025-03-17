import { describe, expect, it } from "vitest";
import { generateValibotInferInput } from "./generate-valibot-infer-input";
import type { Config } from "..";

const generateValibotInferInputTestCases: {
	modelName: string;
	config: Config;
	expected: string;
}[] = [
	{
		modelName: "User",
		config: {
			schemaName: "PascalCase",
			typeName: "PascalCase",
			comment: true,
		},
		expected: "export type User = v.InferInput<typeof UserSchema>",
	},
	{
		modelName: "Profile",
		config: {
			schemaName: "PascalCase",
			typeName: "camelCase",
			comment: true,
		},
		expected: "export type profile = v.InferInput<typeof ProfileSchema>",
	},
	{
		modelName: "Post",
		config: {
			schemaName: "PascalCase",
			typeName: "camelCase",
			comment: false,
		},
		expected: "export type post = v.InferInput<typeof PostSchema>",
	},
];

describe("generateValibotInferInput", () => {
	it.each(generateValibotInferInputTestCases)(
		"generateValibotInferInput($modelName) -> $expected",
		({ modelName, config, expected }) => {
			const result = generateValibotInferInput(modelName, config);
			expect(result).toBe(expected);
		},
	);
});
