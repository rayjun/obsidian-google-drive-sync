import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
	},
	resolve: {
		alias: {
			obsidian: "./tests/__mocks__/obsidian.ts",
		},
	},
});
