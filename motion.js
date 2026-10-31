/* КЛЁВ Алтай: progressive motion and read-only, same-origin release notifications. */
(()=>{'use strict';
 const BUILD=2026103103,LABEL='Фото в общем чате',SITE='https://klev-altai22.github.io/klev-web/';
 const CHANGES=["Фото прямо в общем чате: с подписью или без.", "Предпросмотр перед отправкой и сжатие изображения до 512 КБ.", "Увеличение фото, ответы и жалобы на сообщения с фотографиями.", "Защита от дублей при повторной отправке после обрыва связи.", "Фото дневника остаются личными; фото чата видны участникам.", "Переходы, уведомления о версиях и остальные функции сохранены."];
 const q=s=>document.querySelector(s),read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},save=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}};
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');let userOff=read('klev-motion-off',false)===true,remote=null,busy=false,lastCheck=-Infinity,timer=null,notifiedBuild=0,notifiedMaintenance='',suppressUnload=false;
 const dirtyForms=new Set(),trackedForms=new Set(['message-form','profile-form','catch-form','meetup-form','checklist-form','report-form','feedback-form']);
 const seenMessages=new Set();let firstMessages=true;
 const motionOn=()=>!media.matches&&!userOff;
 const text=(tag,value,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value;return e};
 function dirty(){for(const f of dirtyForms)if(!f.isConnected)dirtyForms.delete(f);return dirtyForms.size>0}
 function setMotion(){const on=motionOn();document.body.classList.toggle('motion-off',!on);const b=q('#motion-toggle');if(b){b.textContent=media.matches?'Эффекты: по настройке системы':on?'Эффекты: включены':'Эффекты: выключены';b.setAttribute('aria-pressed',String(on));b.disabled=media.matches;b.title=media.matches?'Уменьшение движения включено в настройках устройства':'Отключить или включить декоративные эффекты'}if(!on)document.querySelectorAll('.reveal-pending').forEach(e=>e.classList.add('is-visible'))}
 const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}},{threshold:.06,rootMargin:'0px 0px -15px 0px'}):null;
 const candidates='.feature,.fish-card,.gear-card,.city-card,.section-heading,.feedback-summary,.feedback-card,.weather-panel,.trial-banner';
 function reveal(e){if(!e.matches?.(candidates)||e.classList.contains('reveal-pending'))return;if(e.closest('dialog,#messages'))return;e.classList.add('reveal-pending');if(!motionOn()||!observer)e.classList.add('is-visible');else observer.observe(e)}
 function scanMessages(){const nodes=[...document.querySelectorAll('#messages .message[id]')];if(!nodes.length){if(q('#messages .empty'))firstMessages=false;return;}
  for(const m of nodes){if(!firstMessages&&!seenMessages.has(m.id)&&motionOn()){m.classList.add('motion-new-message');m.addEventListener('animationend',()=>m.classList.remove('motion-new-message'),{once:true})}seenMessages.add(m.id)}firstMessages=false;if(seenMessages.size>5000){const keep=nodes.map(x=>x.id);seenMessages.clear();keep.forEach(x=>seenMessages.add(x))}}
 function parse(data){if(!data||data.schema!==1||!Number.isSafeInteger(data.build)||data.build<1||data.build>999999999999)return null;
  const result={build:data.build,label:typeof data.label==='string'?data.label.slice(0,80):'Обновление сайта',changes:Array.isArray(data.changes)?data.changes.filter(x=>typeof x==='string').slice(0,8).map(x=>x.slice(0,220)):[],maintenance:null};
  const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s);
  const m=data.maintenance;if(m?.enabled===true&&typeof m.id==='string'&&m.id.length>0&&m.id.length<=100&&iso(m.startsAt)&&(m.announceAt==null||iso(m.announceAt))){
   const start=Date.parse(m.startsAt),announce=m.announceAt==null?start-24*3600000:Date.parse(m.announceAt),duration=Number(m.expectedMinutes);
   if(Number.isFinite(start)&&Number.isFinite(announce)&&announce<=start&&Number.isInteger(duration)&&duration>=1&&duration<=180)result.maintenance={id:m.id,start,announce,end:start+duration*60000,minutes:duration,message:typeof m.message==='string'?m.message.slice(0,500):'Перед обновлением сохраните свои записи.'};
  }return result;
 }
 function maintenance(){const m=remote?.maintenance,now=Date.now();return m&&now>=m.announce&&now<m.end?m:null}
 function formatTime(ms){return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Barnaul',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(ms))+' по Барнаулу'}
 function renderStatus(){const b=q('#update-pill'),m=maintenance(),newer=remote&&remote.build>BUILD;
  b.hidden=!newer&&!m;b.textContent=newer?'↻ Доступно обновление':'◷ Плановое обновление';b.setAttribute('aria-label',newer?'Открыть сведения о новой версии сайта':'Открыть предупреждение о плановом обновлении');
  const info=q('#whats-new-button'),seen=Number(read('klev-release-seen',0));info.classList.toggle('has-release-dot',seen<BUILD);const announcement=newer?'Доступна новая версия. Сохраните записи перед перезагрузкой.':m?'Плановое окно обновления: '+formatTime(m.start):'';if(q('#release-status').textContent!==announcement)q('#release-status').textContent=announcement;
  if(newer&&notifiedBuild!==remote.build){notifiedBuild=remote.build;window.toast?.('Есть новая версия сайта. Сохраните записи и откройте «Доступно обновление».')}
  if(m&&notifiedMaintenance!==m.id){notifiedMaintenance=m.id;window.toast?.('Плановое обновление: '+formatTime(m.start)+'. Подробнее — в уведомлении.')}
 }
 async function checkUpdates(force=false){if(busy||document.hidden)return;if(!force&&performance.now()-lastCheck<15000)return;lastCheck=performance.now();busy=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
  try{const url=new URL('./release.json',document.baseURI);url.searchParams.set('check',String(Math.floor(Date.now()/60000)));const r=await fetch(url.href,{cache:'no-store',credentials:'omit',mode:'same-origin',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});if(!r.ok)return;const raw=await r.text();if(raw.length>16000)return;const next=parse(JSON.parse(raw));if(next){remote=next;renderStatus()}}
  catch{/* Optional metadata may be temporarily unavailable; the community must keep working. */}
  finally{clearTimeout(timeout);busy=false}
 }
 function openUpdates(){const newer=remote&&remote.build>BUILD,m=maintenance(),current=remote?.build===BUILD?remote:{build:BUILD,label:LABEL,changes:CHANGES};const release=newer?remote:current;
  q('#updates-title').textContent=newer?'Доступно обновление':'Что нового в «КЛЁВ Алтай»';q('#updates-label').textContent=release.label;const list=q('#updates-changes');list.replaceChildren();for(const line of release.changes)list.append(text('li',line));
  const block=q('#maintenance-info');block.hidden=!m;block.replaceChildren();if(m){block.append(text('strong','Плановое окно: '+formatTime(m.start)));block.append(text('p',m.message));block.append(text('p','Ориентировочная продолжительность: '+m.minutes+' мин. Это предупреждение о плане, а не сообщение о фактической недоступности.','subtle'))}
  q('#reload-update').hidden=!newer;q('#updates-unsaved').textContent=dirty()?'У вас есть несохранённые изменения. Сначала сохраните или отправьте их.':'Страница не обновится сама. Вы выбираете, когда перезагрузить её.';q('#updates-result').textContent='';
  save('klev-release-seen',BUILD);renderStatus();if(!q('#updates-dialog').open)q('#updates-dialog').showModal();
 }
 function shareFallback(){if(!q('#share-dialog').open)q('#share-dialog').showModal();q('#site-share-url').value=SITE;q('#share-result').textContent='Скопируйте этот адрес и отправьте знакомым рыбакам.';q('#site-share-url').select()}
 async function share(){if(navigator.share){try{await navigator.share({title:'КЛЁВ Алтай',text:'Сообщество рыбаков Алтайского края: погода, снасти и общий чат.',url:SITE});return}catch(e){if(e.name==='AbortError')return}}
  try{if(!navigator.clipboard?.writeText)throw Error('no clipboard');await navigator.clipboard.writeText(SITE);window.toast?.('Ссылка на «КЛЁВ Алтай» скопирована')}catch{shareFallback()}
 }
 function ensureUI(){const footer=q('footer');if(!footer)return;const links=document.createElement('div');links.className='motion-footer';links.innerHTML='<button type="button" id="whats-new-button">Что нового</button><button type="button" id="share-site">Поделиться сайтом ↗</button><button type="button" id="motion-toggle" aria-pressed="true">Эффекты: включены</button>';footer.append(links);
  document.body.insertAdjacentHTML('beforeend',`<div id="release-status" class="visually-hidden" role="status" aria-live="polite"></div><button type="button" id="update-pill" hidden></button><button type="button" id="back-to-top" aria-label="Вернуться наверх" title="Наверх" hidden>↑</button><dialog id="updates-dialog" aria-labelledby="updates-title"><button type="button" class="close" data-close="updates-dialog" aria-label="Закрыть">×</button><span class="eyebrow muted">КЛЁВ АЛТАЙ · БЕЗ СПЕШКИ</span><h2 id="updates-title">Что нового</h2><h3 id="updates-label"></h3><ul id="updates-changes"></ul><aside id="maintenance-info" class="maintenance-info" hidden></aside><p id="updates-unsaved" class="subtle"></p><p id="updates-result" role="status"></p><div class="update-actions"><button type="button" id="reload-update" class="btn green" hidden>Сохранено — обновить страницу</button><button type="button" class="btn light" data-close="updates-dialog">Позже</button></div></dialog><dialog id="share-dialog" aria-labelledby="share-title"><button type="button" class="close" data-close="share-dialog" aria-label="Закрыть">×</button><h2 id="share-title">Пригласи знакомого рыбака</h2><label>Адрес сайта<input readonly id="site-share-url" value="${SITE}"></label><p id="share-result" role="status" class="subtle"></p><button type="button" id="copy-site-link" class="btn green">Скопировать ссылку</button></dialog>`);
 }
 ensureUI();document.body.classList.add('motion-ready');setMotion();document.querySelectorAll(candidates).forEach(reveal);scanMessages();
 const mutations=new MutationObserver(records=>{let chatChanged=false;for(const r of records){if(r.target instanceof Element&&r.target.closest('#messages'))chatChanged=true;for(const n of r.addedNodes)if(n instanceof Element){reveal(n);n.querySelectorAll(candidates).forEach(reveal);if(n.matches('.message')||n.querySelector('.message'))chatChanged=true}}if(chatChanged)scanMessages()});mutations.observe(document.body,{childList:true,subtree:true});
 media.addEventListener?.('change',setMotion);
 document.addEventListener('input',e=>{const f=e.target.closest?.('form');if(f&&trackedForms.has(f.id))dirtyForms.add(f)});
 document.addEventListener('change',e=>{const f=e.target.closest?.('form');if(f&&trackedForms.has(f.id))dirtyForms.add(f)});
 document.addEventListener('reset',e=>dirtyForms.delete(e.target),true);document.addEventListener('close',e=>{if(e.target instanceof HTMLDialogElement)e.target.querySelectorAll('form').forEach(f=>dirtyForms.delete(f))},true);
 window.addEventListener('beforeunload',e=>{if(!suppressUnload&&dirty()){e.preventDefault();e.returnValue=''}});
 document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id==='motion-toggle'){userOff=!userOff;save('klev-motion-off',userOff);setMotion()}
  if(b.id==='whats-new-button'||b.id==='update-pill')openUpdates();
  if(b.id==='reload-update'){
   if(dirty()&&!window.confirm('Остались несохранённые изменения. При перезагрузке они пропадут. Всё равно обновить страницу?')){q('#updates-result').textContent='Перезагрузка отменена. Сохраните записи и вернитесь к обновлению.';return}
   suppressUnload=true;location.reload();
  }
  if(b.id==='share-site')await share();
  if(b.id==='copy-site-link'){try{if(!navigator.clipboard?.writeText)throw Error('no clipboard');await navigator.clipboard.writeText(SITE);q('#share-result').textContent='Ссылка скопирована'}catch{q('#site-share-url').select();q('#share-result').textContent='Автоматическое копирование недоступно. Нажмите Ctrl+C или удерживайте выделенный адрес.'}}
  if(b.id==='back-to-top')window.scrollTo({top:0,behavior:motionOn()?'smooth':'instant'});
 });
 function scrollState(){q('#back-to-top').hidden=window.scrollY<600}let scrollQueued=false;window.addEventListener('scroll',()=>{if(!scrollQueued){scrollQueued=true;requestAnimationFrame(()=>{scrollQueued=false;scrollState()})}},{passive:true});scrollState();
 function schedule(){clearInterval(timer);timer=null;document.body.classList.toggle('motion-paused',document.hidden);if(!document.hidden){checkUpdates();timer=setInterval(()=>{renderStatus();if(performance.now()-lastCheck>=180000)checkUpdates()},60000)}}
 document.addEventListener('visibilitychange',schedule);schedule();
 window.KlevMotion={build:BUILD,checkUpdates,openUpdates,motionEnabled:motionOn};
})();
