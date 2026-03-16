// Minimal Obsidian mock for unit tests
export class Plugin {
	registerObsidianProtocolHandler(_action: string, _handler: (params: any) => void): void {}
}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class Modal {}
export const Platform = { isMobile: false, isDesktop: true };
export function setIcon(_el: HTMLElement, _iconId: string): void {}
export function requestUrl(_options: any): Promise<any> {
	return Promise.resolve({ json: {}, arrayBuffer: new ArrayBuffer(0), headers: {} });
}
