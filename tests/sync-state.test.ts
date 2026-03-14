import { describe, it, expect } from "vitest";
import {
	SyncRecord,
	createEmptySyncState,
	upsertRecord,
	removeRecord,
	getRecord,
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
});
