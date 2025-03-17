import { describe, expect, it } from "vitest";
import { generateValibotSchema } from "./generate-valibot-schema";
import type { Config } from "..";

const generateValibotSchemaTestCases: {
	modelName: string;
	fields: string;
	config: Config;
	expected: string;
}[] = [
	{
		modelName: "User",
		fields: `  /**
   * Unique identifier for the user.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Username of the user.
   */
  username: v.pipe(v.string(), v.minLength(3)),
  /**
   * Email address of the user.
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Password for the user.
   */
  password: v.pipe(v.string(), v.minLength(8), v.maxLength(100)),
  /**
   * Timestamp when the user was created.
   */
  createdAt: v.date(),
  /**
   * Timestamp when the user was last updated.
   */
  updatedAt: v.date()`,
		config: {
			schemaName: "PascalCase",
			comment: true,
		},
		expected: `export const UserSchema = v.object({
  /**
   * Unique identifier for the user.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Username of the user.
   */
  username: v.pipe(v.string(), v.minLength(3)),
  /**
   * Email address of the user.
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Password for the user.
   */
  password: v.pipe(v.string(), v.minLength(8), v.maxLength(100)),
  /**
   * Timestamp when the user was created.
   */
  createdAt: v.date(),
  /**
   * Timestamp when the user was last updated.
   */
  updatedAt: v.date()
})`,
	},
];

describe("generateValibotSchema", () => {
	it.each(generateValibotSchemaTestCases)(
		"generateValibotSchema($modelName, $fields, $config) -> $expected",
		({ modelName, fields, config, expected }) => {
			const result = generateValibotSchema(modelName, fields, config);
			expect(result).toBe(expected);
		},
	);
});
