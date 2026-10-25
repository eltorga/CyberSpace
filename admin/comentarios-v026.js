/* Eltorga Admin v0.2.6 — moderación online, conservando el panel original v0.2.4. */
(() => {
  'use strict';
  const oldShow=show;
  const nav=document.querySelector('nav button[data-tab="giscus"]');
  if(nav){
    const btn=document.createElement('button');btn.dataset.tab='comments-v026';
    btn.innerHTML='<i class="ri-chat-3-line"></i> Comentarios';
    btn.onclick=()=>show('comments-v026');
    nav.insertAdjacentElement('beforebegin',btn);
  }
  const version=document.querySelector('.admin-footer span');if(version)version.textContent='Eltorga Foro v0.2.6 · Guardado automático al aplicar cambios';
  show=function(tabName){
    if(tabName!=='comments-v026')return oldShow(tabName);
    tab='comments-v026';editing=-1;
    document.querySelectorAll('nav button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tabName));
    $('heading').textContent='Comentarios y moderación';
    renderCommentsSettings();
  };
})();

let eltAdminSB=null,eltAdminSignature='';
function eltAdminClient(){
  const c=DB.config.points||{};
  if(!c.url||!c.publishableKey||!window.supabase?.createClient)return null;
  const signature=c.url+'|'+c.publishableKey;
  if(!eltAdminSB||eltAdminSignature!==signature){
    eltAdminSB=window.supabase.createClient(c.url,c.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
    eltAdminSignature=signature;
  }
  return eltAdminSB;
}
function renderCommentsSettings(){
  const c=DB.config.comments||{};
  $('content').innerHTML=`<article><h2><i class="ri-chat-3-line"></i> Comentarios propios de Eltorga</h2>
    <p class="hint">Comentarios Markdown, usuarios invitados y acceso con GitHub. Reemplaza Giscus sin perder las opciones del administrador original.</p>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" style="width:auto" id="elt-comment-enable" ${c.enabled!==false?'checked':''}> Mostrar comentarios propios en todas las publicaciones</label>
    <p class="hint">Se conecta al mismo proyecto Supabase configurado en la pestaña Puntos. Los contadores de puntos y comentarios se actualizan en línea.</p>
    <div class="bar"><button class="primary" onclick="eltSaveCommentSettings()"><i class="ri-save-line"></i> Guardar configuración</button><button onclick="eltLoadModeration()"><i class="ri-refresh-line"></i> Consultar comentarios</button></div>
    <p class="status-note" id="elt-admin-comment-status">Para moderar inicia sesión con la cuenta de GitHub autorizada en Supabase.</p>
  </article>
  <article><h2><i class="ri-github-line"></i> Sesión de moderador</h2><div class="bar" id="elt-admin-session"><button class="primary" onclick="eltAdminLogin()"><i class="ri-github-fill"></i> Iniciar sesión con GitHub</button></div>
    <p class="hint">Para obtener permisos, inicia sesión una vez con GitHub, busca tu usuario en Supabase → Authentication → Users y autorízalo con el SQL incluido. Abrir ADMIN.bat no otorga acceso a la base de datos.</p>
    <p class="hint">Añade <code>http://127.0.0.1:8765/admin/</code> a Authentication → URL Configuration → Redirect URLs.</p>
  </article>
  <article><h2>Moderación en Supabase</h2><div class="bar"><input id="elt-admin-search" placeholder="Filtrar por nombre, publicación o texto" oninput="eltFilterCommentRows()" style="max-width:440px"></div><div id="elt-admin-comments" class="list"><p class="muted">Pulsa «Consultar comentarios» después de iniciar sesión.</p></div></article>`;
  eltUpdateAdminSession();
}
function eltAdminInfo(message){const el=$('elt-admin-comment-status');if(el)el.textContent=message;}
async function eltSaveCommentSettings(){
  const c=DB.config.comments||{};
  DB.config.comments={...c,enabled:$('elt-comment-enable').checked,allowGuests:true,githubLogin:true};
  await save('config'); eltAdminInfo('Configuración guardada en data/config.json. Publica el sitio desde ADMIN.bat para verla en GitHub Pages.');
}
async function eltAdminLogin(){
  const sb=eltAdminClient();if(!sb)return eltAdminInfo('Configura primero Supabase desde Puntos.');
  const {error}=await sb.auth.signInWithOAuth({provider:'github',options:{redirectTo:location.origin+'/admin/'}});
  if(error)eltAdminInfo(error.message);
}
async function eltAdminLogout(){
  const sb=eltAdminClient();if(sb)await sb.auth.signOut();eltUpdateAdminSession();eltAdminInfo('Sesión cerrada.');
}
async function eltUpdateAdminSession(){
  const sb=eltAdminClient(),el=$('elt-admin-session');if(!el)return;
  if(!sb){el.textContent='Configura Supabase en Puntos y vuelve a abrir esta pestaña.';return;}
  try{
    const {data:{user}}=await sb.auth.getUser();if(!el.isConnected)return;
    const github=!!user&&!user.is_anonymous&&user.app_metadata?.provider==='github';
    if(!github)return;
    el.innerHTML=`<span>GitHub: <b>${esc(user.user_metadata?.user_name||user.user_metadata?.preferred_username||'Conectado')}</b></span><button onclick="eltAdminLogout()">Cerrar sesión</button>`;
    const {data:admin,error}=await sb.rpc('eltorga_comments_is_admin');
    if(error)eltAdminInfo('Primero ejecuta SUPABASE_COMENTARIOS_v0.2.6.sql. '+error.message);
    else if(admin)eltAdminInfo('Cuenta autorizada para moderar comentarios.');
    else eltAdminInfo('Sesión de GitHub conectada, pero esta cuenta todavía NO está autorizada. Ejecuta el SQL de autorización de moderador.');
  }catch(e){eltAdminInfo(e.message||'No se pudo consultar tu sesión.');}
}
let eltModerationRows=[];
async function eltLoadModeration(){
  const sb=eltAdminClient(),el=$('elt-admin-comments');if(!sb||!el)return;
  eltAdminInfo('Consultando comentarios…');el.textContent='Cargando…';
  try{
    const {data,error}=await sb.rpc('eltorga_comments_admin_list',{p_limit:200});if(error)throw error;
    eltModerationRows=Array.isArray(data)?data:[];
    eltAdminInfo('Moderación actualizada desde Supabase. Se muestran los últimos '+eltModerationRows.length+' comentarios.');
    eltFilterCommentRows();
  }catch(e){el.textContent='Acceso no autorizado o SQL pendiente. '+(e.message||e);eltAdminInfo('Comprueba que iniciaste sesión con la cuenta GitHub autorizada.');}
}
function eltFilterCommentRows(){
  const el=$('elt-admin-comments');if(!el)return;
  const term=($('elt-admin-search')?.value||'').toLowerCase();
  const titleMap=new Map(DB.posts.map(p=>[String(p.ID),p.TITULO]));
  const list=eltModerationRows.filter(c=>(c.author_name+' '+c.body+' '+(titleMap.get(c.post_id)||c.post_id)).toLowerCase().includes(term));
  el.innerHTML=list.map(c=>`<div class="elt-admin-comment-row">
    <div><b>${esc(c.author_name)}</b> <small>${c.is_github?'GitHub':'Invitado'} · ${esc(c.status)} ${c.featured?'· DESTACADO':''}</small>
    <p class="muted">${esc(titleMap.get(c.post_id)||c.post_id)} · ${new Date(c.created_at).toLocaleString('es')}</p>
    <div style="white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0">${esc(c.body)}</div>
    <div class="bar"><button onclick="eltModerate('${esc(c.id)}','${c.status==='hidden'?'publish':'hide'}')">${c.status==='hidden'?'Publicar':'Ocultar'}</button>
    <button onclick="eltModerate('${esc(c.id)}','${c.featured?'unfeature':'feature'}')">${c.featured?'Quitar destacado':'Destacar respuesta'}</button>
    <button class="danger" onclick="eltModerate('${esc(c.id)}','delete')">Eliminar</button></div></div></div>`).join('')||'<p class="muted">No hay comentarios para mostrar.</p>';
}
async function eltModerate(id,action){
  if(action==='delete'&&!confirm('¿Eliminar permanentemente el contenido de este comentario?'))return;
  const sb=eltAdminClient();if(!sb)return;
  const {data,error}=await sb.rpc('eltorga_comments_moderate',{p_id:id,p_action:action});
  if(error)return eltAdminInfo('Error: '+error.message);
  if(!data)return eltAdminInfo('No se encontró el comentario.');
  await eltLoadModeration();
}
// Completa automáticamente el retorno OAuth al administrador aunque abra primero Publicaciones.
window.addEventListener('load',()=>setTimeout(()=>{if(DB.config?.points?.url)eltAdminClient();},700));
