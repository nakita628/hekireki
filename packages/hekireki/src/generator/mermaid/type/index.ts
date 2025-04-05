import type { DMMF } from "@prisma/generator-helper";

export type Relation = {
	fromModel: string;
	toModel: string;
	fromField: string;
	toField: string;
	type: string;
};

export type Model = Readonly<DMMF.Model>;
export type ERContent = readonly string[];
