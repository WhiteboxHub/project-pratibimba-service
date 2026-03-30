const VALID_TYPES = ['TYPE_PING', 'TYPE_DOM_MUTATION', 'TYPE_CANVAS_SNAPSHOT'];
const TYPES_REQUIRING_PAYLOAD = ['TYPE_DOM_MUTATION', 'TYPE_CANVAS_SNAPSHOT'];

function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return 'Message must be a non-null object';
  }

  const { type } = message;

  if (!type || typeof type !== 'string') {
    return 'Message must have a string "type" field';
  }

  if (!VALID_TYPES.includes(type)) {
    return `Unknown message type: ${type}`;
  }

  if (TYPES_REQUIRING_PAYLOAD.includes(type) && message.payload == null) {
    return `Message type "${type}" requires a "payload" field`;
  }

  return null;
}

module.exports = { validateMessage, VALID_TYPES };
