#!/usr/bin/env node
import type { GeneratorOptions } from "@prisma/generator-helper";
import type { RelationType } from "./type";

import { OutputFile } from "./output";
import { generatorHandler } from "@prisma/generator-helper";
import { generateERContent } from "./generator/generate-er-content";

export type Config = {
	output?: string;
	file?: string | string[];
};

const DEFAULT_CONFIG: Config = {
	output: "./mermaid-er",
	file: "ER.md",
} as const;

export const CARDINALITY_MAP: Record<RelationType, string> = {
    // Required Relationships
    "one-to-one": "||--||",             // 1 --- 1
    "one-to-many": "||--|{",            // 1 --- 0..*
    "many-to-one": "}|--||",            // * --- 1
    "many-to-many": "}|--|{",           // * --- *

    "one-to-zero-one": "||--o|",        // 1 --- 0..1
    "zero-one-to-one": "o|--||",        // 0..1 --- 1

    "zero-to-one": "o|--o|",            // 0..1 --- 0..1
    "zero-to-zero-one": "o|--o|",       // Alias for zero-to-one

    "zero-to-many": "o|--o{",           // 0..1 --- 0..*
    "zero-one-to-many": "o|--o{",       // 0..1 --- *
    "many-to-zero-one": "}|--o|",       // * --- 0..1

    // Optional Relationships (dotted lines)
    "one-to-one-optional": "||..||",             // 1 --- 1 optional
    "one-to-many-optional": "||..o{",            // 1 --- 0..* optional
    "many-to-one-optional": "}|..||",            // * --- 1 optional
    "many-to-many-optional": "}|..o{",           // * --- 0..* optional

    "one-to-zero-one-optional": "||..o|",       // 1 --- 0..1 optional
    "zero-one-to-one-optional": "o|..||",       // 0..1 --- 1 optional
    "zero-to-one-optional": "o|..o|",           // 0..1 --- 0..1 optional
    "zero-to-many-optional": "o|..o{",          // 0..1 --- 0..* optional
    "zero-one-to-many-optional": "o|..o{",      // 0..1 --- * optional
    "many-to-zero-one-optional": "}|..o|",      // * --- 0..1 optional

    // Nuanced Patterns (Aliases)
    "many-to-zero-many": "}|..o{",              // * --- 0..*
    "zero-many-to-many": "o{--|{",              // 0..* --- *
    "zero-many-to-zero-many": "o{--o{",         // 0..* --- 0..*
};

// ER diagram header
export const ER_HEADER = ["```mermaid", "erDiagram"] as const;

// ER diagram footer
export const ER_FOOTER = ["```"] as const;

// main function
export async function main(options: GeneratorOptions): Promise<void> {
	const config: Config = {
		output: options.generator.output?.value ?? DEFAULT_CONFIG.output,
		file: options.generator.config?.file ?? DEFAULT_CONFIG.file,
	};

	const models = options.dmmf.datamodel.models;

	const content = generateERContent(models);

	if (!config.output) {
		throw new Error("output is required");
	}

	OutputFile(content, config);
}

// prisma generator handler
generatorHandler({
	onManifest() {
		return {
			defaultOutput: "./mermaid-er",
			prettyName: "ekireki-ER",
		};
	},
	onGenerate: main,
});
