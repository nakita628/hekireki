import { describe, expect, it } from "vitest";
import { isRelation } from "./is-relation";

const isRelationTestCases = [
	// basic
	{
		value: "one-to-many",
		expected: true,
	},
	{
		value: "many-to-one",
		expected: true,
	},
	{
		value: "one-to-one",
		expected: true,
	},
	{
		value: "many-to-many",
		expected: true,
	},
	// include 0
	{
		value: "zero-to-many",
		expected: true,
	},
	{
		value: "zero-to-one",
		expected: true,
	},
	{
		value: "one-to-zero-one",
		expected: true,
	},
	{
		value: "zero-one-to-many",
		expected: true,
	},
	{
		value: "zero-to-zero-one",
		expected: true,
	},
	{
		value: "many-to-zero-one",
		expected: true,
	},
	// optional
	{
		value: "one-to-many-optional",
		expected: true,
	},
	{
		value: "one-to-one-optional",
		expected: true,
	},
	{
		value: "many-to-many-optional",
		expected: true,
	},
	// invalid
	{
		value: "onetomany",
		expected: false,
	},
	{
		value: "one_to_many",
		expected: false,
	},
	{
		value: "ONE-TO-MANY",
		expected: false,
	},
	{
		value: "one-to-many-invalid",
		expected: false,
	},

	// partial
	{
		value: "one-to",
		expected: false,
	},
	{
		value: "many",
		expected: false,
	},
	{
		value: "-to-",
		expected: false,
	},

	// empty
	{
		value: "",
		expected: false,
	},
	{
		value: " ",
		expected: false,
	},
	{
		value: "one to many",
		expected: false,
	},
];

describe("isRelation", () => {
	it.concurrent.each(isRelationTestCases)(
		'validates "$value" -> $expected',
		async ({ value, expected }) => {
			const result = isRelation(value);
			expect(result).toBe(expected);
		},
	);
});
