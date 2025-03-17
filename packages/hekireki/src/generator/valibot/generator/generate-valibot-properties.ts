import type { Config } from "..";

export function generateValibotProperties(
	modelFields: {
		documentation: string;
		modelName: string;
		fieldName: string;
		validation: string | null;
		comment: string[];
	}[],
	config?: Config,
): string {
	const fields = modelFields
		.filter((field) => field.validation)
		.map((field) => {
			// @relation, @v, @z exclude
			const cleanDoc = field.comment
				.filter(
					(line) =>
						!(
							line.includes("@relation") ||
							line.includes("@v") ||
							line.includes("@z")
						),
				)
				.join("\n")
				.trim();

			const docComment =
				config?.comment && cleanDoc ? `  /**\n   * ${cleanDoc}\n   */\n` : "";

			return `${docComment}  ${field.fieldName}: v.${field.validation}`;
		})
		.join(",\n");
	return fields;
}
