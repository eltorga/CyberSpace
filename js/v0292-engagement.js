/* Eltorga 0.2.9.2: visitas diarias y clics en favoritos. No guarda marcadores reales. */
(() => {
 'use strict';
 let token=0;
 const count=id=>document.getElementById(id);
 const client=()=>window.EltorgaBackend?.client?.() || null;
 const fmt=v=>Number(v||0).toLocaleString('es');
 function paint(data){
   if(count('elt-eng-visits'))count('elt-eng-visits').textContent=fmt(data?.visits);
   if(count('elt-eng-favorites'))count('elt-eng-favorites').textContent=fmt(data?.favorites);
   const button=count('elt-eng-bookmark');if(button)button.classList.toggle('elt-eng-selected',!!data?.is_favorite);
 }
 async function login(sb){
   const {data,error}=await sb.auth.getSession();if(error)throw error;
   if(!data?.session){const result=await sb.auth.signInAnonymously();if(result.error)throw result.error;}
 }
 async function rpc(sb,name,id){const r=await sb.rpc(name,{p_post_id:id});if(r.error)throw r.error;return r.data;}
 function info(s){const el=count('elt-eng-hint');if(el)el.textContent=s;}
 async function mount(post){
   const id=String(post?.ID||'');const current=++token;
   if(!id)return;
   const sb=client();if(!sb){info('Sin conexión a Supabase');return;}
   try{
     paint(await rpc(sb,'eltorga_engagement_get',id));
     await login(sb);
     const data=await rpc(sb,'eltorga_engagement_visit',id);
     if(current!==token)return;
     paint(data);
   }catch(err){if(current===token){console.warn('Eltorga visitas:',err.message);info('Visitas pendientes de configuración SQL.');}}
   const button=count('elt-eng-bookmark');if(!button)return;
   button.onclick=async()=>{
     if(button.disabled)return;button.disabled=true;
     try{
       await login(sb);
       const data=await rpc(sb,'eltorga_engagement_favorite',id);
       if(current!==token)return;
       paint(data);
       info('');
     }catch(err){info('No se pudo registrar el favorito. '+(err.message||''));}
     finally{button.disabled=false;}
   };
 }
 window.EltorgaEngagement={montar:mount};
})();
