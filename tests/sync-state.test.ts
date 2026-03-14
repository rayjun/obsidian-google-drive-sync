import { describe, it, expect } from "vitest";
import {
	SyncRecord,
	SyncState,
	createEmptySyncState,
	upsertRecord,
	removeRecord,
	getRecord,
	isStateOutdated,
} from "../src/sync-state";

describe("SyncState", () => {
	it("creates empty state", () => {
		const state = createEmptySyncState();
		expect(state.records).toEqual({});
		expect(state.driveFolderIds).toEqual({});
		expect(state.lastSyncTimestamp).toBe(0);
		expect(state.stateVersion).toBe(1);
	});

	it("upserts a record", () => {
		const state = createEmptySyncState();
		const record: SyncRecord = {
			localPath: "notes/hello.md",
			driveFileId: "abc123",
			driveFolderId: "folder1",
			lastSyncedTime: 1000,
		};
		const updated = upsertRecord(state, record);
		expect(updated.records["notes/hello.md"]).toEqual(record);
	});

	it("removes a record", () => {
		let state = createEmptySyncState();
		const record: SyncRecord = {
			localPath: "notes/hello.md",
			driveFileId: "abc123",
			driveFolderId: "folder1",
			lastSyncedTime: 1000,
		};
		state = upsertRecord(state, record);
		const updated = removeRecord(state, "notes/hello.md");
		expect(updated.records["notes/hello.md"]).toBeUndefined();
	});

	it("gets a record", () => {
		let state = createEmptySyncState();
		const record: SyncRecord = {
			localPath: "test.md",
			driveFileId: "xyz",
			driveFolderId: "root",
			lastSyncedTime: 500,
		};
		state = upsertRecord(state, record);
		expect(getRecord(state, "test.md")).toEqual(record);
		expect(getRecord(state, "nonexistent.md")).toBeUndefined();
	});

	it("does not mutate original state on upsert", () => {
		const state = createEmptySyncState();
		const record: SyncRecord = {
			localPath: "a.md",
			driveFileId: "d1",
			driveFolderId: "f1",
			lastSyncedTime: 100,
		};
		const updated = upsertRecord(state, record);
		expect(state.records["a.md"]).toBeUndefined();
		expect(updated.records["a.md"]).toEqual(record);
	});

	it("does not mutate original state on remove", () => {
		const record: SyncRecord = {
			localPath: "a.md",
			driveFileId: "d1",
			driveFolderId: "f1",
			lastSyncedTime: 100,
		};
		const state = upsertRecord(createEmptySyncState(), record);
		const updated = removeRecord(state, "a.md");
		expect(state.records["a.md"]).toEqual(record);
		expect(updated.records["a.md"]).toBeUndefined();
	});
});

describe("isStateOutdated", () => {
	it("returns false for current version", () => {
		const state = createEmptySyncState();
		expect(isStateOutdated(state)).toBe(false);
	});

	it("returns true for version 0", () => {
		const state = createEmptySyncState();
		state.stateVersion = 0;
		expect(isStateOutdated(state)).toBe(true);
	});

	it("returns true for undefined stateVersion (legacy data)", () => {
		const state = { records: {}, driveFolderIds: {}, lastSyncTimestamp: 0 } as unknown as SyncState;
		expect(isStateOutdated(state)).toBe(true);
	});
});
