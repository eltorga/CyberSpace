/* Eltorga Foro 0.2.6 — Comentarios propios, invitados y GitHub via Supabase. */
(function(){
'use strict';
let instance=null,signature='',renderId=0,replyTo=null,sessionUser=null;
const $=id=>document.getElementById(id);
const cfg=()=>window.siteConfig?.points || (typeof siteConfig!=='undefined'?siteConfig.points:{}) || {};
function client(){
  const c=cfg();
  if(!c.url||!c.publishableKey||!window.supabase?.createClient)return null;
  const sig=c.url+'|'+c.publishableKey;
  if(!instance||sig!==signature){
    instance=window.supabase.createClient(c.url,c.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
    signature=sig;
    instance.auth.onAuthStateChange(()=>{
      setTimeout(()=>{syncUser(); if($('elt-comments-slot'))updateAuthControls();},0);
    });
  }
  return instance;
}
window.EltorgaBackend={client};
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isGithub=u=>!!u && !u.is_anonymous && (u.app_metadata?.provider==='github'||u.identities?.some(x=>x.provider==='github'));
const getName=u=>u?.user_metadata?.user_name||u?.user_metadata?.preferred_username||'Usuario GitHub';
const avatar=u=>{const a=u?.user_metadata?.avatar_url||'';try{const url=new URL(a);return url.protocol==='https:'&&url.hostname==='avatars.githubusercontent.com'?a:''}catch{return ''}};
function userIcon(url){return url?`<img src="${escape(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<i class="ri-user-line"></i>'}
async function syncUser(){const sb=client();if(!sb)return;try{const {data}=await sb.auth.getUser();sessionUser=data?.user||null;}catch{sessionUser=null}}
function error(message){const e=$('elt-comment-status');if(e)e.textContent=message||''}
async function githubLogin(){
  const sb=client();if(!sb)return error('Supabase no está configurado.');
  const url=location.origin+location.pathname;
  if(location.hash.startsWith('#post/'))sessionStorage.setItem('eltorga-post-after-oauth',location.hash);
  const {error:err}=await sb.auth.signInWithOAuth({provider:'github',options:{redirectTo:url}});
  if(err)error(err.message);
}
async function guestSession(){
  const sb=client();if(!sb)throw Error('No hay conexión a Supabase');
  let {data:{session},error:err}=await sb.auth.getSession();if(err)throw err;
  if(!session){const r=await sb.auth.signInAnonymously();if(r.error)throw r.error;}
  await syncUser();
}
function markdown(value){
  if(!window.marked||!window.DOMPurify)return escape(value).replace(/\n/g,'<br>');
  const html=window.marked.parse(String(value),{gfm:true,breaks:true});
  const allowed=['p','br','strong','em','del','blockquote','ul','ol','li','pre','code','a','h3','h4','hr'];
  const safe=window.DOMPurify.sanitize(html,{ALLOWED_TAGS:allowed,ALLOWED_ATTR:['href','title'],ALLOW_DATA_ATTR:false});
  const doc=document.createElement('div');doc.innerHTML=safe;
  doc.querySelectorAll('a').forEach(a=>{const u=a.getAttribute('href');try{const url=new URL(u,location.href);if(!['https:','http:','mailto:'].includes(url.protocol))a.removeAttribute('href');else{a.target='_blank';a.rel='noopener noreferrer nofollow ugc';}}catch{a.removeAttribute('href')}});
  return doc.innerHTML;
}
function flatten(comments){
  const grouped=new Map();for(const c of comments){const k=c.parent_id||'root';if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(c)}
  const seen=new Set(),out=[];
  const visit=(c,depth)=>{if(seen.has(c.id))return;seen.add(c.id);out.push({...c,depth});for(const r of grouped.get(c.id)||[])visit(r,Math.min(depth+1,3));};
  for(const c of comments){if(!c.parent_id||!comments.some(t=>t.id===c.parent_id))visit(c,0)}
  for(const c of comments)visit(c,0);
  return out;
}
async function loadComments(postID,token){
  const sb=client(),list=$('elt-comments-list');if(!sb||!list)return;
  const {data, error:err}=await sb.rpc('eltorga_comments_list',{p_post_id:postID});
  if(token!==renderId||$('elt-comments-slot')?.dataset.postId!==postID)return;
  if(err){list.textContent='No se pudieron cargar los comentarios. Ejecuta el SQL v0.2.6 en Supabase.';return;}
  const rows=Array.isArray(data)?data:[];
  const amount=$('elt-comments-count');if(amount)amount.textContent=`${rows.length} comentario${rows.length===1?'':'s'}`;
  if(!rows.length){list.innerHTML='<div class="elt-comments-empty">Todavía no hay comentarios. ¡Comienza la conversación!</div>';return;}
  list.innerHTML=flatten(rows).map(c=>`<article class="elt-comment ${c.featured?'is-featured':''}" style="--depth:${c.depth}" data-comment-id="${escape(c.id)}">
    <div class="elt-comment-avatar">${userIcon(c.avatar)}</div>
    <div class="elt-comment-main"><div class="elt-comment-top"><strong>${escape(c.name)}</strong> <span class="elt-comment-badge ${c.github?'github':'guest'}"><i class="ri-${c.github?'github-fill':'user-line'}"></i> ${c.github?'GitHub':'Invitado'}</span>${c.featured?'<span class="elt-comment-featured"><i class="ri-star-fill"></i> Respuesta destacada</span>':''} <time datetime="${escape(c.created_at)}">${new Date(c.created_at).toLocaleString('es')}</time></div>
    <div class="elt-comment-content">${markdown(c.body)}</div><div class="elt-comment-actions"><button type="button" data-action="reply" data-id="${escape(c.id)}" data-name="${escape(c.name)}"><i class="ri-reply-line"></i> Responder</button>${c.mine&&c.github?`<button type="button" data-action="edit" data-id="${escape(c.id)}">Editar</button>`:''}${c.mine?`<button type="button" data-action="remove" data-id="${escape(c.id)}">Eliminar</button>`:''}</div></div></article>`).join('');
  list.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=async()=>{
    const action=btn.dataset.action,id=btn.dataset.id;
    if(action==='reply'){replyTo=id;const label=$('elt-comment-reply-to');label.hidden=false;label.querySelector('span').textContent='Respondiendo a '+btn.dataset.name; $('elt-comment-editor').focus();}
    if(action==='edit'){
      const old=rows.find(x=>x.id===id),newBody=prompt('Editar tu comentario Markdown:',old?.body||'');if(newBody===null)return;
      const {error:e}=await sb.rpc('eltorga_comments_edit',{p_id:id,p_body:newBody});if(e)error(e.message);else await loadComments(postID,token);
    }
    if(action==='remove'&&confirm('¿Eliminar tu comentario?')){
      const {error:e}=await sb.rpc('eltorga_comments_remove_own',{p_id:id});if(e)error(e.message);else{await loadComments(postID,token);refreshMetrics();}
    }
  });
}
async function updateAuthControls(){
  const info=$('elt-comments-auth');if(!info)return;
  await syncUser();if(!$('elt-comments-auth'))return;
  const github=isGithub(sessionUser);
  info.innerHTML=github?`<div class="elt-auth-current">${userIcon(avatar(sessionUser))}<span>Comentando como <b>${escape(getName(sessionUser))}</b> <small>GitHub</small></span><button type="button" id="elt-signout">Salir</button></div>`:
     `<div class="elt-auth-options"><span>Comentar como invitado o conectar tu cuenta:</span><button type="button" id="elt-github-login"><i class="ri-github-fill"></i> Entrar con GitHub</button></div>`;
  const nick=$('elt-guest-nick-label');if(nick)nick.hidden=github;
  if($('elt-github-login'))$('elt-github-login').onclick=githubLogin;
  if($('elt-signout'))$('elt-signout').onclick=async()=>{await client().auth.signOut();sessionUser=null;updateAuthControls();error('Sesión cerrada. Puedes seguir como invitado.')};
}
async function submit(postID,token){
  const editor=$('elt-comment-editor'),button=$('elt-comment-send'),nick=$('elt-guest-nick');if(!editor||!button)return;
  const body=editor.value.trim();if(body.length<2||body.length>4000)return error('Escribe entre 2 y 4000 caracteres.');
  const nickname=nick?.value?.trim()||'';button.disabled=true;error('Publicando comentario…');
  try{
    await guestSession();
    const {error:err}=await client().rpc('eltorga_comments_create',{p_post_id:postID,p_body:body,p_nickname:isGithub(sessionUser)?null:nickname,p_parent_id:replyTo||null});
    if(err)throw err;
    if(token!==renderId)return;
    editor.value='';replyTo=null;$('elt-comment-reply-to').hidden=true;error('Comentario publicado correctamente.');
    await loadComments(postID,token);await refreshMetrics();await updateAuthControls();
  }catch(e){error(e.message||'No se pudo publicar el comentario.');}
  finally{if($('elt-comment-send'))$('elt-comment-send').disabled=false;}
}
function montar(post){
  renderId++;const token=renderId,slot=$('elt-comments-slot');if(!slot)return;
  const id=String(post.ID||'');slot.dataset.postId=id;replyTo=null;
  if(typeof siteConfig!=='undefined'&&siteConfig.comments?.enabled===false){$('elt-comments-section').hidden=true;return;}
  slot.innerHTML=`<div class="elt-comment-toolbar"><strong id="elt-comments-count">Comentarios</strong><button type="button" id="elt-comments-reload"><i class="ri-refresh-line"></i> Actualizar</button></div>
    <div id="elt-comments-list" aria-live="polite"><div class="elt-comments-empty">Cargando comentarios…</div></div>
    <div class="elt-comment-compose"><div id="elt-comments-auth"></div><label id="elt-guest-nick-label">Nombre de invitado<input type="text" id="elt-guest-nick" maxlength="45" placeholder="Tu apodo" autocomplete="nickname"></label>
    <div class="elt-comment-reply-to" id="elt-comment-reply-to" hidden><span></span><button type="button" id="elt-cancel-reply"><i class="ri-close-line"></i> Cancelar</button></div>
    <div class="elt-markdown-bar"><button type="button" data-mark="bold" title="Negrita"><i class="ri-bold"></i></button><button type="button" data-mark="italic" title="Cursiva"><i class="ri-italic"></i></button><button type="button" data-mark="link" title="Enlace"><i class="ri-link"></i></button><button type="button" data-mark="quote" title="Cita"><i class="ri-double-quotes-l"></i></button><button type="button" data-mark="list" title="Lista"><i class="ri-list-unordered"></i></button><button type="button" data-mark="code" title="Código"><i class="ri-code-s-slash-line"></i></button><button type="button" id="elt-toggle-preview" title="Vista previa"><i class="ri-eye-line"></i> Vista previa</button></div>
    <textarea id="elt-comment-editor" rows="5" maxlength="4000" placeholder="Escribe un comentario Markdown… No se admiten imágenes ni archivos."></textarea><div id="elt-comment-preview" class="elt-comment-preview" hidden></div>
    <div class="elt-comment-bottom"><small>Markdown · enlaces HTTPS · sin subida de archivos · máximo 4000 caracteres</small><button type="button" id="elt-comment-send"><i class="ri-send-plane-2-line"></i> Publicar comentario</button></div>
    <p id="elt-comment-status" role="status" aria-live="polite"></p></div>`;
  const edit=$('elt-comment-editor'),preview=$('elt-comment-preview');
  $('elt-comments-reload').onclick=()=>loadComments(id,token);
  $('elt-comment-send').onclick=()=>submit(id,token);
  $('elt-cancel-reply').onclick=()=>{replyTo=null;$('elt-comment-reply-to').hidden=true};
  $('elt-toggle-preview').onclick=()=>{preview.hidden=!preview.hidden;edit.hidden=!edit.hidden;if(!preview.hidden)preview.innerHTML=markdown(edit.value)||'<em>Sin contenido</em>';};
  slot.querySelectorAll('[data-mark]').forEach(b=>b.onclick=()=>{
    const t={bold:['**','**','texto'],italic:['*','*','texto'],link:['[','](https://ejemplo.com)','texto'],quote:['\n> ','','cita'],list:['\n- ','','elemento'],code:['`','`','código']}[b.dataset.mark];
    const s=edit.selectionStart,e=edit.selectionEnd,selected=edit.value.slice(s,e)||t[2];
    edit.setRangeText(t[0]+selected+t[1],s,e,'select');edit.focus();
  });
  loadComments(id,token);updateAuthControls();
}
let statsBusy=false,statsPending=false;
async function refreshMetrics(){
  if(statsBusy){statsPending=true;return;}
  const nodes=[...document.querySelectorAll('[data-elt-post-id]')];if(!nodes.length)return;
  const sb=client();if(!sb)return;
  statsBusy=true;
  try{
    const ids=[...new Set(nodes.map(x=>x.dataset.eltPostId).filter(Boolean))];
    for(let i=0;i<ids.length;i+=200){
      const {data,error:err}=await sb.rpc('eltorga_forum_metrics',{p_post_ids:ids.slice(i,i+200)});
      if(err)throw err;
      const metrics=new Map((data||[]).map(x=>[String(x.post_id),x]));
      document.querySelectorAll('[data-elt-post-id]').forEach(n=>{
        const m=metrics.get(n.dataset.eltPostId);if(!m)return;
        const total=Number(n.dataset.eltMetric==='points'?m.points:m.comments).toLocaleString('es');
        n.textContent=n.dataset.metricFormat==='number'?total:total+(n.dataset.eltMetric==='points'?' puntos':' comentarios');
      });
    }
  }catch(e){console.warn('Eltorga: estadísticas no disponibles',e.message||e);}
  finally{statsBusy=false;if(statsPending){statsPending=false;setTimeout(refreshMetrics,0)}}
}
window.EltorgaComentarios={montar,refrescarMetricas:refreshMetrics,cliente:client};
// Evita la métrica obsoleta de comments.json de la versión anterior.
window.refreshCommentWidgets=refreshMetrics;
window.addEventListener('hashchange',()=>setTimeout(refreshMetrics,0));
// El redireccionamiento OAuth PKCE vuelve a esta misma página.
const returnPost=sessionStorage.getItem('eltorga-post-after-oauth');
if(returnPost && (location.hash===''||location.hash==='#')){
  sessionStorage.removeItem('eltorga-post-after-oauth');location.hash=returnPost;
}
})();
