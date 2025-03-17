import { describe, expect, it } from "vitest";
import { isValibotDocumentValidation } from "./is-valibot-documentation";

const isValibotDocumentValidationTestCases: {
	documentation: string;
	expected: string[];
}[] = [
	{
		documentation: `Unique identifier for the user
@z.string().uuid()
@v.pipe(v.string(), v.uuid())`,
		expected: ["Unique identifier for the user", "@z.string().uuid()"],
	},
];

describe("isValibotDocumentValidation", () => {
	it.each(isValibotDocumentValidationTestCases)(
		"isValibotDocumentValidation($documentation) -> $expected",
		({ documentation, expected }) => {
			const result = isValibotDocumentValidation(documentation);
			expect(result).toEqual(expected);
		},
	);
});
