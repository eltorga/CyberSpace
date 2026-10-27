/* Eltorga v0.2.9.3: perfil y subforos anidados, compatible con IDs actuales. */
(() => {
 'use strict';
 const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 // El JSON de foros conserva todos los padres en SUBFORO_PARENT.
 let parents=[];
 const origProcess=procesarDatos;
 procesarDatos=function(struct,posts){parents=struct.filter(x=>x.SUBFORO&&x.SUBFORO_PARENT).map(x=>({foro:x.FORO,sub:x.SUBFORO,parent:x.SUBFORO_PARENT}));return origProcess(struct,posts)};
 const oldForum=renderForoView;
 renderForoView=function(container,forum,tag){oldForum(container,forum,tag);const hidden=parents.filter(x=>x.foro===forum).map(x=>x.sub);if(!hidden.length)return;container.querySelectorAll('.forum-row').forEach(row=>{const hash=row.getAttribute('onclick')||'';if(hidden.some(sub=>hash.includes(encodeURIComponent(sub))))row.remove()})};
 const oldSub=renderSubforoView;
 renderSubforoView=function(container,forum,sub,tag){oldSub(container,forum,sub,tag);const children=parents.filter(x=>x.foro===forum&&x.parent===sub);if(!children.length)return;let section=document.createElement('div');section.className='forum-section elt293-child-forums';let html='<div class="shared-header-style forum-section-header"><i class="ri-folder-tree-line"></i> SUBFOROS DE '+esc(sub)+'</div>';
 children.forEach(child=>{const info=Object.values(foroData).map(c=>c.foros[forum]?.subforos[child.sub]).find(Boolean);const count=info?.posts?.length||0;html+=`<a class="elt293-child-forum" href="#subforo/${encodeURIComponent(forum)}/${encodeURIComponent(child.sub)}"><i class="ri-folder-open-line"></i><span><strong>${esc(child.sub)}</strong><small>${esc(info?.res||'')}</small></span><em>${count} posts</em><i class="ri-arrow-right-s-line"></i></a>`});section.innerHTML=html;container.prepend(section)};
 const previousApply=applyAdminProfile;
 applyAdminProfile=function(){previousApply();const p=siteConfig.profile||{};if(!Array.isArray(p.stats)||!p.stats.length)return;document.querySelectorAll('.post-sidebar .author-stats').forEach(box=>{box.innerHTML=p.stats.map(s=>{const i=/^ri-[a-z0-9-]+$/.test(s.icon||'')?s.icon:'ri-bar-chart-line';return `<div class="author-stats-row"><span><i class="${i}"></i> ${esc(s.label)}</span><span>${esc(s.value)}</span></div>`}).join('')})};
})();
