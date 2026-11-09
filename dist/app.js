import { CATEGORIES, OTHER, classify, mentions } from './analyzer.js';
import { decodeCsv, parseCSV, parseDate } from './csv.js';

const ALL_CATEGORIES = [...CATEGORIES, OTHER];
const SENTIMENT_LABEL = { positive: 'Позитив', neutral: 'Нейтрально', negative: 'Негатив' };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

let analysis = [];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const plural = (n, one, few, many) => {
  const m = n % 100;
  if (m >= 11 && m <= 19) return many;
  const d = n % 10;
  return d === 1 ? one : d >= 2 && d <= 4 ? few : many;
};
const formatNumber = n => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n);
const stars = rating => rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'без оценки';
const average = items => items.length ? items.reduce((sum, r) => sum + r.rating, 0) / items.length : 0;

// ---------- данные ----------

function setData(rows, label) {
  analysis = rows.map(classify);
  if (!analysis.length) throw new Error('В файле нет непустых отзывов');
  $('#emptyDashboard').hidden = true;
  $('#emptyBenefits').hidden = true;
  $('#formatGuide').hidden = true;
  $('#dataDashboard').hidden = false;
  $('#analysisStatus').classList.remove('pending');
  $('#analysisStatus').lastChild.textContent = ' Анализ завершён';
  renderAll(label);
}

function renderEmptyState() {
  analysis = [];
  $('#emptyDashboard').hidden = false;
  $('#emptyBenefits').hidden = false;
  $('#formatGuide').hidden = false;
  $('#dataDashboard').hidden = true;
  $('#reviewCountBadge').textContent = '0';
  $('#analysisStatus').classList.add('pending');
  $('#analysisStatus').lastChild.textContent = ' Ожидаем данные';
  $('#reviewList').innerHTML = '<div class="empty">Сначала загрузите CSV с отзывами на странице «Обзор».</div>';
  $('#recommendations').innerHTML = '<div class="empty">Рекомендации появятся после загрузки и анализа отзывов.</div>';
  $('#categoryScorecards').innerHTML = '';
  $('#evidenceGrid').innerHTML = '';
  $('#actionPlan').innerHTML = '';
}

// ---------- обзор ----------

function renderAll(label) {
  const total = analysis.length;
  const positive = analysis.filter(r => r.sentiment === 'positive');
  const neutral = analysis.filter(r => r.sentiment === 'neutral');
  const negative = analysis.filter(r => r.sentiment === 'negative');
  const avg = average(analysis.filter(r => r.rating > 0));
  const pct = n => total ? Math.round(n / total * 100) : 0;

  $('#totalReviews').textContent = total;
  $('#periodLabel').textContent = label;
  $('#avgRating').textContent = avg ? formatNumber(avg) : '—';
  $('#ratingDelta').textContent = !avg ? 'оценок нет в файле' : avg >= 4 ? 'выше 4 из 5' : avg >= 3 ? 'стабильная оценка' : 'нужно улучшение';
  $('#positiveShare').textContent = pct(positive.length) + '%';
  $('#positiveCount').textContent = `${positive.length} ${plural(positive.length, 'отзыв', 'отзыва', 'отзывов')}`;
  $('#negativeCount').textContent = negative.length;
  $('#negativeShare').textContent = pct(negative.length) + '% выборки';
  $('#reviewCountBadge').textContent = total;

  const donut = $('#sentimentDonut');
  donut.style.setProperty('--p', pct(positive.length));
  donut.style.setProperty('--n', pct(neutral.length));
  $('#donutScore').textContent = pct(positive.length) + '%';
  $('#sentimentLegend').innerHTML = [
    ['Позитивные', positive.length, '#14968f'],
    ['Нейтральные', neutral.length, '#e8af52'],
    ['Негативные', negative.length, '#ee745e'],
  ].map(([name, count, color]) => `<div class="legend-row"><i style="background:${color}"></i><span>${name}</span><b>${pct(count)}%</b></div>`).join('');

  renderCategories();
  renderTimeline();
  renderComplaints();
  renderReviews();
  renderRecommendations();
  renderInsight();
}

function categoryStats() {
  return ALL_CATEGORIES.map(name => {
    const items = analysis.filter(r => r.categories.includes(name));
    const negative = items.filter(r => r.sentiment === 'negative').length;
    const positive = items.filter(r => r.sentiment === 'positive').length;
    const neutral = items.length - negative - positive;
    return {
      name, items, negative, positive, neutral,
      count: items.length,
      score: items.length ? Math.round((positive + neutral * 0.5) / items.length * 100) : 0,
      rate: items.length ? Math.round(negative / items.length * 100) : 0,
      positiveRate: items.length ? Math.round(positive / items.length * 100) : 0,
    };
  }).sort((a, b) => b.count - a.count);
}

function renderCategories() {
  const stats = categoryStats();
  const max = Math.max(1, ...stats.map(x => x.count));
  $('#categoryBars').innerHTML = stats.map(x => `<div class="bar-row"><div class="bar-label"><span>${x.name}</span><b>${x.count} · ${x.rate}% негатив</b></div><div class="track"><i style="width:${Math.round(x.count / max * 100)}%"></i></div></div>`).join('');
}

function renderTimeline() {
  const groups = {};
  analysis.forEach(r => {
    const d = parseDate(r.date);
    const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'Без даты';
    (groups[key] ??= []).push(r);
  });
  let entries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  if (!entries.length) entries = [['Данные', analysis]];
  const years = new Set(entries.map(([key]) => key.slice(0, 4)).filter(y => /^\d{4}$/.test(y)));
  const label = key => {
    if (!/^\d{4}-\d{2}$/.test(key)) return key;
    const month = MONTHS[Number(key.slice(5)) - 1];
    return years.size > 1 ? `${month} ${key.slice(2, 4)}` : month;
  };
  $('#lineChart').innerHTML = `<div class="chart-columns">${entries.map(([key, items]) => {
    const value = items.length ? Math.round(items.filter(x => x.sentiment === 'positive').length / items.length * 100) : 0;
    return `<div class="chart-column" title="${value}% позитивных"><i style="height:${value}%"></i><b>${label(key)}</b></div>`;
  }).join('')}</div>`;
}

function renderComplaints() {
  const bad = analysis.filter(r => r.sentiment === 'negative').sort((a, b) => a.score - b.score || a.rating - b.rating).slice(0, 4);
  $('#complaintsBody').innerHTML = bad.length
    ? bad.map(r => `<tr><td class="review-cell"><b>${escapeHtml(r.text)}</b><span>${escapeHtml(r.date)}</span></td><td><span class="tag">${escapeHtml(r.categories[0])}</span></td><td><span class="stars">${stars(r.rating)}</span></td><td><span class="sentiment-tag negative">Негатив</span></td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Негативных отзывов не найдено</td></tr>';
}

function renderReviews() {
  const query = ($('#reviewSearch')?.value || '').toLowerCase();
  const filter = $('#sentimentFilter')?.value || 'all';
  const list = analysis.filter(r => (filter === 'all' || r.sentiment === filter) && r.text.toLowerCase().includes(query));
  $('#reviewList').innerHTML = list.length
    ? list.map(r => `<article class="review-card"><div><div class="review-meta"><span>${escapeHtml(r.date)}</span><span class="sentiment-tag ${r.sentiment}">${SENTIMENT_LABEL[r.sentiment]}</span></div><p class="review-text">${escapeHtml(r.text)}</p><div class="review-tags">${r.categories.map(c => `<span class="tag">${escapeHtml(c)}</span>`).join('')}</div></div><div class="stars">${stars(r.rating)}</div></article>`).join('')
    : '<div class="empty">По выбранным условиям ничего не найдено</div>';
}

function renderInsight() {
  if (!analysis.length) return;
  const stats = categoryStats().filter(x => x.name !== OTHER);
  const best = stats.filter(x => x.positive > x.negative).sort((a, b) => (b.positive - b.negative) - (a.positive - a.negative))[0];
  const worst = [...stats].sort((a, b) => b.negative - a.negative)[0];
  $('#mainInsightTitle').textContent = best ? `Сильная сторона — ${best.name.toLowerCase()}` : 'Явной сильной стороны пока нет';
  $('#mainInsightText').textContent = worst && worst.negative
    ? `При этом в категории «${worst.name}» ${worst.negative} ${plural(worst.negative, 'негативный отзыв', 'негативных отзыва', 'негативных отзывов')}. Начните улучшения с неё.`
    : 'Повторяющихся жалоб в выборке не обнаружено.';
}

// ---------- рекомендации ----------

const STRENGTH_COPY = {
  'Сервис': 'Закрепите удачные сценарии общения и используйте их при обучении команды.',
  'Качество еды': 'Зафиксируйте рецептуры и стандарты подачи блюд, которые хвалят гости, и проверяйте их стабильность.',
  'Цена': 'Сохраняйте прозрачность цен и подчёркивайте ценность предложения.',
  'Атмосфера': 'Сохраните то, что создаёт уют: чистоту, музыку, освещение и удобную посадку.',
};

function situationalAdvice(stat) {
  const texts = stat.items.filter(x => x.sentiment === 'negative').map(x => x.text);
  const has = (...stems) => texts.some(text => mentions(text, stems));
  if (stat.name === 'Сервис') {
    if (has('ждал', 'ждат', 'долго', 'долги', 'очеред', 'медлен', 'задерж', 'опозд')) return 'Главная жалоба связана с ожиданием. Замерьте время обслуживания в часы пик и перераспределите нагрузку команды.';
    if (has('груб', 'хам', 'невежлив', 'невнимател')) return 'В отзывах критикуют общение сотрудников. Разберите конкретные ситуации с командой и закрепите стандарт спокойного ответа гостю.';
    if (has('забыл', 'перепут', 'обсчит')) return 'Гости пишут об ошибках в заказе или счёте. Введите проверку заказа перед подачей и сверку счёта перед выдачей гостю.';
    if (has('достав', 'курьер')) return 'Есть жалобы на доставку. Проверьте время в пути и упаковку, предупреждайте гостя о задержке заранее.';
  }
  if (stat.name === 'Качество еды') {
    if (has('несвеж', 'испорч', 'тухл', 'отрав', 'волос')) return 'Есть сигналы о свежести и гигиене — это главный риск. В первую очередь проверьте сроки хранения продуктов и санитарные правила на кухне.';
    if (has('остыл', 'холодн')) return 'Гости получают остывшие блюда. Проверьте время от выдачи с кухни до стола и подогрев посуды.';
    if (has('невкус', 'безвкус', 'пресн', 'пересол', 'пересуш', 'подгор', 'жестк')) return 'Гостям не нравится вкус или приготовление. Сверьте блюда с технологическими картами и снимайте пробу перед подачей.';
  }
  if (stat.name === 'Цена') return 'Негатив связан с восприятием стоимости. Покажите состав и выход блюд в меню, чтобы цена не становилась неожиданностью.';
  if (stat.name === 'Атмосфера') {
    if (has('гряз', 'нечист', 'таракан', 'запах')) return 'В отзывах затронута чистота. Добавьте проверку зала и санузлов по расписанию с отметкой ответственного.';
    if (has('шум', 'громк', 'музык')) return 'Гости упоминают шум. Проверьте громкость музыки и самые шумные зоны в часы пик.';
    if (has('тесн', 'душн', 'жарк', 'холодн')) return 'Жалобы связаны с физическим комфортом. Проверьте посадку, проветривание и температуру в зале в часы пик.';
  }
  return 'Разберите конкретные негативные отзывы с ответственным сотрудником и проверьте результат после изменения процесса.';
}

function renderRecommendations() {
  const stats = categoryStats().filter(x => x.count && x.name !== OTHER);
  const advice = Object.fromEntries(stats.map(x => [x.name, situationalAdvice(x)]));
  const strengths = stats.filter(x => x.positive > x.negative).sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 4);
  const weaknesses = stats.filter(x => x.negative > 0).sort((a, b) => b.negative - a.negative || b.rate - a.rate).slice(0, 4);
  const negativeTotal = analysis.filter(x => x.sentiment === 'negative').length;
  const averageRating = average(analysis.filter(x => x.rating > 0));
  const excellent = negativeTotal === 0 && averageRating >= 4.8;

  const strengthCards = strengths.map(x => `<article class="rec-card strength-card"><span>${x.positiveRate}% позитивных</span><h3>${x.name}</h3><p>${STRENGTH_COPY[x.name]} Основание: ${x.positive} ${plural(x.positive, 'положительный отзыв', 'положительных отзыва', 'положительных отзывов')} из ${x.count}.</p></article>`).join('');
  const weaknessCards = weaknesses.map((x, i) => `<article class="rec-card growth-card">${i === 0 ? '<span class="priority">приоритет</span>' : ''}<span>${x.rate}% негативных</span><h3>${x.name}</h3><p>${advice[x.name]} Основание: ${x.negative} ${plural(x.negative, 'негативный отзыв', 'негативных отзыва', 'негативных отзывов')} из ${x.count}.</p></article>`).join('');
  const clearTitle = excellent ? 'Проблем не найдено' : 'Повторяющихся проблем не обнаружено';
  const clearText = excellent
    ? `Средняя оценка — ${formatNumber(averageRating)} из 5, негативных отзывов нет. Сохраняйте текущие стандарты и следите, чтобы качество оставалось стабильным.`
    : 'В загруженной выборке нет негативных отзывов по четырём категориям. Продолжайте собирать отзывы — при появлении повторяющейся жалобы она появится здесь.';
  const smallSample = analysis.length < 10 ? ' Выборка пока небольшая, поэтому вывод стоит перепроверить после появления новых отзывов.' : '';
  const growthContent = weaknesses.length ? weaknessCards : `<article class="rec-card clear-card"><span>0 проблемных отзывов</span><h3>${clearTitle}</h3><p>${clearText}${smallSample}</p></article>`;
  const growthHead = weaknesses.length ? '<p class="eyebrow">Зоны роста</p><h2>Что стоит улучшить</h2>' : '<p class="eyebrow">Текущая ситуация</p><h2>Нужно ли что-то исправлять</h2>';

  $('#recommendations').innerHTML = `<section class="rec-group strengths"><div class="rec-group-head"><i>+</i><div><p class="eyebrow">Сильные стороны</p><h2>Что особенно ценят гости</h2></div></div><div class="rec-stack">${strengthCards || '<article class="rec-card clear-card"><h3>Явной сильной стороны пока нет</h3><p>Ни в одной категории позитивных отзывов не больше, чем негативных. Добавьте больше отзывов, чтобы вывод был надёжнее.</p></article>'}</div></section><section class="rec-group ${weaknesses.length ? 'weaknesses' : 'clear-results'}"><div class="rec-group-head"><i>${weaknesses.length ? '!' : '✓'}</i><div>${growthHead}</div></div><div class="rec-stack">${growthContent}</div></section>`;
  renderDetailedInsights(advice, weaknesses, excellent, averageRating);
}

function shortQuote(text, max = 180) {
  const value = String(text || '').trim();
  return value.length > max ? value.slice(0, max).trim() + '…' : value;
}

function renderDetailedInsights(advice, weaknesses, excellent, averageRating) {
  const stats = categoryStats();
  $('#categoryScorecards').innerHTML = ALL_CATEGORIES.map(name => {
    const item = stats.find(x => x.name === name);
    return `<article class="score-card ${item.score < 45 && item.count ? 'critical' : ''}"><header><h3>${item.name}</h3><strong>${item.count ? item.score + '%' : '—'}</strong></header><div class="mini-track"><i style="width:${item.score}%"></i></div><p>${item.count ? `${item.count} упоминаний · ${item.positive} позитивных · ${item.negative} негативных` : 'В текущей выборке категория не упоминается'}</p></article>`;
  }).join('');

  const positive = analysis.filter(x => x.sentiment === 'positive').sort((a, b) => b.score - a.score).slice(0, 3);
  const negative = analysis.filter(x => x.sentiment === 'negative').sort((a, b) => a.score - b.score || a.rating - b.rating).slice(0, 3);
  const quotes = items => items.map(r => `<blockquote class="evidence-quote">«${escapeHtml(shortQuote(r.text))}»<b>${r.rating ? `${r.rating}/5` : 'без оценки'} · ${escapeHtml(r.categories[0])}</b></blockquote>`).join('');
  const positiveEvidence = positive.length ? quotes(positive) : '<p class="evidence-quote">Явных положительных цитат в выборке не найдено.</p>';
  const negativeEvidence = negative.length ? quotes(negative) : `<div class="all-clear"><b>✓ Всё спокойно</b><p>${excellent ? `При средней оценке ${formatNumber(averageRating)} из 5 в выборке нет отзывов, требующих исправлений.` : 'В загруженных отзывах не найдено проблемных отзывов.'}</p></div>`;
  $('#evidenceGrid').innerHTML = `<article class="evidence-column positive"><h3>Что подтверждает сильные стороны</h3>${positiveEvidence}</article><article class="evidence-column ${negative.length ? 'negative' : 'clear'}"><h3>${negative.length ? 'Что требует внимания' : 'Проблемные отзывы'}</h3>${negativeEvidence}</article>`;

  const steps = weaknesses.length
    ? weaknesses.slice(0, 3).map((x, i) => ({
      title: `${['Сначала', 'Затем', 'Закрепить'][i]}: ${x.name}`,
      text: `${advice[x.name]} ${['Срок — первая неделя.', 'Срок — до 14 дней.', 'Контрольная точка — через 30 дней.'][i]}`,
    }))
    : [
      { title: 'Сохранить текущие стандарты', text: 'Не меняйте процессы только ради изменений: гости уже оценивают опыт положительно.' },
      { title: 'Поддерживать обратную связь', text: 'Отвечайте на новые отзывы и отмечайте даже единичные замечания, если они появятся.' },
      { title: 'Проверить динамику через месяц', text: 'Загрузите свежие отзывы и убедитесь, что высокая оценка и отсутствие жалоб сохраняются.' },
    ];
  $('#actionPlan').innerHTML = steps.map((x, i) => `<article class="action-step"><span>${i + 1}</span><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.text)}</p></article>`).join('');
}

// ---------- загрузка файла ----------

async function handleFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) return showToast('Нужен файл в формате CSV');
  if (file.size > 5 * 1024 * 1024) return showToast('Файл больше 5 МБ');
  try {
    const { text, encoding } = decodeCsv(await file.arrayBuffer());
    const rows = parseCSV(text);
    setData(rows, file.name);
    const note = encoding === 'UTF-8' ? '' : ` (кодировка ${encoding})`;
    $('#fileFeedback').textContent = `✓ ${file.name}: проанализировано ${rows.length} ${plural(rows.length, 'отзыв', 'отзыва', 'отзывов')}${note}`;
    showToast('Анализ завершён');
  } catch (e) {
    showToast(e.message);
    $('#fileFeedback').textContent = 'Не удалось прочитать файл. Проверьте заголовки колонок.';
  }
}

// ---------- интерфейс ----------

function switchView(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.nav-item').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  $(`#${name}View`).classList.add('active');
  $('#pageTitle').textContent = { dashboard: 'Обзор отзывов', reviews: 'Все отзывы', insights: 'Рекомендации', about: 'О проекте' }[name];
  $('.sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let toastTimer;
function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

$$('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$$('[data-go]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.go)));
$('#mobileMenu').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#uploadBtn').addEventListener('click', () => $('#fileInput').click());
$('#emptyUploadBtn').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => handleFile(e.target.files[0]));
$('#reviewSearch').addEventListener('input', renderReviews);
$('#sentimentFilter').addEventListener('change', renderReviews);

const dropZone = $('#dropZone');
['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.remove('dragging'); }));
dropZone.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));

renderEmptyState();
