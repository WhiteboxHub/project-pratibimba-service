const logger = require('../utils/logger');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this._heartbeatInterval = setInterval(() => this.checkStaleSessions(), 10000);
  }

  addSession(sessionId, ws) {
    logger.info({ sessionId }, 'Adding new session');
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
      logger.info({ sessionId }, 'Removing session');
      const session = this.sessions.get(sessionId);
      if (session && session.ws && session.ws.readyState !== 3) {
        session.ws.close();
      }
      this.sessions.delete(sessionId);
    }
  }

  checkStaleSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastSeen > 30000) {
        logger.warn({ sessionId }, 'Session inactive for >30s, closing');
        this.removeSession(sessionId);
      }
    }
  }

  /**
   * Sends "UI Config" updates back to the client to disguise the WebSocket
   * traffic as legitimate bidirectional theme syncing.
   */
  sendThemeConfig(sessionId, themeConfig) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === 1) {
      session.ws.send(JSON.stringify({
        type: 'TYPE_UI_CONFIG',
        payload: themeConfig
      }));
      logger.info({ sessionId }, 'Sent theme config');
    } else {
      logger.warn({ sessionId }, 'Cannot send theme config, session inactive/missing');
    }
  }

  shutdown() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    for (const [sessionId] of this.sessions.entries()) {
      this.removeSession(sessionId);
    }
    logger.info('SessionManager shut down');
  }
}

module.exports = new SessionManager();
