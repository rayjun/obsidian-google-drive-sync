# Obsidian Google Drive Sync

一个 Obsidian 插件，支持 Vault 与 Google Drive 之间的双向自动同步。

## 功能

- 双向同步，支持自动和手动触发
- 基于时间戳的三方 diff 算法，冲突时以最新修改为准
- 支持大文件断点续传（>5MB）
- 可配置同步间隔、排除文件等
- 支持桌面端和移动端
- 支持检测并清理 Google Drive 上的重复文件

## 安装

### 脚本安装

```bash
git clone https://github.com/rayjun/obsidian-google-drive-sync.git
cd obsidian-google-drive-sync
./install.sh              # 仅构建
./install.sh /path/to/vault  # 构建并安装到 Vault
```

### 手动安装

从 [Release](https://github.com/rayjun/obsidian-google-drive-sync/releases) 页面下载 `manifest.json`、`main.js`、`styles.css`，放入 `.obsidian/plugins/google-drive-sync/` 目录。

### 从源码构建

```bash
git clone https://github.com/rayjun/obsidian-google-drive-sync.git
cd obsidian-google-drive-sync
npm install
npm run build
```

将 `manifest.json`、`main.js`、`styles.css` 复制到 Vault 的 `.obsidian/plugins/google-drive-sync/` 目录下。

### 移动端安装（iOS）

1. 先在电脑上安装插件（通过以上任意方式），确保插件文件在 Vault 的 `.obsidian/plugins/google-drive-sync/` 目录下
2. 在 Mac 上将 Vault 移到 Obsidian 的 iCloud 目录：
   ```bash
   mv /path/to/your/vault ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/
   ```
   > 如果该目录不存在，先在 iPhone 上打开 Obsidian 并创建一个开启「Store in iCloud」的 Vault，Mac 上就会自动生成该目录
3. 等待 iCloud 同步完成（根据 Vault 大小可能需要几分钟）
4. 在 iPhone 上打开 Obsidian，Vault 会自动出现
5. 进入设置 > 第三方插件 > 关闭安全模式 > 启用 Google Drive Sync
6. 填入 Client ID 和 Client Secret，点击「Login to Google Drive」
7. 在浏览器中完成授权，复制授权码，回到插件设置粘贴提交

## 使用前准备

1. 在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建 OAuth 2.0 客户端（**桌面应用**类型）
2. 启用 Google Drive API
3. 在 **OAuth 同意屏幕 > 测试用户** 中添加你的 Google 账号（应用处于「测试」状态时需要）

## 配置

1. 打开 Obsidian 设置 > Google Drive Sync
2. 填入 Client ID 和 Client Secret
3. 点击「Login to Google Drive」完成授权
4. 授权成功后自动开始同步

> 桌面端授权自动完成。移动端授权后需手动复制授权码，粘贴到插件设置中。

## 使用

### 清理重复文件

如果 Google Drive 上出现了重复文件（例如同步中断导致），可以通过以下方式清理：

1. 打开命令面板（`Cmd/Ctrl + P`）
2. 搜索 **「Google Drive Sync: Remove duplicate files from Google Drive」**
3. 插件会扫描同名重复文件，保留最新的一份，删除其余副本

## 开源协议

[MIT](LICENSE)
