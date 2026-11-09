// Модель 0: словарный анализ тональности и категорий отзыва.
// Это точка отсчёта для сравнения с TF-IDF + логистической регрессией и rubert-tiny2.
//
// Как устроены словари:
//   'вкусн'   — основа: подходит любое слово, которое с неё начинается (вкусно, вкусный, вкуснейший);
//   '=еда'    — только это слово целиком (чтобы не ловить «едва», «среда»).
// Слово с приставкой «не» (невкусно, неплохо) получает противоположную тональность.
// Частицы «не», «нет», «без» переворачивают тональность следующих трёх слов в той же части предложения.

export const CATEGORIES = ['Сервис', 'Качество еды', 'Цена', 'Атмосфера'];
export const OTHER = 'Прочее';

const POSITIVE = [
  'отличн', 'вкусн', 'уют', 'прекрасн', 'хорош', 'быстр', 'вежлив', 'приятн', 'свеж',
  '=лучший', '=лучшая', '=лучшее', '=лучшие', '=лучшую', '=лучшим', '=лучшего', '=лучшей',
  'понрав', 'доброжел', 'рекоменд', 'профессионал', 'оперативн', 'внимател', 'замечательн',
  'великолепн', 'восхит', 'восторг', 'супер', 'классн', 'чудесн', 'шикарн', 'спасиб',
  'благодарн', 'благодарю', 'благодарим', '=люблю', 'любим', '=обожаю', 'щедр', 'комфортн',
  'удобн', 'чист', 'красив', 'приветлив', 'душевн', 'идеальн', 'аккуратн', 'достойн',
  'демократич', 'молодц', 'крут', '=топ', 'счастлив',
  '=вернусь', '=вернемся', '=придем',
];

const NEGATIVE = [
  'плох', 'ужас', 'отвратит', 'кошмар', 'разочар', 'груб', 'хам', 'гряз', 'долго', 'долги',
  'медлен', 'ждал', 'ждат', 'очеред', 'остыл', 'пересол', 'пересуш', 'подгор', 'испорч',
  'тухл', 'пресн', 'безвкус', 'жестк', 'тесн', 'шумн', 'душн', 'дорог', 'переплат',
  'завышен', 'обман', 'обсчит', 'забыл', 'перепут', 'задерж', 'опозд', 'проблем', 'жалоб',
  'отрав', 'таракан', 'волос', 'хуже', 'худш', 'отстой', '=зря', 'пожалел',
];

const CATEGORY_WORDS = {
  'Сервис': [
    'официант', 'персонал', 'сервис', 'обслуж', 'бариста', 'сотрудник', 'администрат',
    'менеджер', 'хостес', 'кассир', 'вежлив', 'груб', 'хам', 'внимател', 'приветлив',
    'доброжел', 'ждал', 'ждат', 'долго', 'долги', 'очеред', 'медлен', 'задерж', 'опозд',
    'быстр', 'оперативн', 'принес', 'принесл', 'забыл', 'перепут', 'обсчит', 'достав',
    'курьер', 'бронир', 'бронь',
  ],
  'Качество еды': [
    '=еда', '=еду', '=еды', '=едой', '=еде', 'блюд', 'вкус', 'безвкус', 'кухн', 'повар', 'шеф',
    'меню', 'порци', 'паст', 'пицц', 'бургер', 'стейк', 'салат', 'суп', 'мяс', 'рыб', 'курин',
    'кофе', 'капучино', 'латте', '=чай', '=чая', '=чаю', '=чаем', 'напит', 'десерт', 'торт',
    'выпеч', 'круасс', 'хлеб', 'соус', 'гарнир', 'завтрак', 'обед', 'ужин', 'ролл', 'суши',
    'шаурм', 'пельмен', 'пив', '=вино', '=вина', 'коктейл', 'лимонад', 'сыр', 'свеж',
    'остыл', 'пересол', 'пересуш', 'подгор', 'пресн', 'жестк', 'приготов', 'продукт',
    'испорч', 'тухл', 'отрав', 'волос',
  ],
  'Цена': [
    'цен', 'стоимост', 'дорог', 'дешев', 'бюджетн', 'переплат', 'завышен', 'рубл', '=руб',
    'чек', 'счет', 'скидк', 'акци', 'прайс', 'демократич',
  ],
  'Атмосфера': [
    'атмосфер', 'интерьер', 'уют', 'музык', '=зал', '=зала', '=зале', '=залу', '=залом',
    '=залы', 'обстанов', 'дизайн', 'освещ', 'мебел', 'чист', 'гряз', 'тесн', 'шум', 'громк',
    'тих', 'красив', 'комфорт', 'туалет', 'санузел', 'веранд', 'террас', 'запах', 'душн',
    'жарк', 'прохлад', 'кондиц', 'таракан',
  ],
};

// Слова, которые начинаются с основы, но означают другое.
const EXCEPTIONS = {
  'суп': ['супер'],
  'цен': ['ценн', 'центр'],
  'дорог': ['=дорога', '=дороги', '=дороге', '=дорогу', '=дорогам', '=дорогах', '=дорогами'],
  'долго': ['долгожд'],
  'хам': ['хамон'],
  'паст': ['пастел'],
  'чек': ['чекин'],
};

const NEGATORS = new Set(['не', 'нет', 'без']);
const NEGATION_REACH = 3;

function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

// Части предложения, внутри — слова. Отрицание не переходит через запятую и точку.
export function tokenize(text) {
  return normalize(text)
    .split(/[.,!?;:()«»"\n—–]+/)
    .map(part => part.match(/[а-яa-z0-9]+/g) || [])
    .filter(words => words.length);
}

export function matchesEntry(word, entry) {
  if (entry.startsWith('=')) return word === entry.slice(1);
  if (!word.startsWith(entry)) return false;
  return !(EXCEPTIONS[entry] || []).some(exception => matchesEntry(word, exception));
}

const matchesAny = (word, entries) => entries.some(entry => matchesEntry(word, entry));

// «невкусно» → «вкусно», «неплохо» → «плохо»
function withoutNe(word) {
  return word.length > 4 && word.startsWith('не') ? word.slice(2) : null;
}

function wordPolarity(word) {
  const direct = matchesAny(word, POSITIVE) ? 1 : matchesAny(word, NEGATIVE) ? -1 : 0;
  if (direct) return direct;
  const stripped = withoutNe(word);
  if (!stripped) return 0;
  return matchesAny(stripped, POSITIVE) ? -1 : matchesAny(stripped, NEGATIVE) ? 1 : 0;
}

function wordCategories(word) {
  const stripped = withoutNe(word);
  return CATEGORIES.filter(name =>
    matchesAny(word, CATEGORY_WORDS[name]) || (stripped && matchesAny(stripped, CATEGORY_WORDS[name])));
}

export function analyzeText(text) {
  let score = 0;
  const categories = new Set();
  for (const words of tokenize(text)) {
    let negationLeft = 0;
    for (const word of words) {
      if (NEGATORS.has(word)) { negationLeft = NEGATION_REACH; continue; }
      const polarity = wordPolarity(word);
      score += negationLeft > 0 ? -polarity : polarity;
      if (negationLeft > 0) negationLeft--;
      wordCategories(word).forEach(name => categories.add(name));
    }
  }
  return { score, categories: CATEGORIES.filter(name => categories.has(name)) };
}

export function classify(review) {
  const { score: textScore, categories } = analyzeText(review.text);
  let score = textScore;
  if (review.rating >= 4) score += 1;
  if (review.rating > 0 && review.rating <= 2) score -= 1;
  const sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  return { ...review, sentiment, categories: categories.length ? categories : [OTHER], score };
}

// Есть ли в тексте слово, подходящее под одну из основ (для выбора совета).
export function mentions(text, entries) {
  return tokenize(text).some(words => words.some(word => matchesAny(word, entries)));
}
