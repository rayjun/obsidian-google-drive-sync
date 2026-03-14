import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
	test: {
		globals: false,
	},
	resolve: {
		alias: {
			obsidian: resolve(__dirname, "tests/__mocks__/obsidian.ts"),
		},
	},
});
