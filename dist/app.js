const demoReviews=[
{name:'Анна',date:'02.11.2026',rating:5,text:'Очень уютная атмосфера, вкусная паста и внимательный официант. Обязательно вернёмся!'},
{name:'Михаил',date:'29.10.2026',rating:2,text:'Ждали заказ почти час. Официант не подходил, сервис разочаровал.'},
{name:'Елена',date:'25.10.2026',rating:5,text:'Прекрасное место, еда свежая и очень вкусная. Цены адекватные.'},
{name:'Игорь',date:'19.10.2026',rating:3,text:'В целом нормально, но порции маленькие за такую цену.'},
{name:'София',date:'12.10.2026',rating:5,text:'Красивый интерьер, чисто и спокойно. Персонал вежливый.'},
{name:'Алексей',date:'03.10.2026',rating:1,text:'Блюдо принесли холодным, пришлось долго ждать замену. Плохо.'},
{name:'Мария',date:'23.09.2026',rating:4,text:'Хорошее кафе рядом с домом. Десерты вкусные, обслуживание быстрое.'},
{name:'Роман',date:'12.09.2026',rating:5,text:'Лучший кофе в районе, бариста дружелюбный, цена приятная.'},
{name:'Дарья',date:'30.08.2026',rating:4,text:'Стильный интерьер и приятная музыка. Немного тесно вечером.'},
{name:'Павел',date:'14.08.2026',rating:2,text:'Слишком дорого для такого качества. Суп был невкусный.'},
{name:'Ольга',date:'02.08.2026',rating:5,text:'Отличный завтрак, быстро приготовили, всё понравилось.'},
{name:'Кирилл',date:'18.07.2026',rating:4,text:'Доброжелательные сотрудники и уютный зал. Вернусь ещё.'}
];

const dictionaries={
 positive:['отличн','вкусн','уютн','прекрасн','хорош','быстр','вежлив','приятн','свеж','лучший','понрав','доброжел','верн','адекватн','красив'],
 negative:['плох','долго','холодн','дорог','невкусн','разочар','час','маленьк','тесно','груб','гряз','ужас','медлен','ждать','ждали'],
 categories:{
  'Сервис':['официант','персонал','сервис','обслуж','бариста','сотрудник','ждать','ждали','быстр','вежлив','груб'],
  'Качество еды':['еда','блюд','вкус','паста','кофе','десерт','суп','порци','завтрак','свеж','холодн'],
  'Цена':['цен','дорог','стоимост','дёшев','дешев'],
  'Атмосфера':['атмосфер','интерьер','уют','музык','зал','чист','тесно','красив']
 }
};

let reviews=[];
let analysis=[];

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const plural=(n,one,few,many)=>{const m=n%100;if(m>=11&&m<=19)return many;const d=n%10;return d===1?one:d>=2&&d<=4?few:many};
const formatNumber=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n);

function classify(review){
 const text=review.text.toLowerCase().replace(/ё/g,'е');
 let score=0;
 dictionaries.positive.forEach(w=>{if(text.includes(w))score++});
 dictionaries.negative.forEach(w=>{if(text.includes(w))score--});
 if(review.rating>=4)score+=1;if(review.rating<=2)score-=1;
 const sentiment=score>0?'positive':score<0?'negative':'neutral';
 const categories=Object.entries(dictionaries.categories).filter(([,words])=>words.some(w=>text.includes(w))).map(([name])=>name);
 return {...review,sentiment,categories:categories.length?categories:['Сервис'],score};
}

function setData(data,label='загруженный файл'){
 reviews=data.filter(r=>r.text&&String(r.text).trim()).map((r,i)=>({name:r.name||`Гость ${i+1}`,date:r.date||'—',rating:Number(r.rating)||0,text:String(r.text).trim()}));
 analysis=reviews.map(classify);
 localStorage.setItem('aci-last-data',JSON.stringify(reviews.slice(0,1000)));
 renderAll(label);
}

function renderAll(label){
 const total=analysis.length;const positive=analysis.filter(r=>r.sentiment==='positive');const neutral=analysis.filter(r=>r.sentiment==='neutral');const negative=analysis.filter(r=>r.sentiment==='negative');
 const rated=analysis.filter(r=>r.rating>0);const avg=rated.length?rated.reduce((a,r)=>a+r.rating,0)/rated.length:0;
 const pct=n=>total?Math.round(n/total*100):0;
 $('#totalReviews').textContent=total;$('#periodLabel').textContent=label;$('#avgRating').textContent=avg?formatNumber(avg):'—';
 $('#ratingDelta').textContent=avg>=4?'выше 4 из 5':avg>=3?'стабильная оценка':'нужно улучшение';
 $('#positiveShare').textContent=pct(positive.length)+'%';$('#positiveCount').textContent=`${positive.length} ${plural(positive.length,'отзыв','отзыва','отзывов')}`;
 $('#negativeCount').textContent=negative.length;$('#negativeShare').textContent=pct(negative.length)+'% выборки';$('#reviewCountBadge').textContent=total;
 const p=pct(positive.length),n=pct(neutral.length);const donut=$('#sentimentDonut');donut.style.setProperty('--p',p);donut.style.setProperty('--n',n);$('#donutScore').textContent=p+'%';
 $('#sentimentLegend').innerHTML=[['positive','Позитивные',positive.length,'#14968f'],['neutral','Нейтральные',neutral.length,'#e8af52'],['negative','Негативные',negative.length,'#ee745e']].map(x=>`<div class="legend-row"><i style="background:${x[3]}"></i><span>${x[1]}</span><b>${pct(x[2])}%</b></div>`).join('');
 renderCategories();renderTimeline();renderComplaints();renderReviews();renderRecommendations();renderInsight();
 $('#healthScore').textContent=Math.round(Math.max(0,Math.min(100,p*.7+(avg/5*100)*.3)));
}

function categoryStats(){return Object.keys(dictionaries.categories).map(name=>{const items=analysis.filter(r=>r.categories.includes(name));const neg=items.filter(r=>r.sentiment==='negative').length;return{name,count:items.length,negative:neg,rate:items.length?Math.round(neg/items.length*100):0}}).sort((a,b)=>b.count-a.count)}
function renderCategories(){const max=Math.max(1,...categoryStats().map(x=>x.count));$('#categoryBars').innerHTML=categoryStats().map(x=>`<div class="bar-row"><div class="bar-label"><span>${x.name}</span><b>${x.count} · ${x.rate}% негатив</b></div><div class="track"><i style="width:${Math.round(x.count/max*100)}%"></i></div></div>`).join('')}

function parseDate(raw){const p=String(raw).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!p)return null;const y=p[3].length===2?'20'+p[3]:p[3];return new Date(+y,+p[2]-1,+p[1])}
function renderTimeline(){const groups={};analysis.forEach(r=>{const d=parseDate(r.date);const key=d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'Без даты';groups[key]??=[];groups[key].push(r)});let entries=Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).slice(-6);if(!entries.length)entries=[['Данные',analysis]];const monthNames=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];$('#lineChart').innerHTML=`<div class="chart-columns">${entries.map(([key,items])=>{const value=items.length?Math.round(items.filter(x=>x.sentiment==='positive').length/items.length*100):0;let label=key==='Без даты'?key:key.includes('-')?monthNames[+key.slice(5)-1]:key;return `<div class="chart-column" title="${value}% позитивных"><i style="height:${value}%"></i><b>${label}</b></div>`}).join('')}</div>`}

function renderComplaints(){const bad=analysis.filter(r=>r.sentiment==='negative').sort((a,b)=>a.rating-b.rating).slice(0,4);$('#complaintsBody').innerHTML=bad.length?bad.map(r=>`<tr><td class="review-cell"><b>${escapeHtml(r.text)}</b><span>${escapeHtml(r.name)} · ${escapeHtml(r.date)}</span></td><td><span class="tag">${escapeHtml(r.categories[0])}</span></td><td><span class="stars">${'★'.repeat(Math.max(0,r.rating))}${'☆'.repeat(Math.max(0,5-r.rating))}</span></td><td><span class="sentiment-tag negative">Негатив</span></td></tr>`).join(''):`<tr><td colspan="4" class="empty">Негативных отзывов не найдено</td></tr>`}

function renderReviews(){const q=($('#reviewSearch')?.value||'').toLowerCase();const filter=$('#sentimentFilter')?.value||'all';const list=analysis.filter(r=>(filter==='all'||r.sentiment===filter)&&(`${r.name} ${r.text}`.toLowerCase().includes(q)));$('#reviewList').innerHTML=list.length?list.map(r=>`<article class="review-card"><div><div class="review-meta"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.date)}</span><span class="sentiment-tag ${r.sentiment}">${{positive:'Позитив',neutral:'Нейтрально',negative:'Негатив'}[r.sentiment]}</span></div><p class="review-text">${escapeHtml(r.text)}</p><div class="review-tags">${r.categories.map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div></div><div class="stars">${r.rating?'★'.repeat(r.rating)+'☆'.repeat(Math.max(0,5-r.rating)):'без оценки'}</div></article>`).join(''):`<div class="empty">По выбранным условиям ничего не найдено</div>`}

function renderInsight(){const stats=categoryStats();const best=[...stats].sort((a,b)=>(b.count-b.negative)-(a.count-a.negative))[0];const worst=[...stats].sort((a,b)=>b.negative-a.negative)[0];if(!analysis.length)return;$('#mainInsightTitle').textContent=best&&best.count?`Сильная сторона — ${best.name.toLowerCase()}`:'Недостаточно данных для вывода';$('#mainInsightText').textContent=worst&&worst.negative?`При этом в категории «${worst.name}» найдено ${worst.negative} негативных ${plural(worst.negative,'сигнал','сигнала','сигналов')}. Начните улучшения с неё.`:'Критичных повторяющихся жалоб в выборке не обнаружено.'}

function renderRecommendations(){const stats=categoryStats().sort((a,b)=>b.negative-a.negative);const copy={'Сервис':'Проверьте время ожидания и сценарии общения сотрудников. Введите короткий чек-лист смены.','Качество еды':'Разберите блюда, которые получают низкие оценки, и проверьте стабильность подачи.','Цена':'Сделайте ценность предложения понятнее: состав, размер порции и выгоду комплектов.','Атмосфера':'Проверьте чистоту, музыку, свет и плотность посадки в часы пик.'};$('#recommendations').innerHTML=stats.slice(0,3).map((x,i)=>`<article class="rec-card"><span>Шаг ${i+1}</span>${i===0&&x.negative?'<span class="priority">приоритет</span>':''}<h3>${x.negative?`Улучшить: ${x.name}`:`Поддерживать: ${x.name}`}</h3><p>${copy[x.name]} Основание: ${x.count} упоминаний, ${x.negative} негативных.</p></article>`).join('')}

function parseCSV(text){
 const clean=text.replace(/^\uFEFF/,'');const first=(clean.split(/\r?\n/).find(Boolean)||'');const delimiter=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';const rows=[];let row=[],cell='',quote=false;
 for(let i=0;i<clean.length;i++){const ch=clean[i];if(ch==='"'){if(quote&&clean[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(ch===delimiter&&!quote){row.push(cell.trim());cell=''}else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&clean[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=ch}row.push(cell.trim());if(row.some(Boolean))rows.push(row);if(rows.length<2)throw new Error('В CSV нет строк с отзывами');
 const headers=rows.shift().map(h=>h.toLowerCase().replace(/ё/g,'е').trim());const find=names=>headers.findIndex(h=>names.some(n=>h.includes(n)));const idx={name:find(['имя','автор','name','author']),date:find(['дата','date']),rating:find(['оцен','рейтинг','rating','stars']),text:find(['отзыв','текст','review','comment','text'])};if(idx.text<0)throw new Error('Не найдена колонка «Отзыв» или «Текст»');return rows.map(r=>({name:idx.name>=0?r[idx.name]:'Аноним',date:idx.date>=0?r[idx.date]:'—',rating:idx.rating>=0?parseFloat(String(r[idx.rating]).replace(',','.'))||0:0,text:r[idx.text]})).filter(r=>r.text)}

function handleFile(file){if(!file)return;if(!file.name.toLowerCase().endsWith('.csv'))return showToast('Нужен файл в формате CSV');if(file.size>5*1024*1024)return showToast('Файл больше 5 МБ');const reader=new FileReader();reader.onload=()=>{try{const data=parseCSV(reader.result);setData(data,file.name);$('#fileFeedback').textContent=`✓ ${file.name}: проанализировано ${data.length} ${plural(data.length,'отзыв','отзыва','отзывов')}`;showToast('Анализ завершён')}catch(e){showToast(e.message);$('#fileFeedback').textContent='Не удалось прочитать файл. Проверьте заголовки колонок.'}};reader.readAsText(file,'UTF-8')}

function exportCSV(){if(!analysis.length)return showToast('Нет данных для экспорта');const head=['Имя','Дата','Оценка','Отзыв','Тональность','Категории'];const lines=analysis.map(r=>[r.name,r.date,r.rating,r.text,{positive:'позитив',neutral:'нейтрально',negative:'негатив'}[r.sentiment],r.categories.join(', ')].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';'));const blob=new Blob(['\uFEFF'+head.join(';')+'\n'+lines.join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ai-customer-insight_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);showToast('Отчёт скачан')}

function switchView(name){$$('.view').forEach(v=>v.classList.remove('active'));$$('.nav-item').forEach(v=>v.classList.toggle('active',v.dataset.view===name));$(`#${name}View`).classList.add('active');$('#pageTitle').textContent={dashboard:'Обзор отзывов',reviews:'Все отзывы',insights:'Рекомендации',about:'О проекте'}[name];$('.sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'})}
let toastTimer;function showToast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600)}

$$('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));$('#mobileMenu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));$('#uploadBtn').addEventListener('click',()=>$('#fileInput').click());$('#fileInput').addEventListener('change',e=>handleFile(e.target.files[0]));$('#demoBtn').addEventListener('click',()=>{setData(demoReviews,'демонстрационный набор');$('#fileFeedback').textContent='Демо-данные восстановлены';showToast('Демо-данные восстановлены')});$('#exportBtn').addEventListener('click',exportCSV);$('#reviewSearch').addEventListener('input',renderReviews);$('#sentimentFilter').addEventListener('change',renderReviews);
const dz=$('#dropZone');['dragenter','dragover'].forEach(e=>dz.addEventListener(e,x=>{x.preventDefault();dz.classList.add('dragging')}));['dragleave','drop'].forEach(e=>dz.addEventListener(e,x=>{x.preventDefault();dz.classList.remove('dragging')}));dz.addEventListener('drop',e=>handleFile(e.dataTransfer.files[0]));
try{const saved=JSON.parse(localStorage.getItem('aci-last-data'));setData(Array.isArray(saved)&&saved.length?saved:demoReviews,Array.isArray(saved)&&saved.length?'последняя сохранённая выборка':'демонстрационный набор')}catch{setData(demoReviews,'демонстрационный набор')}
