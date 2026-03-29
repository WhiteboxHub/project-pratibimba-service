import { WebSocketManager } from './WebSocketManager';

// Declare chrome to avoid TS errors
declare var chrome: any;

export class ScreenshotManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private wsManager: WebSocketManager;

  constructor(wsManager: WebSocketManager) {
    this.wsManager = wsManager;
  }

  public start(intervalMs: number = 10000): void {
    if (this.timer) {
      console.log('[ScreenshotManager] Capture already running.');
      return;
    }

    console.log(`[ScreenshotManager] Starting continuous capture every ${intervalMs}ms`);
    
    this.captureAndSend();
    
    this.timer = setInterval(() => {
      this.captureAndSend();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[ScreenshotManager] Stopped continuous capture.');
    }
  }

  private captureAndSend(): void {
    if (typeof chrome === 'undefined') return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      if (tabs.length === 0) return;

      chrome.tabs.captureVisibleTab(
        tabs[0].windowId,
        { format: 'jpeg', quality: 60 },
        (dataUrl: string) => {
          if (chrome.runtime.lastError) {
            console.error('[ScreenshotManager] Failed to capture tab:', chrome.runtime.lastError.message);
            return;
          }
          
          if (dataUrl) {
            this.wsManager.send('TYPE_CANVAS_SNAPSHOT', dataUrl, true);
            console.log(`[ScreenshotManager] Captured and sent frame (${dataUrl.length} chars)`);
          }
        }
      );
    });
  }
}
