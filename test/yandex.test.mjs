import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportError, extractBusinessId, importYandexReviews, parseYandexPage, validateUrl } from '../lib/yandex.js';
import { createServer } from '../server.js';

// Упрощённая страница карточки: JSON с данными в <script class="state-view">, как у Яндекса.
function fakePage(reviews, extra = {}) {
  const state = {
    stack: [{
      results: {
        items: [{
          id: '1234567890',
          title: 'Кафе «Тест»',
          fullAddress: 'Санкт-Петербург, Невский проспект, 1',
          ratingData: { ratingValue: 4.66, reviewCount: 321 },
          reviewResults: { reviews, params: { count: 321 } },
          ...extra,
        }],
      },
    }],
  };
  return `<html><body><script type="application/json" class="state-view">${JSON.stringify(state)}</script></body></html>`;
}

const sample = [
  { reviewId: 'a', author: { name: 'Анна Иванова' }, text: 'Очень вкусно,\n уютно', rating: 5, updatedTime: '2026-10-01T10:00:00Z' },
  { reviewId: 'b', author: { name: 'Пётр' }, text: 'Долго ждали официанта', rating: 2, updatedTime: '2026-10-03T10:00:00Z' },
  { reviewId: 'b', author: { name: 'Пётр' }, text: 'Долго ждали официанта', rating: 2, updatedTime: '2026-10-03T10:00:00Z' },
  { reviewId: 'c', text: '', rating: 4 },
  { reviewId: 'd', text: 'Без оценки', rating: 0, updatedTime: 'не дата' },
];

test('ссылки: номер организации и допустимые адреса', () => {
  assert.equal(extractBusinessId('https://yandex.ru/maps/org/kafe_test/1234567890/reviews/?ll=30.3%2C59.9'), '1234567890');
  assert.equal(extractBusinessId('https://yandex.ru/maps/?oid=1234567890&ol=biz'), '1234567890');
  assert.equal(extractBusinessId('https://yandex.ru/maps/-/CDqZ4Kz~'), null);
  assert.ok(validateUrl('https://yandex.com/maps/org/1234567890/'));
  assert.throws(() => validateUrl('https://evil.example/maps/org/1/'), ImportError);
  assert.throws(() => validateUrl('https://yandex.ru.evil.example/maps/'), ImportError);
  assert.throws(() => validateUrl('не ссылка'), ImportError);
});

test('разбор страницы: компания, отзывы без имён, дубли и пустые отбрасываются', () => {
  const { company, reviews } = parseYandexPage(fakePage(sample), 'https://yandex.ru/maps/org/1234567890/reviews/');
  assert.deepEqual(company, {
    id: '1234567890', name: 'Кафе «Тест»', address: 'Санкт-Петербург, Невский проспект, 1',
    rating: 4.7, reviewCount: 321, url: 'https://yandex.ru/maps/org/1234567890/reviews/',
  });
  assert.deepEqual(reviews, [
    { date: '2026-10-01', rating: 5, text: 'Очень вкусно, уютно' },
    { date: '2026-10-03', rating: 2, text: 'Долго ждали официанта' },
    { date: '', rating: 0, text: 'Без оценки' },
  ]);
  assert.ok(!JSON.stringify(reviews).includes('Анна'), 'имена авторов не попадают в результат');
});

test('разбор страницы: капча и страница без отзывов дают понятную ошибку', () => {
  assert.throws(() => parseYandexPage('<form action="/showcaptcha">'), /ограничил/);
  assert.throws(() => parseYandexPage('<html></html>'), /не нашлось отзывов/);
  assert.throws(() => parseYandexPage(fakePage([{ text: ' ' }])), /нет отзывов с текстом/);
});

test('импорт: короткая ссылка раскрывается, запрашивается страница отзывов', async () => {
  const requested = [];
  const fakeFetch = async url => {
    requested.push(String(url));
    if (String(url).includes('/maps/-/')) {
      return { ok: true, url: 'https://yandex.ru/maps/org/kafe_test/1234567890/', text: async () => '<html></html>' };
    }
    return { ok: true, url: String(url), text: async () => fakePage(sample) };
  };
  const result = await importYandexReviews('https://yandex.ru/maps/-/CDqZ4Kz~', { fetchImpl: fakeFetch });
  assert.equal(result.reviews.length, 3);
  assert.deepEqual(requested, [
    'https://yandex.ru/maps/-/CDqZ4Kz~',
    'https://yandex.ru/maps/org/1234567890/reviews/?lang=ru_RU',
  ]);
});

test('импорт: короткая ссылка, ведущая не на Яндекс, отклоняется', async () => {
  const fakeFetch = async () => ({ ok: true, url: 'https://evil.example/', text: async () => '' });
  await assert.rejects(importYandexReviews('https://yandex.ru/maps/-/abc', { fetchImpl: fakeFetch }), ImportError);
});

test('API на локальном сервере: успех, ошибка ссылки, CORS', async () => {
  const fakeFetch = async url => ({ ok: true, url: String(url), text: async () => fakePage(sample) });
  const server = createServer({ fetchImpl: fakeFetch }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const api = `http://127.0.0.1:${server.address().port}/api/import/yandex`;
  const post = (body, headers = {}) => fetch(api, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  try {
    const ok = await post({ url: 'https://yandex.ru/maps/org/kafe/1234567890/' }, { origin: 'https://danok12.github.io' });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://danok12.github.io');
    assert.equal((await ok.json()).company.name, 'Кафе «Тест»');

    const bad = await post({ url: 'https://example.com/' }, { origin: 'https://evil.example' });
    assert.equal(bad.status, 422);
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    assert.match((await bad.json()).error, /Яндекс Карты/);

    const preflight = await fetch(api, { method: 'OPTIONS', headers: { origin: 'https://danok12.github.io' } });
    assert.equal(preflight.status, 204);
  } finally {
    server.close();
  }
});
