# Obsidian Google Drive Sync Plugin - Design Spec

## Overview

An Obsidian plugin that provides bidirectional sync between an Obsidian vault and Google Drive. The entire vault (all file types) is synced automatically at configurable intervals. Conflicts are resolved by last-modified-time-wins. Authentication uses OAuth 2.0 with user-provided credentials.

## Architecture

### Module Structure

```
src/
├── main.ts                  # Plugin entry: registers commands, settings, ribbon, timer
├── settings.ts              # Settings interface and settings tab UI
├── google-auth.ts           # OAuth 2.0 flow (authorize, token exchange, refresh)
├── google-drive-api.ts      # Google Drive API wrapper (list, upload, download, delete)
├── sync-engine.ts           # Core sync logic (diff calculation + action execution)
└── sync-state.ts            # Sync state persistence (tracks per-file sync records)
```

### Data Flow

1. Timer fires (or user clicks manual sync) -> `SyncEngine.sync()`
2. SyncEngine fetches local file list from vault + remote file list from Google Drive
3. SyncEngine compares both lists against `SyncState` (last known sync snapshot)
4. Generates a changeset: files to upload, download, or delete
5. Executes changeset actions via `GoogleDriveApi`
6. Updates `SyncState` with new sync records

### Google Drive Storage

- A root folder is created in the user's Google Drive (default name: `Obsidian-Vault`, configurable)
- Directory structure inside mirrors the vault's folder hierarchy
- Each file maps 1:1 to a Drive file; folders map to Drive folders

## OAuth 2.0 Authentication

### Prerequisites

User creates an OAuth 2.0 Client ID in Google Cloud Console and enters `Client ID` and `Client Secret` in the plugin settings.

### Flow

1. User clicks "Login to Google Drive" in settings
2. Plugin constructs OAuth authorization URL with scope `https://www.googleapis.com/auth/drive.file`
3. Opens system browser via `window.open()`
4. User authorizes; Google redirects to `http://localhost:{PORT}/callback`
5. Plugin runs a temporary local HTTP server (via Node `http` module) to capture the authorization code
6. Exchanges code for `access_token` + `refresh_token` via POST to Google token endpoint
7. Tokens stored via `plugin.saveData()` in Obsidian's plugin data directory
8. On token expiry, automatically refreshes using `refresh_token`; if refresh fails, prompts re-login

### Scope

`https://www.googleapis.com/auth/drive.file` — grants access only to files created or opened by this app, not the user's entire Drive.

## First-Run / Initial Sync

On first sync (empty `SyncState`):

1. Plugin creates the root folder on Google Drive if it doesn't exist
2. Plugin lists all local vault files and all files in the Drive root folder
3. **Merge strategy**: For each file that exists on only one side, sync it to the other side. For files that exist on both sides with the same relative path, compare `modifiedTime` — the newer version wins.
4. After initial sync completes, a full `SyncState` is built from the merged result.

This means the plugin supports re-linking to an existing Drive folder (e.g., setting up a second device). Since `drive.file` scope only sees files created by the app, re-linking requires re-authorizing with the same OAuth client that originally created the files.

## Sync Engine

### Concurrency Guard

A `syncInProgress` flag prevents overlapping sync cycles. If the timer fires while a sync is running, the cycle is skipped. Manual sync requests while a sync is in progress show a notice: "Sync already in progress."

### SyncState Data Structure

```typescript
interface SyncRecord {
  localPath: string;        // Relative path within the vault
  driveFileId: string;      // Google Drive file ID
  driveFolderId: string;    // Parent folder's Drive ID
  lastSyncedTime: number;   // File modified time at last sync (ms epoch)
}

interface SyncState {
  records: Record<string, SyncRecord>;  // keyed by localPath
  driveFolderIds: Record<string, string>; // folder path -> Drive folder ID
  lastSyncTimestamp: number;             // when sync last completed
}
```

Persisted via `plugin.saveData()`.

### Diff Algorithm

A file is considered "modified" if its `mtime` (local) or `modifiedTime` (remote, in UTC) is newer than the `lastSyncedTime` recorded in the SyncRecord. All timestamps are compared in UTC. Local `mtime` is converted to UTC epoch ms for comparison against Google Drive's `modifiedTime` (which is already UTC).

Three-way comparison: local current state, remote current state, last sync record.

| Local Change | Remote Change | Action |
|---|---|---|
| Unchanged | Unchanged | Skip |
| Modified | Unchanged | Upload to Drive |
| Unchanged | Modified | Download to local |
| Modified | Modified | Compare `modifiedTime` (both in UTC); newer version overwrites older |
| New (local) | Not exists | Upload to Drive |
| Not exists | New (remote) | Download to local |
| Deleted (local) | Unchanged | Delete from Drive |
| Unchanged | Deleted (remote) | Delete from local |
| Deleted (local) | Modified (remote) | Download from remote (remote wins) |
| Modified (local) | Deleted (remote) | Upload to Drive (local wins) |
| Deleted (local) | Deleted (remote) | Remove SyncRecord, no action needed |

### Sync Execution Order

1. Create folders first (ensure parent folders exist before uploading files)
2. Upload new/modified files
3. Download new/modified files
4. Delete files
5. Delete empty folders (bottom-up)

### Exclude Rules

- Default: `.obsidian/**`, `.DS_Store`, `Thumbs.db` (plugin configs and OS artifacts should not sync)
- User-configurable list of glob patterns in settings
- Matched files/folders are ignored in both directions
- Symlinks are not followed; they are skipped during sync

### Rename Handling

Renames are not explicitly detected. A rename appears as a delete + create, which results in deleting the old file from Drive and uploading the new file. This is acceptable for the initial version — Drive file history is lost for renames, but data integrity is preserved.

### Folder Deletion

When all files in a folder are deleted (by the per-file diff), the folder becomes empty. Empty folders are cleaned up bottom-up in step 5 of the execution order. Folder-level diffs are not tracked separately; folder existence is derived from file presence.

### Multi-Device Usage

Multiple devices can sync to the same Google Drive folder. Each device maintains its own local `SyncState`. Since conflicts are resolved by last-modified-time-wins (UTC), concurrent edits from different devices are handled the same as any other conflict. There is no distributed locking — the sync is eventually consistent.

## Settings

### Configuration Interface

```typescript
interface GoogleDriveSyncSettings {
  clientId: string;           // OAuth Client ID
  clientSecret: string;       // OAuth Client Secret
  accessToken: string;        // Current access token
  refreshToken: string;       // Refresh token
  tokenExpiry: number;        // Token expiry timestamp (ms)
  syncInterval: number;       // Sync interval in minutes (default: 5, range: 1-60)
  driveFolderName: string;    // Root folder name on Drive (default: "Obsidian-Vault")
  excludePatterns: string[];  // Glob patterns to exclude (default: [".obsidian/**", ".DS_Store", "Thumbs.db"])
  stateVersion: number;       // Schema version for SyncState migration
}
```

### Settings Tab UI

- **Google Account section**: Client ID input, Client Secret input, Login/Logout button, auth status display
- **Sync section**: Interval slider (1-60 min), Drive folder name input, exclude patterns editor
- **Status section**: Last sync time, files synced count

## User Interaction

### Ribbon Icon

- Cloud icon in the left sidebar
- Click to trigger manual sync
- Visual state: idle / syncing (spinning) / error (red)

### Status Bar

- Shows sync status: "Google Drive: Idle" / "Syncing..." / "Last sync: 2 min ago" / "Error: ..."

### Command Palette

- `Google Drive Sync: Sync now` — manual sync trigger
- `Google Drive Sync: Login to Google Drive` — start OAuth flow
- `Google Drive Sync: Logout` — clear tokens

### Notifications

- `Notice` on sync completion: "Google Drive sync complete (X uploaded, Y downloaded)"
- `Notice` on error: "Google Drive sync failed: {error message}"

## Error Handling

- **Token expired**: Auto-refresh; if refresh fails, show notice and prompt re-login
- **Network error**: Skip current sync cycle, retry on next interval
- **Single file failure**: Log error, continue syncing remaining files, report failures in summary
- **Rate limiting**: Respect Google API rate limits; back off and retry with exponential delay
- **Large files**: Google Drive API supports resumable uploads; use for files > 5MB
- **Rate limiting strategy**: Batch API requests where possible. Limit concurrent requests to 5. Use exponential backoff (starting at 1s, max 60s) on 403/429 responses.

## Technical Constraints

- **Obsidian API**: Use `vault.adapter` for file system operations (read, write, list, stat, delete)
- **HTTP server for OAuth**: Uses Node `http` module available in Obsidian's Electron renderer process. This is desktop-only. If Obsidian restricts Node integration in the future, a fallback approach would be manual copy-paste of the auth code from the browser redirect URL.
- **Token storage**: Tokens are stored in plain JSON via `plugin.saveData()` (under `.obsidian/plugins/`). This is excluded from sync by the default `.obsidian/**` pattern. Users should ensure restrictive file permissions on their vault directory.
- **State versioning**: `SyncState` includes a `stateVersion` field. On schema changes, the plugin detects outdated versions and performs a full re-sync to rebuild state.
- **esbuild bundling**: All dependencies bundled; `obsidian` and `electron` are external
- **Desktop only**: OAuth localhost callback requires desktop environment; set `isDesktopOnly: true` in manifest
