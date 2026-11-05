const dictionaries={
 positive:['отличн','вкусн','уютн','прекрасн','хорош','быстр','вежлив','приятн','свеж','лучший','понрав','доброжел','верн','адекватн','красив','удобн','чист','качествен','рекоменд','профессион','оперативн','надежн'],
 negative:['плох','долго','холодн','дорог','невкусн','разочар','час','маленьк','тесно','груб','гряз','ужас','медлен','ждать','ждали','неудобн','сломал','обман','ошиб','хам','задерж','очеред','шумн'],
 categories:{
  'Сервис':['официант','персонал','сервис','обслуж','бариста','сотрудник','ждать','ждали','быстр','вежлив','груб'],
  'Качество':['еда','блюд','вкус','паста','кофе','десерт','суп','порци','завтрак','свеж','холодн','качеств','товар','работ','результат'],
  'Цена':['цен','дорог','стоимост','дёшев','дешев'],
  'Комфорт':['атмосфер','интерьер','уют','музык','зал','чист','тесно','красив','комфорт','шум'],
  'Удобство':['удоб','располож','парков','сайт','запис','достав','приложен','очеред'],
  'Надёжность':['надеж','гарант','срок','обещ','вовремя','задерж','сломал','возврат'],
  'Общее впечатление':['впечатлен','рекоменд','вернусь','понрав','разочар','любим','лучший','ужас']
 }
};

let reviews=[];
let analysis=[];
let company=null;

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

function setData(data,label='загруженный файл',companyData=null){
 company=companyData;
 reviews=data.filter(r=>r.text&&String(r.text).trim()).map((r,i)=>({name:r.name||`Гость ${i+1}`,date:r.date||'—',rating:Math.max(0,Math.min(5,Math.round(Number(r.rating)||0))),text:String(r.text).trim(),reply:r.reply||''}));
 if(!reviews.length)throw new Error('В файле нет непустых отзывов');
 analysis=reviews.map(classify);
 $('#emptyDashboard').hidden=true;
 $('#emptyBenefits').hidden=true;
 $('#formatGuide').hidden=true;
 $('#dataDashboard').hidden=false;
 $('#analysisStatus').classList.remove('pending');
 $('#analysisStatus').lastChild.textContent=' Анализ завершён';
 renderCompany();
 renderAll(label);
}

function renderCompany(){
 const banner=$('#companyBanner');
 if(!company){banner.hidden=true;return}
 banner.hidden=false;
 $('#companyName').textContent=company.name||'Компания в Яндекс Картах';
 $('#companyAddress').textContent=company.address||'Адрес не указан';
 $('#companyRating').textContent=company.rating?formatNumber(company.rating):'—';
 $('#companySourceCount').textContent=company.reviewCount||reviews.length;
 $('#companyLink').href=company.url||'#';
}

function renderEmptyState(){
 reviews=[];analysis=[];
 company=null;
 localStorage.removeItem('aci-last-data');
 $('#emptyDashboard').hidden=false;
 $('#emptyBenefits').hidden=false;
 $('#formatGuide').hidden=false;
 $('#dataDashboard').hidden=true;
 $('#companyBanner').hidden=true;
 $('#reviewCountBadge').textContent='0';
 $('#analysisStatus').classList.add('pending');
 $('#analysisStatus').lastChild.textContent=' Ожидаем данные';
 $('#reviewList').innerHTML='<div class="empty">Сначала загрузите CSV с отзывами на странице «Обзор».</div>';
 $('#recommendations').innerHTML='<div class="empty">Рекомендации появятся после загрузки и анализа отзывов.</div>';
 $('#categoryScorecards').innerHTML='';$('#evidenceGrid').innerHTML='';$('#actionPlan').innerHTML='';
 $('#healthScore').textContent='0';
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

function categoryStats(){return Object.keys(dictionaries.categories).map(name=>{const items=analysis.filter(r=>r.categories.includes(name));const negative=items.filter(r=>r.sentiment==='negative').length;const positive=items.filter(r=>r.sentiment==='positive').length;const neutral=items.length-negative-positive;const score=items.length?Math.round((positive+neutral*.5)/items.length*100):0;return{name,count:items.length,items,negative,positive,neutral,score,rate:items.length?Math.round(negative/items.length*100):0,positiveRate:items.length?Math.round(positive/items.length*100):0}}).sort((a,b)=>b.count-a.count)}
function renderCategories(){const max=Math.max(1,...categoryStats().map(x=>x.count));$('#categoryBars').innerHTML=categoryStats().map(x=>`<div class="bar-row"><div class="bar-label"><span>${x.name}</span><b>${x.count} · ${x.rate}% негатив</b></div><div class="track"><i style="width:${Math.round(x.count/max*100)}%"></i></div></div>`).join('')}

function parseDate(raw){const p=String(raw).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!p)return null;const y=p[3].length===2?'20'+p[3]:p[3];return new Date(+y,+p[2]-1,+p[1])}
function renderTimeline(){const groups={};analysis.forEach(r=>{const d=parseDate(r.date);const key=d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'Без даты';groups[key]??=[];groups[key].push(r)});let entries=Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).slice(-6);if(!entries.length)entries=[['Данные',analysis]];const monthNames=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];$('#lineChart').innerHTML=`<div class="chart-columns">${entries.map(([key,items])=>{const value=items.length?Math.round(items.filter(x=>x.sentiment==='positive').length/items.length*100):0;let label=key==='Без даты'?key:key.includes('-')?monthNames[+key.slice(5)-1]:key;return `<div class="chart-column" title="${value}% позитивных"><i style="height:${value}%"></i><b>${label}</b></div>`}).join('')}</div>`}

function renderComplaints(){const bad=analysis.filter(r=>r.sentiment==='negative').sort((a,b)=>a.rating-b.rating).slice(0,4);$('#complaintsBody').innerHTML=bad.length?bad.map(r=>`<tr><td class="review-cell"><b>${escapeHtml(r.text)}</b><span>${escapeHtml(r.name)} · ${escapeHtml(r.date)}</span></td><td><span class="tag">${escapeHtml(r.categories[0])}</span></td><td><span class="stars">${'★'.repeat(Math.max(0,r.rating))}${'☆'.repeat(Math.max(0,5-r.rating))}</span></td><td><span class="sentiment-tag negative">Негатив</span></td></tr>`).join(''):`<tr><td colspan="4" class="empty">Негативных отзывов не найдено</td></tr>`}

function renderReviews(){const q=($('#reviewSearch')?.value||'').toLowerCase();const filter=$('#sentimentFilter')?.value||'all';const list=analysis.filter(r=>(filter==='all'||r.sentiment===filter)&&(`${r.name} ${r.text}`.toLowerCase().includes(q)));$('#reviewList').innerHTML=list.length?list.map(r=>`<article class="review-card"><div><div class="review-meta"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.date)}</span><span class="sentiment-tag ${r.sentiment}">${{positive:'Позитив',neutral:'Нейтрально',negative:'Негатив'}[r.sentiment]}</span></div><p class="review-text">${escapeHtml(r.text)}</p><div class="review-tags">${r.categories.map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div></div><div class="stars">${r.rating?'★'.repeat(r.rating)+'☆'.repeat(Math.max(0,5-r.rating)):'без оценки'}</div></article>`).join(''):`<div class="empty">По выбранным условиям ничего не найдено</div>`}

function renderInsight(){const stats=categoryStats();const best=[...stats].sort((a,b)=>(b.count-b.negative)-(a.count-a.negative))[0];const worst=[...stats].sort((a,b)=>b.negative-a.negative)[0];if(!analysis.length)return;$('#mainInsightTitle').textContent=best&&best.count?`Сильная сторона — ${best.name.toLowerCase()}`:'Недостаточно данных для вывода';$('#mainInsightText').textContent=worst&&worst.negative?`При этом в категории «${worst.name}» найдено ${worst.negative} негативных ${plural(worst.negative,'сигнал','сигнала','сигналов')}. Начните улучшения с неё.`:'Критичных повторяющихся жалоб в выборке не обнаружено.'}

function situationalAdvice(stat){
 const text=stat.items.filter(x=>x.sentiment==='negative').map(x=>x.text.toLowerCase().replace(/ё/g,'е')).join(' ');
 const has=(...words)=>words.some(word=>text.includes(word));
 if(stat.name==='Сервис'){
  if(has('ждать','ждали','долго','очеред'))return 'Главная жалоба связана с ожиданием. Замерьте время обслуживания в часы пик и перераспределите нагрузку команды.';
  if(has('груб','хам','невежлив','отношен'))return 'В отзывах критикуют общение сотрудников. Разберите конкретные ситуации с командой и закрепите стандарт спокойного ответа клиенту.';
 }
 if(stat.name==='Качество'){
  if(has('холодн','сыр','несвеж','невкус'))return 'Клиенты указывают на качество самого продукта. Проверьте приготовление, хранение и контроль перед выдачей.';
  if(has('сломал','брак','дефект'))return 'Есть сигналы о дефектах. Усильте проверку результата перед передачей клиенту и упростите замену.';
 }
 if(stat.name==='Цена')return 'Негатив связан с восприятием стоимости. Покажите состав предложения, результат и выгоду до оплаты, чтобы цена не становилась неожиданностью.';
 if(stat.name==='Комфорт'){
  if(has('гряз','чист'))return 'В отзывах затронута чистота. Добавьте проверку зала и санузлов по расписанию с отметкой ответственного.';
  if(has('шум','громк','музык'))return 'Клиенты упоминают шум. Проверьте громкость музыки и самые шумные зоны в часы пик.';
  if(has('тесно','холодн','жарк'))return 'Жалобы связаны с физическим комфортом. Проверьте посадку и температуру именно в периоды, указанные гостями.';
 }
 if(stat.name==='Удобство'){
  if(has('парков'))return 'Клиентам сложно с парковкой. Добавьте на сайт и в карточку понятную схему подъезда и ближайшие альтернативы.';
  if(has('достав','запис','сайт','прилож'))return 'Есть затруднения на пути к услуге. Пройдите сценарий клиента от записи до получения результата и уберите лишний шаг.';
 }
 if(stat.name==='Надёжность')return 'Отзывы указывают на несоблюдение срока или обещания. Фиксируйте срок письменно и предупреждайте клиента о риске задержки заранее.';
 if(stat.name==='Общее впечатление')return 'Разберите негативные отзывы целиком: в них нет одной узкой причины. Свяжитесь с клиентами и уточните момент, который сильнее всего повлиял на итоговую оценку.';
 return 'Разберите конкретные негативные отзывы с ответственным сотрудником и проверьте результат после изменения процесса.';
}

function renderRecommendations(){
 const stats=categoryStats().filter(x=>x.count);
 const strengthCopy={'Сервис':'Закрепите удачные сценарии общения и используйте их при обучении команды.','Качество':'Зафиксируйте стандарты продукта и регулярно проверяйте стабильность результата.','Цена':'Сохраняйте прозрачность цен и подчёркивайте ценность предложения.','Комфорт':'Сохраните удачные решения по чистоте, атмосфере и удобству пространства.','Удобство':'Продолжайте упрощать путь клиента — от поиска компании до получения услуги.','Надёжность':'Используйте соблюдение обещаний и сроков как аргумент в коммуникации.','Общее впечатление':'Просите довольных клиентов делиться опытом и возвращаться снова.'};
 const growthCopy=Object.fromEntries(stats.map(x=>[x.name,situationalAdvice(x)]));
 const strengths=stats.filter(x=>x.positive>0).sort((a,b)=>b.score-a.score||b.count-a.count).slice(0,4);
 const weaknesses=stats.filter(x=>x.negative>0).sort((a,b)=>b.negative-a.negative||b.rate-a.rate).slice(0,4);
 const negativeTotal=analysis.filter(x=>x.sentiment==='negative').length;
 const rated=analysis.filter(x=>x.rating>0);
 const averageRating=rated.length?rated.reduce((sum,x)=>sum+x.rating,0)/rated.length:0;
 const excellent=negativeTotal===0&&averageRating>=4.8;
 const strengthCards=strengths.map(x=>`<article class="rec-card strength-card"><span>${x.positiveRate}% позитивных</span><h3>${x.name}</h3><p>${strengthCopy[x.name]} Основание: ${x.positive} ${plural(x.positive,'положительный отзыв','положительных отзыва','положительных отзывов')} из ${x.count}.</p></article>`).join('');
 const weaknessCards=weaknesses.map((x,i)=>`<article class="rec-card growth-card">${i===0?'<span class="priority">приоритет</span>':''}<span>${x.rate}% негативных</span><h3>${x.name}</h3><p>${growthCopy[x.name]} Основание: ${x.negative} ${plural(x.negative,'негативный сигнал','негативных сигнала','негативных сигналов')} из ${x.count}.</p></article>`).join('');
 const clearTitle=excellent?'У вас всё хорошо — проблем не найдено':'Критичных проблем не обнаружено';
 const clearText=excellent?`Средняя оценка — ${formatNumber(averageRating)} из 5, негативных сигналов нет. Не нужно придумывать срочные исправления: сохраняйте текущие стандарты и следите, чтобы качество оставалось стабильным.`:`В загруженной выборке нет негативных сигналов. Сохраняйте сильные стороны и продолжайте собирать отзывы — при появлении повторяющейся жалобы система покажет её здесь.`;
 const growthContent=weaknesses.length?weaknessCards:`<article class="rec-card clear-card"><span>0 проблемных сигналов</span><h3>${clearTitle}</h3><p>${clearText}${analysis.length<10?' Выборка пока небольшая, поэтому вывод стоит перепроверить после появления новых отзывов.':''}</p></article>`;
 const growthHead=weaknesses.length?'<p class="eyebrow">Зоны роста</p><h2>Что стоит улучшить</h2>':'<p class="eyebrow">Текущая ситуация</p><h2>Нужно ли что-то исправлять</h2>';
 $('#recommendations').innerHTML=`<section class="rec-group strengths"><div class="rec-group-head"><i>+</i><div><p class="eyebrow">Сильные стороны</p><h2>Что особенно ценят гости</h2></div></div><div class="rec-stack">${strengthCards||'<article class="rec-card clear-card"><h3>Пока недостаточно позитивных сигналов</h3><p>Добавьте больше отзывов, чтобы надёжно определить сильные стороны.</p></article>'}</div></section><section class="rec-group ${weaknesses.length?'weaknesses':'clear-results'}"><div class="rec-group-head"><i>${weaknesses.length?'!':'✓'}</i><div>${growthHead}</div></div><div class="rec-stack">${growthContent}</div></section>`;
 renderDetailedInsights(stats,strengthCopy,growthCopy,weaknesses,excellent,averageRating);
}

function shortQuote(text,max=180){const value=String(text||'').trim();return value.length>max?value.slice(0,max).trim()+'…':value}

function renderDetailedInsights(stats,strengthCopy,growthCopy,weaknesses,excellent,averageRating){
 $('#categoryScorecards').innerHTML=Object.keys(dictionaries.categories).map(name=>{
  const item=stats.find(x=>x.name===name)||{name,count:0,positive:0,negative:0,score:0};
  return `<article class="score-card ${item.score<45&&item.count?'critical':''}"><header><h3>${item.name}</h3><strong>${item.count?item.score+'%':'—'}</strong></header><div class="mini-track"><i style="width:${item.score}%"></i></div><p>${item.count?`${item.count} упоминаний · ${item.positive} позитивных · ${item.negative} негативных`:'В текущей выборке аспект почти не упоминается'}</p></article>`
 }).join('');
 const positive=[...analysis].filter(x=>x.sentiment==='positive').sort((a,b)=>b.score-a.score).slice(0,3);
 const negative=[...analysis].filter(x=>x.sentiment==='negative').sort((a,b)=>a.score-b.score||a.rating-b.rating).slice(0,3);
 const quotes=(items,empty)=>items.length?items.map(r=>`<blockquote class="evidence-quote">«${escapeHtml(shortQuote(r.text))}»<b>${escapeHtml(r.name)} · ${r.rating?`${r.rating}/5`:'без оценки'} · ${escapeHtml(r.categories[0])}</b></blockquote>`).join(''):`<p class="evidence-quote">${empty}</p>`;
 const negativeEvidence=negative.length?quotes(negative,''):`<div class="all-clear"><b>✓ Всё спокойно</b><p>${excellent?`При средней оценке ${formatNumber(averageRating)} из 5 в выборке нет отзывов, требующих исправлений.`:'В загруженных отзывах не найдено проблемных сигналов.'}</p></div>`;
 $('#evidenceGrid').innerHTML=`<article class="evidence-column positive"><h3>Что подтверждает сильные стороны</h3>${quotes(positive,'Явных положительных цитат в выборке не найдено.')}</article><article class="evidence-column ${negative.length?'negative':'clear'}"><h3>${negative.length?'Что требует внимания':'Проблемные сигналы'}</h3>${negativeEvidence}</article>`;
 const steps=weaknesses.length?weaknesses.slice(0,3).map((x,i)=>({
  title:i===0?`Сначала: ${x.name}`:i===1?`Затем: ${x.name}`:`Закрепить: ${x.name}`,
  text:i===0?`${growthCopy[x.name]} Срок — первая неделя.`:i===1?`${growthCopy[x.name]} Срок — до 14 дней.`:`${growthCopy[x.name]} Контрольная точка — через 30 дней.`
 })):[
  {title:'Сохранить текущие стандарты',text:'Не меняйте процессы только ради изменений: клиенты уже оценивают опыт положительно.'},
  {title:'Поддерживать обратную связь',text:'Отвечайте на новые отзывы и отмечайте даже единичные замечания, если они появятся.'},
  {title:'Проверить динамику через месяц',text:'Загрузите свежие отзывы и убедитесь, что высокая оценка и отсутствие жалоб сохраняются.'}
 ];
 $('#actionPlan').innerHTML=steps.map((x,i)=>`<article class="action-step"><span>${i+1}</span><h3>${x.title}</h3><p>${x.text}</p></article>`).join('');
}

function parseCSV(text){
 const clean=text.replace(/^\uFEFF/,'');const first=(clean.split(/\r?\n/).find(Boolean)||'');const delimiter=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';const rows=[];let row=[],cell='',quote=false;
 for(let i=0;i<clean.length;i++){const ch=clean[i];if(ch==='"'){if(quote&&clean[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(ch===delimiter&&!quote){row.push(cell.trim());cell=''}else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&clean[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=ch}row.push(cell.trim());if(row.some(Boolean))rows.push(row);if(rows.length<2)throw new Error('В CSV нет строк с отзывами');
 const headers=rows.shift().map(h=>h.toLowerCase().replace(/ё/g,'е').trim());const find=names=>headers.findIndex(h=>names.some(n=>h.includes(n)));const idx={name:find(['имя','автор','name','author']),date:find(['дата','date']),rating:find(['оцен','рейтинг','rating','stars']),text:find(['отзыв','текст','review','comment','text'])};if(idx.text<0)throw new Error('Не найдена колонка «Отзыв» или «Текст»');return rows.map(r=>({name:idx.name>=0?r[idx.name]:'Аноним',date:idx.date>=0?r[idx.date]:'—',rating:idx.rating>=0?parseFloat(String(r[idx.rating]).replace(',','.'))||0:0,text:r[idx.text]})).filter(r=>r.text)}

function handleFile(file){if(!file)return;if(!file.name.toLowerCase().endsWith('.csv'))return showToast('Нужен файл в формате CSV');if(file.size>5*1024*1024)return showToast('Файл больше 5 МБ');const reader=new FileReader();reader.onload=()=>{try{const data=parseCSV(reader.result);setData(data,file.name);$('#fileFeedback').textContent=`✓ ${file.name}: проанализировано ${data.length} ${plural(data.length,'отзыв','отзыва','отзывов')}`;showToast('Анализ завершён')}catch(e){showToast(e.message);$('#fileFeedback').textContent='Не удалось прочитать файл. Проверьте заголовки колонок.'}};reader.readAsText(file,'UTF-8')}

async function importYandex(event){
 event.preventDefault();
 const url=$('#yandexUrl').value.trim();const button=$('#yandexBtn');const feedback=$('#importFeedback');
 if(!url)return;
 button.classList.add('loading');button.disabled=true;button.firstChild.textContent='Загружаем';feedback.className='import-feedback';feedback.textContent='Получаем публичные отзывы и данные компании…';
 try{
  const response=await fetch('/api/import/yandex',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||'Не удалось загрузить отзывы по этой ссылке');
  setData(payload.reviews,`Яндекс Карты · ${payload.reviews.length} отзывов`,payload.company);
  feedback.className='import-feedback success';feedback.textContent=`Готово: загружено и проанализировано ${payload.reviews.length} ${plural(payload.reviews.length,'отзыв','отзыва','отзывов')}`;
  showToast('Анализ компании готов');
 }catch(error){feedback.className='import-feedback error';feedback.textContent=error.message;showToast('Импорт не выполнен')}
 finally{button.classList.remove('loading');button.disabled=false;button.textContent='Проанализировать'}
}

function switchView(name){$$('.view').forEach(v=>v.classList.remove('active'));$$('.nav-item').forEach(v=>v.classList.toggle('active',v.dataset.view===name));$(`#${name}View`).classList.add('active');$('#pageTitle').textContent={dashboard:'Обзор отзывов',reviews:'Все отзывы',insights:'Рекомендации',about:'О проекте'}[name];$('.sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'})}
let toastTimer;function showToast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600)}

$$('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));$('#mobileMenu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));$('#uploadBtn').addEventListener('click',()=>$('#fileInput').click());$('#emptyUploadBtn').addEventListener('click',()=>$('#fileInput').click());$('#fileInput').addEventListener('change',e=>handleFile(e.target.files[0]));$('#reviewSearch').addEventListener('input',renderReviews);$('#sentimentFilter').addEventListener('change',renderReviews);$('#yandexForm').addEventListener('submit',importYandex);
const dz=$('#dropZone');['dragenter','dragover'].forEach(e=>dz.addEventListener(e,x=>{x.preventDefault();dz.classList.add('dragging')}));['dragleave','drop'].forEach(e=>dz.addEventListener(e,x=>{x.preventDefault();dz.classList.remove('dragging')}));dz.addEventListener('drop',e=>handleFile(e.dataTransfer.files[0]));
renderEmptyState();
