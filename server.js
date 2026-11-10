// Локальный сервер для разработки: отдаёт файлы из dist/ и API импорта из Яндекс Карт.
// Анализ отзывов выполняется в браузере.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleImport } from './lib/import-api.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

async function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep)) return sendJson(res, 403, { error: 'Доступ запрещён' });
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    const extension = path.extname(file);
    res.writeHead(200, {
      'content-type': mime[extension] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': ['.html', '.js', '.css'].includes(extension) ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    sendJson(res, 404, { error: 'Страница не найдена' });
  }
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}

export function createServer({ fetchImpl } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });
      if (new URL(req.url, 'http://localhost').pathname === '/api/import/yandex') {
        const body = req.method === 'POST' ? await readJson(req) : null;
        const result = await handleImport({
          method: req.method, origin: req.headers.origin, ip: req.socket.remoteAddress, body, fetchImpl,
        });
        if (result.body === null) {
          res.writeHead(result.status, result.headers);
          return res.end();
        }
        const json = JSON.stringify(result.body);
        res.writeHead(result.status, { ...result.headers, 'content-type': 'application/json; charset=utf-8' });
        return res.end(json);
      }
      if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res);
      sendJson(res, 405, { error: 'Метод не поддерживается' });
    } catch (error) {
      console.error('[request]', error.message);
      sendJson(res, 400, { error: 'Не удалось обработать запрос' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, '127.0.0.1', () => console.log(`AI-Customer Insight: http://localhost:${port}`));
}
