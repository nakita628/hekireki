const VALIDATION_PATTERNS = ["@v."] as const;

export function isValibotDocumentValidation(documentation?: string): string[] {
	if (!documentation) return [];

	return documentation
		.split("\n")
		.filter(
			(line) => !VALIDATION_PATTERNS.some((pattern) => line.includes(pattern)),
		)
		.map((line) => line.trim())
		.filter(Boolean);
}
