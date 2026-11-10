// Общий обработчик POST /api/import/yandex — для локального server.js и для функции Vercel (api/).
import { ImportError, importYandexReviews } from './yandex.js';

// Сайты, которым можно обращаться к API из браузера (через запятую в ACI_ALLOWED_ORIGINS).
const DEFAULT_ORIGINS = [
  'https://danok12.github.io',
  'https://3092334al-del.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const allowedOrigins = () => (process.env.ACI_ALLOWED_ORIGINS?.split(',').map(s => s.trim()) ?? DEFAULT_ORIGINS);

// Не больше 10 импортов в минуту с одного адреса, чтобы не нагружать Яндекс.
const LIMIT = 10;
const WINDOW_MS = 60_000;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMIT;
}

export function corsHeaders(origin) {
  if (!origin || !allowedOrigins().includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}

// Возвращает { status, headers, body } — дальше их отправляет конкретный сервер.
export async function handleImport({ method, origin, ip = '', body, fetchImpl }) {
  const headers = { ...corsHeaders(origin), 'cache-control': 'no-store' };
  if (method === 'OPTIONS') return { status: 204, headers, body: null };
  if (method !== 'POST') return { status: 405, headers, body: { error: 'Метод не поддерживается' } };
  if (rateLimited(ip)) return { status: 429, headers, body: { error: 'Слишком много запросов. Подождите минуту.' } };

  const url = body && typeof body === 'object' ? body.url : null;
  try {
    const result = await importYandexReviews(url, fetchImpl ? { fetchImpl } : {});
    return { status: 200, headers, body: result };
  } catch (error) {
    if (error instanceof ImportError) return { status: 422, headers, body: { error: error.message } };
    console.error('[import]', error);
    return { status: 502, headers, body: { error: 'Не удалось загрузить отзывы. Попробуйте позже или загрузите CSV.' } };
  }
}
