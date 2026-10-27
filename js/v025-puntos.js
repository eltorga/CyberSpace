/* Eltorga Foro 0.2.5 — puntos compartidos en Supabase; usa IDs permanentes del JSON. */
(function () {
  'use strict';
  let client=null, clientSignature='';
  let renderToken=0;
  function cfg(){return window.siteConfig?.points || (typeof siteConfig !== 'undefined' ? siteConfig.points : null) || {};}
  function getClient(){
    if(window.EltorgaBackend?.client)return window.EltorgaBackend.client();
    const p=cfg();
    if(!p.url || !p.publishableKey || !/^https:\/\/[^/]+\.supabase\.co$/.test(p.url))return null;
    if(!window.supabase?.createClient)return null;
    const sig=p.url+'|'+p.publishableKey;
    if(!client || sig!==clientSignature){
      client=window.supabase.createClient(p.url,p.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      clientSignature=sig;
    }
    return client;
  }
  function slot(){return document.getElementById('elt-points-slot');}
  function aviso(txt,kind){const el=document.getElementById('elt-points-status');if(!el)return;el.textContent=txt||'';el.classList.toggle('error',kind==='error');}
  function paint(data){
    const total=document.getElementById('elt-points-total');
    const voters=document.getElementById('elt-points-voters');
    const rating=document.getElementById('elt-points-rating');
    if(total)total.textContent=Number(data?.total||0).toLocaleString('es');
    if(voters)voters.textContent=Number(data?.voters||0).toLocaleString('es');
    if(rating){const n=Number(data?.voters||0);const points=Number(data?.total||0);rating.textContent=n?Math.min(100,Math.max(0,Math.round(points/n/10*100)))+'%':'0%';}
    const already=Number(data?.my_points||0);
    document.querySelectorAll('.elt-point-btn').forEach(btn=>{
      btn.disabled=!!already;
      btn.classList.toggle('my-vote',already===Number(btn.dataset.value));
      btn.title=already?'Ya otorgaste '+already+' puntos a esta publicación':'Otorgar '+btn.dataset.value+' puntos';
    });
    if(already)aviso('Ya otorgaste +'+already+' puntos a esta publicación.');
    else aviso('Puedes votar una sola vez por publicación.');
  }
  async function refresh(postID, token){
    const sb=getClient();
    if(!sb){aviso('Configura Supabase desde ADMIN.bat → Puntos.','error');return;}
    const {data,error}=await sb.rpc('eltorga_points_get',{p_post_id:postID});
    if(token!==renderToken||slot()?.dataset.postId!==postID)return;
    if(error){aviso('No se pudieron cargar los puntos. Comprueba que ejecutaste SUPABASE_PUNTOS.sql.','error');return;}
    paint(data||{});
  }
  async function vote(postID,amount,token){
    const sb=getClient();
    if(!sb)return;
    if(!Number.isInteger(amount)||amount<1||amount>10)return;
    const btns=[...document.querySelectorAll('.elt-point-btn')];
    if(btns.some(b=>b.dataset.busy==='yes'||b.classList.contains('my-vote')))return;
    btns.forEach(b=>{b.disabled=true;b.dataset.busy='yes'});
    aviso('Guardando tus puntos…');
    try{
      const {data:{session},error:sessionError}=await sb.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session){const res=await sb.auth.signInAnonymously();if(res.error)throw res.error;}
      const {error}=await sb.rpc('eltorga_points_vote',{p_post_id:postID,p_points:amount});
      if(error)throw error;
      if(token!==renderToken||slot()?.dataset.postId!==postID)return;
      await refresh(postID,token);
    }catch(err){
      if(token!==renderToken||slot()?.dataset.postId!==postID)return;
      const duplicate=err.code==='23505'||/ya diste|duplicate|already/i.test(err.message||'');
      aviso(duplicate?'Ya habías votado en esta publicación.':(err.message||'No se pudo guardar tu voto.'),'error');
      if(duplicate)await refresh(postID,token);
      else btns.forEach(b=>{b.disabled=false;b.dataset.busy='no'});
    }finally{btns.forEach(b=>b.dataset.busy='no');}
  }
  function montar(post){
    renderToken++;
    const current=renderToken, panel=document.getElementById('elt-points-section');
    if(!panel)return;
    if(cfg().enabled===false){panel.style.display='none';return;}
    panel.style.display='';
    const mount=slot();if(!mount)return;
    const id=String(post.ID||'');
    if(!id){mount.textContent='Esta publicación no tiene un identificador permanente.';return;}
    mount.dataset.postId=id;
    mount.innerHTML='<div class="elt-points-body">'+
      '<div class="elt-points-coin" title="Puntos"><i class="ri-bard-fill" aria-hidden="true"></i></div>'+
      '<div class="elt-points-buttons" role="group" aria-label="Otorgar de uno a diez puntos">'+
      Array.from({length:10},(_,i)=>'<button type="button" class="elt-point-btn" data-value="'+(i+1)+'" aria-label="Otorgar '+(i+1)+' puntos">+'+(i+1)+'</button>').join('')+
      '</div><div class="elt-eng-stats"><div class="elt-eng-stat elt-points-count" aria-label="Puntos acumulados"><strong id="elt-points-total">—</strong><small>PUNTOS</small></div><div class="elt-eng-stat" aria-label="Cantidad de votos"><strong id="elt-points-voters">—</strong><small>VOTOS</small></div><div class="elt-eng-stat" aria-label="Promedio normalizado"><strong id="elt-points-rating">—</strong><small>RANKING</small></div><div class="elt-eng-stat elt294-stat-after-divider" aria-label="Visitas"><strong id="elt-eng-visits">—</strong><small>VISITAS</small></div><button type="button" class="elt-eng-stat" id="elt-eng-bookmark" title="Añadir a favoritos"><strong id="elt-eng-favorites">—</strong><small>FAVORITOS</small></button></div></div>'+
      '<p id="elt-points-status" class="elt-points-status" role="status" aria-live="polite">Consultando puntuación…</p><p id="elt-eng-hint" role="status" aria-live="polite"></p>';
    mount.querySelectorAll('.elt-point-btn').forEach(b=>b.addEventListener('click',()=>vote(id,Number(b.dataset.value),current)));
    refresh(id,current);
    window.EltorgaEngagement?.montar(post);
  }
  window.EltorgaPuntos={montar};
})();
