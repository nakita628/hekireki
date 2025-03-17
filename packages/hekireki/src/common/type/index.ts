import type { DMMF } from "@prisma/generator-helper";

export type Field = {
	documentation: string;
	modelName: string;
	fieldName: string;
	comment: string[];
	validation: string | null;
};

export type ValidField = Required<Field>;

export type GroupedFields = Record<string, Field[]>;

export type Model = Readonly<DMMF.Model>;

export type ModelInfo = {
	documentation: string;
	name: string;
	fields: Model["fields"];
};
