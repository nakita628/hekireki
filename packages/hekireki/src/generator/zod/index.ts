#!/usr/bin/env node
import type { GeneratorOptions } from "@prisma/generator-helper";
import { generatorHandler } from "@prisma/generator-helper";
import { generateZod } from "./generator/generate-zod";
import { format } from "prettier";
import fs from "node:fs";

export type Config = {
	output?: string;
	file?: string | string[];
	schemaName?: "PascalCase" | "camelCase" | string | string[];
	typeName?: "PascalCase" | "camelCase" | string | string[];
	type?: boolean | string | string[];
	comment?: boolean | string | string[];
};

const DEFAULT_CONFIG: Config = {
	output: "./zod",
	file: "index.ts",
	schemaName: "PascalCase",
	typeName: "PascalCase",
	type: false,
	comment: false,
} as const;

export async function main(options: GeneratorOptions): Promise<void> {
	const config: Config = {
		output: options.generator.output?.value ?? DEFAULT_CONFIG.output,
		file: options.generator.config?.file ?? DEFAULT_CONFIG.file,
		schemaName:
			options.generator.config?.schemaName ?? DEFAULT_CONFIG.schemaName,
		typeName: options.generator.config?.typeName ?? DEFAULT_CONFIG.typeName,
		type: options.generator.config?.type ?? DEFAULT_CONFIG.type,
		comment: options.generator.config?.comment === "true",
	};

	const content = generateZod(options.dmmf.datamodel.models, config);
	const code = await format(content, {
		parser: "typescript",
		printWidth: 100,
		singleQuote: true,
		semi: false,
	});
	if (!config.output) {
		throw new Error("output is required");
	}
	if (!fs.existsSync(config.output)) {
		fs.mkdirSync(config.output, { recursive: true });
	}

	const file = config.file ?? "index.ts";
	const filePath = `${config.output}/${file}`;
	fs.writeFileSync(filePath, code);
}
generatorHandler({
	onManifest() {
		return {
			defaultOutput: "./zod/",
			prettyName: "Hekireki-Zod",
		};
	},
	onGenerate: main,
});
