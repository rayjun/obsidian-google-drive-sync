import type { Vault } from "obsidian";
import { GoogleDriveApi } from "./google-drive-api";
import {
	SyncState,
	SyncRecord,
	upsertRecord,
	removeRecord,
} from "./sync-state";
import { isExcluded, getParentPath, collectFolderPaths } from "./utils";

export interface LocalFile {
	path: string;
	mtime: number;
}

export interface RemoteFile {
	path: string;
	driveFileId: string;
	driveFolderId: string;
	modifiedTime: number;
}

export type SyncActionType =
	| "upload"
	| "download"
	| "delete_remote"
	| "delete_local"
	| "remove_record";

export interface SyncAction {
	type: SyncActionType;
	path: string;
	driveFileId: string | undefined;
	driveFolderId: string | undefined;
	remoteModifiedTime?: number;
}

/**
 * Compute the diff between local, remote, and last sync state.
 * Returns a list of actions to execute.
 */
export function computeDiff(
	localFiles: LocalFile[],
	remoteFiles: RemoteFile[],
	records: Record<string, SyncRecord>
): SyncAction[] {
	const actions: SyncAction[] = [];
	const localMap = new Map(localFiles.map((f) => [f.path, f]));
	const remoteMap = new Map(remoteFiles.map((f) => [f.path, f]));

	// All known paths: union of local, remote, and records
	const allPaths = new Set([
		...localMap.keys(),
		...remoteMap.keys(),
		...Object.keys(records),
	]);

	for (const path of allPaths) {
		const local = localMap.get(path);
		const remote = remoteMap.get(path);
		const record = records[path];

		if (local && remote && record) {
			// File exists everywhere — check for modifications
			const localModified = local.mtime > record.lastSyncedTime;
			const remoteModified = remote.modifiedTime > record.lastSyncedTime;

			if (localModified && remoteModified) {
				// Both modified — newer wins
				if (local.mtime >= remote.modifiedTime) {
					actions.push({
						type: "upload",
						path,
						driveFileId: remote.driveFileId,
						driveFolderId: remote.driveFolderId,
					});
				} else {
					actions.push({
						type: "download",
						path,
						driveFileId: remote.driveFileId,
						driveFolderId: remote.driveFolderId,
						remoteModifiedTime: remote.modifiedTime,
					});
				}
			} else if (localModified) {
				actions.push({
					type: "upload",
					path,
					driveFileId: remote.driveFileId,
					driveFolderId: remote.driveFolderId,
				});
			} else if (remoteModified) {
				actions.push({
					type: "download",
					path,
					driveFileId: remote.driveFileId,
					driveFolderId: remote.driveFolderId,
					remoteModifiedTime: remote.modifiedTime,
				});
			}
			// else: unchanged — skip
		} else if (local && remote && !record) {
			// Exists on both sides but no record (first sync) — newer wins
			if (local.mtime >= remote.modifiedTime) {
				actions.push({
					type: "upload",
					path,
					driveFileId: remote.driveFileId,
					driveFolderId: remote.driveFolderId,
				});
			} else {
				actions.push({
					type: "download",
					path,
					driveFileId: remote.driveFileId,
					driveFolderId: remote.driveFolderId,
					remoteModifiedTime: remote.modifiedTime,
				});
			}
		} else if (local && !remote && !record) {
			// New local file — upload
			actions.push({
				type: "upload",
				path,
				driveFileId: undefined,
				driveFolderId: undefined,
			});
		} else if (!local && remote && !record) {
			// New remote file — download
			actions.push({
				type: "download",
				path,
				driveFileId: remote.driveFileId,
				driveFolderId: remote.driveFolderId,
				remoteModifiedTime: remote.modifiedTime,
			});
		} else if (local && !remote && record) {
			// Deleted remotely
			const localModified = local.mtime > record.lastSyncedTime;
			if (localModified) {
				// Modified locally, deleted remotely — upload (local wins)
				actions.push({
					type: "upload",
					path,
					driveFileId: undefined,
					driveFolderId: undefined,
				});
			} else {
				// Not modified locally — delete local
				actions.push({
					type: "delete_local",
					path,
					driveFileId: record.driveFileId,
					driveFolderId: record.driveFolderId,
				});
			}
		} else if (!local && remote && record) {
			// Deleted locally
			const remoteModified = remote.modifiedTime > record.lastSyncedTime;
			if (remoteModified) {
				// Modified remotely — download (remote wins)
				actions.push({
					type: "download",
					path,
					driveFileId: remote.driveFileId,
					driveFolderId: remote.driveFolderId,
					remoteModifiedTime: remote.modifiedTime,
				});
			} else {
				// Not modified remotely — delete remote
				actions.push({
					type: "delete_remote",
					path,
					driveFileId: record.driveFileId,
					driveFolderId: record.driveFolderId,
				});
			}
		} else if (!local && !remote && record) {
			// Deleted on both sides — just remove record
			actions.push({
				type: "remove_record",
				path,
				driveFileId: record.driveFileId,
				driveFolderId: record.driveFolderId,
			});
		}
	}

	return actions;
}

export class SyncEngine {
	private syncInProgress = false;

	constructor(
		private vault: Vault,
		private driveApi: GoogleDriveApi,
		private getSettings: () => {
			driveFolderName: string;
			excludePatterns: string[];
		},
		private getSyncState: () => SyncState,
		private saveSyncState: (state: SyncState) => Promise<void>
	) {}

	isSyncing(): boolean {
		return this.syncInProgress;
	}

	async sync(): Promise<{
		uploaded: number;
		downloaded: number;
		deleted: number;
		errors: number;
	}> {
		if (this.syncInProgress) {
			console.log("[Google Drive Sync] Sync already in progress, skipping.");
			return { uploaded: 0, downloaded: 0, deleted: 0, errors: 0 };
		}

		this.syncInProgress = true;
		const stats = { uploaded: 0, downloaded: 0, deleted: 0, errors: 0 };

		try {
			const settings = this.getSettings();
			let state = this.getSyncState();

			// 1. Find or create root folder
			const rootFolderId = await this.driveApi.findOrCreateFolder(
				settings.driveFolderName
			);
			state.driveFolderIds[""] = rootFolderId;

			// 2. List local files
			const allLocalFiles = this.vault.getFiles();
			const localFiles: LocalFile[] = allLocalFiles
				.filter((f) => !isExcluded(f.path, settings.excludePatterns))
				.map((f) => ({ path: f.path, mtime: f.stat.mtime }));

			console.log(
				`[Google Drive Sync] Local files: ${localFiles.length} (total: ${allLocalFiles.length})`
			);

			// 3. List remote files (also populates folder IDs)
			const remoteFolderIds: Record<string, string> = {};
			const remoteEntries =
				await this.driveApi.listAllFilesRecursive(
					rootFolderId,
					remoteFolderIds
				);
			// Merge remote folder IDs into state
			Object.assign(state.driveFolderIds, remoteFolderIds);

			const remoteFiles: RemoteFile[] = remoteEntries
				.filter((e) => !isExcluded(e.relativePath, settings.excludePatterns))
				.map((e) => ({
					path: e.relativePath,
					driveFileId: e.file.id,
					driveFolderId: e.file.parents?.[0] ?? rootFolderId,
					modifiedTime: new Date(e.file.modifiedTime).getTime(),
				}));

			console.log(
				`[Google Drive Sync] Remote files: ${remoteFiles.length}`
			);

			// 4. Compute diff
			const actions = computeDiff(localFiles, remoteFiles, state.records);

			console.log(
				`[Google Drive Sync] Actions: ${actions.length}`,
				actions.map((a) => `${a.type}: ${a.path}`).join(", ")
			);

			// 5. Ensure all needed folders exist on Drive
			const uploadPaths = actions
				.filter((a) => a.type === "upload")
				.map((a) => a.path);
			const neededFolders = collectFolderPaths(uploadPaths);
			for (const folderPath of neededFolders) {
				if (!state.driveFolderIds[folderPath]) {
					const parentPath = getParentPath(folderPath);
					const parentId =
						state.driveFolderIds[parentPath] ?? rootFolderId;
					const folderName = folderPath.split("/").pop()!;
					const folderId = await this.driveApi.findOrCreateFolder(
						folderName,
						parentId
					);
					state.driveFolderIds[folderPath] = folderId;
				}
			}

			// 6. Execute actions
			for (const action of actions) {
				try {
					switch (action.type) {
						case "upload": {
							const content = await this.vault.adapter.readBinary(
								action.path
							);
							const fileName = action.path.split("/").pop()!;
							const parentPath = getParentPath(action.path);
							const parentFolderId =
								state.driveFolderIds[parentPath] ?? rootFolderId;

							const driveFile = await this.driveApi.uploadFile(
								content,
								fileName,
								parentFolderId,
								action.driveFileId
							);

							// Use the greater of local mtime and remote modifiedTime
							// to prevent clock skew from causing duplicate uploads
							const fileStat = await this.vault.adapter.stat(action.path);
							const localMtime = fileStat?.mtime ?? Date.now();
							const remoteMtime = new Date(driveFile.modifiedTime).getTime();
							const syncTime = Math.max(localMtime, remoteMtime);

							state = upsertRecord(state, {
								localPath: action.path,
								driveFileId: driveFile.id,
								driveFolderId: parentFolderId,
								lastSyncedTime: syncTime,
							});
							stats.uploaded++;
							break;
						}

						case "download": {
							const content = await this.driveApi.downloadFile(
								action.driveFileId!
							);
							// Ensure full directory hierarchy exists locally
							const parentPath = getParentPath(action.path);
							if (parentPath) {
								const parts = parentPath.split("/");
								let current = "";
								for (const part of parts) {
									current = current ? `${current}/${part}` : part;
									const exists =
										await this.vault.adapter.exists(current);
									if (!exists) {
										await this.vault.adapter.mkdir(current);
									}
								}
							}
							await this.vault.adapter.writeBinary(
								action.path,
								content
							);

							// Use the actual file mtime after writing to avoid clock skew
							const fileStat = await this.vault.adapter.stat(action.path);
							const localMtime = fileStat?.mtime ?? Date.now();

							// Use the greater of local mtime and remote modifiedTime
							// to prevent re-downloading files that were deleted locally
							const syncTime = Math.max(localMtime, action.remoteModifiedTime ?? localMtime);

							state = upsertRecord(state, {
								localPath: action.path,
								driveFileId: action.driveFileId!,
								driveFolderId: action.driveFolderId!,
								lastSyncedTime: syncTime,
							});
							stats.downloaded++;
							break;
						}

						case "delete_remote": {
							await this.driveApi.deleteFile(action.driveFileId!);
							state = removeRecord(state, action.path);
							stats.deleted++;
							break;
						}

						case "delete_local": {
							const exists = await this.vault.adapter.exists(
								action.path
							);
							if (exists) {
								await this.vault.adapter.remove(action.path);
							}
							state = removeRecord(state, action.path);
							stats.deleted++;
							break;
						}

						case "remove_record": {
							state = removeRecord(state, action.path);
							break;
						}
					}
				} catch (err) {
					console.error(
						`[Google Drive Sync] Failed to ${action.type} ${action.path}:`,
						err
					);
					stats.errors++;
				}
			}

			// 7. Clean up empty folders (bottom-up)
			const deletedPaths = actions
				.filter(
					(a) =>
						a.type === "delete_remote" ||
						a.type === "delete_local" ||
						a.type === "remove_record"
				)
				.map((a) => a.path);
			if (deletedPaths.length > 0) {
				const folderPathsToCheck =
					collectFolderPaths(deletedPaths).reverse(); // deepest first
				for (const folderPath of folderPathsToCheck) {
					// Check if any remaining synced file is inside this folder
					// (either directly or in a subdirectory)
					const hasFiles = Object.values(state.records).some(
						(r) =>
							getParentPath(r.localPath) === folderPath ||
							r.localPath.startsWith(folderPath + "/")
					);
					if (!hasFiles) {
						// Clean up remote folder
						if (state.driveFolderIds[folderPath]) {
							try {
								await this.driveApi.deleteFile(
									state.driveFolderIds[folderPath]!
								);
								delete state.driveFolderIds[folderPath];
							} catch {
								// Folder may not be empty on Drive — ignore
							}
						}
						// Clean up local empty folder
						try {
							const localExists =
								await this.vault.adapter.exists(folderPath);
							if (localExists) {
								await this.vault.adapter.rmdir(folderPath, false);
							}
						} catch {
							// Folder may not be empty locally — ignore
						}
					}
				}
			}

			// 8. Update sync timestamp and save state
			state.lastSyncTimestamp = Date.now();
			await this.saveSyncState(state);

			return stats;
		} finally {
			this.syncInProgress = false;
		}
	}
}
