import { WebSocketManager } from './WebSocketManager';
import { ScreenshotManager, CAPTURE_TIMEOUT_ALARM, DEFAULT_MAX_CAPTURE_DURATION_MS } from './ScreenshotManager';

declare var chrome: any;

console.log('[ThemeEngine ServiceWorker] Starting...');

const DEFAULT_CAPTURE_INTERVAL_MS = 10000;

let screenshotManager: ScreenshotManager;

const wsManager = new WebSocketManager((type: string, payload: any) => {
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

/** Returns true only if the user has a stored api_key (i.e. is logged in). */
function isAuthenticated(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) { resolve(false); return; }
    chrome.storage.local.get(['apiKey'], (result: { [key: string]: any }) => {
      resolve(!!(result.apiKey && result.apiKey !== 'missing'));
    });
  });
}

async function startCapture(intervalMs: number = DEFAULT_CAPTURE_INTERVAL_MS) {
  const loggedIn = await isAuthenticated();
  if (!loggedIn) {
    console.warn('[Prathibimba] Capture blocked — not logged in. Open popup and sign in.');
    return;
  }
  const timeoutMs = await getConfiguredTimeout();
  screenshotManager.start(intervalMs, timeoutMs);
}

if (typeof chrome !== 'undefined' && chrome.commands) {
  chrome.commands.onCommand.addListener(async (command: string) => {
    console.log(`[ThemeEngine] Command received: ${command}`);
    if (command === 'start-capture') {
      const loggedIn = await isAuthenticated();
      if (!loggedIn) {
        console.warn('[Prathibimba] Shortcut blocked — not logged in.');
        return;
      }
      const hasPerm = await ScreenshotManager.hasHostPermission();
      if (!hasPerm) {
        console.warn('[ThemeEngine] Host permission not granted.');
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
      isAuthenticated().then((loggedIn) => {
        if (!loggedIn) {
          sendResponse({ running: false, error: 'Not logged in' });
          return;
        }
        startCapture();
        sendResponse({ running: true });
      });
      return true;
    } else if (message.action === 'STOP_CAPTURE') {
      screenshotManager.stop();
      sendResponse({ running: false });
    }
    return true;
  });
}

wsManager.connect();
