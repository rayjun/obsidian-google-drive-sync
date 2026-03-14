# Obsidian Google Drive Sync

Bidirectional sync between your Obsidian vault and Google Drive.

[中文文档](README_CN.md)

## Features

- Bidirectional sync with automatic and manual triggers
- Timestamp-based three-way diff — latest modification wins on conflict
- Resumable uploads for large files (>5MB)
- Configurable sync interval and exclude patterns
- Works on both desktop and mobile

## Installation

### From Community Plugins

Search for "Google Drive Sync" in Obsidian Settings > Community Plugins > Browse.

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

### Mobile

1. Install the plugin files on desktop first (via any method above)
2. Sync the vault to your phone via iCloud, Syncthing, or another method
3. Open the vault in Obsidian mobile, enable the plugin in Settings > Community Plugins

## Prerequisites

1. Create an OAuth 2.0 client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (choose **Desktop app** type)
2. Enable the Google Drive API

## Configuration

1. Open Obsidian Settings > Google Drive Sync
2. Enter your Client ID and Client Secret
3. Click "Login to Google Drive" to authorize
4. Sync starts automatically after login

> On desktop, authorization completes automatically. On mobile, copy the authorization code from the browser and paste it in the plugin settings.

## License

[MIT](LICENSE)
