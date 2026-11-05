import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBusinessId,parseYandexPage} from '../server.js';

test('extracts organization id from common Yandex links',()=>{
 assert.equal(extractBusinessId('https://yandex.ru/maps/org/company/146989264608/reviews/'),'146989264608');
 assert.equal(extractBusinessId('https://yandex.ru/maps/?oid=12345678901'),'12345678901');
 assert.equal(extractBusinessId('https://yandex.ru/maps/org/temp/98765432100/'),'98765432100');
});

test('parses reviews and company metadata from state-view',()=>{
 const state={stack:[{name:'Тестовая кофейня',fullAddress:'Москва, Тверская, 1',rating:4.8,reviewCount:77,reviewResults:{reviews:[{reviewId:'1',author:{name:'Анна'},updatedTime:'2026-10-12T10:00:00Z',rating:5,text:'Очень вкусный кофе и вежливый персонал'},{reviewId:'2',author:{name:'Иван'},rating:2,text:'Долго ждали заказ'}]}}]};
 const html=`<html><script type="application/json" class="state-view">${JSON.stringify(state)}</script></html>`;
 const result=parseYandexPage(html,'https://yandex.ru/maps/org/test/12345678901/');
 assert.equal(result.company.name,'Тестовая кофейня');
 assert.equal(result.company.reviewCount,77);
 assert.equal(result.reviews.length,2);
 assert.equal(result.reviews[0].name,'Анна');
});
