# Obsidian Google Drive Sync

Bidirectional sync between your Obsidian vault and Google Drive. Automatically keeps your entire vault in sync at configurable intervals.

## Features

- **Bidirectional sync** — changes on either side are synced to the other
- **Automatic sync** — configurable interval (1-60 minutes, default 5)
- **Manual sync** — ribbon icon or command palette
- **Three-way diff** — compares local, remote, and last sync state to detect changes accurately
- **Conflict resolution** — last-modified-time wins (UTC)
- **Large file support** — resumable uploads for files > 5MB
- **Rate limiting** — automatic throttling (max 5 concurrent requests) with exponential backoff
- **Exclude patterns** — skip files/folders from sync (default: `.obsidian/**`, `.DS_Store`, `Thumbs.db`)
- **Multi-device** — multiple devices can sync to the same Google Drive folder

## Prerequisites

1. A Google Cloud project with the **Google Drive API** enabled
2. An **OAuth 2.0 Client ID** (Desktop app type) created in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
3. Add `http://localhost:42813/callback` as an authorized redirect URI

## Installation

### From source

```bash
git clone https://github.com/rayjun/obsidian-google-drive-sync.git
cd obsidian-google-drive-sync
npm install
npm run build
```

Copy `manifest.json`, `main.js`, and `styles.css` to your vault:

```bash
cp manifest.json main.js styles.css /path/to/vault/.obsidian/plugins/google-drive-sync/
```

### Manual

1. Download `manifest.json`, `main.js`, `styles.css` from the latest release
2. Create folder `.obsidian/plugins/google-drive-sync/` in your vault
3. Copy the three files into that folder
4. Restart Obsidian and enable the plugin in Settings > Community Plugins

## Setup

1. Open **Settings > Google Drive Sync**
2. Enter your **Client ID** and **Client Secret**
3. Click **Login to Google Drive** — a browser window opens for authorization
4. After authorizing, the plugin starts syncing automatically

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Sync interval | 5 min | How often to auto-sync (1-60 minutes) |
| Drive folder name | `Obsidian-Vault` | Root folder name on Google Drive |
| Exclude patterns | `.obsidian/**`, `.DS_Store`, `Thumbs.db` | Glob patterns to exclude from sync (one per line) |

## Commands

| Command | Description |
|---------|-------------|
| `Google Drive Sync: Sync now` | Trigger a manual sync |
| `Google Drive Sync: Login to Google Drive` | Start OAuth authorization |
| `Google Drive Sync: Logout` | Clear stored tokens |

## How it works

### Sync algorithm

The plugin uses a three-way diff algorithm comparing:

1. **Local state** — current files in the vault
2. **Remote state** — current files on Google Drive
3. **Last sync state** — snapshot from the previous sync

| Local | Remote | Action |
|-------|--------|--------|
| Modified | Unchanged | Upload to Drive |
| Unchanged | Modified | Download to local |
| Modified | Modified | Newer timestamp wins |
| New | Not exists | Upload to Drive |
| Not exists | New | Download to local |
| Deleted | Unchanged | Delete from Drive |
| Unchanged | Deleted | Delete from local |
| Deleted | Modified | Download (remote wins) |
| Modified | Deleted | Upload (local wins) |
| Deleted | Deleted | Remove sync record |

### Storage structure

The plugin creates a root folder on Google Drive (default: `Obsidian-Vault`) and mirrors your vault's directory structure inside it.

### Security

- OAuth scope: `drive.file` — only accesses files created by this plugin, not your entire Drive
- Tokens are stored locally in `.obsidian/plugins/google-drive-sync/data.json`
- CSRF protection via OAuth `state` parameter
- OAuth callback server binds to `127.0.0.1` only

## Development

```bash
npm install          # Install dependencies
npm run dev          # Build in watch mode
npm run build        # Production build
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

### Project structure

```
src/
├── main.ts              # Plugin entry point
├── settings.ts          # Settings interface and UI
├── google-auth.ts       # OAuth 2.0 authentication
├── google-drive-api.ts  # Google Drive API wrapper
├── sync-engine.ts       # Sync diff algorithm and execution
├── sync-state.ts        # Sync state management
└── utils.ts             # Shared utilities
tests/
├── utils.test.ts        # 16 tests
├── sync-state.test.ts   # 9 tests
└── sync-engine.test.ts  # 20 tests
```

## Limitations

- **Desktop only** — OAuth localhost callback requires a desktop environment
- **Exclude patterns** — supports `dir/**` recursive match and basename match (e.g., `.DS_Store`), but not full glob wildcards like `*.tmp`
- **Rename detection** — renames appear as delete + create (data is preserved, but Drive file history is lost)
- **No distributed locking** — multi-device sync is eventually consistent

## License

MIT
