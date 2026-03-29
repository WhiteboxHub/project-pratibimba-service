const { validateMessage } = require('../websocket/validator');

describe('validateMessage', () => {
  it('rejects null input', () => {
    expect(validateMessage(null)).toBe('Message must be a non-null object');
  });

  it('rejects non-object input', () => {
    expect(validateMessage('string')).toBe('Message must be a non-null object');
  });

  it('rejects missing type field', () => {
    expect(validateMessage({ payload: {} })).toBe('Message must have a string "type" field');
  });

  it('rejects non-string type', () => {
    expect(validateMessage({ type: 123 })).toBe('Message must have a string "type" field');
  });

  it('rejects unknown message type', () => {
    expect(validateMessage({ type: 'TYPE_UNKNOWN' })).toBe('Unknown message type: TYPE_UNKNOWN');
  });

  it('accepts TYPE_PING without payload', () => {
    expect(validateMessage({ type: 'TYPE_PING' })).toBeNull();
  });

  it('rejects TYPE_DOM_MUTATION without payload', () => {
    expect(validateMessage({ type: 'TYPE_DOM_MUTATION' })).toBe(
      'Message type "TYPE_DOM_MUTATION" requires a "payload" field'
    );
  });

  it('rejects TYPE_CANVAS_SNAPSHOT without payload', () => {
    expect(validateMessage({ type: 'TYPE_CANVAS_SNAPSHOT' })).toBe(
      'Message type "TYPE_CANVAS_SNAPSHOT" requires a "payload" field'
    );
  });

  it('accepts TYPE_DOM_MUTATION with payload', () => {
    expect(validateMessage({ type: 'TYPE_DOM_MUTATION', payload: { html: '<div>' } })).toBeNull();
  });

  it('accepts TYPE_CANVAS_SNAPSHOT with payload', () => {
    expect(validateMessage({ type: 'TYPE_CANVAS_SNAPSHOT', payload: 'data:image/png;base64,abc' })).toBeNull();
  });
});
