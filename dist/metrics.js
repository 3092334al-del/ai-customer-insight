// Индекс репутации от 0 до 100.
//   70 % — доля позитивных отзывов (по тексту),
//   30 % — средняя оценка гостей, переведённая в проценты (5 из 5 = 100).
// Если оценок в данных нет, индекс равен доле позитивных отзывов.
export function reputationIndex(reviews) {
  if (!reviews.length) return null;
  const positiveShare = reviews.filter(r => r.sentiment === 'positive').length / reviews.length * 100;
  const rated = reviews.filter(r => r.rating > 0);
  if (!rated.length) return Math.round(positiveShare);
  const ratingShare = rated.reduce((sum, r) => sum + r.rating, 0) / rated.length / 5 * 100;
  return Math.round(Math.min(100, Math.max(0, positiveShare * 0.7 + ratingShare * 0.3)));
}

export function reputationLevel(index) {
  if (index === null) return 'нет данных';
  if (index >= 80) return 'отличная';
  if (index >= 60) return 'хорошая';
  if (index >= 40) return 'средняя';
  return 'требует внимания';
}
