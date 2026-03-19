import { moment } from "obsidian";

export type Locale = "en" | "zh";
export type LanguageSetting = "auto" | Locale;

interface TranslationDict {
	[key: string]: string;
}

const en: TranslationDict = {
	// Settings page
	"settings.title": "Google Drive Sync Settings",
	"settings.googleAccount": "Google Account",
	"settings.clientId": "Client ID",
	"settings.clientIdDesc": "OAuth 2.0 Client ID from Google Cloud Console",
	"settings.clientIdPlaceholder": "Enter Client ID",
	"settings.clientSecret": "Client Secret",
	"settings.clientSecretDesc": "OAuth 2.0 Client Secret from Google Cloud Console",
	"settings.clientSecretPlaceholder": "Enter Client Secret",
	"settings.authentication": "Authentication",
	"settings.loggedIn": "Logged in to Google Drive",
	"settings.notLoggedIn": "Not logged in",
	"settings.loginButton": "Login to Google Drive",
	"settings.logoutButton": "Logout",
	"settings.pasteAuthCode": "Paste authorization code",
	"settings.pasteAuthCodeDesc": "If the automatic redirect didn't work, paste the authorization code here",
	"settings.submitButton": "Submit",
	"settings.syncSettings": "Sync Settings",
	"settings.syncInterval": "Sync interval",
	"settings.syncIntervalDesc": "How often to sync (in minutes)",
	"settings.driveFolderName": "Drive folder name",
	"settings.driveFolderNameDesc": "Root folder name on Google Drive",
	"settings.excludePatterns": "Exclude patterns",
	"settings.excludePatternsDesc": "Glob patterns to exclude (one per line)",
	"settings.syncHistory": "Sync History",
	"settings.noSyncRecords": "No sync records yet.",
	"settings.headerTime": "Time",
	"settings.headerUp": "↑ Up",
	"settings.headerDown": "↓ Down",
	"settings.headerDel": "🗑 Del",
	"settings.headerStatus": "Status",
	"settings.statusOk": "✓ OK",
	"settings.statusErrors": "✗ {{count}} error(s)",
	"settings.language": "Language",
	"settings.languageDesc": "Display language for plugin interface",
	"settings.languageAuto": "Auto",

	// Main - commands
	"command.syncNow": "Sync now",
	"command.login": "Login to Google Drive",
	"command.logout": "Logout",
	"command.deduplicate": "Remove duplicate files from Google Drive",

	// Main - notices
	"notice.setClientFirst": "Please set Client ID and Client Secret in settings first.",
	"notice.mobileAuth": "Please complete authorization in the browser, then paste the authorization code in plugin settings.",
	"notice.waitingAuth": "Waiting for Google authorization...",
	"notice.loginSuccess": "Successfully logged in to Google Drive!",
	"notice.loggedOut": "Logged out of Google Drive.",
	"notice.noPendingLogin": "No pending login. Please start the login flow first.",
	"notice.loginTimeout": "Login timed out. Please try again.",
	"notice.loginFailed": "Login failed: {{message}}",
	"notice.noRefreshToken": "No refresh token. Please log in again.",
	"notice.tokenRefreshFailed": "Google Drive token refresh failed. Please log in again.",
	"notice.pleaseLogin": "Please log in to Google Drive first.",
	"notice.scanning": "Scanning for duplicate files on Google Drive...",
	"notice.removedDuplicates": "Removed {{count}} duplicate file(s) from Google Drive.",
	"notice.noDuplicates": "No duplicate files found on Google Drive.",
	"notice.deduplicateFailed": "Deduplicate failed: {{message}}",

	// Main - status bar
	"status.idle": "Idle",
	"status.syncing": "Syncing...",
	"status.prefix": "Google Drive: ",

	// Auth - HTML pages
	"auth.successTitle": "Authorization successful!",
	"auth.successBody": "You can close this window.",
	"auth.failedTitle": "Authorization failed",
	"auth.invalidState": "Invalid state parameter (possible CSRF attack).",
};

const zh: TranslationDict = {
	// Settings page
	"settings.title": "Google Drive 同步设置",
	"settings.googleAccount": "Google 账户",
	"settings.clientId": "客户端 ID",
	"settings.clientIdDesc": "来自 Google Cloud Console 的 OAuth 2.0 客户端 ID",
	"settings.clientIdPlaceholder": "输入客户端 ID",
	"settings.clientSecret": "客户端密钥",
	"settings.clientSecretDesc": "来自 Google Cloud Console 的 OAuth 2.0 客户端密钥",
	"settings.clientSecretPlaceholder": "输入客户端密钥",
	"settings.authentication": "身份验证",
	"settings.loggedIn": "已登录 Google Drive",
	"settings.notLoggedIn": "未登录",
	"settings.loginButton": "登录 Google Drive",
	"settings.logoutButton": "退出登录",
	"settings.pasteAuthCode": "粘贴授权码",
	"settings.pasteAuthCodeDesc": "如果自动重定向未生效，请在此粘贴授权码",
	"settings.submitButton": "提交",
	"settings.syncSettings": "同步设置",
	"settings.syncInterval": "同步间隔",
	"settings.syncIntervalDesc": "同步频率（分钟）",
	"settings.driveFolderName": "Drive 文件夹名称",
	"settings.driveFolderNameDesc": "Google Drive 上的根文件夹名称",
	"settings.excludePatterns": "排除规则",
	"settings.excludePatternsDesc": "要排除的 Glob 模式（每行一个）",
	"settings.syncHistory": "同步历史",
	"settings.noSyncRecords": "暂无同步记录。",
	"settings.headerTime": "时间",
	"settings.headerUp": "↑ 上传",
	"settings.headerDown": "↓ 下载",
	"settings.headerDel": "🗑 删除",
	"settings.headerStatus": "状态",
	"settings.statusOk": "✓ 正常",
	"settings.statusErrors": "✗ {{count}} 个错误",
	"settings.language": "语言",
	"settings.languageDesc": "插件界面的显示语言",
	"settings.languageAuto": "自动",

	// Main - commands
	"command.syncNow": "立即同步",
	"command.login": "登录 Google Drive",
	"command.logout": "退出登录",
	"command.deduplicate": "移除 Google Drive 上的重复文件",

	// Main - notices
	"notice.setClientFirst": "请先在设置中填写客户端 ID 和客户端密钥。",
	"notice.mobileAuth": "请在浏览器中完成授权，然后在插件设置中粘贴授权码。",
	"notice.waitingAuth": "正在等待 Google 授权...",
	"notice.loginSuccess": "成功登录 Google Drive！",
	"notice.loggedOut": "已退出 Google Drive。",
	"notice.noPendingLogin": "没有待处理的登录。请先启动登录流程。",
	"notice.loginTimeout": "登录超时，请重试。",
	"notice.loginFailed": "登录失败：{{message}}",
	"notice.noRefreshToken": "没有刷新令牌，请重新登录。",
	"notice.tokenRefreshFailed": "Google Drive 令牌刷新失败，请重新登录。",
	"notice.pleaseLogin": "请先登录 Google Drive。",
	"notice.scanning": "正在扫描 Google Drive 上的重复文件...",
	"notice.removedDuplicates": "已从 Google Drive 移除 {{count}} 个重复文件。",
	"notice.noDuplicates": "Google Drive 上没有找到重复文件。",
	"notice.deduplicateFailed": "去重失败：{{message}}",

	// Main - status bar
	"status.idle": "空闲",
	"status.syncing": "同步中...",
	"status.prefix": "Google Drive：",

	// Auth - HTML pages
	"auth.successTitle": "授权成功！",
	"auth.successBody": "您可以关闭此窗口。",
	"auth.failedTitle": "授权失败",
	"auth.invalidState": "无效的 state 参数（可能遭受 CSRF 攻击）。",
};

const dictionaries: Record<Locale, TranslationDict> = { en, zh };

let currentLocale: Locale = "en";

/**
 * Detect the locale from Obsidian's moment.locale() setting.
 */
export function detectLocale(): Locale {
	const locale = moment.locale();
	if (locale.startsWith("zh")) {
		return "zh";
	}
	return "en";
}

/**
 * Resolve the effective locale from a language setting.
 */
export function resolveLocale(setting: LanguageSetting): Locale {
	if (setting === "auto") {
		return detectLocale();
	}
	return setting;
}

/**
 * Set the active locale used by t().
 */
export function setLocale(locale: Locale): void {
	currentLocale = locale;
}

/**
 * Get the current active locale.
 */
export function getLocale(): Locale {
	return currentLocale;
}

/**
 * Translate a key, with optional placeholder interpolation.
 * Placeholders use {{name}} syntax.
 */
export function t(key: string, params?: Record<string, string | number>): string {
	const dict = dictionaries[currentLocale] ?? dictionaries.en;
	let value = dict[key] ?? dictionaries.en[key] ?? key;

	if (params) {
		for (const [k, v] of Object.entries(params)) {
			value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
		}
	}

	return value;
}
