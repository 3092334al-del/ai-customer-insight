import test from 'node:test';
import assert from 'node:assert/strict';
import { reputationIndex, reputationLevel } from '../dist/metrics.js';

const r = (sentiment, rating = 0) => ({ sentiment, rating });

test('индекс репутации: 70 % доля позитивных + 30 % средняя оценка', () => {
  // 50 % позитивных, средняя оценка 4 из 5 (80 %): 0.7·50 + 0.3·80 = 59
  assert.equal(reputationIndex([r('positive', 5), r('negative', 3)]), 59);
  assert.equal(reputationIndex([r('positive', 5), r('positive', 5)]), 100);
  assert.equal(reputationIndex([r('negative', 1)]), 6);
});

test('индекс репутации без оценок — доля позитивных; без отзывов — нет данных', () => {
  assert.equal(reputationIndex([r('positive'), r('neutral'), r('negative'), r('positive')]), 50);
  assert.equal(reputationIndex([]), null);
  assert.equal(reputationLevel(null), 'нет данных');
  assert.equal(reputationLevel(85), 'отличная');
  assert.equal(reputationLevel(39), 'требует внимания');
});
