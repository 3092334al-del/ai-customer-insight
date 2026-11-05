import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.join(root,'dist');
const allowedHosts=new Set(['yandex.ru','www.yandex.ru','yandex.com','www.yandex.com','yandex.kz','www.yandex.kz','yandex.by','www.yandex.by','yandex.com.tr','www.yandex.com.tr','yandex.com.ge','www.yandex.com.ge','yandex.uz','www.yandex.uz','yandex.eu','www.yandex.eu','yandex.com.am','www.yandex.com.am','yandex.com.az','www.yandex.com.az']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};

function sendJson(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store'});res.end(body)}

export function extractBusinessId(raw){
 const decoded=decodeURIComponent(String(raw||'')).replace(/&amp;/g,'&');
 const patterns=[/\/maps\/org\/(?:[^/?#]+\/)?(\d{6,})/i,/[?&#]oid=(\d{6,})/i,/\"businessId\"\s*:\s*\"?(\d{6,})/i,/\"id\"\s*:\s*\"(\d{6,})\"\s*,\s*\"name\"/i];
 for(const pattern of patterns){const match=decoded.match(pattern);if(match)return match[1]}
 return null;
}

function findReviewContainers(value,found=[]){
 if(!value||typeof value!=='object')return found;
 if(value.reviewResults&&Array.isArray(value.reviewResults.reviews))found.push({business:value,reviews:value.reviewResults.reviews});
 if(Array.isArray(value)){for(const item of value)findReviewContainers(item,found)}else{for(const item of Object.values(value))findReviewContainers(item,found)}
 return found;
}

function cleanText(value){return String(value||'').replace(/\s+/g,' ').trim()}
function readableDate(raw){if(!raw)return '—';const date=new Date(raw);if(Number.isNaN(date.getTime()))return cleanText(raw);return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date)}

export function parseYandexPage(html,canonicalUrl=''){
 const scripts=[...String(html).matchAll(/<script[^>]*type=["']application\/json["'][^>]*class=["'][^"']*state-view[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi)];
 if(!scripts.length)throw new Error('Яндекс не вернул данные карточки. Возможно, страница временно недоступна.');
 let candidates=[];
 for(const match of scripts){try{candidates.push(...findReviewContainers(JSON.parse(match[1])))}catch{}}
 const selected=candidates.sort((a,b)=>b.reviews.length-a.reviews.length)[0];
 if(!selected||!selected.reviews.length)throw new Error('В карточке не нашлось доступных публичных отзывов.');
 const business=selected.business;
 const seen=new Set();
 const reviews=selected.reviews.map(review=>({
  id:review.reviewId||review.id||'',
  name:cleanText(review.author?.name)||'Аноним',
  date:readableDate(review.updatedTime||review.createdTime||review.date),
  rating:Number(review.rating)||0,
  text:cleanText(review.text||review.body),
  reply:cleanText(review.businessComment?.text)
 })).filter(review=>{const key=review.id||`${review.name}:${review.text}`;if(!review.text||seen.has(key))return false;seen.add(key);return true}).slice(0,50);
 if(!reviews.length)throw new Error('В карточке нет отзывов с текстом для анализа.');
 const address=cleanText(business.fullAddress||business.address||business.subtitleItems?.map(x=>x.text).filter(Boolean).join(', '));
 const listedRating=Number(business.rating||business.ratingData?.rating||0);
 const rated=reviews.filter(item=>item.rating>0);
 const rating=listedRating||(rated.length?Number((rated.reduce((sum,item)=>sum+item.rating,0)/rated.length).toFixed(1)):0);
 const reviewCount=Number(business.reviewCount||business.ratingData?.reviewCount||business.reviews||reviews.length);
 return {reviews,company:{name:cleanText(business.name||business.title)||'Компания в Яндекс Картах',address,rating,reviewCount,url:canonicalUrl}};
}

function parseAndValidateUrl(raw){
 let url;try{url=new URL(raw)}catch{throw new Error('Вставьте корректную ссылку на Яндекс Карты.')}
 if(url.protocol!=='https:'&&url.protocol!=='http:')throw new Error('Ссылка должна начинаться с https://');
 if(!allowedHosts.has(url.hostname.toLowerCase()))throw new Error('Поддерживаются только ссылки на карточки Яндекс Карт.');
 return url;
}

async function fetchText(url){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36','accept':'text/html,application/xhtml+xml','accept-language':'ru-RU,ru;q=0.9'}});
  if(!response.ok)throw new Error(`Яндекс вернул ошибку ${response.status}. Попробуйте позже.`);
  const text=await response.text();
  if(text.length>5_000_000)throw new Error('Ответ Яндекса слишком большой для обработки.');
  return {text,url:response.url};
 }catch(error){if(error.name==='AbortError')throw new Error('Яндекс отвечает слишком долго. Попробуйте ещё раз.');throw error}finally{clearTimeout(timer)}
}

export async function importYandexReviews(rawUrl){
 const input=parseAndValidateUrl(rawUrl);
 let id=extractBusinessId(input.href);let resolved=input.href;
 if(!id){const first=await fetchText(input.href);resolved=first.url;parseAndValidateUrl(resolved);id=extractBusinessId(resolved)||extractBusinessId(first.text)}
 if(!id)throw new Error('Не удалось определить компанию. Откройте её карточку в Яндекс Картах и скопируйте ссылку из адресной строки.');
 const canonical=`https://yandex.ru/maps/org/temp/${id}/reviews/?lang=ru_RU`;
 const page=await fetchText(canonical);
 return parseYandexPage(page.text,resolved.includes('/maps/org/')?resolved:canonical);
}

async function readBody(req){
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>32_768)throw new Error('Запрос слишком большой.');chunks.push(chunk)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw new Error('Некорректный запрос.')}
}

async function serveStatic(req,res){
 const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const relative=requestPath==='/'?'index.html':requestPath.replace(/^\/+/, '');
 const file=path.resolve(publicDir,relative);
 if(!file.startsWith(publicDir+path.sep)){sendJson(res,403,{error:'Доступ запрещён'});return}
 try{const info=await stat(file);if(!info.isFile())throw new Error();const body=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','content-length':body.length,'cache-control':path.extname(file)==='.html'?'no-cache':'public, max-age=3600'});res.end(body)}catch{sendJson(res,404,{error:'Страница не найдена'})}
}

export function createServer(){return http.createServer(async(req,res)=>{
 try{
  if(req.method==='GET'&&req.url==='/health'){sendJson(res,200,{ok:true});return}
  if(req.method==='POST'&&req.url==='/api/import/yandex'){const body=await readBody(req);const result=await importYandexReviews(body.url);sendJson(res,200,result);return}
  if(req.method==='GET'||req.method==='HEAD'){await serveStatic(req,res);return}
  sendJson(res,405,{error:'Метод не поддерживается'});
 }catch(error){console.error('[request]',error.message);sendJson(res,400,{error:error.message||'Не удалось обработать запрос'})}
})}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.env.PORT)||3000;createServer().listen(port,'0.0.0.0',()=>console.log(`AI-Customer Insight: http://0.0.0.0:${port}`))}
