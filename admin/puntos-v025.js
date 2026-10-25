/* Eltorga 0.2.5 — pestaña Puntos en el administrador ORIGINAL v0.2.4. */
(() => {
  'use strict';
  const nav=document.querySelector('nav button[data-tab="giscus"]');
  if(nav){
    const btn=document.createElement('button');
    btn.dataset.tab='points';
    btn.innerHTML='<i class="ri-copper-coin-line"></i> Puntos';
    btn.onclick=()=>show('points');
    nav.insertAdjacentElement('afterend',btn);
  }
  const originalShow=show;
  show=function(tabName){
    if(tabName!=='points')return originalShow(tabName);
    tab='points';editing=-1;
    document.querySelectorAll('nav button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='points'));
    $('heading').textContent='Puntos de las publicaciones';
    renderPointsSettings();
  };
})();

function renderPointsSettings(){
  const c=DB.config.points||{};
  $('content').innerHTML=`
    <article>
      <h2><i class="ri-copper-coin-line"></i> Sistema de puntos</h2>
      <p class="hint">De +1 a +10, diez botones individuales, un voto por identidad Supabase y publicación. El contador se almacena en línea y se actualiza sin exportar a GitHub.</p>
      <label style="display:flex;align-items:center;gap:9px;max-width:450px;margin:16px 0"><input id="pointsEnabled" type="checkbox" style="width:auto;margin:0" ${c.enabled!==false?'checked':''}> Activar puntos en todas las publicaciones</label>
      <div class="cols"><label>Project URL de Supabase<input id="pointsUrl" value="${esc(c.url||'')}" placeholder="https://xxxx.supabase.co"></label>
      <label>Publishable Key (pública)<input id="pointsKey" value="${esc(c.publishableKey||'')}" placeholder="sb_publishable_..."></label></div>
      <p class="hint">La Publishable Key es pública. Nunca utilices aquí Secret Key, service_role ni la contraseña de la base de datos.</p>
      <div class="bar"><button class="primary" onclick="savePointsSettings()"><i class="ri-save-line"></i> Guardar configuración</button><button onclick="checkPointsDatabase()"><i class="ri-refresh-line"></i> Consultar puntos</button></div>
      <div id="points-check" style="margin-top:14px" class="hint">Comprueba que has activado Anonymous Sign-Ins y ejecutado el SQL de esta versión.</div>
    </article>
    <article>
      <h2>Vista previa de la barra de puntos</h2>
      <div class="elt-admin-points-preview">
        <div class="elt-admin-coin"><i class="ri-copper-coin-line" aria-hidden="true"></i></div>
        <div class="elt-admin-buttons">${Array.from({length:10},(_,i)=>`<span>+${i+1}</span>`).join('')}</div>
        <div class="elt-admin-total"><strong>248</strong><small>PUNTOS</small></div>
      </div>
      <p class="hint">Moneda a la izquierda, +1 a +10 en una sola fila y total a la derecha. En móviles los botones se desplazan horizontalmente sin formar otra fila.</p>
    </article>
    <article><h2>Publicaciones con más puntos</h2><div id="points-ranking" class="list"><small class="muted">Pulsa «Consultar puntos» para cargar los totales desde Supabase.</small></div></article>
  `;
}

async function savePointsSettings(){
  const url=$('pointsUrl').value.trim().replace(/\/$/,'');
  const key=$('pointsKey').value.trim();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))return alert('Introduce una URL de proyecto válida, https://xxxx.supabase.co');
  if(!key.startsWith('sb_publishable_'))return alert('Utiliza solo tu Publishable Key: sb_publishable_...');
  DB.config.points={...DB.config.points,enabled:$('pointsEnabled').checked,url,publishableKey:key};
  await save('config');
  $('points-check').textContent='Configuración guardada en data/config.json. Publica los archivos en GitHub Pages cuando quieras aplicar el cambio a los visitantes.';
}

async function checkPointsDatabase(){
  const check=$('points-check'),ranking=$('points-ranking');
  check.textContent='Consultando Supabase…';
  ranking.textContent='Cargando resultados…';
  const points=DB.config.points||{};
  if(!window.supabase?.createClient){check.textContent='No se pudo cargar la librería Supabase. Comprueba tu conexión a Internet.';ranking.textContent='';return;}
  if(!points.url||!points.publishableKey){check.textContent='Guarda primero la URL y la Publishable Key.';ranking.textContent='';return;}
  try{
    const sb=window.supabase.createClient(points.url,points.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await sb.rpc('eltorga_points_ranking');
    if(error)throw error;
    check.textContent='Conexión operativa. Los totales se obtienen de Supabase y no se almacenan en el JSON local.';
    if(!Array.isArray(data)||!data.length){ranking.textContent='Todavía no hay votos registrados.';return;}
    const titles=new Map(DB.posts.map(p=>[String(p.ID),p.TITULO]));
    ranking.innerHTML=data.map((x,i)=>`<div class="tree-line"><strong>#${i+1}</strong><span style="min-width:0;overflow-wrap:anywhere">${esc(titles.get(String(x.post_id))||x.post_id)}</span><strong style="color:#f0c66a">${Number(x.total||0)} puntos</strong><small>${Number(x.voters||0)} votos</small></div>`).join('');
  }catch(error){
    check.textContent='No se pudo consultar Supabase: '+(error.message||error)+' — Verifica la URL, la clave y el archivo SUPABASE_PUNTOS.sql.';
    ranking.textContent='';
  }
}
