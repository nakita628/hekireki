import type { DMMF } from "@prisma/generator-helper";

export type RelationType =
	// Required Relationships
	| "one-to-one"
	| "one-to-many"
	| "many-to-one"
	| "many-to-many"
	| "one-to-zero-one"
	| "zero-one-to-one"
	| "zero-to-one"
	| "zero-to-zero-one"
	| "zero-to-many"
	| "zero-one-to-many"
	| "many-to-zero-one"
	// Optional Relationships (using dotted lines)
	| "one-to-one-optional"
	| "one-to-many-optional"
	| "many-to-one-optional"
	| "many-to-many-optional"
	| "one-to-zero-one-optional"
	| "zero-one-to-one-optional"
	| "zero-to-one-optional"
	| "zero-to-many-optional"
	| "zero-one-to-many-optional"
	| "many-to-zero-one-optional"
	// Nuanced Patterns (Aliases)
	| "many-to-zero-many"
	| "zero-many-to-many"
	| "zero-many-to-zero-many";

export type Relation = {
	fromModel: string;
	toModel: string;
	fromField: string;
	toField: string;
	type: RelationType;
};

export type Model = Readonly<DMMF.Model>;
export type ERContent = readonly string[];
