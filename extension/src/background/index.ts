import { WebSocketManager } from './WebSocketManager';
import { ScreenshotManager, CAPTURE_TIMEOUT_ALARM, DEFAULT_MAX_CAPTURE_DURATION_MS } from './ScreenshotManager';

declare var chrome: any;

console.log('[ThemeEngine ServiceWorker] Starting...');

const API_KEY = 'my-super-secret-key';
const DEFAULT_CAPTURE_INTERVAL_MS = 10000;

let screenshotManager: ScreenshotManager;

const wsManager = new WebSocketManager(API_KEY, (type: string, payload: any) => {
  if (type === 'CMD_START_SCREENSHOTS') {
    const interval = payload && payload.interval ? payload.interval : DEFAULT_CAPTURE_INTERVAL_MS;
    startCapture(interval);
  } else if (type === 'CMD_STOP_SCREENSHOTS') {
    screenshotManager.stop();
  }
});

screenshotManager = new ScreenshotManager(wsManager);

async function getConfiguredTimeout(): Promise<number> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(DEFAULT_MAX_CAPTURE_DURATION_MS);
      return;
    }
    chrome.storage.local.get('captureTimeoutMinutes', (result: any) => {
      if (result.captureTimeoutMinutes && result.captureTimeoutMinutes > 0) {
        resolve(result.captureTimeoutMinutes * 60 * 1000);
      } else {
        resolve(DEFAULT_MAX_CAPTURE_DURATION_MS);
      }
    });
  });
}

async function startCapture(intervalMs: number = DEFAULT_CAPTURE_INTERVAL_MS) {
  const timeoutMs = await getConfiguredTimeout();
  screenshotManager.start(intervalMs, timeoutMs);
}

if (typeof chrome !== 'undefined' && chrome.commands) {
  chrome.commands.onCommand.addListener(async (command: string) => {
    console.log(`[ThemeEngine] Command received: ${command}`);
    if (command === 'start-capture') {
      const hasPerm = await ScreenshotManager.hasHostPermission();
      if (!hasPerm) {
        console.warn('[ThemeEngine] Host permission not granted. Open the popup and click Start to grant access.');
        return;
      }
      startCapture();
    } else if (command === 'stop-capture') {
      screenshotManager.stop();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm: any) => {
    if (alarm.name === CAPTURE_TIMEOUT_ALARM) {
      console.log('[ThemeEngine] Auto-timeout reached, stopping capture');
      screenshotManager.stop();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
    if (message.action === 'GET_CAPTURE_STATUS') {
      ScreenshotManager.hasHostPermission().then((hasPerm) => {
        sendResponse({ running: screenshotManager.running, hasHostPermission: hasPerm });
      });
      return true;
    } else if (message.action === 'START_CAPTURE') {
      startCapture();
      sendResponse({ running: true });
    } else if (message.action === 'STOP_CAPTURE') {
      screenshotManager.stop();
      sendResponse({ running: false });
    }
    return true;
  });
}

wsManager.connect();
