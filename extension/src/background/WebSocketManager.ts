// Extension: WebSocketManager.ts
import { deflateSync, strFromU8, strToU8, inflateSync } from 'fflate';

type MessageType = 'TYPE_DOM_MUTATION' | 'TYPE_CANVAS_SNAPSHOT' | 'TYPE_PING' | 'TYPE_PONG' | 'TYPE_UI_CONFIG' | 'CMD_START_SCREENSHOTS' | 'CMD_STOP_SCREENSHOTS';

interface ServerMessage {
  type: MessageType;
  payload?: any;
}

interface EnqueuedMessage {
  type: MessageType;
  payload: any;
  compress: boolean;
}

const WS_URL = 'wss://WBL-Screenshots.com/stream';
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;
const PING_INTERVAL = 15000;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private messageQueue: EnqueuedMessage[] = [];
  private apiKey: string = 'pending';
  private sessionId: string;
  private systemId: string = 'pending';
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private onCommand?: (type: string, payload: any) => void;

  constructor(onCommand?: (type: string, payload: any) => void) {
    this.sessionId = crypto.randomUUID();
    this.onCommand = onCommand;

    // Load apiKey, systemId, and deviceName from chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['apiKey', 'systemId', 'deviceName'], (result: { [key: string]: any }) => {
        // API key from login
        this.apiKey = result.apiKey || 'missing';

        // System ID: prefer human-readable deviceName, then persisted UUID
        if (result.deviceName && result.deviceName.trim() !== '') {
          this.systemId = result.deviceName.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
        } else if (result.systemId) {
          this.systemId = result.systemId;
        } else {
          this.systemId = crypto.randomUUID();
          chrome.storage.local.set({ systemId: this.systemId });
        }
      });
    } else {
      this.apiKey = 'missing';
      this.systemId = crypto.randomUUID();
    }
  }

  public connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;
    if (this.systemId === 'pending' || this.apiKey === 'pending') {
      setTimeout(() => this.connect(), 50);
      return;
    }
    if (this.apiKey === 'missing' || !this.apiKey) {
      console.warn('[Prathibimba] No api_key found. Please log in via the extension popup.');
      return;
    }

    this.isConnecting = true;

    const url = new URL(WS_URL);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('session_id', this.sessionId);
    url.searchParams.set('system_id', this.systemId);

    this.ws = new WebSocket(url.toString());
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
    this.ws.onerror = this.handleError.bind(this);
  }

  public send(type: MessageType, payload: any, compress = false): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.dispatch(type, payload, compress);
    } else {
      this.messageQueue.push({ type, payload, compress });
      this.connect();
    }
  }

  private dispatch(type: MessageType, payload: any, compress: boolean) {
    const messageStr = JSON.stringify({ type, sessionId: this.sessionId, payload });

    if (compress) {
      try {
        const zipped = deflateSync(strToU8(messageStr), { level: 6 });
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(zipped);
        }
      } catch (err) {
        console.error('[ThemeEngine] Compression failed:', err);
      }
    } else {
      this.ws?.send(messageStr);
    }
  }

  private handleOpen(): void {
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    console.log('[ThemeEngine] Sync Server Connected.');

    this.startHeartbeat();

    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg) this.dispatch(msg.type, msg.payload, msg.compress);
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      if (event.data instanceof ArrayBuffer) {
        const unzipped = inflateSync(new Uint8Array(event.data));
        const str = strFromU8(unzipped);
        this.processServerMessage(JSON.parse(str));
      } else {
        this.processServerMessage(JSON.parse(event.data));
      }
    } catch (err) {
      console.error('[ThemeEngine] Failed to parse message:', err);
    }
  }

  private processServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'TYPE_PONG':
        break;
      case 'TYPE_UI_CONFIG':
        if (typeof chrome !== 'undefined') {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
            if (tabs.length > 0 && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'UPDATE_THEME', config: msg.payload })
                .catch(() => { /* tab has no content script listener yet */ });
            }
          });
        }
        break;
      case 'CMD_START_SCREENSHOTS':
      case 'CMD_STOP_SCREENSHOTS':
        if (this.onCommand) this.onCommand(msg.type, msg.payload);
        break;
      default:
        console.warn('[ThemeEngine] Unknown command from config server:', msg.type);
    }
  }

  private handleClose(event: CloseEvent): void {
    this.isConnecting = false;
    this.ws = null;
    this.stopHeartbeat();
    console.log(`[ThemeEngine] Disconnected. Code: ${event.code}`);
    this.attemptReconnect();
  }

  private handleError(event: Event): void {
    console.error('[ThemeEngine] Connection Error');
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[ThemeEngine] Max connection attempts reached. Pausing sync.');
      return;
    }

    const delay = RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    console.log(`[ThemeEngine] Reconnecting in ${delay}ms...`);
    setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.send('TYPE_PING', { timestamp: Date.now() });
    }, PING_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
