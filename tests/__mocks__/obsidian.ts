// Minimal Obsidian mock for unit tests
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class Modal {}
export function requestUrl(_options: any): Promise<any> {
	return Promise.resolve({ json: {}, arrayBuffer: new ArrayBuffer(0), headers: {} });
}
