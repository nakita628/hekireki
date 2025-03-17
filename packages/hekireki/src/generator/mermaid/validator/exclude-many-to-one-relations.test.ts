import { describe, expect, it } from "vitest";
import { excludeManyToOneRelations } from "./exclude-many-to-one-relations";

const excludeManyToOneRelationsTestCases = [
	{
		relations: [
			'    User ||--|| Profile : "(id) <- (user_id)"',
			'    Team }o--|| User : "(team_id) <- (id)"',
			'    Team ||--o{ Member : "(id) <- (team_id)"',
			'    Team ||--o{ Member : "(id) <- (team_id)"',
		],
		expected: [
			'    User ||--|| Profile : "(id) <- (user_id)"',
			'    Team }o--|| User : "(team_id) <- (id)"',
			'    Team ||--o{ Member : "(id) <- (team_id)"',
		],
	},
	{
		relations: [
			'    Post }o--|| User : "(authorId) <- (id)"',
			'    Post }o--|| User : "(authorId) <- (id)"',
		],
		expected: ['    Post }o--|| User : "(authorId) <- (id)"'],
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
			const result = excludeManyToOneRelations(relations);
			expect(result).toEqual(expected);
		},
	);
});
