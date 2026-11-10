import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, OTHER } from '../dist/analyzer.js';

const run = (text, rating = 0) => classify({ text, rating, date: '—' });

test('части других слов не считаются признаками', () => {
  assert.ok(!run('Официант сказал, что я заказал не то').categories.includes('Атмосфера'), '«зал» внутри «сказал», «заказал»');
  assert.ok(!run('Оценили по достоинству, оценка отличная').categories.includes('Цена'), '«цен» внутри «оценка»');
  assert.ok(!run('Супер место').categories.includes('Качество еды'), '«суп» внутри «супер»');
  assert.ok(!run('Кафе в центре города').categories.includes('Цена'), '«цен» внутри «центре»');
  assert.ok(!run('Дорогу к кафе найти сложно').categories.includes('Цена'), '«дорогу» — это не цена');
  assert.notEqual(run('Часто заходим, сейчас были счастливы').sentiment, 'negative', '«час» внутри «часто»');
  assert.notEqual(run('Долгожданное открытие').sentiment, 'negative');
});

test('отрицание переворачивает тональность', () => {
  assert.equal(run('Неплохо').sentiment, 'positive');
  assert.equal(run('Не понравилось').sentiment, 'negative');
  assert.equal(run('Больше не вернусь').sentiment, 'negative');
  assert.equal(run('Невкусно').sentiment, 'negative');
  assert.equal(run('Не пришлось ждать').sentiment, 'positive');
  assert.equal(run('Не очень вкусно').sentiment, 'negative');
  assert.equal(run('Без проблем и без очереди').sentiment, 'positive');
  assert.equal(run('Недорого и уютно').sentiment, 'positive');
});

test('отрицание не переходит через запятую', () => {
  assert.equal(run('Не знаю почему, но очень вкусно').sentiment, 'positive');
});

test('категории определяются и для слов с «не»', () => {
  assert.deepEqual(run('Невкусно').categories, ['Качество еды']);
  assert.deepEqual(run('Недорого').categories, ['Цена']);
  assert.deepEqual(run('Неуютно').categories, ['Атмосфера']);
});

test('у отзыва может быть несколько категорий', () => {
  const review = run('Пицца отличная, но ждали официанта 40 минут, цены высокие, зато уютно');
  assert.deepEqual(review.categories, ['Сервис', 'Качество еды', 'Цена', 'Атмосфера']);
});

test('отзыв без признаков категорий попадает в «Прочее», а не в «Сервис»', () => {
  assert.deepEqual(run('Просто зашли').categories, [OTHER]);
});

test('оценка сдвигает тональность', () => {
  assert.equal(run('Обычное место', 5).sentiment, 'positive');
  assert.equal(run('Обычное место', 1).sentiment, 'negative');
  assert.equal(run('Обычное место', 3).sentiment, 'neutral');
  assert.equal(run('Обычное место').sentiment, 'neutral');
});

test('известное ограничение: ирония не распознаётся', () => {
  // Словарная модель видит «быструю» как похвалу. Это пример для сравнения с нейросетью.
  assert.notEqual(run('Ну конечно, «быстрая» доставка — всего полтора часа').sentiment, 'negative');
});
