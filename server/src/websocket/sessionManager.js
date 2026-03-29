const config = require('../config');

class SessionManager {
  constructor() {
    this.sessions = new Map();

    // The Heartbeat Monitor: Check for stale sessions every 10 seconds
    setInterval(() => this.checkStaleSessions(), 10000);
  }

  addSession(sessionId, ws) {
    console.log(\`[SessionManager] Adding new session: \${sessionId}\`);
    this.sessions.set(sessionId, {
      ws,
      lastSeen: Date.now(),
      status: 'ACTIVE'
    });
  }

  updateLastSeen(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeen = Date.now();
    }
  }

  removeSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      console.log(\`[SessionManager] Removing session: \${sessionId}\`);
      const payload = this.sessions.get(sessionId);
      if (payload && payload.ws && payload.ws.readyState !== 3) {
        payload.ws.close();
      }
      this.sessions.delete(sessionId);
    }
  }

  checkStaleSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      // 30 Seconds threshold as requested
      if (now - session.lastSeen > 30000) {
        console.warn(\`[SessionManager] Session \${sessionId} inactive for > 30s. Closing gracefully & marking complete.\`);
        // We could also run a DB update here to mark "Complete"
        this.removeSession(sessionId);
      }
    }
  }

  /**
   * The "Translation" Layer
   * Sends "UI Config" updates back to the client to make the man-in-the-middle look legitimate.
   */
  sendThemeConfig(sessionId, themeConfig) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === 1) { // 1 = OPEN
      session.ws.send(JSON.stringify({
        type: 'TYPE_UI_CONFIG',
        payload: themeConfig
      }));
      console.log(\`[SessionManager] Sent Theme Config to \${sessionId}\`);
    } else {
      console.warn(\`[SessionManager] Cannot send theme config. Session \${sessionId} is inactive/missing.\`);
    }
  }
}

// Export a singleton instance
module.exports = new SessionManager();
