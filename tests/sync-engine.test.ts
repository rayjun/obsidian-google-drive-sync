import { describe, it, expect } from "vitest";
import { computeDiff, LocalFile, RemoteFile } from "../src/sync-engine";
import { SyncRecord } from "../src/sync-state";

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
