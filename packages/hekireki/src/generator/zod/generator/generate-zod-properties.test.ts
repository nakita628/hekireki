import { describe, expect, it } from "vitest";
import { generateZodProperties } from "./generate-zod-properties";
import type { Config } from "..";

const generateZodPropertiesTestCases: {
	modelFields: {
		documentation: string;
		modelName: string;
		fieldName: string;
		validation: string | null;
		comment: string[];
	}[];
	config?: Config;
	expected: string;
}[] = [
	{
		modelFields: [
			{
				documentation: "",
				modelName: "User",
				fieldName: "id",
				comment: [
					"Unique identifier for the user.",
					"@v.pipe(v.string(), v.uuid())",
				],
				validation: "string().uuid()",
			},
			{
				documentation: "",
				modelName: "User",
				fieldName: "username",
				comment: [
					"Username of the user.",
					"@v.pipe(v.string(), v.minLength(3))",
				],
				validation: "string().min(3)",
			},
			{
				documentation: "",
				modelName: "User",
				fieldName: "email",
				comment: [
					"Email address of the user.",
					"@v.pipe(v.string(), v.email())",
				],
				validation: "string().email()",
			},
			{
				documentation: "",
				modelName: "User",
				fieldName: "password",
				comment: [
					"Password for the user.",
					"@v.pipe(v.string(), v.minLength(8), v.maxLength(100))",
				],
				validation: "string().min(8).max(100)",
			},
			{
				documentation: "",
				modelName: "User",
				fieldName: "createdAt",
				comment: ["Timestamp when the user was created.", "@v.date()"],
				validation: "date()",
			},
			{
				documentation: "",
				modelName: "User",
				fieldName: "updatedAt",
				comment: ["Timestamp when the user was last updated.", "@v.date()"],
				validation: "date()",
			},
		],
		config: {
			schemaName: "PascalCase",
			typeName: "PascalCase",
			comment: true,
		},
		expected: `  /**
   * Unique identifier for the user.
   */
  id: z.string().uuid(),
  /**
   * Username of the user.
   */
  username: z.string().min(3),
  /**
   * Email address of the user.
   */
  email: z.string().email(),
  /**
   * Password for the user.
   */
  password: z.string().min(8).max(100),
  /**
   * Timestamp when the user was created.
   */
  createdAt: z.date(),
  /**
   * Timestamp when the user was last updated.
   */
  updatedAt: z.date()`,
	},
];

describe("generateZodProperties", () => {
	it.each(generateZodPropertiesTestCases)(
		"generateZodProperties($modelFields, $config) -> $expected",
		({ modelFields, config, expected }) => {
			const result = generateZodProperties(modelFields, config);
			expect(result).toBe(expected);
		},
	);
});
