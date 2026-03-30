require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const fastify = require('fastify')({ loggerInstance: logger });
const fastifyWebsocket = require('@fastify/websocket');
const { handleConnection } = require('./websocket/handler');
const { startWorker } = require('./db/worker');
const sessionManager = require('./websocket/sessionManager');
const { db } = require('./db');
const config = require('./config');

const snapshotsDir = path.resolve(process.cwd(), config.STORAGE_DIR, 'snapshots');

fastify.register(fastifyWebsocket);

fastify.get('/health', async (request, reply) => {
  return { status: 'healthy', uptime: process.uptime() };
});

fastify.get('/', async (request, reply) => {
  reply.type('text/html').send(`
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
  `);
});

// Snapshot gallery -- browse all captured screenshots
fastify.get('/snapshots', async (request, reply) => {
  let files = [];
  if (fs.existsSync(snapshotsDir)) {
    files = fs.readdirSync(snapshotsDir)
      .filter(f => /\.(webp|jpg|jpeg|png)$/i.test(f))
      .sort()
      .reverse();
  }

  const cards = files.map(f => {
    const stat = fs.statSync(path.join(snapshotsDir, f));
    const sizeKb = (stat.size / 1024).toFixed(1);
    const parts = f.replace(/\.\w+$/, '').split('_');
    const ts = parts.pop();
    const session = parts.join('_').substring(0, 8);
    const date = new Date(parseInt(ts)).toLocaleString();
    return `
      <div class="card">
        <a href="/snapshots/${f}" target="_blank">
          <img src="/snapshots/${f}" loading="lazy" alt="${f}" />
        </a>
        <div class="meta">
          <span class="session">${session}...</span>
          <span class="date">${date}</span>
          <span class="size">${sizeKb} KB</span>
        </div>
      </div>`;
  }).join('');

  reply.type('text/html').send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Snapshots</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
        h1 { font-size: 22px; margin-bottom: 6px; }
        .info { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .card { background: #1e293b; border-radius: 10px; overflow: hidden; transition: transform 0.15s; }
        .card:hover { transform: translateY(-2px); }
        .card img { width: 100%; display: block; aspect-ratio: 16/9; object-fit: cover; }
        .meta { padding: 10px 12px; display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; }
        .session { font-family: monospace; }
        .empty { text-align: center; padding: 80px 20px; color: #64748b; }
        .empty p { font-size: 16px; margin-bottom: 8px; }
        .empty small { font-size: 13px; }
      </style>
    </head>
    <body>
      <h1>Captured Snapshots</h1>
      <p class="info">${files.length} screenshot${files.length !== 1 ? 's' : ''} &mdash; newest first</p>
      ${files.length > 0
        ? `<div class="grid">${cards}</div>`
        : `<div class="empty"><p>No snapshots yet</p><small>Press Cmd+Shift+6 in the extension to start capturing</small></div>`
      }
      <script>setTimeout(() => location.reload(), 15000);</script>
    </body>
    </html>
  `);
});

// Serve individual snapshot files
fastify.get('/snapshots/:filename', async (request, reply) => {
  const { filename } = request.params;

  if (/[\/\\]/.test(filename)) {
    return reply.code(400).send({ error: 'Invalid filename' });
  }

  const filePath = path.join(snapshotsDir, filename);
  if (!fs.existsSync(filePath)) {
    return reply.code(404).send({ error: 'Snapshot not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const stream = fs.createReadStream(filePath);
  return reply.type(contentType).send(stream);
});

fastify.register(async function (fastify) {
  fastify.get('/stream', { websocket: true }, (socket, req) => {
    handleConnection(socket, req);
  });
});

let workerIntervalId;

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port: port, host: '0.0.0.0' });
    workerIntervalId = startWorker(logger);
    logger.info({ port }, 'Theme Server listening');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');

  if (workerIntervalId) clearInterval(workerIntervalId);
  sessionManager.shutdown();

  fastify.close().then(() => {
    db.close();
    logger.info('Server shut down cleanly');
    process.exit(0);
  }).catch((err) => {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
