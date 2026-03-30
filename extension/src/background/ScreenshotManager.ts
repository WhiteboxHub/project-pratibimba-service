import { WebSocketManager } from './WebSocketManager';

declare var chrome: any;

const CAPTURE_TIMEOUT_ALARM = 'capture-timeout';
const DEFAULT_MAX_CAPTURE_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

export class ScreenshotManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private wsManager: WebSocketManager;
  private consecutivePermErrors = 0;
  private static readonly MAX_PERM_ERRORS = 3;

  constructor(wsManager: WebSocketManager) {
    this.wsManager = wsManager;
  }

  public get running(): boolean {
    return this.timer !== null;
  }

  public start(intervalMs: number = 10000, maxDurationMs?: number): void {
    if (this.timer) {
      console.log('[ScreenshotManager] Capture already running.');
      return;
    }

    console.log(`[ScreenshotManager] Starting continuous capture every ${intervalMs}ms`);
    this.consecutivePermErrors = 0;

    this.captureAndSend();

    this.timer = setInterval(() => {
      this.captureAndSend();
    }, intervalMs);

    const timeoutMs = maxDurationMs ?? DEFAULT_MAX_CAPTURE_DURATION_MS;
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create(CAPTURE_TIMEOUT_ALARM, { delayInMinutes: timeoutMs / 60000 });
      console.log(`[ScreenshotManager] Auto-timeout alarm set for ${timeoutMs / 60000} minutes`);
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[ScreenshotManager] Stopped continuous capture.');
    }

    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear(CAPTURE_TIMEOUT_ALARM);
    }
  }

  public static async hasHostPermission(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.permissions) return false;
    return new Promise((resolve) => {
      chrome.permissions.contains({ origins: ['<all_urls>'] }, (result: boolean) => {
        resolve(result);
      });
    });
  }

  private async captureAndSend(): Promise<void> {
    if (typeof chrome === 'undefined') return;

    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs || tabs.length === 0) {
        console.warn('[ScreenshotManager] No active tab found');
        return;
      }

      const tab = tabs[0];
      if (!tab.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        console.warn('[ScreenshotManager] Skipping non-capturable tab:', tab.url);
        return;
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',
        quality: 60
      });

      if (dataUrl) {
        this.consecutivePermErrors = 0;
        this.wsManager.send('TYPE_CANVAS_SNAPSHOT', dataUrl, true);
        console.log(`[ScreenshotManager] Captured and sent frame (${dataUrl.length} chars)`);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('activeTab') || msg.includes('permission')) {
        this.consecutivePermErrors++;
        console.error(
          `[ScreenshotManager] Permission error (${this.consecutivePermErrors}/${ScreenshotManager.MAX_PERM_ERRORS}):`,
          msg,
          '— Grant "All sites" access via the popup or extension settings.'
        );
        if (this.consecutivePermErrors >= ScreenshotManager.MAX_PERM_ERRORS) {
          console.error('[ScreenshotManager] Too many permission errors, stopping capture. Please open the popup and click Start to re-grant permissions.');
          this.stop();
        }
      } else {
        console.error('[ScreenshotManager] Capture failed:', msg);
      }
    }
  }
}

export { CAPTURE_TIMEOUT_ALARM, DEFAULT_MAX_CAPTURE_DURATION_MS };
