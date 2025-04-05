export const RELATION_SHIPS = {
	"zero-one": "|o",
	one: "||",
	"zero-many": "|o{",
	many: "|{",
} as const;

type RelationshipKey = keyof typeof RELATION_SHIPS;

/**
 * generate relation line
 * @param { string } input
 * @returns { string }
 */
export function generateRelationLineFromString(input: string): string {
	const parts = input.split("-to-");
	const toParts = parts[1].split("-");

	const from = parts[0] as RelationshipKey;
	const to = toParts[0] as RelationshipKey;
	const isOptional = toParts.includes("optional");

	const fromSymbol = RELATION_SHIPS[from];
	const toSymbol = RELATION_SHIPS[to];

	if (!fromSymbol || !toSymbol) {
		throw new Error(`Invalid relationship string: ${input}`);
	}

	const connector = isOptional ? ".." : "--";

	return `${fromSymbol}${connector}${toSymbol}`;
}
