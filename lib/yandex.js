// Импорт публичных отзывов из карточки организации в Яндекс Картах.
//
// Страница карточки содержит JSON с данными (<script class="state-view">),
// в нём — первые 50 отзывов, название, адрес и рейтинг. Код работает на сервере:
// браузер не может запросить yandex.ru с другого сайта (ограничение CORS).
//
// Имена авторов не извлекаются: для анализа они не нужны (см. dist/legal.html).

export const MAX_REVIEWS = 50;
const USER_AGENT = 'AI-Customer-Insight/1.0 (school project; +https://danok12.github.io/ai-customer-insight/)';
const TIMEOUT_MS = 15000;
const MAX_PAGE_BYTES = 5_000_000;

const YANDEX_HOST = /^(?:www\.|maps\.)?yandex\.(?:ru|com|kz|by|uz|com\.tr|com\.ge|com\.am|com\.az|eu)$/i;

export class ImportError extends Error {}

export function validateUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new ImportError('Вставьте ссылку на карточку компании в Яндекс Картах.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || !YANDEX_HOST.test(url.hostname)) {
    throw new ImportError('Поддерживаются только ссылки на Яндекс Карты (yandex.ru/maps/...).');
  }
  return url;
}

// Номер организации из ссылки: /maps/org/<название>/<номер>/ или ?oid=<номер>.
export function extractBusinessId(raw) {
  const text = decodeURIComponent(String(raw ?? '')).replace(/&amp;/g, '&');
  const patterns = [
    /\/maps\/org\/(?:[^/?#]+\/)?(\d{6,})/i,
    /[?&#]oid=(\d{6,})/i,
    /\/org\/(\d{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function findBusinesses(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    for (const item of value) findBusinesses(item, found);
    return found;
  }
  if (Array.isArray(value.reviewResults?.reviews)) found.push(value);
  for (const item of Object.values(value)) findBusinesses(item, found);
  return found;
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function isoDate(raw) {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function parseYandexPage(html, pageUrl = '') {
  const page = String(html);
  if (/showcaptcha|smartcaptcha/i.test(page)) {
    throw new ImportError('Яндекс временно ограничил автоматические запросы. Попробуйте позже или загрузите CSV.');
  }
  const blocks = [...page.matchAll(/<script[^>]*class=["'][^"']*state-view[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const businesses = [];
  for (const [, json] of blocks) {
    try {
      findBusinesses(JSON.parse(json), businesses);
    } catch {
      // повреждённый блок пропускаем
    }
  }
  if (!businesses.length) {
    throw new ImportError('На странице не нашлось отзывов. Проверьте, что это карточка организации, а не поиск или маршрут.');
  }
  const business = businesses.sort((a, b) => b.reviewResults.reviews.length - a.reviewResults.reviews.length)[0];

  const seen = new Set();
  const reviews = [];
  for (const review of business.reviewResults.reviews) {
    const text = clean(review.text);
    const key = review.reviewId || text;
    if (!text || seen.has(key)) continue;
    seen.add(key);
    const rating = Math.round(Number(review.rating));
    reviews.push({
      date: isoDate(review.updatedTime || review.createdTime),
      rating: rating >= 1 && rating <= 5 ? rating : 0,
      text,
    });
    if (reviews.length === MAX_REVIEWS) break;
  }
  if (!reviews.length) throw new ImportError('В карточке нет отзывов с текстом.');

  const ratingData = business.ratingData || {};
  const total = Number(ratingData.reviewCount ?? business.reviewResults.params?.count);
  return {
    company: {
      id: String(business.id || ''),
      name: clean(business.title || business.shortTitle || business.name) || 'Организация в Яндекс Картах',
      address: clean(business.fullAddress || business.address),
      rating: Math.round(Number(ratingData.ratingValue || 0) * 10) / 10,
      reviewCount: Number.isFinite(total) ? total : reviews.length,
      url: pageUrl,
    },
    reviews,
  };
}

async function fetchPage(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html', 'accept-language': 'ru-RU,ru;q=0.9' },
    });
    if (!response.ok) throw new ImportError(`Яндекс ответил ошибкой ${response.status}. Попробуйте позже.`);
    const text = await response.text();
    if (text.length > MAX_PAGE_BYTES) throw new ImportError('Страница слишком большая для обработки.');
    return { text, url: response.url || String(url) };
  } catch (error) {
    if (error.name === 'AbortError') throw new ImportError('Яндекс отвечает слишком долго. Попробуйте ещё раз.');
    if (error instanceof ImportError) throw error;
    throw new ImportError('Не удалось связаться с Яндекс Картами.');
  } finally {
    clearTimeout(timer);
  }
}

export async function importYandexReviews(rawUrl, { fetchImpl = fetch } = {}) {
  const input = validateUrl(rawUrl);
  let id = extractBusinessId(input.href);
  if (!id) {
    // Короткая ссылка (yandex.ru/maps/-/...) — узнаём, куда она ведёт.
    const first = await fetchPage(input.href, fetchImpl);
    validateUrl(first.url);
    id = extractBusinessId(first.url) || extractBusinessId(first.text.match(/\/maps\/org\/[^"'\s]+/)?.[0]);
  }
  if (!id) {
    throw new ImportError('Не удалось определить организацию. Откройте её карточку в Яндекс Картах и скопируйте ссылку из адресной строки.');
  }
  const pageUrl = `https://yandex.ru/maps/org/${id}/reviews/`;
  const page = await fetchPage(`${pageUrl}?lang=ru_RU`, fetchImpl);
  return parseYandexPage(page.text, pageUrl);
}
