import { describe, expect, it } from "vitest";
import { isValibotValidation } from "./is-valibot-validation";

const isValibotValidationTestCases: {
	documentation: string;
	expected: string | null;
}[] = [
	{
		documentation: `Unique identifier for the user
@z.string().uuid()
@v.pipe(v.string(), v.uuid())`,
		expected: "pipe(v.string(), v.uuid())",
	},
];

describe("isValibotValidation", () => {
	it.each(isValibotValidationTestCases)(
		"isValibotValidation($documentation) -> $expected",
		({ documentation, expected }) => {
			const result = isValibotValidation(documentation);
			expect(result).toBe(expected);
		},
	);
});
