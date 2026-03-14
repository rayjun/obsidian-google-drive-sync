# Mobile Support Design

## Goal

让 obsidian-google-drive-sync 插件支持移动端，统一桌面端和移动端的 OAuth 认证流程。

## 现状分析

当前插件 `isDesktopOnly: true`，唯一的阻塞点是 OAuth 认证流程依赖 Node.js `http` 模块在 localhost:42813 启动 HTTP 服务器接收回调。移动端无法绑定本地端口。

其余代码（Google Drive API 调用、文件同步、设置等）均使用 Obsidian API（`requestUrl`、`vault.adapter`），已兼容移动端。

## 设计方案

### OAuth 流程改造

**核心思路**：使用中转页面（静态 HTML，部署在 GitHub Pages）接收 Google OAuth 回调，然后重定向到 `obsidian://` 协议将授权码传回插件。

Google OAuth 的 redirect URI 限制：
- Web 应用类型：仅支持 `http://` 和 `https://`
- 桌面应用类型：仅支持 loopback 地址
- 不支持自定义 URL Scheme

因此需要一个 `https://` 中转页面作为 Google 的 redirect URI，页面收到授权码后通过 `obsidian://` 协议跳转回插件。

### OAuth 客户端类型

使用 Google Cloud Console 的 **Web 应用** 类型，redirect URI 设为中转页面地址（如 `https://rayjun.github.io/obsidian-google-drive-sync/callback`）。

`client_secret` 说明：Web 应用类型有 client_secret，嵌入开源客户端 JS 中可被提取，这是已知且被接受的 trade-off，是 Obsidian 社区插件的通用做法。PKCE 提供额外安全保障防止授权码被截获利用。

### 新 OAuth 流程

1. 插件生成 `state`（CSRF 防护）和 PKCE `code_verifier` / `code_challenge`
2. **将 `state`、`code_verifier`、`pendingOAuthExpiry` 持久化到 `this.saveData()`**（因为页面跳转后内存状态会丢失）
3. 使用 `window.location.href` 打开 Google OAuth 授权页（`window.open` 在 iOS 上不可靠）
4. 用户授权后，Google 重定向到中转页面 `https://rayjun.github.io/obsidian-google-drive-sync/callback?code=xxx&state=xxx`
5. 中转页面提取 URL 参数（包括 `code`/`state` 或 `error`），重定向到 `obsidian://google-drive-sync-callback?code=xxx&state=xxx`（或 `error=xxx&state=xxx`）
6. Obsidian 重新加载插件，`onload()` 中注册的 protocol handler 接收回调
7. 插件从持久化存储恢复 `state` 和 `code_verifier`，验证 `state` 匹配且未超时
8. 用 `code` + `code_verifier` + `client_secret` 换取 token
9. 成功后清除持久化的 `code_verifier` 和 pending 状态

授权 URL 完整参数：`client_id`、`redirect_uri`、`response_type=code`、`scope`、`access_type=offline`、`prompt=consent`、`state`、`code_challenge`、`code_challenge_method=S256`

### PKCE 实现

授权 URL 需包含：
- `code_challenge=<SHA256 hash of code_verifier, base64url encoded>`
- `code_challenge_method=S256`

Token 交换请求需包含：
- `code_verifier=<原始 code_verifier>`

### crypto 替换

`crypto.randomBytes` 替换为 Web Crypto API：
- `state` 生成：`crypto.getRandomValues(new Uint8Array(16))`，hex 编码
- PKCE `code_verifier` 生成：`crypto.getRandomValues(new Uint8Array(32))`，base64url 编码
- PKCE `code_challenge` 生成：`crypto.subtle.digest('SHA-256', ...)`，base64url 编码

### 超时与并发控制

- OAuth 流程设置 5 分钟超时，`pendingOAuthExpiry` 时间戳持久化到磁盘，插件重新加载时检查是否过期
- 若用户在已有 OAuth 流程进行中再次触发登录，取消前一次的 `state`，发起新流程
- Protocol handler 收到回调时，若无 pending 流程、`state` 不匹配或已超时，显示 Notice 提示并忽略
- 收到 Google 返回的 `error` 参数时（如 `access_denied`），显示对应错误提示并清除 pending 状态

### Protocol Handler 生命周期

- 在 `onload()` 中注册 `registerObsidianProtocolHandler("google-drive-sync-callback", ...)`（action 名用连字符，不含 `/`）
- Handler 持续存在于插件生命周期内
- 收到意外回调（无 pending 流程）时，gracefully 忽略

### 中转页面

静态 HTML，部署在 GitHub Pages，逻辑：
1. 从 URL 参数中提取 `code`/`state` 或 `error`/`state`
2. 重定向到 `obsidian://google-drive-sync-callback?code=xxx&state=xxx`（或 `error=xxx`）
3. 显示提示文字："正在跳转回 Obsidian..."
4. 若跳转失败，显示授权码供用户手动复制，插件设置中提供"粘贴授权码"输入框作为 fallback

### 改动文件

| 文件 | 变更 |
|------|------|
| `src/google-auth.ts` | 移除 `http`/`crypto` 模块；移除 `listenForAuthCode`；添加 PKCE 工具函数（`generateCodeVerifier`、`generateCodeChallenge`）；`REDIRECT_URI` 改为中转页面地址；`getAuthUrl` 增加 `code_challenge` 和 `code_challenge_method` 参数；`exchangeCodeForTokens` 增加 `code_verifier` 参数；`generateOAuthState` 改用 Web Crypto API |
| `src/main.ts` | 添加 `registerObsidianProtocolHandler` 处理回调；OAuth 流程改为事件驱动；持久化 pending OAuth 状态（`state`、`code_verifier`、`pendingOAuthExpiry`）到 `saveData()`；添加超时和并发控制；`window.open` 改为 `window.location.href`；设置中添加"粘贴授权码"输入框作为 fallback |
| `manifest.json` | `isDesktopOnly` 改为 `false` |
| `callback.html`（新建） | 中转页面，部署到 GitHub Pages |

### 用户迁移

- 已有的 refresh token 仍然有效，不影响已登录用户的同步
- 用户重新登录时需要使用新的 OAuth 客户端（Web 应用类型）
- README 中更新 OAuth 配置说明，redirect URI 改为中转页面地址

## 不变的部分

- Google Drive API 调用方式（`requestUrl`）
- 同步引擎逻辑（`sync-engine.ts`）
- 同步状态管理（`sync-state.ts`）
- 工具函数（`utils.ts`）
- 设置界面结构（`settings.ts`）
- Token 刷新逻辑
