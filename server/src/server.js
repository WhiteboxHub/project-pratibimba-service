require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const fastifyWebsocket = require('@fastify/websocket');
const { handleConnection } = require('./websocket/handler');

// Register WebSocket plugin
fastify.register(fastifyWebsocket);

// Register Health Route
fastify.get('/health', async (request, reply) => {
  return { status: 'healthy', uptime: process.uptime() };
});

// The Stealth Route - A fake documentation page
fastify.get('/', async (request, reply) => {
  // Returns a fake "Theme Engine" documentation
  reply.type('text/html').send(\`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Theme Engine API Documentation</title>
      <style>body { font-family: sans-serif; background: #fafafa; padding: 40px; text-align: center; } h1 { color: #333; }</style>
    </head>
    <body>
      <h1>UI Customizer: Theme API</h1>
      <p>Welcome to the developer portal. Please refer to your custom integration specs for theme synchronization endpoints.</p>
    </body>
    </html>
  \`);
});

// Mount WebSocket Stream
fastify.register(async function (fastify) {
  fastify.get('/stream', { websocket: true }, (connection, req) => {
    // Pass socket and request down to our clean handler
    handleConnection(connection.socket, req);
  });
});

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port: port, host: '0.0.0.0' });
    fastify.log.info(\`Theme Server listening on port \${port}\`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
