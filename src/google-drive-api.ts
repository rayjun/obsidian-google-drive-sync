import { requestUrl } from "obsidian";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const MAX_CONCURRENT = 5;

export interface DriveFile {
	id: string;
	name: string;
	mimeType: string;
	modifiedTime: string; // ISO 8601
	parents?: string[];
}

export interface DriveListResponse {
	files: DriveFile[];
	nextPageToken?: string;
}

/**
 * Throttle concurrent requests to avoid rate limits.
 */
class RequestThrottler {
	private running = 0;
	private queue: (() => void)[] = [];

	async acquire(): Promise<void> {
		if (this.running < MAX_CONCURRENT) {
			this.running++;
			return;
		}
		return new Promise((resolve) => {
			this.queue.push(() => {
				this.running++;
				resolve();
			});
		});
	}

	release(): void {
		this.running--;
		const next = this.queue.shift();
		if (next) next();
	}
}

const throttler = new RequestThrottler();

async function throttledRequest<T>(fn: () => Promise<T>): Promise<T> {
	await throttler.acquire();
	try {
		return await fn();
	} finally {
		throttler.release();
	}
}

/**
 * Retry with exponential backoff on 403/429 errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
	let delay = 1000;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err: unknown) {
			const status = (err as { status?: number }).status;
			if ((status === 403 || status === 429) && attempt < maxRetries) {
				await new Promise((r) => setTimeout(r, delay));
				delay = Math.min(delay * 2, 60000);
				continue;
			}
			throw err;
		}
	}
	throw new Error("withRetry: should not reach here");
}

export class GoogleDriveApi {
	constructor(private getAccessToken: () => Promise<string>) {}

	private async authHeaders(): Promise<Record<string, string>> {
		const token = await this.getAccessToken();
		return { Authorization: `Bearer ${token}` };
	}

	/**
	 * Find or create the root sync folder. Returns the folder ID.
	 */
	async findOrCreateFolder(
		folderName: string,
		parentId?: string
	): Promise<string> {
		return withRetry(() =>
			throttledRequest(async () => {
				const safeName = folderName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
				const q = parentId
					? `name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
					: `name='${safeName}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

				const headers = await this.authHeaders();
				const listResp = await requestUrl({
					url: `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
					headers,
				});
				const data = listResp.json as DriveListResponse;

				if (data.files.length > 0) {
					return data.files[0]!.id;
				}

				// Create folder
				const createResp = await requestUrl({
					url: `${DRIVE_API_BASE}/files`,
					method: "POST",
					headers: { ...headers, "Content-Type": "application/json" },
					body: JSON.stringify({
						name: folderName,
						mimeType: "application/vnd.google-apps.folder",
						parents: parentId ? [parentId] : undefined,
					}),
				});
				return (createResp.json as DriveFile).id;
			})
		);
	}

	/**
	 * List all files in a folder (recursively pages through results).
	 */
	async listAllFiles(folderId: string): Promise<DriveFile[]> {
		const allFiles: DriveFile[] = [];
		let pageToken: string | undefined;

		do {
			const result = await withRetry(() =>
				throttledRequest(async () => {
					const headers = await this.authHeaders();
					const params = new URLSearchParams({
						q: `'${folderId}' in parents and trashed=false`,
						fields:
							"nextPageToken,files(id,name,mimeType,modifiedTime,parents)",
						pageSize: "1000",
					});
					if (pageToken) params.set("pageToken", pageToken);

					const resp = await requestUrl({
						url: `${DRIVE_API_BASE}/files?${params.toString()}`,
						headers,
					});
					return resp.json as DriveListResponse;
				})
			);

			allFiles.push(...result.files);
			pageToken = result.nextPageToken;
		} while (pageToken);

		return allFiles;
	}

	/**
	 * Recursively list all files in the sync folder tree.
	 * Returns files with their relative paths resolved.
	 * Also populates the folderIds map with folder path -> Drive ID mappings.
	 */
	async listAllFilesRecursive(
		rootFolderId: string,
		folderIds?: Record<string, string>
	): Promise<{ file: DriveFile; relativePath: string }[]> {
		const result: { file: DriveFile; relativePath: string }[] = [];
		if (folderIds) {
			folderIds[""] = rootFolderId;
		}

		const walk = async (folderId: string, pathPrefix: string) => {
			const files = await this.listAllFiles(folderId);
			for (const file of files) {
				const filePath = pathPrefix
					? `${pathPrefix}/${file.name}`
					: file.name;
				if (file.mimeType === "application/vnd.google-apps.folder") {
					if (folderIds) {
						folderIds[filePath] = file.id;
					}
					await walk(file.id, filePath);
				} else {
					result.push({ file, relativePath: filePath });
				}
			}
		};

		await walk(rootFolderId, "");
		return result;
	}

	/**
	 * Find an existing file by name in a specific folder.
	 * Returns the file ID if found, undefined otherwise.
	 */
	private async findExistingFile(
		fileName: string,
		parentFolderId: string
	): Promise<string | undefined> {
		return withRetry(() =>
			throttledRequest(async () => {
				const safeName = fileName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
				const q = `name='${safeName}' and '${parentFolderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
				const headers = await this.authHeaders();
				const resp = await requestUrl({
					url: `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
					headers,
				});
				const data = resp.json as DriveListResponse;
				return data.files.length > 0 ? data.files[0]!.id : undefined;
			})
		);
	}

	/**
	 * Upload a file (create or update).
	 * Uses resumable upload for files > 5MB, simple upload otherwise.
	 * If no existingFileId is given, checks for an existing file with the same
	 * name in the parent folder to avoid creating duplicates.
	 */
	async uploadFile(
		content: ArrayBuffer,
		fileName: string,
		parentFolderId: string,
		existingFileId?: string
	): Promise<DriveFile> {
		// If no existing file ID, check if a file with the same name already exists
		// in the parent folder to prevent duplicates
		if (!existingFileId) {
			existingFileId = await this.findExistingFile(fileName, parentFolderId);
		}

		const RESUMABLE_THRESHOLD = 5 * 1024 * 1024; // 5MB

		if (content.byteLength > RESUMABLE_THRESHOLD) {
			return this.resumableUpload(
				content,
				fileName,
				parentFolderId,
				existingFileId
			);
		}

		return withRetry(() =>
			throttledRequest(async () => {
				const headers = await this.authHeaders();

				if (existingFileId) {
					const resp = await requestUrl({
						url: `${DRIVE_UPLOAD_BASE}/files/${existingFileId}?uploadType=media&fields=id,name,mimeType,modifiedTime`,
						method: "PATCH",
						headers: {
							...headers,
							"Content-Type": "application/octet-stream",
						},
						body: content,
					});
					return resp.json as DriveFile;
				} else {
					const metadata = {
						name: fileName,
						parents: [parentFolderId],
					};

					const boundary = "obsidian_gdrive_sync_boundary";
					const metadataPart = JSON.stringify(metadata);
					const encoder = new TextEncoder();

					const bodyParts = [
						encoder.encode(
							`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
						),
						new Uint8Array(content),
						encoder.encode(`\r\n--${boundary}--`),
					];

					const totalLength = bodyParts.reduce(
						(sum, part) => sum + part.byteLength,
						0
					);
					const body = new Uint8Array(totalLength);
					let offset = 0;
					for (const part of bodyParts) {
						body.set(part, offset);
						offset += part.byteLength;
					}

					const resp = await requestUrl({
						url: `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime`,
						method: "POST",
						headers: {
							...headers,
							"Content-Type": `multipart/related; boundary=${boundary}`,
						},
						body: body.buffer,
					});
					return resp.json as DriveFile;
				}
			})
		);
	}

	/**
	 * Resumable upload for large files (>5MB).
	 */
	private async resumableUpload(
		content: ArrayBuffer,
		fileName: string,
		parentFolderId: string,
		existingFileId?: string
	): Promise<DriveFile> {
		return withRetry(() =>
			throttledRequest(async () => {
				const headers = await this.authHeaders();

				// Step 1: Initiate resumable upload session
				const initUrl = existingFileId
					? `${DRIVE_UPLOAD_BASE}/files/${existingFileId}?uploadType=resumable&fields=id,name,mimeType,modifiedTime`
					: `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id,name,mimeType,modifiedTime`;

				const metadata = existingFileId
					? { name: fileName }
					: { name: fileName, parents: [parentFolderId] };

				const initResp = await requestUrl({
					url: initUrl,
					method: existingFileId ? "PATCH" : "POST",
					headers: {
						...headers,
						"Content-Type": "application/json; charset=UTF-8",
						"X-Upload-Content-Length": content.byteLength.toString(),
					},
					body: JSON.stringify(metadata),
				});

				const uploadUrl = initResp.headers["location"];
				if (!uploadUrl) {
					throw new Error("No upload URL in resumable upload response");
				}

				// Step 2: Upload the content
				const resp = await requestUrl({
					url: uploadUrl,
					method: "PUT",
					headers: {
						"Content-Type": "application/octet-stream",
						"Content-Length": content.byteLength.toString(),
					},
					body: content,
				});

				return resp.json as DriveFile;
			})
		);
	}

	/**
	 * Download file content.
	 */
	async downloadFile(fileId: string): Promise<ArrayBuffer> {
		return withRetry(() =>
			throttledRequest(async () => {
				const headers = await this.authHeaders();
				const resp = await requestUrl({
					url: `${DRIVE_API_BASE}/files/${fileId}?alt=media`,
					headers,
				});
				return resp.arrayBuffer;
			})
		);
	}

	/**
	 * Delete a file or folder.
	 */
	async deleteFile(fileId: string): Promise<void> {
		return withRetry(() =>
			throttledRequest(async () => {
				const headers = await this.authHeaders();
				await requestUrl({
					url: `${DRIVE_API_BASE}/files/${fileId}`,
					method: "DELETE",
					headers,
				});
			})
		);
	}

	/**
	 * Find and remove duplicate files in the sync folder tree.
	 * For each group of files with the same relative path, keeps the newest
	 * one (by modifiedTime) and deletes the rest.
	 * Returns the number of duplicates deleted.
	 */
	async deduplicateFiles(rootFolderId: string): Promise<number> {
		const entries = await this.listAllFilesRecursive(rootFolderId);

		// Group by relative path
		const pathGroups = new Map<string, { file: DriveFile; relativePath: string }[]>();
		for (const entry of entries) {
			const group = pathGroups.get(entry.relativePath) ?? [];
			group.push(entry);
			pathGroups.set(entry.relativePath, group);
		}

		let deletedCount = 0;
		for (const [, group] of pathGroups) {
			if (group.length <= 1) continue;

			// Sort by modifiedTime descending — keep the newest
			group.sort(
				(a, b) =>
					new Date(b.file.modifiedTime).getTime() -
					new Date(a.file.modifiedTime).getTime()
			);

			// Delete all but the first (newest)
			for (let i = 1; i < group.length; i++) {
				try {
					await this.deleteFile(group[i]!.file.id);
					deletedCount++;
				} catch (err) {
					console.error(
						`[Google Drive Sync] Failed to delete duplicate ${group[i]!.relativePath} (${group[i]!.file.id}):`,
						err
					);
				}
			}
		}

		return deletedCount;
	}
}
