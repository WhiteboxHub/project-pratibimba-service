const zlib = require('zlib');
const sessionManager = require('./sessionManager');
const { routeMessage } = require('./router');

function handleConnection(ws, req) {
  // Extract custom parameters safely. Browser WebSockets use query string here.
  const query = new URL(\`http://localhost\${req.url}\`).searchParams;
  const apiKey = query.get('api_key');
  const sessionId = query.get('session_id');

  const EXPECTED_API_KEY = process.env.X_API_KEY || 'my-super-secret-key';

  if (apiKey !== EXPECTED_API_KEY) {
    console.error(\`[WebSocket] Invalid API key (\${apiKey}). Closing connection.\`);
    ws.close(1008, 'Unauthorized - Invalid Theme Engine Key'); // Policy Violation
    return;
  }

  if (!sessionId) {
    console.error('[WebSocket] Missing Session ID. Closing connection.');
    ws.close(1008, 'Missing Session ID');
    return;
  }

  sessionManager.addSession(sessionId, ws);
  
  // Optionally push an initial "Theme Sync" to prove legitimacy right away:
  sessionManager.sendThemeConfig(sessionId, { themeMode: 'dark', accentColor: '#3b82f6' });

  ws.on('message', (message, isBinary) => {
    try {
      let payloadStr = message;

      // Handle raw compressed messages. (If client uses generic fflate/zlib zip/gzip streams)
      if (isBinary) {
        // Node's zlib can try unzip which detects deflate/gzip headers.
        try {
          // Unzip synchronous for simplicity, for extremely high freq use async unzip
          payloadStr = zlib.unzipSync(message).toString('utf-8');
        } catch (zlibErr) {
          console.error('[WebSocket] Zlib Decompression failed:', zlibErr);
          return;
        }
      }

      const parsedMessage = JSON.parse(payloadStr);

      // Pass down to the message router to distribute the workload cleanly
      routeMessage(ws, sessionManager, sessionId, parsedMessage);
    } catch (err) {
      console.error(\`[WebSocket] Failed to process message from \${sessionId}:\`, err);
    }
  });

  ws.on('close', () => {
    console.log(\`[WebSocket] Connection closed by client: \${sessionId}\`);
    sessionManager.removeSession(sessionId);
  });

  ws.on('error', (error) => {
    console.error(\`[WebSocket] Socket error for \${sessionId}:\`, error.message);
  });
}

module.exports = { handleConnection };
