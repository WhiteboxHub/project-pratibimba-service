jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../db/tracker', () => ({
  recordDomMutation: jest.fn(),
}));

jest.mock('../utils/storage', () => ({
  saveCanvasSnapshot: jest.fn(),
}));

const { routeMessage } = require('../websocket/router');
const { recordDomMutation } = require('../db/tracker');
const { saveCanvasSnapshot } = require('../utils/storage');
const logger = require('../utils/logger');

describe('routeMessage', () => {
  let mockWs;
  let mockSessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWs = { send: jest.fn() };
    mockSessionManager = { updateLastSeen: jest.fn() };
  });

  it('handles TYPE_PING with pong response', () => {
    routeMessage(mockWs, mockSessionManager, 'sess-1', { type: 'TYPE_PING' });

    expect(mockSessionManager.updateLastSeen).toHaveBeenCalledWith('sess-1');
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'TYPE_PONG' }));
  });

  it('handles TYPE_DOM_MUTATION by recording', () => {
    const payload = { html: '<div>test</div>' };
    routeMessage(mockWs, mockSessionManager, 'sess-1', { type: 'TYPE_DOM_MUTATION', payload }, 'sys-1');

    expect(mockSessionManager.updateLastSeen).toHaveBeenCalledWith('sess-1');
    expect(recordDomMutation).toHaveBeenCalledWith('sess-1', payload);
  });

  it('handles TYPE_CANVAS_SNAPSHOT by saving', () => {
    const payload = 'data:image/jpeg;base64,abc123';
    routeMessage(mockWs, mockSessionManager, 'sess-1', { type: 'TYPE_CANVAS_SNAPSHOT', payload }, 'sys-1');

    expect(mockSessionManager.updateLastSeen).toHaveBeenCalledWith('sess-1');
    expect(saveCanvasSnapshot).toHaveBeenCalledWith('sess-1', payload, 'sys-1');
  });

  it('logs warning for unknown message type', () => {
    routeMessage(mockWs, mockSessionManager, 'sess-1', { type: 'TYPE_UNKNOWN' }, 'sys-1');

    expect(logger.warn).toHaveBeenCalled();
    expect(mockWs.send).not.toHaveBeenCalled();
  });
});
