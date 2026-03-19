import { describe, it, expect, vi } from "vitest";
import { computeDiff, SyncEngine, LocalFile, RemoteFile } from "../src/sync-engine";
import { SyncRecord, SyncState, createEmptySyncState } from "../src/sync-state";

describe("computeDiff", () => {
	it("skips unchanged files", () => {
		const localFiles: LocalFile[] = [{ path: "a.md", mtime: 1000 }];
		const remoteFiles: RemoteFile[] = [
			{
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				modifiedTime: 1000,
			},
		];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([]);
	});

	it("uploads locally modified file", () => {
		const localFiles: LocalFile[] = [{ path: "a.md", mtime: 2000 }];
		const remoteFiles: RemoteFile[] = [
			{
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				modifiedTime: 1000,
			},
		];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "upload",
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
			},
		]);
	});

	it("downloads remotely modified file", () => {
		const localFiles: LocalFile[] = [{ path: "a.md", mtime: 1000 }];
		const remoteFiles: RemoteFile[] = [
			{
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				modifiedTime: 2000,
			},
		];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "download",
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				remoteModifiedTime: 2000,
			},
		]);
	});

	it("both modified — newer wins (local newer)", () => {
		const localFiles: LocalFile[] = [{ path: "a.md", mtime: 3000 }];
		const remoteFiles: RemoteFile[] = [
			{
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				modifiedTime: 2000,
			},
		];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "upload",
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
			},
		]);
	});

	it("both modified — newer wins (remote newer)", () => {
		const localFiles: LocalFile[] = [{ path: "a.md", mtime: 2000 }];
		const remoteFiles: RemoteFile[] = [
			{
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				modifiedTime: 3000,
			},
		];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "download",
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				remoteModifiedTime: 3000,
			},
		]);
	});

	it("uploads new local file", () => {
		const localFiles: LocalFile[] = [{ path: "new.md", mtime: 1000 }];
		const remoteFiles: RemoteFile[] = [];
		const records: Record<string, SyncRecord> = {};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "upload",
				path: "new.md",
				driveFileId: undefined,
				driveFolderId: undefined,
			},
		]);
	});

	it("downloads new remote file", () => {
		const localFiles: LocalFile[] = [];
		const remoteFiles: RemoteFile[] = [
			{
				path: "new.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				modifiedTime: 1000,
			},
		];
		const records: Record<string, SyncRecord> = {};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "download",
				path: "new.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				remoteModifiedTime: 1000,
			},
		]);
	});

	it("deletes from Drive when locally deleted", () => {
		const localFiles: LocalFile[] = [];
		const remoteFiles: RemoteFile[] = [
			{
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				modifiedTime: 1000,
			},
		];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "delete_remote",
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
			},
		]);
	});

	it("deletes locally when remotely deleted", () => {
		const localFiles: LocalFile[] = [{ path: "a.md", mtime: 1000 }];
		const remoteFiles: RemoteFile[] = [];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "delete_local",
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
			},
		]);
	});

	it("downloads when deleted locally but modified remotely", () => {
		const localFiles: LocalFile[] = [];
		const remoteFiles: RemoteFile[] = [
			{
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				modifiedTime: 2000,
			},
		];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "download",
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				remoteModifiedTime: 2000,
			},
		]);
	});

	it("uploads when modified locally but deleted remotely", () => {
		const localFiles: LocalFile[] = [{ path: "a.md", mtime: 2000 }];
		const remoteFiles: RemoteFile[] = [];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "upload",
				path: "a.md",
				driveFileId: undefined,
				driveFolderId: undefined,
			},
		]);
	});

	it("removes record when deleted on both sides", () => {
		const localFiles: LocalFile[] = [];
		const remoteFiles: RemoteFile[] = [];
		const records: Record<string, SyncRecord> = {
			"a.md": {
				localPath: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
				lastSyncedTime: 1000,
			},
		};
		const actions = computeDiff(localFiles, remoteFiles, records);
		expect(actions).toEqual([
			{
				type: "remove_record",
				path: "a.md",
				driveFileId: "d1",
				driveFolderId: "f1",
			},
		]);
	});
});

// --- SyncEngine class tests ---

function createMockVault(files: { path: string; mtime: number; content?: ArrayBuffer }[] = []) {
	const fileMap = new Map(files.map((f) => [f.path, f]));
	return {
		getFiles: () =>
			files.map((f) => ({
				path: f.path,
				stat: { mtime: f.mtime, ctime: f.mtime, size: 100 },
				name: f.path.split("/").pop()!,
				basename: f.path.split("/").pop()!.replace(/\.[^.]+$/, ""),
				extension: f.path.split(".").pop()!,
				vault: {} as any,
				parent: null,
			})),
		adapter: {
			readBinary: vi.fn(async (path: string) => fileMap.get(path)?.content ?? new ArrayBuffer(0)),
			writeBinary: vi.fn(async () => {}),
			exists: vi.fn(async () => true),
			mkdir: vi.fn(async () => {}),
			remove: vi.fn(async () => {}),
			stat: vi.fn(async (path: string) => {
				const f = fileMap.get(path);
				return f ? { mtime: f.mtime, ctime: f.mtime, size: 100 } : null;
			}),
		},
	} as any;
}

function createMockDriveApi(remoteFiles: { relativePath: string; id: string; modifiedTime: string }[] = []) {
	return {
		findOrCreateFolder: vi.fn(async () => "root-folder-id"),
		listAllFilesRecursive: vi.fn(async (_rootId: string, folderIds?: Record<string, string>) => {
			if (folderIds) folderIds[""] = "root-folder-id";
			return remoteFiles.map((f) => ({
				file: {
					id: f.id,
					name: f.relativePath.split("/").pop()!,
					mimeType: "application/octet-stream",
					modifiedTime: f.modifiedTime,
					parents: ["root-folder-id"],
				},
				relativePath: f.relativePath,
			}));
		}),
		uploadFile: vi.fn(async () => ({
			id: "new-drive-id",
			name: "file",
			mimeType: "text/plain",
			modifiedTime: new Date().toISOString(),
		})),
		downloadFile: vi.fn(async () => new ArrayBuffer(10)),
		deleteFile: vi.fn(async () => {}),
	} as any;
}

describe("SyncEngine", () => {
	it("returns early with zero stats when sync is already in progress", async () => {
		const vault = createMockVault();
		const driveApi = createMockDriveApi();
		const state = createEmptySyncState();
		const saveSyncState = vi.fn(async () => {});

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => state,
			saveSyncState
		);

		// Start first sync (will take some time)
		const sync1 = engine.sync();
		// Immediately start second sync — should return early
		const result = await engine.sync();

		expect(result).toEqual({ uploaded: 0, downloaded: 0, deleted: 0, errors: 0 });

		// Wait for first sync to complete
		await sync1;
	});

	it("isSyncing() returns true during sync", async () => {
		const vault = createMockVault();
		const driveApi = createMockDriveApi();
		const state = createEmptySyncState();

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => state,
			vi.fn(async () => {})
		);

		expect(engine.isSyncing()).toBe(false);
		const syncPromise = engine.sync();
		expect(engine.isSyncing()).toBe(true);
		await syncPromise;
		expect(engine.isSyncing()).toBe(false);
	});

	it("uploads new local files to Drive", async () => {
		const vault = createMockVault([
			{ path: "hello.md", mtime: 1000, content: new ArrayBuffer(5) },
		]);
		const driveApi = createMockDriveApi();
		let savedState: SyncState | null = null;

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => createEmptySyncState(),
			async (s) => { savedState = s; }
		);

		const stats = await engine.sync();

		expect(stats.uploaded).toBe(1);
		expect(stats.errors).toBe(0);
		expect(driveApi.uploadFile).toHaveBeenCalledTimes(1);
		expect(savedState).not.toBeNull();
		expect(savedState!.records["hello.md"]).toBeDefined();
	});

	it("does not re-upload files on second sync (no clock skew duplication)", async () => {
		// Simulate: local mtime=5000, but Drive returns modifiedTime in the past (3000)
		const vault = createMockVault([
			{ path: "note.md", mtime: 5000, content: new ArrayBuffer(5) },
		]);
		const driveModifiedTime = new Date(3000).toISOString();
		const driveApi = createMockDriveApi();
		driveApi.uploadFile = vi.fn(async () => ({
			id: "drive-1",
			name: "note.md",
			mimeType: "text/plain",
			modifiedTime: driveModifiedTime, // Drive time is earlier than local mtime
		}));

		let savedState: SyncState = createEmptySyncState();
		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => savedState,
			async (s) => { savedState = s; }
		);

		// First sync — should upload the file
		const stats1 = await engine.sync();
		expect(stats1.uploaded).toBe(1);

		// Second sync — same local file, now record exists, should NOT re-upload
		// Update driveApi to return the file as remote
		driveApi.listAllFilesRecursive = vi.fn(async (_rootId: string, folderIds?: Record<string, string>) => {
			if (folderIds) folderIds[""] = "root-folder-id";
			return [{
				file: {
					id: "drive-1",
					name: "note.md",
					mimeType: "text/plain",
					modifiedTime: driveModifiedTime,
					parents: ["root-folder-id"],
				},
				relativePath: "note.md",
			}];
		});
		driveApi.uploadFile.mockClear();

		const stats2 = await engine.sync();
		expect(stats2.uploaded).toBe(0);
		expect(stats2.downloaded).toBe(0);
		expect(driveApi.uploadFile).not.toHaveBeenCalled();
	});

	it("downloads new remote files to local", async () => {
		const vault = createMockVault();
		const driveApi = createMockDriveApi([
			{ relativePath: "remote.md", id: "d1", modifiedTime: new Date(2000).toISOString() },
		]);
		let savedState: SyncState | null = null;

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => createEmptySyncState(),
			async (s) => { savedState = s; }
		);

		const stats = await engine.sync();

		expect(stats.downloaded).toBe(1);
		expect(driveApi.downloadFile).toHaveBeenCalledWith("d1");
		expect(vault.adapter.writeBinary).toHaveBeenCalledTimes(1);
		expect(savedState!.records["remote.md"]).toBeDefined();
	});

	it("continues processing after a single file upload error", async () => {
		const vault = createMockVault([
			{ path: "fail.md", mtime: 1000 },
			{ path: "success.md", mtime: 1000 },
		]);
		const driveApi = createMockDriveApi();

		// First upload fails, second succeeds
		let callCount = 0;
		driveApi.uploadFile = vi.fn(async () => {
			callCount++;
			if (callCount === 1) throw new Error("Network error");
			return {
				id: "new-id",
				name: "success.md",
				mimeType: "text/plain",
				modifiedTime: new Date().toISOString(),
			};
		});

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => createEmptySyncState(),
			vi.fn(async () => {})
		);

		const stats = await engine.sync();

		expect(stats.errors).toBe(1);
		expect(stats.uploaded).toBe(1);
		expect(driveApi.uploadFile).toHaveBeenCalledTimes(2);
	});

	it("resets syncInProgress even on unrecoverable error", async () => {
		const vault = createMockVault();
		const driveApi = createMockDriveApi();
		driveApi.findOrCreateFolder = vi.fn(async () => {
			throw new Error("Fatal error");
		});

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => createEmptySyncState(),
			vi.fn(async () => {})
		);

		await expect(engine.sync()).rejects.toThrow("Fatal error");
		expect(engine.isSyncing()).toBe(false);
	});

	it("excludes files matching exclude patterns", async () => {
		const vault = createMockVault([
			{ path: ".obsidian/config", mtime: 1000 },
			{ path: "notes/hello.md", mtime: 1000 },
		]);
		const driveApi = createMockDriveApi();

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [".obsidian/**"] }),
			() => createEmptySyncState(),
			vi.fn(async () => {})
		);

		const stats = await engine.sync();

		expect(stats.uploaded).toBe(1); // Only hello.md, not .obsidian/config
	});

	it("saves sync state with updated lastSyncTimestamp", async () => {
		const vault = createMockVault();
		const driveApi = createMockDriveApi();
		let savedState: SyncState | null = null;
		const beforeSync = Date.now();

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => createEmptySyncState(),
			async (s) => { savedState = s; }
		);

		await engine.sync();

		expect(savedState).not.toBeNull();
		expect(savedState!.lastSyncTimestamp).toBeGreaterThanOrEqual(beforeSync);
	});

	it("uploads files in nested subdirectories and creates folder hierarchy", async () => {
		const vault = createMockVault([
			{ path: "a/b/c/deep.md", mtime: 1000, content: new ArrayBuffer(5) },
		]);
		const driveApi = createMockDriveApi();
		// Return unique folder IDs for each folder creation
		let folderCallCount = 0;
		driveApi.findOrCreateFolder = vi.fn(async (name: string) => {
			folderCallCount++;
			return `folder-${name}-${folderCallCount}`;
		});

		let savedState: SyncState | null = null;
		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => createEmptySyncState(),
			async (s) => { savedState = s; }
		);

		const stats = await engine.sync();

		expect(stats.uploaded).toBe(1);
		// Root folder + 3 subdirectories (a, b, c) = 4 findOrCreateFolder calls
		expect(driveApi.findOrCreateFolder).toHaveBeenCalledTimes(4);
		// Verify folder IDs were saved
		expect(savedState!.driveFolderIds["a"]).toBeDefined();
		expect(savedState!.driveFolderIds["a/b"]).toBeDefined();
		expect(savedState!.driveFolderIds["a/b/c"]).toBeDefined();
		// Verify file was uploaded to the correct parent folder (a/b/c), not root
		expect(driveApi.uploadFile).toHaveBeenCalledWith(
			expect.anything(),       // content
			"deep.md",               // fileName
			savedState!.driveFolderIds["a/b/c"],  // parentFolderId — must be folder c, not root
			undefined                // driveFileId (new file)
		);
		// Verify the sync record has correct folder
		expect(savedState!.records["a/b/c/deep.md"]).toBeDefined();
		expect(savedState!.records["a/b/c/deep.md"].driveFolderId).toBe(
			savedState!.driveFolderIds["a/b/c"]
		);
	});

	it("downloads files into nested subdirectories and creates all intermediate dirs", async () => {
		const vault = createMockVault();
		// Mock exists to return false for all directories
		vault.adapter.exists = vi.fn(async () => false);
		vault.adapter.stat = vi.fn(async () => ({ mtime: 5000, ctime: 5000, size: 10 }));

		const driveApi = createMockDriveApi([
			{ relativePath: "x/y/z/file.md", id: "d1", modifiedTime: new Date(2000).toISOString() },
		]);

		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => createEmptySyncState(),
			vi.fn(async () => {})
		);

		const stats = await engine.sync();

		expect(stats.downloaded).toBe(1);
		// Should create x, x/y, x/y/z — 3 mkdir calls
		expect(vault.adapter.mkdir).toHaveBeenCalledWith("x");
		expect(vault.adapter.mkdir).toHaveBeenCalledWith("x/y");
		expect(vault.adapter.mkdir).toHaveBeenCalledWith("x/y/z");
	});

	it("handles computeDiff correctly for files in subdirectories", () => {
		const localFiles: LocalFile[] = [
			{ path: "docs/notes/a.md", mtime: 2000 },
			{ path: "docs/notes/b.md", mtime: 1000 },
		];
		const remoteFiles: RemoteFile[] = [
			{ path: "docs/notes/a.md", driveFileId: "d1", driveFolderId: "f1", modifiedTime: 1000 },
			{ path: "docs/notes/b.md", driveFileId: "d2", driveFolderId: "f1", modifiedTime: 2000 },
		];
		const records: Record<string, SyncRecord> = {
			"docs/notes/a.md": { localPath: "docs/notes/a.md", driveFileId: "d1", driveFolderId: "f1", lastSyncedTime: 1000 },
			"docs/notes/b.md": { localPath: "docs/notes/b.md", driveFileId: "d2", driveFolderId: "f1", lastSyncedTime: 1000 },
		};
		const actions = computeDiff(localFiles, remoteFiles, records);

		expect(actions).toHaveLength(2);
		expect(actions).toContainEqual({
			type: "upload",
			path: "docs/notes/a.md",
			driveFileId: "d1",
			driveFolderId: "f1",
		});
		expect(actions).toContainEqual({
			type: "download",
			path: "docs/notes/b.md",
			driveFileId: "d2",
			driveFolderId: "f1",
			remoteModifiedTime: 2000,
		});
	});

	it("syncs mix of root and nested files correctly", async () => {
		const vault = createMockVault([
			{ path: "root.md", mtime: 1000, content: new ArrayBuffer(3) },
			{ path: "notes/daily/2024-01-01.md", mtime: 1000, content: new ArrayBuffer(5) },
			{ path: "notes/daily/2024-01-02.md", mtime: 1000, content: new ArrayBuffer(5) },
			{ path: "attachments/img/photo.png", mtime: 1000, content: new ArrayBuffer(8) },
		]);
		const driveApi = createMockDriveApi();
		const folderMap: Record<string, string> = {};
		driveApi.findOrCreateFolder = vi.fn(async (name: string, parentId?: string) => {
			const key = parentId ? `${parentId}/${name}` : name;
			folderMap[key] = `id-${name}`;
			return `id-${name}`;
		});

		let savedState: SyncState | null = null;
		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => createEmptySyncState(),
			async (s) => { savedState = s; }
		);

		const stats = await engine.sync();

		expect(stats.uploaded).toBe(4);
		expect(stats.errors).toBe(0);
		// All 4 files should have sync records
		expect(Object.keys(savedState!.records)).toHaveLength(4);
		expect(savedState!.records["root.md"]).toBeDefined();
		expect(savedState!.records["notes/daily/2024-01-01.md"]).toBeDefined();
		expect(savedState!.records["notes/daily/2024-01-02.md"]).toBeDefined();
		expect(savedState!.records["attachments/img/photo.png"]).toBeDefined();
		// Folder structure should be created:
		// root folder + notes + notes/daily + attachments + attachments/img = 5 calls
		expect(driveApi.findOrCreateFolder).toHaveBeenCalledTimes(5);
	});

	it("does not delete parent folders that still have files in subdirectories", async () => {
		// Scenario: delete "notes/a.md" but "notes/daily/b.md" still exists
		// The "notes" folder should NOT be deleted
		const vault = createMockVault([
			{ path: "notes/daily/b.md", mtime: 1000 },
		]);
		const driveApi = createMockDriveApi([
			{ relativePath: "notes/a.md", id: "d1", modifiedTime: new Date(1000).toISOString() },
			{ relativePath: "notes/daily/b.md", id: "d2", modifiedTime: new Date(1000).toISOString() },
		]);

		// State: both files were previously synced, now "notes/a.md" is deleted locally
		const state = createEmptySyncState();
		state.records["notes/a.md"] = {
			localPath: "notes/a.md",
			driveFileId: "d1",
			driveFolderId: "folder-notes",
			lastSyncedTime: 1000,
		};
		state.records["notes/daily/b.md"] = {
			localPath: "notes/daily/b.md",
			driveFileId: "d2",
			driveFolderId: "folder-daily",
			lastSyncedTime: 1000,
		};
		state.driveFolderIds[""] = "root-folder-id";
		state.driveFolderIds["notes"] = "folder-notes";
		state.driveFolderIds["notes/daily"] = "folder-daily";

		let savedState: SyncState | null = null;
		const engine = new SyncEngine(
			vault,
			driveApi,
			() => ({ driveFolderName: "Vault", excludePatterns: [] }),
			() => state,
			async (s) => { savedState = s; }
		);

		const stats = await engine.sync();

		// "notes/a.md" should be deleted from Drive
		expect(stats.deleted).toBe(1);
		expect(driveApi.deleteFile).toHaveBeenCalledWith("d1");
		// "notes" folder should NOT be deleted (still has "notes/daily/b.md")
		expect(savedState!.driveFolderIds["notes"]).toBe("folder-notes");
		// "notes/daily" folder should NOT be deleted
		expect(savedState!.driveFolderIds["notes/daily"]).toBe("folder-daily");
	});
});
