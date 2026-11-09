// Чтение CSV с отзывами: кодировка, колонки, даты.

// Excel в Windows сохраняет CSV в Windows-1251, остальные программы — в UTF-8.
export function decodeCsv(buffer) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1251').decode(buffer), encoding: 'Windows-1251' };
  }
}

function detectDelimiter(firstLine) {
  const counts = [';', ',', '\t'].map(ch => [ch, firstLine.split(ch).length - 1]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

function splitRows(text, delimiter) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const endCell = () => { row.push(cell.trim()); cell = ''; };
  const endRow = () => { endCell(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      endCell();
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  endRow();
  return rows;
}

const HEADER_NAMES = {
  date: ['дата', 'date', 'время'],
  rating: ['оцен', 'рейтинг', 'rating', 'stars', 'балл', 'звезд'],
  text: ['текст', 'отзыв', 'review', 'comment', 'коммент', 'text', 'сообщен'],
};

// Сначала дата и оценка, потом текст среди оставшихся колонок:
// иначе «Дата отзыва» приняли бы за колонку с отзывом.
function findColumns(headers) {
  const taken = new Set();
  const find = names => {
    const index = headers.findIndex((h, i) => !taken.has(i) && names.some(n => h.includes(n)));
    if (index >= 0) taken.add(index);
    return index;
  };
  const date = find(HEADER_NAMES.date);
  const rating = find(HEADER_NAMES.rating);
  const text = find(HEADER_NAMES.text);
  return { date, rating, text };
}

function parseRating(raw) {
  const value = parseFloat(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(value) ? Math.max(0, Math.min(5, Math.round(value))) : 0;
}

// Колонку с именем автора не читаем: для анализа она не нужна.
export function parseCSV(text) {
  const clean = String(text).replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/).find(Boolean) || '';
  const rows = splitRows(clean, detectDelimiter(firstLine));
  if (rows.length < 2) throw new Error('В CSV нет строк с отзывами');
  const headers = rows.shift().map(h => h.toLowerCase().replace(/ё/g, 'е').trim());
  const col = findColumns(headers);
  if (col.text < 0) throw new Error('Не найдена колонка «Отзыв» или «Текст»');
  return rows
    .map(r => ({
      date: col.date >= 0 && r[col.date] ? r[col.date] : '—',
      rating: col.rating >= 0 ? parseRating(r[col.rating]) : 0,
      text: (r[col.text] || '').trim(),
    }))
    .filter(r => r.text);
}

// Понимает 01.11.2026, 1/11/26, 2026-11-01 и 2026-11-01T10:00:00Z.
export function parseDate(raw) {
  const s = String(raw ?? '').trim();
  let y, m, d;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (match) [, y, m, d] = match.map(Number);
  else {
    match = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/);
    if (!match) return null;
    [, d, m, y] = match.map(Number);
    if (match[3].length === 2) y += 2000;
  }
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
