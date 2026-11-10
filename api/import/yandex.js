// Функция Vercel: POST /api/import/yandex { "url": "https://yandex.ru/maps/org/..." }
import { handleImport } from '../../lib/import-api.js';

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const result = await handleImport({ method: req.method, origin: req.headers.origin, ip, body });
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.body === null) return res.status(result.status).end();
  res.status(result.status).json(result.body);
}
