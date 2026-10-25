/* Eltorga v0.2.4. El diseño original se conserva. */
const pubSafe=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pubIcon=x=>/^ri-[a-z0-9-]+$/.test(x||'')?x:'ri-shield-star-line';
const pubColor=(x,def)=>/^#[0-9a-f]{6}$/i.test(x||'')?x:def;
const pubAsset=x=>x?String(x).replace(/^\/+/, ''):'';
// Aplicar TODOS los datos del perfil, no solo el texto de los cargos.
applyAdminProfile=function(){
 const p=siteConfig.profile||{};
 document.querySelectorAll('.post-sidebar').forEach(side=>{
  const avatar=side.querySelector('.author-avatar');if(avatar){if(p.avatar||siteConfig.avatar){avatar.src=pubAsset(p.avatar||siteConfig.avatar);avatar.style.display='block';avatar.alt=p.name||'Autor'}else avatar.style.display='none'}
  const name=side.querySelector('.author-name');if(name)name.textContent=p.name||'eltorga';
  const roles=[['.badge-admin',p.role||'Administrador',p.roleIcon||'ri-shield-star-line',p.roleColor||'#d32f2f'],['.badge-dev',p.role2||'Desarrollador',p.role2Icon||'ri-code-s-slash-line',p.role2Color||'#66c0f4']];
  for(const [sel,title,icon,color] of roles){const el=side.querySelector(sel);if(el){el.innerHTML=`<i class="${pubIcon(icon)}"></i> ${pubSafe(title)}`;el.style.backgroundColor=pubColor(color,'#2a475e');if(sel==='.badge-dev')el.style.color='#18232f'}}
  const stats=side.querySelector('.author-stats');if(stats){stats.innerHTML=[['Posts creados',p.posts??142,p.postsIcon||'ri-edit-line'],['Likes recibidos',p.likes??396,p.likesIcon||'ri-heart-3-fill'],['Reputación',p.reputation??530,p.reputationIcon||'ri-arrow-up-line']].map(([label,value,ico])=>`<div class="author-stats-row"><span><i class="${pubIcon(ico)}"></i> ${pubSafe(label)}</span><span>${pubSafe(value)}</span></div>`).join('')}
  const badges=side.querySelector('.badges-grid');if(badges){const a=p.achievements||[];badges.innerHTML=Array.from({length:9},(_,i)=>{const x=a[i]||{};return `<a href="#" onclick="event.preventDefault()" data-tooltip="${pubSafe(x.name||'Logro '+(i+1))}" title="${pubSafe(x.name||'Logro '+(i+1))}">${x.image?`<img src="${pubSafe(pubAsset(x.image))}" alt="${pubSafe(x.name||'Logro')}">`:'<i class="ri-medal-line" style="font-size:1.5rem;color:var(--steam-grey)"></i>'}</a>`}).join('')}
 });
};
// Al seleccionar español, restablecer el sitio original sin volver a la portada.
function v24CookieReset(){
 const segments=location.pathname.split('/').filter(Boolean),paths=['/'];let cur='';for(const part of segments){cur+='/'+part;paths.push(cur+'/')}
 for(const path of paths){document.cookie='googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path='+path+';SameSite=Lax';document.cookie='googtrans=/es/es;path='+path+';SameSite=Lax'}
 try{sessionStorage.setItem('eltorga-language','es')}catch(e){}
}
chooseLanguage=function(code){
 if(code==='es'){v24CookieReset();location.reload();return}
 try{sessionStorage.setItem('eltorga-language',code)}catch(e){}
 const select=document.querySelector('.goog-te-combo');
 if(select&&[...select.options].some(op=>op.value===code)){
  select.value=code;select.dispatchEvent(new Event('change',{bubbles:true}));
  const list=siteConfig.languages||translationsFallback;const active=list.find(x=>x.code===code);const label=document.querySelector('.language-trigger span');if(label)label.textContent=active?.name||code;
  document.querySelector('.language-options')?.classList.remove('active');document.querySelector('.language-trigger')?.setAttribute('aria-expanded','false');return;
 }
 // Respaldo para idiomas aún no cargados por Google Translate.
 const path=location.pathname.split('/').filter(Boolean);const roots=['/'];if(path.length)roots.push('/'+path[0]+'/');
 for(const root of roots)document.cookie='googtrans=/es/'+encodeURIComponent(code)+';path='+root+';SameSite=Lax';
 location.reload();
};
renderLanguages=function(){
 const original=document.getElementById('google_translate_element');if(!original)return;
 const holder=original.parentElement;if(!holder)return;
 document.getElementById('custom-language-selector')?.remove();
 let langs=siteConfig.languages?.length?siteConfig.languages:translationsFallback;
 if(!langs.some(l=>l.code==='es'))langs=[{code:'es',name:'Español',flag:'1F1EA-1F1F8'},...langs];
 let chosen='es';try{chosen=sessionStorage.getItem('eltorga-language')||'es'}catch(e){}
 const cookie=(document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/)||[])[1];if(cookie){const c=decodeURIComponent(cookie).split('/').pop();if(c&&c!=='es')chosen=c}
 const active=langs.find(x=>x.code===chosen)||langs.find(x=>x.code==='es')||langs[0];
 const im=x=>`<img src="${openmoji(x.flag||'1F1EA-1F1F8')}" width="24" height="24" alt="">`;
 const parent=document.createElement('div');parent.id='custom-language-selector';parent.innerHTML=`<button type="button" class="language-trigger" aria-label="Seleccionar idioma" aria-expanded="false">${im(active)}<span style="flex:1;text-align:left">${pubSafe(active.name)}</span><i class="ri-arrow-down-s-line"></i></button><div class="language-options" role="menu">${langs.map(x=>`<button type="button" data-lang="${pubSafe(x.code)}" role="menuitem">${im(x)} <span>${pubSafe(x.name)}</span></button>`).join('')}</div>`;
 holder.insertBefore(parent,original);
 const trigger=parent.querySelector('.language-trigger'),menu=parent.querySelector('.language-options');
 trigger.onclick=e=>{e.preventDefault();e.stopPropagation();menu.classList.toggle('active');trigger.setAttribute('aria-expanded',menu.classList.contains('active'))};
 menu.querySelectorAll('[data-lang]').forEach(x=>x.onclick=e=>{e.preventDefault();e.stopPropagation();chooseLanguage(x.dataset.lang)});
 document.addEventListener('click',e=>{if(!parent.contains(e.target)){menu.classList.remove('active');trigger.setAttribute('aria-expanded','false')}},{signal:undefined});
};
// La cifra publicada se obtiene de data/comments.json (sin llamadas privadas desde GitHub Pages).
refreshCommentWidgets=function(){
 document.querySelectorAll('.comment-meta').forEach(el=>{
  const c=publicCommentCache[el.dataset.postId];
  if(!c||typeof c.count!=='number'){el.textContent='— comments';return}
  const count=c.count;
  el.textContent=count+' '+(count===1?'comment':'comments');
 });
};
window.eltorgaPublicInit=function(){renderLanguages();loadPublicComments()};
// Los nuevos posts se agregan por SPA; leer datos sincronizados sin depender de abrirlos.
window.addEventListener('hashchange',()=>queueMicrotask(refreshCommentWidgets));
