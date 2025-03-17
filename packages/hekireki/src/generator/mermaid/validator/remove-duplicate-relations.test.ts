import { describe, expect, it } from "vitest";
import { removeDuplicateRelations } from "./remove-duplicate-relations";

const excludeManyToOneRelationsTestCases = [
	{
		relations: [
			'    Post }o--|| User : "PK(authorId) <- FK(id)"',
			'    Post }o--|| User : "PK(authorId) <- FK(id)"',
		],
		expected: ['    Post }o--|| User : "PK(authorId) <- FK(id)"'],
	},
	{
		relations: [
			'    User ||--o{ Post : "(id) - (userId)"',
			'    User ||--o{ Comment : "(id) - (userId)"',
			'    User ||--o{ Notification : "(id) - (userId)"',
			'    User ||--o{ Follow : "(id) - (followerId)"',
			'    User ||--o{ Follow : "(id) - (followingId)"',
			'    User ||--o{ Like : "(id) - (userId)"',
		],
		expected: [
			'    User ||--o{ Post : "(id) - (userId)"',
			'    User ||--o{ Comment : "(id) - (userId)"',
			'    User ||--o{ Notification : "(id) - (userId)"',
			'    User ||--o{ Follow : "(id) - (followerId)"',
			'    User ||--o{ Follow : "(id) - (followingId)"',
			'    User ||--o{ Like : "(id) - (userId)"',
		],
	},
	{
		relations: [],
		expected: [],
	},
];

describe("excludeManyToOneRelations", () => {
	it.concurrent.each(excludeManyToOneRelationsTestCases)(
		"excludeManyToOneRelations($relations) -> $expected",
		({ relations, expected }) => {
			const result = removeDuplicateRelations(relations);
			expect(result).toEqual(expected);
		},
	);
});
