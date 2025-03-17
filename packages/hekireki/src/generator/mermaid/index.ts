// #!/usr/bin/env node
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
	// Both sides required (one-to-one)
	"one-to-one": "||--||", // 1 --- 1

	// One side singular, the other multiple
	"one-to-many": "||--o{", // 1 --- * (also known as one-to-zero-many)
	"many-to-one": "}o--||", // * --- 1

	// Both sides multiple (many-to-many)
	"many-to-many": "}o--o{", // * --- *

	// One side required, one side optional (0..1)
	"one-to-zero-one": "||--o|", // 1 --- 0..1
	"zero-one-to-one": "o|--||", // 0..1 --- 1

	// Both sides optional singular (0..1 on both sides)
	"zero-to-one": "o|--o|", // 0..1 --- 0..1
	"zero-to-zero-one": "o|--o|", // Alias for zero-to-one

	// One side optional singular, the other multiple
	"zero-to-many": "o|--o{", // 0 --- *
	"zero-one-to-many": "o|--o{", // 0..1 --- *
	"many-to-zero-one": "}o--o|", // * --- 0..1

	// Optional Relationships (using dotted lines)
	"one-to-one-optional": "||..||", // 1..1
	"one-to-many-optional": "||..o{", // 1..*
	"many-to-one-optional": "}o..||", // *..1
	"many-to-many-optional": "}o..o{", // *..*

	"one-to-zero-one-optional": "||..o|", // 1..0..1
	"zero-one-to-one-optional": "o|..||", // 0..1..1
	"zero-to-one-optional": "o|..o|", // 0..1 (both sides optional singular)
	"zero-to-many-optional": "o|..o{", // 0..* (optional multiple)
	"zero-one-to-many-optional": "o|..o{", // 0..1 --- * (optional)
	"many-to-zero-one-optional": "}o..o|", // *..0..1

	// Nuanced Patterns (Aliases)
	"many-to-zero-many": "}o..o{", // * --- 0..* (equivalent to many-to-many-optional)
	"zero-many-to-many": "o{..}o", // 0..* --- * (left side optional multiple, right side required multiple)
	"zero-many-to-zero-many": "o{..o{", // both sides optional multiple
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
