jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

let SessionManager;

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
  SessionManager = require('../websocket/sessionManager');
});

afterEach(() => {
  SessionManager.shutdown();
  jest.useRealTimers();
});

describe('SessionManager', () => {
  function createMockWs(readyState = 1) {
    return { close: jest.fn(), send: jest.fn(), readyState };
  }

  it('adds and tracks a session', () => {
    const ws = createMockWs();
    SessionManager.addSession('s1', ws);

    SessionManager.updateLastSeen('s1');
    // No error means it found the session
  });

  it('removes a session and closes the socket', () => {
    const ws = createMockWs();
    SessionManager.addSession('s1', ws);
    SessionManager.removeSession('s1');

    expect(ws.close).toHaveBeenCalled();
  });

  it('does not error when removing nonexistent session', () => {
    expect(() => SessionManager.removeSession('nonexistent')).not.toThrow();
  });

  it('closes stale sessions after 30s', () => {
    const ws = createMockWs();
    SessionManager.addSession('s1', ws);

    // Heartbeat checks every 10s; session must be >30s stale, so the 40s check triggers it
    jest.advanceTimersByTime(41000);

    expect(ws.close).toHaveBeenCalled();
  });

  it('does not close active sessions within 30s', () => {
    const ws = createMockWs();
    SessionManager.addSession('s1', ws);

    jest.advanceTimersByTime(9000);
    SessionManager.updateLastSeen('s1');
    jest.advanceTimersByTime(25000);

    expect(ws.close).not.toHaveBeenCalled();
  });

  it('sends theme config to open session', () => {
    const ws = createMockWs(1);
    SessionManager.addSession('s1', ws);
    SessionManager.sendThemeConfig('s1', { themeMode: 'dark' });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'TYPE_UI_CONFIG', payload: { themeMode: 'dark' } })
    );
  });

  it('does not send theme config to closed session', () => {
    const ws = createMockWs(3);
    SessionManager.addSession('s1', ws);
    SessionManager.sendThemeConfig('s1', { themeMode: 'dark' });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('shutdown clears all sessions and interval', () => {
    const ws = createMockWs();
    SessionManager.addSession('s1', ws);
    SessionManager.shutdown();

    expect(ws.close).toHaveBeenCalled();
  });
});
