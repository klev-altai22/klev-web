/* Direct browser integration. Authorization is enforced by PostgreSQL RLS, not UI. */
(()=>{
 const C=window.KLEV_CONFIG||{};
 const URL=(C.supabaseUrl||'').replace(/\/$/,'');
 const KEY=C.publishableKey||'';
 const emailReturn=new URLSearchParams(location.hash.replace(/^#/,''));
 if(emailReturn.has('error')||emailReturn.has('error_description'))window.KLEV_EMAIL_NOTICE='expired';
 else if(emailReturn.get('type')==='signup'&&emailReturn.has('access_token'))window.KLEV_EMAIL_NOTICE='confirmed';
 // Deliberately do not accept session tokens from a confirmation link. User signs in explicitly.
 if(emailReturn.has('access_token')||emailReturn.has('refresh_token')||emailReturn.has('error')||emailReturn.has('error_description'))history.replaceState(null,'',location.pathname+location.search+'#home');
 const storage='klev-supabase-session-v1';
 let session=null;
 try{session=JSON.parse(localStorage.getItem(storage)||'null')}catch{}
 let refreshing=null;
 function configured(){
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
 function friendly(s){if(/Invalid login credentials/i.test(s))return 'Неверный email или пароль';if(/Email not confirmed/i.test(s))return 'Сначала подтвердите email по ссылке из письма';if(/rate limit|too many|сообщений слишком/i.test(s))return 'Слишком много запросов. Подождите немного.';if(/schema cache|does not exist|permission denied/i.test(s))return 'База ещё не настроена владельцем сайта';if(/already registered/i.test(s))return 'Этот email уже зарегистрирован';return String(s).slice(0,220)}
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
 window.KlevAPI=async function(path,data){
  if(path==='me'){configured();return {user:await me()}}
  if(path==='register'){
   if(!data.consent)throw Error('Нужно согласие на хранение данных');
   const j=await request('/auth/v1/signup',{method:'POST',body:{email:data.email,password:data.password,data:{name:data.name}}});
   if(!j.access_token)return {confirmation_required:true};save(j);return {user:await me()};
  }
  if(path==='login'){save(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:data.email,password:data.password}}));return {user:await me()}}
  if(path==='logout'){if(session)await request('/auth/v1/logout?scope=local',{method:'POST',token:await token()});save(null);return {ok:true}}
  if(path==='profile'){await requireAccess();await db('klev_profiles?id=eq.'+encodeURIComponent(session?.user?.id||''),{method:'PATCH',body:{name:data.name,city:data.city,favorite:data.favorite,experience:data.experience,bio:data.bio}});return {user:await me()}}
  if(path==='messages'){
   await requireAccess();
   if(data){await db('klev_messages',{method:'POST',body:{user_id:session?.user?.id,text:data.text}});return {ok:true}}
   const rows=await db('klev_messages?select=id,user_id,name,city,text,created&order=id.desc&limit=100');return {messages:rows.reverse()};
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
  if(path==='admin/delete-message'){await db('rpc/klev_admin_delete_message',{method:'POST',body:{p_message_id:data.id}});return {ok:true}}
  if(path==='admin/ban'){await db('rpc/klev_admin_ban_user',{method:'POST',body:{p_user_id:data.user_id,p_reason:data.reason||''}});return {ok:true}}
  if(path==='admin/unban'){await db('rpc/klev_admin_unban_user',{method:'POST',body:{p_user_id:data.user_id}});return {ok:true}}
  if(path==='export'){
   const result={profile:await me(),catches:(await window.KlevAPI('catches')).catches};
   try{result.community=await window.KlevAPI('feedback/mine')}catch(e){result.community={unavailable:true,error:e.message}}
   return result;
  }
  if(path==='delete-account'){
   if(!session)throw Error('Войдите в аккаунт');
   // Reauthenticate before destructive action; the RPC independently restricts deletion to auth.uid().
   const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:session.user.email,password:data.password}});save(s);
   await db('rpc/klev_delete_my_account',{method:'POST',body:{confirmation:'DELETE'}});save(null);return {ok:true};
  }
  throw Error('Операция не поддерживается');
 };
})();
