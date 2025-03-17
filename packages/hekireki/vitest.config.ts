import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: [
			"**/dist/**",
			"**/src/type/*.ts",
			"**/node_modules/**",
			"**/vitest.config.ts",
		],
		coverage: {
			exclude: ["**/src/**/*.test.ts", "**/dist/**", "**/vitest.config.ts"],
			all: true,
		},
	},
});
