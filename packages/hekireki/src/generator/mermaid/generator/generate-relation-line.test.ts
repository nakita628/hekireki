import { describe, expect, it } from "vitest";
import { generateRelationLine } from "./generate-relation-line";
import type { Relation } from "../type";

const generateRelationLineTestCases: {
	relation: Relation;
	expected: string;
}[] = [
	{
		relation: {
			fromModel: "User",
			fromField: "id",
			toModel: "Post",
			toField: "userId",
			type: "one-to-many",
		},
		expected: '    User ||--o{ Post : "(id) - (userId)"',
	},
];

describe("generateRelationLine", () => {
	it.concurrent.each(generateRelationLineTestCases)(
		"generateRelationLine($fromModel, $toModel, $relation) -> $expected",
		async ({ relation, expected }) => {
			const result = generateRelationLine(relation);
			expect(result).toBe(expected);
		},
	);
});
