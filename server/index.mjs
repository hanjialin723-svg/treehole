import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { openStore } from './store.mjs';
import { createApp } from './app.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export async function startServer({
  port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? '0.0.0.0',
  databasePath = process.env.DATABASE_PATH ?? resolve(projectRoot, 'data/diary.sqlite'),
  staticDir = resolve(projectRoot, 'dist/client'),
  publicOrigin = process.env.PUBLIC_ORIGIN || undefined,
  logger = console,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
  const store = openStore(databasePath);
  let server;
  try {
    server = createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, createApp({ store, staticDir, publicOrigin, logger }));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
  } catch (error) {
    store.close();
    throw error;
  }
  let closing;
  return {
    server,
    store,
    close() {
      if (!closing) closing = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => server.closeAllConnections(), 10_000).unref();
        server.close((error) => {
          clearTimeout(timeout);
          try { store.close(); } catch (closeError) { reject(closeError); return; }
          if (error) reject(error); else resolve();
        });
      });
      return closing;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const app = await startServer();
    const address = app.server.address();
    console.log(`Treehool listening on http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      app.close().catch((error) => { console.error(error); process.exitCode = 1; });
    });
  } catch (error) {
    console.error('Treehool could not start:', error.message);
    process.exitCode = 1;
  }
}
