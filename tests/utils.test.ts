import { describe, it, expect } from "vitest";
import { isExcluded, getParentPath, collectFolderPaths } from "../src/utils";

describe("isExcluded", () => {
	const patterns = [".obsidian/**", ".DS_Store", "Thumbs.db"];

	it("excludes .obsidian subdirectories", () => {
		expect(isExcluded(".obsidian/plugins/foo/data.json", patterns)).toBe(true);
	});

	it("excludes .obsidian root", () => {
		expect(isExcluded(".obsidian/config", patterns)).toBe(true);
	});

	it("excludes .DS_Store", () => {
		expect(isExcluded(".DS_Store", patterns)).toBe(true);
		expect(isExcluded("subdir/.DS_Store", patterns)).toBe(true);
	});

	it("excludes Thumbs.db", () => {
		expect(isExcluded("Thumbs.db", patterns)).toBe(true);
		expect(isExcluded("subdir/Thumbs.db", patterns)).toBe(true);
	});

	it("does not exclude normal files", () => {
		expect(isExcluded("notes/hello.md", patterns)).toBe(false);
		expect(isExcluded("images/photo.png", patterns)).toBe(false);
	});
});

describe("getParentPath", () => {
	it("returns empty string for root-level file", () => {
		expect(getParentPath("file.md")).toBe("");
	});

	it("returns parent for nested file", () => {
		expect(getParentPath("a/b/c.md")).toBe("a/b");
	});

	it("returns parent for one level", () => {
		expect(getParentPath("folder/file.md")).toBe("folder");
	});
});

describe("collectFolderPaths", () => {
	it("returns empty for root-level files", () => {
		expect(collectFolderPaths(["a.md", "b.md"])).toEqual([]);
	});

	it("collects unique folder paths sorted by depth", () => {
		const result = collectFolderPaths(["a/b/c.md", "a/d.md", "x/y.md"]);
		expect(result).toEqual(["a", "x", "a/b"]);
	});

	it("deduplicates shared parent paths", () => {
		const result = collectFolderPaths(["a/b/c.md", "a/b/d.md"]);
		expect(result).toEqual(["a", "a/b"]);
	});
});
