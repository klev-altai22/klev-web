/* Public community feedback. Publishing and owner-only deletion are enforced by SQL RPC. */
(()=>{
'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds=['ratings','ideas'];
const votes=n=>n+' '+(n%100>=11&&n%100<=14?'оценок':n%10===1?'оценка':n%10>=2&&n%10<=4?'оценки':'оценок');
const state={ratings:{items:[],seq:0,loaded:false},ideas:{items:[],seq:0,loaded:false}};
let member=null,formKind='ratings',submitting=false;
const stamp=v=>Number.isFinite(Number(v))?new Date(Number(v)*1000).toLocaleDateString('ru',{timeZone:'Asia/Barnaul',day:'numeric',month:'short',year:'numeric'}):'';
function controls(){
 document.querySelectorAll('[data-feedback-open]').forEach(b=>{b.disabled=!!member?.is_banned;b.textContent=b.dataset.feedbackOpen==='ratings'?(state.ratings.my_rating&&member?'Изменить оценку ↗':'Оценить сайт ↗'):'Предложить идею ↗'});
 kinds.forEach(kind=>{if(state[kind].loaded)render(kind)});
}
function setUser(value){
 const next=value?{id:value.id,name:value.name,is_admin:!!value.is_admin,is_banned:!!value.is_banned}:null;
 const changed=JSON.stringify(next)!==JSON.stringify(member);member=next;
 if($('#feedback-dialog').open){$('#feedback-dialog').close();$('#feedback-form').reset()}
 controls();if(changed)kinds.forEach(kind=>load(kind));
}
function render(kind){
 const s=state[kind];
 $('#'+kind+'-list').innerHTML=s.items.length?s.items.map(item=>{
 const stars=Number(item.stars),rating=kind==='ratings'&&Number.isInteger(stars)&&stars>=1&&stars<=5;
 return `<article class="feedback-card"><div class="feedback-card-head"><strong>${esc(item.name)}</strong><time>${esc(stamp(item.updated||item.created))}</time></div>${rating?`<div class="review-stars" aria-label="Оценка ${stars} из 5"><span aria-hidden="true">${'★'.repeat(stars)}${'☆'.repeat(5-stars)}</span> <small>${stars} / 5</small></div>`:''}${item.text?`<p class="feedback-text">${esc(item.text)}</p>`:'<p class="subtle">Без текстового отзыва</p>'}${member?.is_admin?`<button class="text-link danger feedback-delete" data-feedback-delete="${kind}" data-feedback-id="${esc(item.id)}">${kind==='ratings'?'Удалить оценку':'Удалить идею'}</button>`:''}</article>`;
 }).join(''):`<div class="empty"><h3>${kind==='ratings'?'Пока нет опубликованных оценок':'Пока нет опубликованных идей'}</h3><p>${kind==='ratings'?'Поделитесь первым впечатлением о сайте.':'Предложите, чего не хватает сообществу.'}</p></div>`;
 const more=$('[data-feedback-more="'+kind+'"]');more.classList.toggle('hidden',!s.more);
}
async function load(kind,append=false){
 const s=state[kind],seq=++s.seq;
 const status=$('#'+kind+'-status'),more=$('[data-feedback-more="'+kind+'"]');
 more.disabled=true;status.textContent='Загружаем…';
 try{
  const j=await window.KlevAPI('feedback/feed',{kind,before:append?s.before:null});
  if(seq!==s.seq)return;
  if(!j||!Array.isArray(j.items)||!Number.isInteger(j.count)||j.count<0)throw Error('Не удалось прочитать раздел. Попробуйте обновить позже.');
  if(kind==='ratings'&&j.count>0&&(!Number.isFinite(j.average)||j.average<1||j.average>5))throw Error('Источник вернул некорректную среднюю оценку.');
  const batch=j.items.slice(0,20);s.items=append?s.items.concat(batch):batch;s.more=j.items.length>20;s.before=batch.length?String(batch.at(-1).id):null;s.loaded=true;s.my_rating=j.my_rating||null;
  if(kind==='ratings'){
   $('#ratings-summary').innerHTML=j.count&&typeof j.average==='number'?`<strong>${esc(j.average.toFixed(1).replace('.',','))}<small> / 5</small></strong><span class="summary-star" aria-hidden="true">★</span><span>${esc(votes(j.count))} · по опубликованным записям</span>`:'<strong>—<small> / 5</small></strong><span>Оценок ещё нет</span>';
  }
  controls();status.textContent=(member?.is_banned?'Читать можно, но новые публикации недоступны из-за блокировки. ':'')+'Всего '+j.count+'. По 20 записей на странице. Обновляются по кнопке.';
 }catch(e){if(seq!==s.seq)return;status.textContent=(s.loaded?'Не удалось обновить записи: ':'Раздел пока недоступен: ')+e.message;if(!s.loaded){$('#'+kind+'-list').innerHTML='<p class="subtle">Записи не загружены. Это не означает, что их нет. Попробуйте «Обновить» позже.</p>';if(kind==='ratings')$('#ratings-summary').textContent='Нет данных об оценках'}}
 finally{if(seq===s.seq)more.disabled=false}
}
function open(kind){
 if(!member){window.auth('login');window.toast('Войдите в аккаунт, затем вернитесь к оценкам и идеям.');return}
 if(member.is_banned){window.toast('Заблокированные участники не могут публиковать оценки и идеи.');return}
 formKind=kind;const rating=kind==='ratings',f=$('#feedback-form');f.reset();$('#feedback-error').textContent='';
 $('#feedback-title').textContent=rating?'Оценить сайт':'Что можно добавить?';
 $('#feedback-description').textContent=rating?'Одна оценка на аккаунт. Новая заменяет предыдущую. Имя, звёзды и отзыв будут видны всем.':'Ваше имя, предложение и дата будут видны всем, даже без регистрации.';
 $('#feedback-text-label').textContent=rating?'Отзыв (необязательно)':'Ваше предложение';
 $('#rating-options').classList.toggle('hidden',!rating);$('#rating-options').disabled=!rating;
 f.elements.text.required=!rating;f.elements.text.minLength=rating?0:5;
 if(rating&&state.ratings.my_rating){const r=f.querySelector('[name="stars"][value="'+Number(state.ratings.my_rating.stars)+'"]');if(r)r.checked=true;f.elements.text.value=String(state.ratings.my_rating.text||'')}
 f.querySelector('[type="submit"]').disabled=false;$('#feedback-dialog').showModal();
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(kinds.includes(b.dataset.feedbackOpen))open(b.dataset.feedbackOpen);
 if(kinds.includes(b.dataset.feedbackRefresh))load(b.dataset.feedbackRefresh);
 if(kinds.includes(b.dataset.feedbackMore))load(b.dataset.feedbackMore,true);
 if(kinds.includes(b.dataset.feedbackDelete)&&member?.is_admin){
  const kind=b.dataset.feedbackDelete;if(!/^\d+$/.test(b.dataset.feedbackId||''))return;
  if(!confirm('Удалить '+(kind==='ratings'?'оценку':'идею')+' для всех? Отменить удаление нельзя.'))return;
  b.disabled=true;
  try{await window.KlevAPI('admin/delete-feedback',{kind,id:b.dataset.feedbackId});window.toast('Запись удалена');await load(kind)}catch(error){window.toast(error.message)}finally{b.disabled=false}
 }
});
$('#feedback-form').addEventListener('submit',async e=>{
 e.preventDefault();e.stopPropagation();if(submitting)return;
 const f=e.currentTarget,button=f.querySelector('[type="submit"]');
 if(!member||member.is_banned){$('#feedback-error').textContent='Войдите в аккаунт с доступом к публикациям.';return}
 if(!f.reportValidity())return;submitting=true;button.disabled=true;$('#feedback-error').textContent='';
 const kind=formKind;
 try{
  await window.KlevAPI(kind==='ratings'?'feedback/rate':'feedback/idea',{stars:f.elements.stars.value,text:f.elements.text.value});
  $('#feedback-dialog').close();f.reset();window.toast(kind==='ratings'?'Ваша оценка опубликована':'Ваша идея опубликована');
  await load(kind);await window.navigate('home');$('#'+kind).scrollIntoView({behavior:'smooth'});
 }catch(error){$('#feedback-error').textContent=error.message}
 finally{submitting=false;button.disabled=false}
});
window.KlevFeedback={setUser};
setUser(typeof user==='undefined'?null:user);
// A guest also loads public feedback; no local/session-only fake records.
if(!member)kinds.forEach(kind=>load(kind));
})();
