export interface SyncRecord {
	localPath: string;
	driveFileId: string;
	driveFolderId: string;
	lastSyncedTime: number;
}

export interface SyncState {
	records: Record<string, SyncRecord>;
	driveFolderIds: Record<string, string>;
	lastSyncTimestamp: number;
	stateVersion: number;
}

const CURRENT_STATE_VERSION = 1;

export function createEmptySyncState(): SyncState {
	return {
		records: {},
		driveFolderIds: {},
		lastSyncTimestamp: 0,
		stateVersion: CURRENT_STATE_VERSION,
	};
}

export function upsertRecord(state: SyncState, record: SyncRecord): SyncState {
	return {
		...state,
		records: {
			...state.records,
			[record.localPath]: record,
		},
	};
}

export function removeRecord(state: SyncState, localPath: string): SyncState {
	const { [localPath]: _, ...rest } = state.records;
	return {
		...state,
		records: rest,
	};
}

export function getRecord(
	state: SyncState,
	localPath: string
): SyncRecord | undefined {
	return state.records[localPath];
}

export function isStateOutdated(state: SyncState): boolean {
	return (state.stateVersion ?? 0) < CURRENT_STATE_VERSION;
}
