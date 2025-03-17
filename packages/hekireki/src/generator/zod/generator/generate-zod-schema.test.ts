import { describe, expect, it } from "vitest";
import { generateZodSchema } from "./generate-zod-schema";
import type { Config } from "..";

const generateZodSchemaTestCases: {
	modelName: string;
	fields: string;
	config: Config;
	expected: string;
}[] = [
	{
		modelName: "User",
		fields: "name: z.string()",
		config: {
			schemaName: "PascalCase",
			typeName: "camelCase",
			comment: false,
		},
		expected: `export const UserSchema = z.object({
name: z.string()
})`,
	},
	{
		modelName: "Profile",
		fields: "name: z.string()",
		config: {
			schemaName: "PascalCase",
			typeName: "camelCase",
			comment: false,
		},
		expected: `export const ProfileSchema = z.object({
name: z.string()
})`,
	},
	{
		modelName: "Post",
		fields: "title: z.string()",
		config: {
			schemaName: "PascalCase",
			typeName: "PascalCase",
			comment: false,
		},
		expected: `export const PostSchema = z.object({
title: z.string()
})`,
	},
];

describe("generateZodSchema", () => {
	it.each(generateZodSchemaTestCases)(
		"generateZodSchema($modelName, $fields, $config) -> $expected",
		({ modelName, fields, config, expected }) => {
			const result = generateZodSchema(modelName, fields, config);
			expect(result).toBe(expected);
		},
	);
});
