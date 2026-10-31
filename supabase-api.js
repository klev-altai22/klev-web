/* Direct browser integration. Authorization is enforced by PostgreSQL RLS, not UI. */
(()=>{
 const C=window.KLEV_CONFIG||{};
 const URL=(C.supabaseUrl||'').replace(/\/$/,'');
 const KEY=C.publishableKey||'';
 let recovery=null;
 function consumeEmailHash(){
  const h=new URLSearchParams(location.hash.replace(/^#/,''));let kind=null;
  if(h.get('type')==='recovery'&&h.has('access_token')){recovery={access_token:h.get('access_token')};window.KLEV_RECOVERY_PENDING=true;kind='recovery'}
  if(h.has('error')||h.has('error_description')){window.KLEV_EMAIL_NOTICE='expired';kind='expired'}
  else if(h.get('type')==='signup'&&h.has('access_token')){window.KLEV_EMAIL_NOTICE='confirmed';kind='confirmed'}
  // No signup session is accepted. Recovery token stays in memory only and is verified server-side.
  if(h.has('access_token')||h.has('refresh_token')||h.has('error')||h.has('error_description'))history.replaceState(null,'',location.pathname+location.search+'#home');
  return kind;
 }
 consumeEmailHash();
 window.addEventListener?.('hashchange',()=>{const kind=consumeEmailHash();if(kind==='recovery')window.KlevCommunity?.recovery();else if(kind==='expired')window.toast?.('Ссылка устарела или недействительна. Запросите новую.');else if(kind==='confirmed')window.toast?.('Почта подтверждена. Можно войти.')});
 const storage='klev-supabase-session-v1';
 let session=null;
 try{session=JSON.parse(localStorage.getItem(storage)||'null')}catch{}
 let refreshing=null;
 function configured(){
  if(window.KLEV_PREVIEW)throw Error('Тестовый макет: вход, отправка данных и письма отключены. Рабочий сайт не изменён.');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL)||!KEY)throw Error('Владелец ещё подключает базу. Регистрация и чат пока недоступны.');
  if(KEY.startsWith('sb_secret_'))throw Error('Ошибка настройки: секретный ключ нельзя использовать в браузере.');
  if(KEY.startsWith('eyJ')){
   try{const role=JSON.parse(atob(KEY.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role;if(role!=='anon')throw Error('role')}catch{throw Error('В браузере разрешён только publishable или legacy anon ключ.')}
  }else if(!KEY.startsWith('sb_publishable_'))throw Error('Нужен публичный publishable ключ Supabase.');
 }
 function save(s){session=s?.access_token?{access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600),user:s.user}:null;try{session?localStorage.setItem(storage,JSON.stringify(session)):localStorage.removeItem(storage)}catch{}}
 async function request(path,{method='GET',body,token,prefer}={}){
  configured();const headers={apikey:KEY,'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(prefer)headers.Prefer=prefer;
  let r;try{r=await fetch(URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'})}catch{throw Error('Нет соединения с базой. Попробуйте позже.')}
  const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null}catch{throw Error('Неожиданный ответ базы данных')}
  if(!r.ok){const e=Error(friendly(data?.msg||data?.message||data?.error_description||data?.error||'Ошибка базы данных'));e.status=r.status;throw e}return data;
 }
 function friendly(s){if(/Invalid login credentials/i.test(s))return 'Неверный email или пароль';if(/Email not confirmed/i.test(s))return 'Сначала подтвердите email по ссылке из письма';if(/rate limit|too many|сообщений слишком/i.test(s))return 'Слишком много запросов. Подождите немного.';if(/schema cache|does not exist|permission denied/i.test(s))return 'База ещё не настроена владельцем сайта';if(/row.level security/i.test(s))return 'Операция недоступна: проверьте права, блокировку и лимиты.';if(/already registered/i.test(s))return 'Этот email уже зарегистрирован';return String(s).slice(0,220)}
 async function token(){
  if(!session)throw Error('Войдите в аккаунт');
  if(session.expires_at<Date.now()/1000+60){
   if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(s=>save(s)).catch(e=>{if(e.status===400||e.status===401)save(null);throw e}).finally(()=>refreshing=null);
   await refreshing;
  }return session.access_token;
 }
 async function db(path,opts={}){return request('/rest/v1/'+path,{...opts,token:await token()})}
 async function access(){return db('rpc/klev_access_status',{method:'POST',body:{}})}
 async function me(){if(!session)return null;const status=await access();const rows=await db('klev_profiles?select=*');if(!rows.length)throw Error('Профиль ещё не создан. Обратитесь к владельцу сайта.');return {...rows[0],email:session.user.email,access_active:!status.is_banned,is_banned:status.is_banned,is_admin:status.is_admin,access_mode:'free'}}
 async function requireAccess(){if((await access()).is_banned){const e=Error('Ваш доступ к чату и новым публикациям заблокирован владельцем.');e.code='BANNED';throw e}}
 async function removePhotoPaths(paths){if(paths.length)await request('/storage/v1/object/klev-catches',{method:'DELETE',token:await token(),body:{prefixes:paths}})}
 async function cleanMyPhotos(){
  const uid=session.user.id;const folders=await request('/storage/v1/object/list/klev-catches',{method:'POST',token:await token(),body:{prefix:uid+'/',limit:100}});const paths=[];
  for(const f of folders){
   if(f.id){paths.push(uid+'/'+f.name);continue}
   const items=await request('/storage/v1/object/list/klev-catches',{method:'POST',token:await token(),body:{prefix:uid+'/'+f.name+'/',limit:100}});
   for(const x of items)if(x.id)paths.push(uid+'/'+f.name+'/'+x.name);
  }
  await removePhotoPaths(paths);
  const linked=await db('klev_catches?select=id,photo_path&photo_path=not.is.null');
  for(const c of linked)await db('rpc/klev_detach_photo',{method:'POST',body:{p_catch:c.id}});
 }
 const chatId=id=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(id)))throw Error('Неверное прикрепление');return session.user.id+'/'+id+'.webp'};
 async function removeChatPaths(paths){if(paths.length)await request('/storage/v1/object/klev-chat',{method:'DELETE',token:await token(),body:{prefixes:paths}})}
 async function cleanMyChatPhotos(){
  const uid=session.user.id,items=await request('/storage/v1/object/list/klev-chat',{method:'POST',token:await token(),body:{prefix:uid+'/',limit:100}});
  const paths=items.filter(x=>x.id).map(x=>uid+'/'+x.name);await removeChatPaths(paths);
 }
 async function sendChatPhoto(data){
  const blob=data.blob;if(!(blob instanceof Blob)||blob.type!=='image/webp'||blob.size<1||blob.size>524288)throw Error('Нужно WebP-фото до 512 КБ');
  const path=chatId(data.upload_id),caption=String(data.text||'').trim()||'📷 Фото улова',reply=data.reply_to||null;
  if(caption.length>1000)throw Error('Подпись: до 1000 символов');
  const status=await db('rpc/klev_chat_photo_status',{method:'POST',body:{p_path:path}});
  if(status.message_id){if(status.text!==caption||String(status.reply_to||'')!==String(reply||''))throw Error('Это фото уже опубликовано с другой подписью. Уберите прикрепление и проверьте чат.');return {ok:true,id:status.message_id,retried:true}}
  if(!status.stored){
   const r=await fetch(URL+'/storage/v1/object/klev-chat/'+path,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+await token(),'Content-Type':'image/webp','x-upsert':'false','cache-control':'60'},body:blob});
   if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(friendly(j.message||j.error||'Не удалось загрузить фото. Лимиты: 10 в сутки, пауза 30 секунд, до 20 сохранённых фото.'))}
  }
  // Never delete after an uncertain RPC response: commit may have succeeded. Retry uses the SAME path.
  const id=await db('rpc/klev_send_chat_photo',{method:'POST',body:{p_text:caption,p_path:path,p_reply:reply}});return {ok:true,id};
 }
 window.KlevAPI=async function(path,data){
  if(path==='password/recover'){
   const email=String(data.email||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Введите email');
   const target=location.origin+location.pathname.replace(/index\.html$/,'');
   await request('/auth/v1/recover?redirect_to='+encodeURIComponent(target),{method:'POST',body:{email}});return {ok:true};
  }
  if(path==='password/check'){
   if(!recovery)throw Error('Откройте новую ссылку из письма восстановления');
   const j=await request('/auth/v1/user',{token:recovery.access_token});return {ok:true,email:j.email};
  }
  if(path==='password/reset'){
   if(!recovery)throw Error('Ссылка недействительна. Запросите новую');
   if(typeof data.password!=='string'||data.password.length<10||data.password.length>128)throw Error('Пароль: 10–128 символов');
   await request('/auth/v1/user',{method:'PUT',token:recovery.access_token,body:{password:data.password}});
   try{await request('/auth/v1/logout?scope=global',{method:'POST',token:recovery.access_token})}catch{}
   recovery=null;window.KLEV_RECOVERY_PENDING=false;save(null);return {ok:true};
  }
  if(path==='community/me')return db('rpc/klev_community_me',{method:'POST',body:{}});
  if(path==='community/save'){await db('rpc/klev_member_save',{method:'POST',body:{p_checklist:data.checklist??null,p_read:data.read??null}});return {ok:true}}
  if(path==='community/pin'){await db('rpc/klev_pin_message',{method:'POST',body:{p_id:data.id||null}});return {ok:true}}
  if(path==='community/report'){await db('rpc/klev_report_message',{method:'POST',body:{p_id:data.id,p_reason:data.reason}});return {ok:true}}
  if(path==='community/reports')return db('rpc/klev_admin_reports',{method:'POST',body:{}});
  if(path==='community/resolve'){await db('rpc/klev_resolve_report',{method:'POST',body:{p_id:data.id}});return {ok:true}}
  if(path==='community/meetups'){
   if(data?.publish){await db('rpc/klev_publish_meetup',{method:'POST',body:{p_city:data.city,p_day:data.day,p_method:data.method,p_details:data.details}});return {ok:true}}
   return db('rpc/klev_meetups_feed',{method:'POST',body:{p_before:data?.before||null}});
  }
  if(path==='community/close'){await db('rpc/klev_close_meetup',{method:'POST',body:{p_id:data.id}});return {ok:true}}
  if(path==='photo/sign'){
   const rows=await db('klev_catches?id=eq.'+encodeURIComponent(data.id)+'&select=photo_path');const path=rows[0]?.photo_path;
   if(!path)return {url:null};const result=await request('/storage/v1/object/sign/klev-catches/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',token:await token(),body:{expiresIn:600}});
   return {url:URL+'/storage/v1'+result.signedURL};
  }
  if(path==='photo/upload'){
   await requireAccess();const blob=data.blob;if(!(blob instanceof Blob)||blob.type!=='image/webp'||blob.size>524288)throw Error('Нужно WebP-фото до 512 КБ');
   if(!/^\d+$/.test(String(data.id)))throw Error('Неверная запись');
   const path=session.user.id+'/'+data.id+'/'+crypto.randomUUID()+'.webp';
   const r=await fetch(URL+'/storage/v1/object/klev-catches/'+path,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+await token(),'Content-Type':'image/webp','x-upsert':'false'},body:blob});
   if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(friendly(j.message||j.error||'Не удалось загрузить фото; проверьте лимит 10 фото и размер'))}
   try{await db('rpc/klev_attach_photo',{method:'POST',body:{p_catch:data.id,p_path:path}})}catch(e){try{await removePhotoPaths([path])}catch{}throw e}
   return {ok:true};
  }
  if(path==='photo/remove'){
   const rows=await db('klev_catches?id=eq.'+encodeURIComponent(data.id)+'&select=photo_path');const path=rows[0]?.photo_path;
   if(path)await removePhotoPaths([path]);await db('rpc/klev_detach_photo',{method:'POST',body:{p_catch:data.id}});return {ok:true};
  }
  if(path==='me'){configured();return {user:await me()}}
  if(path==='register'){
   if(!data.consent)throw Error('Нужно согласие на хранение данных');
   const j=await request('/auth/v1/signup',{method:'POST',body:{email:data.email,password:data.password,data:{name:data.name}}});
   if(!j.access_token)return {confirmation_required:true};save(j);return {user:await me()};
  }
  if(path==='login'){save(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:data.email,password:data.password}}));return {user:await me()}}
  if(path==='logout'){if(session)await request('/auth/v1/logout?scope=local',{method:'POST',token:await token()});save(null);return {ok:true}}
  if(path==='profile'){await requireAccess();await db('klev_profiles?id=eq.'+encodeURIComponent(session?.user?.id||''),{method:'PATCH',body:{name:data.name,city:data.city,favorite:data.favorite,experience:data.experience,bio:data.bio}});return {user:await me()}}
  if(path==='chat-photo/sign'){
   if(!/^\d+$/.test(String(data.id)))throw Error('Неверное сообщение');await requireAccess();
   const rows=await db('klev_messages?id=eq.'+encodeURIComponent(data.id)+'&select=photo_path');const path=rows[0]?.photo_path;
   if(!path)return {url:null};const result=await request('/storage/v1/object/sign/klev-chat/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',token:await token(),body:{expiresIn:300}});
   const signed=result.signedURL||result.signedUrl;if(!signed)throw Error('Не удалось открыть фото');return {url:URL+'/storage/v1'+signed};
  }
  if(path==='chat-photo/cleanup'){
   await token();const paths=await db('rpc/klev_claim_unused_chat_photos',{method:'POST',body:{}});
   if(!Array.isArray(paths)||paths.some(p=>typeof p!=='string'||!p.startsWith(session.user.id+'/')))throw Error('Некорректный список файлов');
   await removeChatPaths(paths);return {ok:true,count:paths.length};
  }
  if(path==='chat-photo/discard'){
   await token();const path=chatId(data.upload_id),status=await db('rpc/klev_chat_photo_status',{method:'POST',body:{p_path:path}});
   if(status.message_id)return {ok:true,published:true};if(status.stored)await removeChatPaths([path]);return {ok:true};
  }
  if(path==='messages'){
   await requireAccess();
   if(data?.blob)return sendChatPhoto(data);
   if(data){await db('klev_messages',{method:'POST',body:{user_id:session?.user?.id,text:data.text,reply_to:data.reply_to||null}});return {ok:true}}
   return db('rpc/klev_chat_feed',{method:'POST',body:{}});
  }
  if(path==='catches'){
   if(data){await requireAccess();await db('klev_catches',{method:'POST',body:{user_id:session?.user?.id,fish:data.fish,weight:Number(data.weight),date:data.date,place:data.place,note:data.note||''}});return {ok:true}}
   return {catches:await db('klev_catches?select=*&order=date.desc,id.desc')};
  }
  if(path==='feedback/feed')return request('/rest/v1/rpc/klev_feedback_feed',{method:'POST',token:session?await token():undefined,body:{p_kind:data.kind,p_before:data.before||null}});
  if(path==='feedback/rate'){await requireAccess();await db('rpc/klev_publish_rating',{method:'POST',body:{p_stars:Number(data.stars),p_text:data.text||''}});return {ok:true}}
  if(path==='feedback/idea'){await requireAccess();await db('rpc/klev_publish_idea',{method:'POST',body:{p_text:data.text}});return {ok:true}}
  if(path==='feedback/mine')return db('rpc/klev_my_feedback',{method:'POST',body:{}});
  if(path==='admin/delete-feedback'){await db('rpc/klev_admin_delete_feedback',{method:'POST',body:{p_kind:data.kind,p_id:data.id}});return {ok:true}}
  if(path==='admin/users')return {users:await db('rpc/klev_admin_list_users',{method:'POST',body:{p_query:data?.query||'',p_offset:data?.offset||0}})};
  if(path==='admin/delete-message'){
   if(!(await access()).is_admin)throw Error('Только владелец сайта');if(!/^\d+$/.test(String(data.id)))throw Error('Неверное сообщение');
   const rows=await db('klev_messages?id=eq.'+encodeURIComponent(data.id)+'&select=photo_path');
   if(rows[0]?.photo_path)await removeChatPaths([rows[0].photo_path]);
   await db('rpc/klev_admin_delete_message',{method:'POST',body:{p_message_id:data.id}});return {ok:true};
  }
  if(path==='admin/ban'){await db('rpc/klev_admin_ban_user',{method:'POST',body:{p_user_id:data.user_id,p_reason:data.reason||''}});return {ok:true}}
  if(path==='admin/unban'){await db('rpc/klev_admin_unban_user',{method:'POST',body:{p_user_id:data.user_id}});return {ok:true}}
  if(path==='export'){
   const result={profile:await me(),catches:(await window.KlevAPI('catches')).catches};
   try{result.community=await window.KlevAPI('feedback/mine');result.community_update=await db('rpc/klev_community_export',{method:'POST',body:{}});if(Array.isArray(result.community_update?.catches)){result.catches=result.community_update.catches;delete result.community_update.catches}if(Array.isArray(result.community_update?.messages)){result.messages=result.community_update.messages;delete result.community_update.messages}result.photo_note='Фото дневника и чата скачиваются отдельно; JSON содержит пути, не файлы. Фото чата были доступны вошедшим участникам.'}catch(e){result.community={unavailable:true,error:e.message}}
   return result;
  }
  if(path==='delete-account'){
   if(!session)throw Error('Войдите в аккаунт');
   if((await me()).is_admin)throw Error('Владелец не может удалить свой аккаунт, пока права не переданы через базу.');
   // Reauthenticate before destructive action; the RPC independently restricts deletion to auth.uid().
   const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:session.user.email,password:data.password}});save(s);
   await cleanMyChatPhotos();
   await cleanMyPhotos();
   await db('rpc/klev_delete_my_account',{method:'POST',body:{confirmation:'DELETE'}});save(null);return {ok:true};
  }
  throw Error('Операция не поддерживается');
 };
})();
