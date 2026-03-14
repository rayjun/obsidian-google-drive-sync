/**
 * Check if a file path matches any of the exclude glob patterns.
 * Supports: exact match, ** wildcard for recursive matching,
 * and basename matching (e.g., ".DS_Store" matches "subdir/.DS_Store").
 */
export function isExcluded(filePath: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		if (pattern.includes("/")) {
			// Path pattern — match from start
			if (pattern.endsWith("/**")) {
				const prefix = pattern.slice(0, -3);
				if (filePath === prefix || filePath.startsWith(prefix + "/")) {
					return true;
				}
			} else if (filePath === pattern) {
				return true;
			}
		} else {
			// Basename pattern — match against filename or any path segment
			const basename = filePath.split("/").pop() ?? "";
			if (basename === pattern) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Get the parent directory path. Returns "" for root-level files.
 */
export function getParentPath(filePath: string): string {
	const lastSlash = filePath.lastIndexOf("/");
	if (lastSlash === -1) return "";
	return filePath.substring(0, lastSlash);
}

/**
 * Collect all unique directory paths needed for a set of file paths.
 * Returns them sorted by depth (shallowest first).
 */
export function collectFolderPaths(filePaths: string[]): string[] {
	const folders = new Set<string>();
	for (const fp of filePaths) {
		let dir = getParentPath(fp);
		while (dir !== "") {
			if (folders.has(dir)) break;
			folders.add(dir);
			dir = getParentPath(dir);
		}
	}
	return Array.from(folders).sort(
		(a, b) => a.split("/").length - b.split("/").length
	);
}
