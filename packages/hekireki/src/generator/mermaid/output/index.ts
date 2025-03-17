import type { Config } from "..";
import type { ERContent } from "../type";
import fs from "node:fs";

/**
 * Output the ER content to a file
 * @param content - The ER content
 * @param config - The configuration
 */
export function OutputFile(content: ERContent, config: Config): void {
	const outputDir = config.output;
	if (!outputDir) {
		throw new Error("output is required");
	}
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const file = config.file ?? "ER.md";

	const filePath = `${outputDir}/${file}`;
	fs.writeFileSync(filePath, content.join("\n"), { encoding: "utf-8" });
}
