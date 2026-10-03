import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { apiError } from './store.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function validateOrigin(req, publicOrigin) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw apiError(403, 'CROSS_ORIGIN', '请在本站页面内操作日记。');
  const origin = req.headers.origin;
  if (!origin) return; // Non-browser clients may omit Origin; JSON and Fetch Metadata protect browser writes.
  let parsed;
  try { parsed = new URL(origin); } catch { throw apiError(403, 'CROSS_ORIGIN', '请求来源不受支持。'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin
    || (publicOrigin ? origin !== publicOrigin : parsed.host !== req.headers.host)) {
    throw apiError(403, 'CROSS_ORIGIN', '请在本站页面内操作日记。');
  }
}

async function readJson(req, limit) {
  const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', '请使用 JSON 格式提交日记。');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    throw apiError(415, 'UNSUPPORTED_ENCODING', '暂不支持压缩的请求内容。');
  }
  if (Number(req.headers['content-length']) > limit) throw apiError(413, 'BODY_TOO_LARGE', '提交的日记数据过大。');
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      req.off('data', data);
      req.off('end', end);
      req.off('error', fail);
      req.off('aborted', aborted);
    };
    const fail = (error) => { cleanup(); reject(error); };
    const aborted = () => fail(apiError(400, 'ABORTED_REQUEST', '提交日记时连接中断，请重试。'));
    const data = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        fail(apiError(413, 'BODY_TOO_LARGE', '提交的日记数据过大。'));
        req.resume();
      } else chunks.push(chunk);
    };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    req.on('data', data);
    req.once('end', end);
    req.once('error', fail);
    req.once('aborted', aborted);
  });
  try { return JSON.parse(body.toString('utf8')); } catch {
    throw apiError(400, 'INVALID_JSON', '日记内容不是有效的 JSON 数据。');
  }
}

export function createApp({ store, staticDir, publicOrigin, logger = console }) {
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== publicOrigin) throw new Error('PUBLIC_ORIGIN must be an exact HTTP(S) origin without a trailing slash');
  }
  const root = resolve(staticDir);
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const rawPath = (req.url ?? '/').split('?')[0];
      let path;
      try { path = decodeURIComponent(rawPath); } catch { throw apiError(400, 'INVALID_PATH', '请求地址无效。'); }
      if (!path.startsWith('/') || /[\0\\]/.test(path) || path.split('/').some((part) => part.startsWith('.'))) {
        throw apiError(404, 'NOT_FOUND', '未找到页面。');
      }
      if (path === '/api' || path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'GET' && path === '/api/health') return sendJson(res, 200, { ok: true });
        if (req.method === 'GET' && path === '/api/diaries') return sendJson(res, 200, { entries: store.list() });
        if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
          validateOrigin(req, publicOrigin);
          const isImport = path === '/api/diaries/import' && req.method === 'POST';
          const input = await readJson(req, isImport ? 2 * 1024 * 1024 : 32 * 1024);
          if (req.method === 'POST' && path === '/api/diaries') return sendJson(res, 201, { entry: store.create(input) });
          if (isImport) return sendJson(res, 200, store.import(input));
          const entryRoute = /^\/api\/diaries\/([^/]{1,128})$/.exec(path);
          if (entryRoute && req.method === 'PUT') return sendJson(res, 200, { entry: store.update(entryRoute[1], input) });
          if (entryRoute && req.method === 'DELETE') {
            store.delete(entryRoute[1], input);
            return sendJson(res, 200, { ok: true });
          }
        }
        throw apiError(404, 'NOT_FOUND', '未找到接口。');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw apiError(404, 'NOT_FOUND', '未找到页面。');
      const filename = resolve(root, `.${path === '/' ? '/index.html' : path}`);
      if (!filename.startsWith(`${root}${sep}`)) throw apiError(404, 'NOT_FOUND', '未找到页面。');
      let metadata;
      try {
        const [actualRoot, actualFile] = await Promise.all([realpath(root), realpath(filename)]);
        if (!actualFile.startsWith(`${actualRoot}${sep}`)) throw apiError(404, 'NOT_FOUND', '未找到页面。');
        metadata = await stat(actualFile);
        if (!metadata.isFile()) throw apiError(404, 'NOT_FOUND', '未找到页面。');
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw apiError(404, 'NOT_FOUND', '未找到页面。');
        throw error;
      }
      res.writeHead(200, {
        'Content-Type': types[extname(filename).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': metadata.size,
        'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(filename).on('error', (error) => { logger.error(error); res.destroy(); }).pipe(res);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      if (!error.status) logger.error(error);
      sendJson(res, error.status ?? 500, { error: error.status ? error.message : '服务器暂时无法处理日记，请稍后重试。', code: error.code && error.status ? error.code : 'INTERNAL_ERROR' });
      if (!req.complete) req.resume();
    }
  };
}
