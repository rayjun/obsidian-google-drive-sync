# Obsidian Google Drive Sync

一个 Obsidian 插件，支持 Vault 与 Google Drive 之间的双向自动同步。

## 功能

- 双向同步，支持自动和手动触发
- 基于时间戳的三方 diff 算法，冲突时以最新修改为准
- 支持大文件断点续传（>5MB）
- 可配置同步间隔、排除文件等

## 安装

### 从源码构建

```bash
git clone https://github.com/rayjun/obsidian-google-drive-sync.git
cd obsidian-google-drive-sync
npm install
npm run build
```

将 `manifest.json`、`main.js`、`styles.css` 复制到 Vault 的 `.obsidian/plugins/google-drive-sync/` 目录下，重启 Obsidian 并启用插件。

### 手动安装

从 Release 页面下载 `manifest.json`、`main.js`、`styles.css`，放入 `.obsidian/plugins/google-drive-sync/` 目录。

## 使用前准备

1. 在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建 OAuth 2.0 客户端（桌面应用类型）
2. 启用 Google Drive API
3. 在授权重定向 URI 中添加 `http://localhost:42813/callback`

## 配置

1. 打开 Obsidian 设置 > Google Drive Sync
2. 填入 Client ID 和 Client Secret
3. 点击「Login to Google Drive」完成授权
4. 授权成功后自动开始同步

## 开源协议

[MIT](LICENSE)
