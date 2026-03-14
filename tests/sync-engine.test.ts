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
});
