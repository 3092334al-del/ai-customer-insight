import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeCsv, parseCSV, parseDate } from '../dist/csv.js';

// Кодирует русский текст в Windows-1251 (А–я → 0xC0–0xFF, Ё → 0xA8, ё → 0xB8).
function encode1251(text) {
  return Uint8Array.from(text, ch => {
    const code = ch.charCodeAt(0);
    if (code < 128) return code;
    if (ch === 'Ё') return 0xa8;
    if (ch === 'ё') return 0xb8;
    if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
    throw new Error(`нет символа ${ch} в тесте`);
  });
}

test('читает UTF-8 и Windows-1251', () => {
  const utf8 = decodeCsv(new TextEncoder().encode('Отзыв\nВкусно'));
  assert.equal(utf8.encoding, 'UTF-8');
  assert.equal(utf8.text, 'Отзыв\nВкусно');
  const cp1251 = decodeCsv(encode1251('Отзыв;Оценка\nВсё вкусно;5'));
  assert.equal(cp1251.encoding, 'Windows-1251');
  assert.equal(cp1251.text, 'Отзыв;Оценка\nВсё вкусно;5');
});

test('«Дата отзыва» не принимается за колонку с текстом', () => {
  const rows = parseCSV('Дата отзыва;Текст отзыва;Оценка отзыва\n01.11.2026;Вкусно;5');
  assert.deepEqual(rows, [{ date: '01.11.2026', rating: 5, text: 'Вкусно' }]);
});

test('колонку с именем не читает', () => {
  const rows = parseCSV('Имя;Отзыв\nАнна;Вкусно');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['date', 'rating', 'text']);
});

test('кавычки, запятые внутри текста, пустые строки', () => {
  const rows = parseCSV('text,rating\n"Вкусно, но долго ""очень""",4,5\n\n,3\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, 'Вкусно, но долго "очень"');
});

test('оценка с запятой и за пределами шкалы', () => {
  const rows = parseCSV('Отзыв;Оценка\nа;4,6\nб;9\nв;нет');
  assert.deepEqual(rows.map(r => r.rating), [5, 5, 0]);
});

test('без колонки с текстом — понятная ошибка', () => {
  assert.throws(() => parseCSV('Дата;Оценка\n01.11.2026;5'), /Отзыв/);
});

test('даты в разных форматах', () => {
  const ymd = d => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  assert.deepEqual(ymd(parseDate('01.11.2026')), [2026, 11, 1]);
  assert.deepEqual(ymd(parseDate('1/11/26')), [2026, 11, 1]);
  assert.deepEqual(ymd(parseDate('2026-11-01')), [2026, 11, 1]);
  assert.deepEqual(ymd(parseDate('2026-11-01T10:00:00Z')), [2026, 11, 1]);
  assert.equal(parseDate('31.02.2026'), null);
  assert.equal(parseDate('вчера'), null);
});

test('пример из репозитория читается', async () => {
  const rows = parseCSV(await readFile(new URL('./perfect_reviews.csv', import.meta.url), 'utf8'));
  assert.equal(rows.length, 4);
  assert.ok(rows.every(r => r.rating === 5));
});
