# Obsidian Google Drive Sync

Bidirectional sync between your Obsidian vault and Google Drive.

[中文文档](README_CN.md)

## Features

- Bidirectional sync with automatic and manual triggers
- Timestamp-based three-way diff — latest modification wins on conflict
- Resumable uploads for large files (>5MB)
- Configurable sync interval and exclude patterns
- Works on both desktop and mobile
- Duplicate file detection and cleanup on Google Drive

## Installation

### Install Script

```bash
git clone https://github.com/rayjun/obsidian-google-drive-sync.git
cd obsidian-google-drive-sync
./install.sh              # Build only
./install.sh /path/to/vault  # Build and install to vault
```

### Manual Install

Download `manifest.json`, `main.js`, `styles.css` from the [Releases](https://github.com/rayjun/obsidian-google-drive-sync/releases) page, and place them in `.obsidian/plugins/google-drive-sync/` inside your vault.

### Build from Source

```bash
git clone https://github.com/rayjun/obsidian-google-drive-sync.git
cd obsidian-google-drive-sync
npm install
npm run build
```

Copy `manifest.json`, `main.js`, `styles.css` to `.obsidian/plugins/google-drive-sync/` in your vault.

### Mobile (iOS)

1. Install the plugin on desktop first (via any method above), making sure the plugin files are inside the vault's `.obsidian/plugins/google-drive-sync/` directory
2. Move the vault to the Obsidian iCloud directory on your Mac:
   ```bash
   mv /path/to/your/vault ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/
   ```
   > If this directory does not exist, open Obsidian on your iPhone first and create a new vault with "Store in iCloud" enabled. This will create the directory on your Mac.
3. Wait for iCloud to sync (may take a few minutes depending on vault size)
4. Open Obsidian on your iPhone — the vault should appear automatically
5. Go to Settings > Community Plugins > disable Restricted Mode > enable Google Drive Sync
6. Enter Client ID and Client Secret, tap "Login to Google Drive"
7. Complete authorization in the browser, copy the authorization code, go back to plugin settings and paste it

## Prerequisites

1. Create an OAuth 2.0 client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (choose **Desktop app** type)
2. Enable the Google Drive API
3. Add your Google account as a test user under **OAuth consent screen > Test users** (required while the app is in "Testing" status)

## Configuration

1. Open Obsidian Settings > Google Drive Sync
2. Enter your Client ID and Client Secret
3. Click "Login to Google Drive" to authorize
4. Sync starts automatically after login

> On desktop, authorization completes automatically. On mobile, copy the authorization code from the browser and paste it in the plugin settings.

## Usage

### Remove Duplicate Files

If duplicate files appear on Google Drive (e.g., due to interrupted syncs), you can clean them up:

1. Open the command palette (`Cmd/Ctrl + P`)
2. Search for **"Google Drive Sync: Remove duplicate files from Google Drive"**
3. The plugin will scan for files with the same path, keep the newest copy, and delete the rest

## License

[MIT](LICENSE)
