/* Eltorga Foro v0.2.9.5 — perfil único a partir de data/config.json. */
(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validIcon=x=>/^ri-[a-z0-9-]+$/.test(x||'')?x:'ri-user-star-line';
  const hex=(x,fallback='#ffffff')=>/^#[a-f0-9]{6}$/i.test(x||'')?x:fallback;
  const asset=x=>String(x||'').replace(/^(?!https?:|data:|\/)/,'').replace(/^\/+/, '');
  function cssBg(r){
    const c1=hex(r.c1,'#294861'),c2=hex(r.c2,c1),invert=!!r.invert;
    if(r.mode==='radial')return `radial-gradient(circle, ${invert?c2:c1}, ${invert?c1:c2})`;
    if(r.mode==='linear')return `linear-gradient(${invert?270:90}deg, ${c1}, ${c2})`;
    return c1;
  }
  // Esta función se llama cada vez que se abre una publicación (SPA).
  const oldApply=window.applyAdminProfile;
  window.applyAdminProfile=function(){
    if(typeof oldApply==='function')oldApply();
    const p=typeof siteConfig!=='undefined'?(siteConfig.profile||{}):{};
    document.querySelectorAll('.post-sidebar').forEach(side=>{
      const name=side.querySelector('.author-name');if(name)name.textContent=p.name||'eltorga';
      const avatar=side.querySelector('.author-avatar');
      if(avatar){const src=p.avatar||siteConfig.avatar;if(src){avatar.src=asset(src);avatar.style.display='block';}else avatar.style.display='none';}
      const rawRoles=Array.isArray(p.roles)?p.roles:[];
      if(rawRoles.length){
        side.querySelectorAll('.elt28-public-roles').forEach(el=>el.remove());
        side.querySelectorAll('.badge-admin,.badge-dev').forEach(el=>el.style.display='none');
        const box=document.createElement('div');box.className='elt28-public-roles elt295-roles';
        for(const r of rawRoles){
          const badge=document.createElement('span');badge.className='elt28-public-role';
          badge.style.background=cssBg(r);badge.style.color=hex(r.textColor,'#ffffff');
          if(r.image){const img=document.createElement('img');img.src=asset(r.image);img.alt='';badge.append(img)}
          else{const i=document.createElement('i');i.className=validIcon(r.icon);badge.append(i)}
          badge.append(document.createTextNode(String(r.name||'Cargo')));box.append(badge);
        }
        side.querySelector('.author-stars')?.before(box);
      }
      if(Array.isArray(p.stats)&&p.stats.length){
        const stats=side.querySelector('.author-stats');
        if(stats){stats.replaceChildren();for(const s of p.stats){
          const row=document.createElement('div');row.className='author-stats-row';
          const label=document.createElement('span'),i=document.createElement('i');i.className=validIcon(s.icon);
          label.append(i,document.createTextNode(' '+String(s.label||'')));
          const value=document.createElement('span');value.textContent=String(s.value??'');
          row.append(label,value);stats.append(row);
        }}
      }
      const badges=side.querySelector('.badges-grid');
      if(badges&&Array.isArray(p.achievements)){
        badges.replaceChildren();
        for(let j=0;j<9;j++){
          const obj=p.achievements[j]||{};
          const item=document.createElement('span');item.title=String(obj.name||'Logro '+(j+1));
          if(obj.image){const img=document.createElement('img');img.src=asset(obj.image);img.alt=item.title;item.append(img)}
          else{const i=document.createElement('i');i.className='ri-medal-line';item.append(i)}
          badges.append(item);
        }
      }
    });
    document.querySelectorAll('.related-author-name').forEach(el=>el.textContent=p.name||'eltorga');
    document.querySelectorAll('.related-author-img').forEach(el=>{if(el.tagName==='IMG'&&(p.avatar||siteConfig.avatar))el.src=asset(p.avatar||siteConfig.avatar)});
  };
})();
