jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    writeFile: jest.fn((_path, _data, _opts, cb) => {
      if (typeof _opts === 'function') _opts(null);
      else if (cb) cb(null);
    }),
  };
});

const fs = require('fs');
const logger = require('../utils/logger');
const { saveCanvasSnapshot } = require('../utils/storage');

describe('saveCanvasSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves a base64 data URL string', () => {
    saveCanvasSnapshot('sess-1', 'data:image/jpeg;base64,/9j/4AAQ==', 'sys-1');

    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const [filePath, data, opts] = fs.writeFile.mock.calls[0];
    expect(filePath).toMatch(/sys-1[\\/]sess-1[\\/]\d+\.jpg$/);
    expect(data).toBe('/9j/4AAQ==');
    expect(opts).toEqual({ encoding: 'base64' });
  });

  it('saves from an object with a data property', () => {
    saveCanvasSnapshot('sess-2', { data: 'data:image/png;base64,iVBOR==' }, 'sys-1');

    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const [filePath, data] = fs.writeFile.mock.calls[0];
    expect(filePath).toMatch(/sys-1[\\/]sess-2[\\/]\d+\.png$/);
    expect(data).toBe('iVBOR==');
  });

  it('saves a Buffer payload', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    saveCanvasSnapshot('sess-3', buf, 'sys-1');

    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const [, data] = fs.writeFile.mock.calls[0];
    expect(Buffer.isBuffer(data)).toBe(true);
  });

  it('warns on unhandled payload format', () => {
    saveCanvasSnapshot('sess-4', 12345, 'sys-1');

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
