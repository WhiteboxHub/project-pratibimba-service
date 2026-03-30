jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../db', () => {
  const runFn = jest.fn();
  return {
    db: {
      prepare: jest.fn(() => ({ run: runFn })),
    },
    __mockRun: runFn,
  };
});

const { __mockRun } = require('../db');
const { recordDomMutation } = require('../db/tracker');

describe('recordDomMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a string payload directly', () => {
    recordDomMutation('sess-1', '{"tag":"div"}');
    expect(__mockRun).toHaveBeenCalledWith('sess-1', '{"tag":"div"}');
  });

  it('stringifies an object payload', () => {
    recordDomMutation('sess-1', { tag: 'div', text: 'hello' });
    expect(__mockRun).toHaveBeenCalledWith('sess-1', JSON.stringify({ tag: 'div', text: 'hello' }));
  });

  it('handles errors without throwing', () => {
    __mockRun.mockImplementationOnce(() => {
      throw new Error('DB write failed');
    });
    expect(() => recordDomMutation('sess-1', 'test')).not.toThrow();
  });
});
