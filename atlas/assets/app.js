/* Atlas · Biblioteca visual
   100 % estático en GitHub Pages; API local opcional para administrar carpetas.
   Sin dependencias externas, sin cuentas y sin telemetría.
*/
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const collator = new Intl.Collator('es', {numeric:true, sensitivity:'base'});
  const sortByTitle = (a,b) => collator.compare(a.title,b.title);
  const letters = [...'ABCDEFGHIJKLMN', 'Ñ', ...'OPQRSTUVWXYZ'];
  // Los nombres inexistentes no se muestran en el selector: la comprobación se hace
  // sobre las reglas ::before del CSS de Uicons realmente cargado en el navegador.
  const ICON_CANDIDATES = (window.ATLAS_UICONS || ['books','book','heart','pencil']);
  const checkedIcons = new Map();
  function hasUicon(name){
    if(checkedIcons.has(name))return checkedIcons.get(name);
    if(!/^[a-z0-9-]+$/.test(name))return false;
    const probe=document.createElement('i');probe.className='fi fi-rr-'+name;
    probe.style.cssText='position:absolute;pointer-events:none;visibility:hidden;left:-9999px';
    document.body.appendChild(probe);
    const content=getComputedStyle(probe,'::before').content;
    probe.remove();
    const exists=!!content && !['none','normal','\"\"',"''"].includes(content);
    checkedIcons.set(name,exists);return exists;
  }
  const ICON_BANK = ICON_CANDIDATES.filter(hasUicon).map(key=>[key,key.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())]);
  function iconHTML(name, cls=''){
    let chosen=hasUicon(name)?name:({ 'list-ol':'list','align-right':'align-left','book-open-reader':'book','image':'picture' }[name]||'book');
    if(!hasUicon(chosen)) chosen=hasUicon('book')?'book':'home';
    const mirrored=name==='align-right' && chosen==='align-left'?' mirror-x':'';
    return `<i class="fi fi-rr-${e(chosen)} ${e(cls)}${mirrored}" aria-hidden="true"></i>`;
  }
  const ix = (name,label) => iconHTML(name)+' '+label;
  const swatches = [
    {bg:'#e6efea',ink:'#6d9581',book:'#3b6254'},
    {bg:'#f4ebdf',ink:'#bd9b6f',book:'#ac7c55'},
    {bg:'#e7edf2',ink:'#92a6b8',book:'#476782'},
    {bg:'#f0e9ed',ink:'#b892ad',book:'#735e78'},
    {bg:'#f1eee0',ink:'#b3a479',book:'#757953'},
    {bg:'#e9eae7',ink:'#9ba9a4',book:'#525f62'}
  ];
  const safeGet = (key, fallback) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}};
  const safeSet = (key, val) => {try{localStorage.setItem(key,JSON.stringify(val))}catch{}};
  const state = {
    catalog:{collections:[],books:[],stats:{collections:0,books:0,pages:0}},
    admin:false, query:'', letter:'TODAS', zoom:1,
    mode:safeGet('atlas.readerMode','double'),
    favorites:new Set(safeGet('atlas.favorites',[])),
    fileTarget:null,
  };
  const main = $('#main-content');
  let toastTimer;
  let pdfBusy = false;

  function toast(message, isError=false) {
    const node = $('#toast'); node.textContent = message; node.classList.toggle('error',isError); node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>node.classList.remove('show'),4300);
  }
  function palettes(id){let hash=0;for(let i=0;i<id.length;i++) hash=(hash*31+id.charCodeAt(i))|0; return swatches[Math.abs(hash)%swatches.length]}
  function url(path){return path ? new URL(path,location.href).href : ''}
  function route(){const p=decodeURIComponent(location.hash.slice(2)||'inicio').split('/'); return {type:p[0]||'inicio',id:p[1],index:Number.parseInt(p[2]||'0',10)||0}}
  function go(path){if(location.hash==='#/'+path){render()}else{location.hash='#/'+path}}
  function c(id){return state.catalog.collections.find(item=>item.id===id)}
  function b(id){return state.catalog.books.find(item=>item.id===id)}
  function parents(id){const list=[];let node=c(id);let steps=0;while(node && steps++<15){list.unshift(node);node=c(node.parentId)}return list}
  function descendants(id){const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const x of state.catalog.collections){if(x.parentId && ids.has(x.parentId) && !ids.has(x.id)){ids.add(x.id);changed=true}}}return ids}
  function sortBooks(items){return items.slice().sort((a,b)=>{const ao=Number.isFinite(a.sortOrder)?a.sortOrder:null,bo=Number.isFinite(b.sortOrder)?b.sortOrder:null;if(ao!==null||bo!==null){const av=ao===null?Number.MAX_SAFE_INTEGER:ao,bv=bo===null?Number.MAX_SAFE_INTEGER:bo;if(av!==bv)return av-bv}return sortByTitle(a,b)})}
  function sortLibraryBooks(items){return items.slice().sort((a,b)=>{const ao=Number.isFinite(a.libraryOrder)?a.libraryOrder:null,bo=Number.isFinite(b.libraryOrder)?b.libraryOrder:null;if(ao!==null||bo!==null){const av=ao===null?Number.MAX_SAFE_INTEGER:ao,bv=bo===null?Number.MAX_SAFE_INTEGER:bo;if(av!==bv)return av-bv}return sortByTitle(a,b)})}
  function sortCollections(items){return items.slice().sort((a,b)=>{const ao=Number.isFinite(a.sortOrder)?a.sortOrder:null,bo=Number.isFinite(b.sortOrder)?b.sortOrder:null;if(ao!==null||bo!==null){const av=ao===null?Number.MAX_SAFE_INTEGER:ao,bv=bo===null?Number.MAX_SAFE_INTEGER:bo;if(av!==bv)return av-bv}return sortByTitle(a,b)})}
  function booksIn(id, recursive=false){return sortBooks(state.catalog.books.filter(book=>book.collectionId===id || (recursive && descendants(id).has(book.collectionId))))}
  function getAllPages(){return sortLibraryBooks(state.catalog.books).flatMap(book=>book.pages.map(page=>({page,book})))}
  function formatCount(n,singular,plural){return `${n} ${n===1?singular:plural}`}
  function setTopBreadcrumb(parts){$('#breadcrumb-top').innerHTML=`<span>Biblioteca personal</span><span class="crumb-slash">/</span><strong>${e(parts)}</strong>`}
  function closeMobile(){ $('#sidebar').classList.remove('mobile-open'); $('#sidebar-shade').hidden=true; }

  async function refreshCatalog() {
    const result=await fetch(`catalogo.json?v=${Date.now()}`,{cache:'no-store'});
    if(!result.ok) throw new Error('No se encuentra catalogo.json. Inicia con: python tools/server.py');
    const catalog=await result.json();
    if(!Array.isArray(catalog.collections)||!Array.isArray(catalog.books)) throw new Error('Catálogo inválido');
    state.catalog=catalog;
    renderSidebar();render();
  }
  function renderSidebar(){
    const groups=sortCollections(state.catalog.collections.filter(x=>!x.parentId));
    const nav=$('#collections-nav');
    nav.innerHTML=groups.length ? groups.map(x=>`<a href="#/coleccion/${x.id}" class="nav-link ${state.admin?'sidebar-sortable-item':''}" data-collection-link="${e(x.id)}" data-collection-id="${e(x.id)}" ${state.admin?'draggable="true" title="Arrastra para ordenar"':''}><span class="sidebar-collection-icon" style="color:${palettes(x.id).ink}">${iconHTML(x.icon)}</span><span>${e(x.title)}</span></a>`).join('') : '<span class="sidebar-empty">Aún no hay colecciones</span>';
    if($('#sidebar-add-collection'))$('#sidebar-add-collection').hidden=!state.admin;
    if($('#sidebar-settings'))$('#sidebar-settings').hidden=!state.admin;
    $('#header-avatar').title=state.admin?'Cambiar imagen de perfil':'Imagen de perfil';
    $('#header-avatar').disabled=!state.admin;
    $('#avatar-image').src=url(state.catalog.settings?.avatar || 'assets/avatar.svg') + (state.admin?'?v='+encodeURIComponent(state.catalog.generatedAt||''):'');
    if($('#sync-label'))$('#sync-label').textContent=state.admin?'Editor local':'Biblioteca pública';
    if(state.admin) enableSidebarCollectionSorting();
  }
  function updateNav(r){
    document.querySelectorAll('[data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===r.type || (r.type==='coleccion'&&n.dataset.nav==='colecciones')));
    document.querySelectorAll('[data-collection-link]').forEach(n=>n.classList.toggle('active',n.dataset.collectionLink===r.id));
  }
  function actions(arr=[]){return arr.filter(Boolean).join('')}
  function button(text, action, args={}, variant='secondary', cls=''){
    const attrs=Object.entries(args).map(([k,v])=>`data-${e(k)}="${e(v)}"`).join(' ');
    return `<button type="button" class="button ${variant} ${cls}" data-action="${e(action)}" ${attrs}>${text}</button>`;
  }
  function heading(label,title,sub,buttons=''){
    return `<div class="content-heading"><div><div class="eyebrow">${e(label)}</div><h1 class="heading-title">${e(title)}</h1>${sub?`<p class="heading-sub">${e(sub)}</p>`:''}</div><div class="heading-right">${buttons}</div></div>`;
  }
  function cover(book, className=''){
    const colors=palettes(book.id);
    return `<div class="book-cover ${book.cover?'':'no-image'} ${className}" style="--book-bg:${colors.book}">${book.cover?`<img src="${e(url(book.cover))}" alt="Portada de ${e(book.title)}" loading="lazy">`:`<span class="cover-flourish">${iconHTML('book')}</span><span class="cover-rule"></span><span class="cover-title">${e(book.title)}</span><span class="cover-rule"></span><span class="cover-foot">ATLAS · BIBLIOTECA</span>`}</div>`;
  }
  function collectionCard(collection){
    const colors=palettes(collection.id);const total=booksIn(collection.id,true).length;
    const visual=`<a class="collection-card" href="#/coleccion/${collection.id}"><div class="collection-illustration" style="--card-background:${colors.bg};--card-color:${colors.ink}">${collection.cover?`<img src="${e(url(collection.cover))}" loading="lazy" alt="Portada ${e(collection.title)}">`:`<span class="collection-glyph">${iconHTML(collection.icon)}</span>`}</div><div class="collection-info"><span class="collection-type">COLECCIÓN</span><span class="collection-name">${e(collection.title)}</span><span class="collection-count">${formatCount(total,'libro','libros')} · explorar ${iconHTML('arrow-right')}</span></div></a>`;
    return `<div class="collection-card-wrap">${visual}${state.admin?`<button class="collection-card-edit" type="button" data-action="edit-meta" data-kind="collection" data-id="${e(collection.id)}" title="Editar colección" aria-label="Editar colección ${e(collection.title)}">${iconHTML('pencil')}</button>`:''}</div>`;
  }
  function bookCard(book,sortable=false){
    return `<article class="book-card ${sortable&&state.admin?'book-card-sortable':''}" data-book-id="${e(book.id)}" ${sortable&&state.admin?'draggable="true" title="Arrastra para cambiar el orden"':''}><a href="#/libro/${book.id}" class="book-link">${cover(book)}<div class="book-title">${e(book.title)}</div></a>${state.admin?`<button type="button" class="book-more" data-action="edit-meta" data-kind="book" data-id="${e(book.id)}" title="Editar libro">${iconHTML('pencil')}</button>`:''}</article>`;
  }
  function pageCard(item){
    const {page,book}=item; const fav=state.favorites.has(page.id);
    return `<article class="page-card"><a href="#/leer/${book.id}/${page.index}" class="page-thumbnail"><img src="${e(url(page.src))}" alt="${e(page.title)}" loading="lazy"></a>${state.admin?`<button class="page-edit-toggle" type="button" data-action="edit-page" data-book="${e(book.id)}" data-page="${e(page.id)}" aria-label="Editar ficha ${e(page.title)}" title="Editar ficha">${iconHTML('pencil')}</button>`:''}<button aria-label="${fav?'Quitar de favoritos':'Añadir a favoritos'}" title="${fav?'Quitar de favoritos':'Añadir a favoritos'}" class="favorite-toggle ${fav?'is-fav':''}" type="button" data-action="favorite" data-page="${e(page.id)}">${iconHTML('heart')}</button>${page.notes?`<button type="button" class="page-note-toggle" title="Ver notas" aria-label="Ver notas de ${e(page.title)}" data-action="view-notes" data-book="${e(book.id)}" data-page="${e(page.id)}">${iconHTML('book')}</button>`:''}<div class="page-title" title="${e(page.title)}">${e(page.title)}</div></article>`;
  }
  function pageGroups(items){
    const sections=[];let cur='';let acc=[];
    for(const item of items){const letter=alphabet(item.page.title);if(cur!==letter){if(acc.length)sections.push({letter:cur,items:acc});cur=letter;acc=[]}acc.push(item)}
    if(acc.length)sections.push({letter:cur,items:acc});
    return sections.map(group=>`<section><h2 class="letter-section">${e(group.letter)}</h2><div class="pages-grid">${group.items.map(item=>pageCard(item,true)).join('')}</div></section>`).join('');
  }
  function alphabet(str){const v=String(str||'').trim().charAt(0).toLocaleUpperCase('es'); return letters.includes(v)?v:'#'}
  function alphaBar(){return `<div class="alpha-wrap" aria-label="Filtrar por letra">${['TODAS',...letters].map(l=>`<button class="alpha-button ${state.letter===l?'active':''}" type="button" data-action="letter" data-letter="${e(l)}" title="${l==='TODAS'?'Mostrar todas':l}">${l==='TODAS'?'Todo':l}</button>`).join('')}</div>`}
  function empty(title,description,action=''){return `<div class="muted-panel"><div class="empty-icon">${iconHTML('books')}</div><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`}
  function pathLine(parts){return `<div class="path-line"><a href="#/inicio">Inicio</a>${parts.map(p=>`<span>${iconHTML('angle-right')}</span>${p.href?`<a href="${e(p.href)}">${e(p.text)}</a>`:`<strong>${e(p.text)}</strong>`}`).join('')}</div>`}
  function bookGrid(items,sortable=false){return items.length?`<div class="book-grid ${sortable&&state.admin?'sortable-book-grid':''}">${items.map(book=>bookCard(book,sortable)).join('')}</div>`:empty('Todavía no hay libros','Crea un libro y agrega una carpeta de imágenes para verlo aquí.',state.admin?button(ix('plus','Nuevo libro'),'new-book',{},'primary'):'')}

  function renderHome(){
    setTopBreadcrumb('Inicio');
    const top=sortCollections(state.catalog.collections.filter(x=>!x.parentId));
    const highlighted=state.catalog.books.slice().sort(sortByTitle).slice(0,6);
    main.innerHTML=`<section class="hero"><div class="hero-text"><div class="hero-eyebrow">TU ENCICLOPEDIA PERSONAL</div><h1>Un universo de ideas,<br><em>en tus propias páginas.</em></h1><p>Explora el conocimiento en libros visuales. Organiza, descubre y disfruta cada ficha a tu ritmo.</p></div><div class="hero-books" aria-hidden="true"><div class="hero-book"></div><div class="hero-book"></div><div class="hero-book"></div></div></section>
    <section class="stats-row"><div class="stat-card"><div class="stat-symbol">${iconHTML('folder')}</div><div><div class="stat-value">${state.catalog.stats.collections}</div><div class="stat-name">Colecciones</div></div></div><div class="stat-card"><div class="stat-symbol">${iconHTML('books')}</div><div><div class="stat-value">${state.catalog.stats.books}</div><div class="stat-name">Libros</div></div></div><div class="stat-card"><div class="stat-symbol">${iconHTML('grid')}</div><div><div class="stat-value">${state.catalog.stats.pages}</div><div class="stat-name">Fichas visuales</div></div></div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Explora tus colecciones</h2><p class="section-sub">Cada colección guarda una historia por descubrir.</p></div><a class="inline-link" href="#/biblioteca">Ver biblioteca ${iconHTML('arrow-right')}</a></div>${top.length?`<div class="collection-grid">${top.map(collectionCard).join('')}</div>`:empty('Tu biblioteca comienza aquí','Crea una colección y coloca dentro carpetas con libros.',state.admin?button(ix('plus','Crear colección'),'new-collection',{},'primary'):'')}</section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Libros de la biblioteca</h2><p class="section-sub">Una selección de tus libros, siempre disponibles.</p></div><a class="inline-link" href="#/biblioteca">Ver todos ${iconHTML('arrow-right')}</a></div>${highlighted.length?bookGrid(highlighted):empty('Tus próximos libros aparecerán aquí','Usa el editor local o añade carpetas dentro de biblioteca/.')}</section>`;
  }
  function renderLibrary(){
    setTopBreadcrumb('Mi biblioteca');
    const books=sortLibraryBooks(state.catalog.books.slice());
    main.innerHTML=heading('TODOS TUS LIBROS','Mi biblioteca','Aquí se muestran solo tus libros. Puedes reorganizarlos arrastrando y soltando.', '')+
      `<section class="section"><div class="section-head"><div><h2 class="section-title">Todos los libros</h2><p class="section-sub">${state.admin?'Arrastra las tarjetas para reordenar tu biblioteca.':'Tu biblioteca visual completa.'}</p></div><span class="toolbar-muted">${formatCount(books.length,'libro','libros')}</span></div>${books.length?bookGrid(books,state.admin).replace('sortable-book-grid','sortable-book-grid sortable-library-grid'):empty('Todavía no hay libros','Crea libros dentro de tus colecciones para verlos aquí.')}</section>`;
    if(state.admin && books.length) enableLibraryBookSorting();
  }
  function renderCollections(){
    setTopBreadcrumb('Mis colecciones');
    const roots=sortCollections(state.catalog.collections.filter(x=>!x.parentId));
    main.innerHTML=heading('ORGANIZACIÓN','Mis colecciones','Administra y reordena tus colecciones. La barra lateral seguirá este mismo orden.', state.admin?button(ix('plus','Nueva colección'),'new-collection',{},'primary'):'')+
      `<section class="section"><div class="section-head"><div><h2 class="section-title">Colecciones principales</h2><p class="section-sub">${state.admin?'Arrastra para reordenar las colecciones principales.':'Colecciones disponibles.'}</p></div><span class="toolbar-muted">${formatCount(roots.length,'colección','colecciones')}</span></div>${roots.length?`<div class="collection-grid ${state.admin?'sortable-collection-grid':''}" data-parent-path="biblioteca">${roots.map(collectionCard).join('')}</div>`:empty('Sin colecciones','Crea una colección para empezar.')}</section>`;
    if(state.admin && roots.length) enableCollectionSorting('biblioteca');
  }
  function renderCollection(id){
    const collection=c(id);if(!collection){return notFound()}
    setTopBreadcrumb(collection.title);
    const chain=parents(id);
    const children=sortCollections(state.catalog.collections.filter(x=>x.parentId===id));
    const books=booksIn(id);
    const pagesTotal=booksIn(id,true).reduce((sum,book)=>sum+book.pageCount,0);
    const controls=state.admin?actions([button(ix('plus','Nuevo libro'),'new-book',{collection:id},'primary'),button(ix('plus','Subcolección'),'new-collection',{collection:id}),button(ix('image','Cambiar portada'),'upload-cover',{kind:'collection',id}),button(ix('pencil','Editar'),'edit-meta',{kind:'collection',id},'quiet'),button(ix('trash','Eliminar colección'),'delete-item',{kind:'collection',id},'danger')]):'';
    main.innerHTML=pathLine([{text:'Biblioteca',href:'#/biblioteca'},...chain.map((x,i)=>({text:x.title,href:i===chain.length-1?null:'#/coleccion/'+x.id}))])+
      heading('COLECCIÓN',collection.title,collection.description || `${formatCount(booksIn(id,true).length,'libro','libros')} y ${formatCount(pagesTotal,'ficha','fichas')} en esta colección.`,controls)+
      (children.length?`<section class="section"><div class="section-head"><div><h2 class="section-title">Subcolecciones</h2><p class="section-sub">${state.admin?'Arrastra para cambiar el orden de este nivel.':'Subcolecciones dentro de esta categoría.'}</p></div></div><div class="collection-grid ${state.admin?'sortable-collection-grid':''}" data-parent-path="${e(collection.path)}">${children.map(collectionCard).join('')}</div></section>`:'')+
      `<section class="section"><div class="section-head"><div><h2 class="section-title">Libros</h2><p class="section-sub">${state.admin?'Arrastra las tarjetas para cambiar el orden':'Orden de esta colección'}</p></div><span class="toolbar-muted">${formatCount(books.length,'libro','libros')}</span></div>${books.length?bookGrid(books,state.admin):empty('No hay libros todavía','Crea un libro en esta colección o añade una carpeta con páginas.',state.admin?button(ix('plus','Nuevo libro'),'new-book',{collection:id},'primary'):'')}</section>`;
    if(state.admin && children.length) enableCollectionSorting(collection.path);
    if(state.admin && books.length) enableBookSorting(collection);
  }
  function renderBook(id){
    const book=b(id);if(!book)return notFound();
    setTopBreadcrumb(book.title);
    const chain=book.collectionId?parents(book.collectionId):[];
    const controls=state.admin?actions([button(ix('cloud-upload','Subir imágenes'),'upload-pages',{book:id},'primary'),button(ix('image','Portada'),'upload-cover',{kind:'book',id}),button(ix('pencil','Editar'),'edit-meta',{kind:'book',id},'quiet'),button(ix('trash','Eliminar libro'),'delete-item',{kind:'book',id},'danger')]):'';
    const ordered=book.pages.map(page=>({page,book}));
    main.innerHTML=pathLine([{text:'Biblioteca',href:'#/biblioteca'},...chain.map(x=>({text:x.title,href:'#/coleccion/'+x.id})),{text:book.title}])+
      `<div class="intro-panel"><div class="intro-cover">${cover(book)}</div><div class="intro-body"><div class="eyebrow">LIBRO VISUAL</div><h2>${e(book.title)}</h2><p>${e(book.description || 'Tus fichas ilustradas, conservadas en el orden de incorporación al libro.')}</p><div class="feature-list"><span>${iconHTML('grid')} ${formatCount(book.pageCount,'ficha','fichas')}</span><span>${iconHTML('list')} Orden de incorporación</span><span>${iconHTML('image')} Formato visual</span></div><div class="intro-actions">${button(ix('book-open-reader','Abrir libro'),'read-book',{book:id},'primary',book.pages.length?'':'')}${button(ix('file-pdf','Exportar PDF'),'pdf-book',{book:id})}${controls}</div></div></div>`+
      `<section class="section"><div class="section-head"><h2 class="section-title">Fichas del libro</h2><span class="toolbar-muted">${book.pageCount} en total</span></div>${ordered.length?`<div class="pages-grid">${ordered.map(pageCard).join('')}</div>`:empty('Todavía no hay fichas',book.pageCount===0?'Agrega imágenes en la carpeta paginas/.':'Sube imágenes para empezar el libro.')}</section>`;
    if(!book.pageCount){const read=main.querySelector('[data-action="read-book"]');if(read)read.disabled=true;const pdf=main.querySelector('[data-action="pdf-book"]');if(pdf)pdf.disabled=true;}
  }
  function renderSettings(){
    if(!state.admin){notFound();return}
    setTopBreadcrumb('Configuración');
    main.innerHTML=heading('ATLAS · AJUSTES','Configuración','Gestiona la publicación, tus copias de seguridad y la conservación de imágenes.')+
      `<section class="settings-grid">
        <article class="settings-card settings-card-featured"><div class="settings-card-icon">${iconHTML('cloud-upload')}</div><div class="settings-card-copy"><h2>Publicar en GitHub Pages</h2><p>Genera una versión pública de solo lectura con tus libros, portadas, fichas, notas y adjuntos. Las imágenes originales de tu biblioteca local no se modifican.</p><div class="settings-facts"><span>${iconHTML('shield-check')} Solo lectura</span><span>${iconHTML('image')} Optimización sin pérdida</span></div></div><div class="settings-card-actions">${button(ix('cloud-upload','Exportar a GitHub'),'export-github',{},'primary')}</div></article>
        <article class="settings-card"><div class="settings-card-icon">${iconHTML('download')}</div><div class="settings-card-copy"><h2>Copia de seguridad completa</h2><p>Exporta colecciones, libros, imágenes, portadas, notas, adjuntos, avatar y preferencias a un ZIP que podrás importar en futuras versiones de Atlas.</p><div class="settings-card-actions">${button(ix('file-zip','Exportar copia ZIP'),'backup-export',{},'primary')}<button type="button" class="button secondary" data-action="backup-import">${iconHTML('upload')} Importar copia ZIP</button></div></div><div class="settings-warning"><strong>${iconHTML('triangle-warning')} Atención al restaurar</strong><span>Importar una copia reemplazará toda la biblioteca actual. Atlas creará automáticamente un respaldo de emergencia antes de hacerlo.</span></div></article>
        <article class="settings-card"><div class="settings-card-icon">${iconHTML('compress')}</div><div class="settings-card-copy"><h2>Compresión de imágenes</h2><p>Modo seleccionado: <strong>sin pérdida exacta de calidad</strong>. Atlas recomprime PNG sin alterar los datos de píxeles y puede probar WebP lossless para JPG/PNG si verifica un raster idéntico y un archivo más pequeño. La optimización se aplica a la copia pública, nunca a tus originales.</p><p class="settings-muted">Los JPG que ya están comprimidos pueden reducirse poco sin pérdida. Se prioriza conservar su calidad exacta antes que bajar el peso a cualquier costo.</p></div></article>
        <article class="settings-card"><div class="settings-card-icon">${iconHTML('rows')}</div><div class="settings-card-copy"><h2>Orden de los libros</h2><p>Abre una colección y arrastra las tarjetas de libros para cambiar su posición. Atlas guardará el orden en los metadatos de cada libro y lo mantendrá al exportar a GitHub Pages.</p></div></article>
      </section>`;
  }

  function enableBookSorting(collection){
    const grid=main.querySelector('.sortable-book-grid');if(!grid)return;
    let dragged=null;
    grid.addEventListener('dragstart',event=>{
      const card=event.target.closest('.book-card');if(!card)return;
      if(event.target.closest('button')){event.preventDefault();return}
      dragged=card;card.classList.add('is-dragging');
      if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.dataset.bookId)}
    });
    grid.addEventListener('dragover',event=>{
      if(!dragged)return;event.preventDefault();
      const target=event.target.closest('.book-card');if(!target||target===dragged)return;
      const rect=target.getBoundingClientRect();const after=event.clientY>rect.top+rect.height/2;
      grid.insertBefore(dragged,after?target.nextSibling:target);
    });
    grid.addEventListener('dragend',()=>{if(dragged)dragged.classList.remove('is-dragging');dragged=null});
    grid.addEventListener('drop',async event=>{
      if(!dragged)return;event.preventDefault();
      const ordered=[...grid.querySelectorAll('.book-card[data-book-id]')].map(node=>b(node.dataset.bookId)).filter(Boolean);
      try{await requestApi('api/reorder-books',{collectionPath:collection.path,bookPaths:ordered.map(book=>book.path)});await refreshCatalog();toast('Orden de libros guardado')}catch(err){toast('No se pudo guardar el orden: '+err.message,true);await refreshCatalog()}
    });
  }

  function enableLibraryBookSorting(){
    const grid=main.querySelector('.sortable-library-grid');if(!grid)return;
    let dragged=null;
    grid.addEventListener('dragstart',event=>{const card=event.target.closest('.book-card');if(!card)return;if(event.target.closest('button')){event.preventDefault();return}dragged=card;card.classList.add('is-dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.dataset.bookId)}});
    grid.addEventListener('dragover',event=>{if(!dragged)return;event.preventDefault();const target=event.target.closest('.book-card');if(!target||target===dragged)return;const rect=target.getBoundingClientRect();const after=event.clientY>rect.top+rect.height/2;grid.insertBefore(dragged,after?target.nextSibling:target)});
    grid.addEventListener('dragend',()=>{if(dragged)dragged.classList.remove('is-dragging');dragged=null});
    grid.addEventListener('drop',async event=>{if(!dragged)return;event.preventDefault();const ordered=[...grid.querySelectorAll('.book-card[data-book-id]')].map(node=>b(node.dataset.bookId)).filter(Boolean);try{await requestApi('api/reorder-library-books',{bookPaths:ordered.map(book=>book.path)});await refreshCatalog();toast('Orden general de libros guardado')}catch(err){toast('No se pudo guardar el orden: '+err.message,true);await refreshCatalog()}});
  }
  function enableCollectionSorting(parentPath='biblioteca'){
    const selector=`.sortable-collection-grid[data-parent-path="${CSS.escape(parentPath)}"]`;
    const grid=main.querySelector(selector)||main.querySelector('.sortable-collection-grid'); if(!grid)return;
    let dragged=null;
    grid.addEventListener('dragstart',event=>{const card=event.target.closest('.collection-card-wrap');if(!card)return;if(event.target.closest('button')){event.preventDefault();return}dragged=card;card.classList.add('is-dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.querySelector('.collection-card')?.getAttribute('href')||'')}});
    grid.addEventListener('dragover',event=>{if(!dragged)return;event.preventDefault();const target=event.target.closest('.collection-card-wrap');if(!target||target===dragged)return;const rect=target.getBoundingClientRect();const after=event.clientY>rect.top+rect.height/2;grid.insertBefore(dragged,after?target.nextSibling:target)});
    grid.addEventListener('dragend',()=>{if(dragged)dragged.classList.remove('is-dragging');dragged=null});
    grid.addEventListener('drop',async event=>{if(!dragged)return;event.preventDefault();const ordered=[...grid.querySelectorAll('.collection-card-wrap .collection-card')].map(node=>{const href=node.getAttribute('href')||'';const id=href.split('/').pop();return c(id)}).filter(Boolean);try{await requestApi('api/reorder-collections',{parentPath,collectionPaths:ordered.map(item=>item.path)});await refreshCatalog();toast('Orden de colecciones guardado')}catch(err){toast('No se pudo guardar el orden: '+err.message,true);await refreshCatalog()}});
  }
  function enableSidebarCollectionSorting(){
    const nav=$('#collections-nav'); if(!nav) return; let dragged=null;
    nav.querySelectorAll('.sidebar-sortable-item').forEach(item=>{
      item.addEventListener('dragstart',event=>{dragged=item;item.classList.add('is-dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.dataset.collectionId||'')}});
      item.addEventListener('dragover',event=>{if(!dragged)return;event.preventDefault();const target=event.currentTarget;if(target===dragged)return;const rect=target.getBoundingClientRect();const after=event.clientY>rect.top+rect.height/2;nav.insertBefore(dragged,after?target.nextSibling:target)});
      item.addEventListener('dragend',()=>{if(dragged)dragged.classList.remove('is-dragging');dragged=null});
      item.addEventListener('drop',async event=>{if(!dragged)return;event.preventDefault();const ordered=[...nav.querySelectorAll('.sidebar-sortable-item')].map(node=>c(node.dataset.collectionId)).filter(Boolean);try{await requestApi('api/reorder-collections',{parentPath:'biblioteca',collectionPaths:ordered.map(item=>item.path)});await refreshCatalog();toast('Orden de colecciones actualizado')}catch(err){toast('No se pudo guardar el orden: '+err.message,true);await refreshCatalog()}});
    });
  }
  function renderPageIndex(type){
    const faves=type==='favoritos';setTopBreadcrumb(faves?'Favoritos':'Fichas');
    const items=getAllPages().filter(item=>!faves||state.favorites.has(item.page.id));
    main.innerHTML=heading(faves?'TU SELECCIÓN':'FICHAS',faves?'Mis favoritos':'Fichas',faves?'Guardadas en el orden de tu biblioteca.':'Páginas en orden de incorporación.')+
      (items.length?`<div class="pages-grid">${items.map(pageCard).join('')}</div>`:empty('Todavía no hay fichas favoritas','Toca el corazón de una ficha para guardarla aquí.'));
  }
  function renderSearch(){
    setTopBreadcrumb('Resultados de búsqueda');
    const q=state.query.trim();const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
    const match=t=>norm(t).includes(norm(q));
    const books=q?state.catalog.books.filter(x=>match(x.title)||match(x.description)).sort(sortByTitle):[];
    const groups=q?sortCollections(state.catalog.collections.filter(x=>match(x.title))):[];
    const pages=q?getAllPages().filter(x=>match(x.page.title)||match(x.page.filename)||match(x.page.notes?.replace(/<[^>]*>/g,' ')||'')):[];
    main.innerHTML=heading('BUSCADOR','Buscar en Atlas',q?`${formatCount(books.length+groups.length+pages.length,'resultado','resultados')} para «${q}».`:'Escribe el nombre de una persona, tema o libro en el buscador superior.')+
      (groups.length?`<section class="section"><div class="section-head"><h2 class="section-title">Colecciones</h2></div><div class="collection-grid">${groups.map(collectionCard).join('')}</div></section>`:'')+
      (books.length?`<section class="section"><div class="section-head"><h2 class="section-title">Libros</h2></div>${bookGrid(books)}</section>`:'')+
      (pages.length?`<section class="section"><div class="section-head"><h2 class="section-title">Fichas</h2></div><div class="pages-grid">${pages.map(p=>pageCard(p,true)).join('')}</div></section>`:'')+
      (!books.length&&!groups.length&&!pages.length?empty(q?'Sin coincidencias':'Empieza a explorar',q?'Prueba otra palabra o revisa el nombre del archivo.':'El buscador encuentra fichas por el nombre de sus archivos.'):'');
  }
  function readerPageNames(pages){return pages.map(p=>p.title).join(' · ')}
  function renderReader(id, pageNumber){
    const book=b(id);if(!book)return notFound();
    setTopBreadcrumb(book.title);
    const pages=book.pages;
    if(!pages.length){main.innerHTML=empty('Este libro todavía está vacío','Sube imágenes para comenzar a leer.',button(ix('arrow-left','Volver al libro'),'go-book',{book:id}));return}
    const mobile=window.matchMedia('(max-width:620px)').matches;
    const double=!mobile&&state.mode==='double';
    const index=Math.max(0,Math.min(pages.length-1,pageNumber));
    const start=double?Math.floor(index/2)*2:index;
    const visible=pages.slice(start,start+(double?2:1));
    const step=double?2:1;
    const previous=Math.max(0,start-step),next=Math.min(pages.length-1,start+step);
    const fav=state.favorites.has(pages[start].id);
    main.innerHTML=`<div class="reader-shell" id="atlas-reader">
      <div class="reader-header"><div><a class="inline-link" href="#/libro/${id}">${iconHTML('arrow-left')} Volver al libro</a><h1 class="reader-title" style="margin-top:12px">${e(book.title)}</h1><div class="reader-subtitle">${e(readerPageNames(visible))}</div></div>
        <div class="reader-controls"><div class="toggle-group" aria-label="Modo de lectura"><button type="button" data-action="mode" data-mode="single" class="${!double?'selected':''}" aria-pressed="${!double}">${iconHTML('book')} Una página</button><button type="button" data-action="mode" data-mode="double" class="${double?'selected':''}" aria-pressed="${double}" ${mobile?'disabled title="En móvil se usa una sola página"':''}>${iconHTML('books')} Dos páginas</button></div>
        ${button(ix('heart',fav?'Favorita':'Favorito'),'favorite',{page:pages[start].id},'secondary','small')}
        ${state.admin?button(ix('pencil','Editar ficha'),'edit-page',{book:id,page:pages[start].id},'secondary','small'):''}
        ${button(ix('file-pdf','PDF'),'pdf-book',{book:id},'secondary','small')}
        ${button(ix('expand','Pantalla completa'),'reader-fullscreen',{},'secondary','small')}</div>
      </div>
      <div class="reader-view">
        <div class="reader-canvas" id="reader-canvas" aria-label="Visualizador de páginas; en escritorio arrastra para mover y usa la rueda del ratón para ampliar">
          <div class="reader-spread ${double?'two':'one'}" id="reader-spread">${visible.map(page=>`<img src="${e(url(page.src))}" alt="Ficha ${e(page.title)}" draggable="false">`).join('')}</div>
        </div>
        <div class="reader-bottom">
          <div class="zoom-group"><button type="button" data-action="zoom-out" aria-label="Alejar">${iconHTML('minus')}</button><span id="reader-zoom-value">${Math.round(state.zoom*100)}%</span><button type="button" data-action="zoom-in" aria-label="Acercar">${iconHTML('plus')}</button></div>
          <div class="reader-progress-wrap"><div class="reader-progress"><span style="width:${Math.round(((start+visible.length)/pages.length)*100)}%"></span></div></div>
          <div class="reader-nav-inline"><button type="button" class="reader-inline-btn" data-action="reader-prev" data-book="${id}" data-index="${previous}" ${start===0?'disabled':''} aria-label="Página anterior">${iconHTML('angle-left')}</button><span class="reader-number">${start+1}${double&&visible.length===2?'–'+(start+2):''} / ${pages.length}</span><button type="button" class="reader-inline-btn" data-action="reader-next" data-book="${id}" data-index="${next}" ${next===start?'disabled':''} aria-label="Página siguiente">${iconHTML('angle-right')}</button>
          <button type="button" class="reader-inline-btn reader-exit-fullscreen" data-action="reader-fullscreen" aria-label="Salir de pantalla completa">${iconHTML('compress')}</button></div>
        </div>
      </div>
      <p class="reader-tip">${mobile?'Desliza horizontalmente para pasar páginas.':'Rueda del ratón: zoom · Arrastra para mover · Flechas del teclado para cambiar de ficha.'}</p>
      <section class="reader-notes"><div class="section-head"><h2 class="section-title">Apuntes de estas fichas</h2><span class="toolbar-muted">Consulta tus notas o ábrelas junto a la imagen</span></div><div class="reader-notes-grid">${visible.map(page=>`<article class="reader-note-card"><div class="note-head"><strong>${e(page.title)}</strong><div class="reader-note-actions">
       ${button(iconHTML('eye')+' Ver notas','view-notes',{book:id,page:page.id},'secondary','small')}
       ${button(iconHTML('columns')+' Vista dividida','split-notes',{book:id,page:page.id},'secondary','small')}
       ${state.admin?button(iconHTML('pencil')+' Editar nota','edit-notes',{book:id,page:page.id},'secondary','small'):''}
      </div></div>${page.notes?`<div class="notes-content">${page.notes}</div>`:'<p class="note-placeholder">Esta ficha todavía no tiene notas.</p>'}</article>`).join('')}</div></section>
    </div>`;
    hydrateMedia(main);
    attachReaderInteractions();
  }
  function notFound(){setTopBreadcrumb('No encontrada');main.innerHTML=empty('Página no encontrada','El libro o colección puede haber cambiado de carpeta.',button('Volver al inicio','go-home'))}
  function render(){
    const r=route();updateNav(r);closeMobile();
    document.title=`Atlas · ${r.type==='inicio'?'Mi biblioteca':r.type==='configuracion'?'Configuración':r.type}`;
    switch(r.type){
      case 'inicio':renderHome();break;
      case 'biblioteca':renderLibrary();break;
      case 'colecciones':renderCollections();break;
      case 'coleccion':renderCollection(r.id);break;
      case 'libro':renderBook(r.id);break;
      case 'leer':renderReader(r.id,r.index);break;
      case 'paginas':case 'favoritos':renderPageIndex(r.type);break;
      case 'buscar':renderSearch();break;
      case 'configuracion':renderSettings();break;
      default:notFound();
    }
  }
  function navReader(direction){
    const r=route();if(r.type!=='leer')return;
    const book=b(r.id);if(!book||!book.pages.length)return;
    const mobile=window.matchMedia('(max-width:620px)').matches;
    const step=(mobile||state.mode==='single')?1:2;
    const current=step===2?Math.floor(r.index/2)*2:r.index;
    const next=Math.max(0,Math.min(book.pages.length-1,current+direction*step));
    if(next!==current)go(`leer/${book.id}/${next}`);
  }
  async function toggleReaderFullscreen(){
    if(route().type!=='leer')return;
    try{
      // El nodo main permanece montado mientras cambian las páginas.
      // Solicitar fullscreen sobre reader-shell lo cancelaba al hacer render().
      if(document.fullscreenElement){await document.exitFullscreen();}
      else {await main.requestFullscreen();}
    }catch(err){toast('El navegador no permitió pantalla completa',true)}
  }
  let readerCleanup=null;
  function setReaderZoom(next, anchorX=null, anchorY=null){
    const canvas=$('#reader-canvas'),spread=$('#reader-spread');if(!canvas||!spread)return;
    const minimum=window.matchMedia('(max-width:620px)').matches?.65:.5;
    const target=Math.min(4,Math.max(minimum,Math.round(next*100)/100));
    const old=state.zoom;const factor=target/old;
    // Conservar bajo el puntero el punto que se está ampliando.
    if(anchorX!==null&&anchorY!==null&&old!==target){
      const rect=canvas.getBoundingClientRect();
      const cx=anchorX-rect.left-rect.width/2,cy=anchorY-rect.top-rect.height/2;
      readerPan.x=cx-(cx-readerPan.x)*factor;
      readerPan.y=cy-(cy-readerPan.y)*factor;
    }
    state.zoom=target;
    applyReaderTransform();
  }
  const readerPan={x:0,y:0};
  function applyReaderTransform(){
    const spread=$('#reader-spread');if(!spread)return;
    spread.style.transform=`translate(calc(-50% + ${readerPan.x}px),calc(-50% + ${readerPan.y}px)) scale(${state.zoom})`;
    const label=$('#reader-zoom-value');if(label)label.textContent=Math.round(state.zoom*100)+'%';
  }
  function attachReaderInteractions(){
    if(readerCleanup){readerCleanup();readerCleanup=null}
    const canvas=$('#reader-canvas');if(!canvas)return;
    readerPan.x=0;readerPan.y=0;applyReaderTransform();
    const mobile=window.matchMedia('(max-width:620px)').matches;
    const abort=new AbortController(),opt={signal:abort.signal};
    if(mobile){
      let first=null;
      canvas.addEventListener('touchstart',ev=>{const t=ev.changedTouches[0];first={x:t.clientX,y:t.clientY}}, {passive:true,signal:abort.signal});
      canvas.addEventListener('touchend',ev=>{if(!first)return;const t=ev.changedTouches[0];const dx=t.clientX-first.x,dy=t.clientY-first.y;first=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){navReader(dx<0?1:-1)}}, {passive:true,signal:abort.signal});
    }else{
      let start=null;
      canvas.addEventListener('pointerdown',ev=>{if(ev.button!==0)return;ev.preventDefault();start={x:ev.clientX,y:ev.clientY,px:readerPan.x,py:readerPan.y};canvas.classList.add('is-panning');canvas.setPointerCapture(ev.pointerId)},opt);
      canvas.addEventListener('pointermove',ev=>{if(!start)return;readerPan.x=start.px+ev.clientX-start.x;readerPan.y=start.py+ev.clientY-start.y;applyReaderTransform()},opt);
      const stop=ev=>{start=null;canvas.classList.remove('is-panning');if(canvas.hasPointerCapture(ev.pointerId))canvas.releasePointerCapture(ev.pointerId)};
      canvas.addEventListener('pointerup',stop,opt);canvas.addEventListener('pointercancel',stop,opt);
      canvas.addEventListener('wheel',ev=>{ev.preventDefault();const delta=ev.deltaMode===1?ev.deltaY*16:ev.deltaY;setReaderZoom(state.zoom*Math.exp(-delta*.0013),ev.clientX,ev.clientY)},{passive:false,signal:abort.signal});
    }
    readerCleanup=()=>abort.abort();
  }
  async function requestApi(path,data){
    const result=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const response=await result.json();
    if(!result.ok)throw new Error(response.error||'No se pudo guardar');
    return response;
  }
  function closeModal(){const root=$('#modal-root');root.hidden=true;root.innerHTML=''}
  function openModal(title,description,fields,submitText,submit){
    const root=$('#modal-root');root.hidden=false;
    const html=fields.map(field=>`<div class="field"><label for="field-${e(field.name)}">${e(field.label)}</label>${field.type==='icon'?`<input type="hidden" id="field-${e(field.name)}" name="${e(field.name)}" value="${e(field.value||'books')}"><input type="search" class="icon-search" placeholder="Buscar entre ${ICON_BANK.length} iconos…" aria-label="Buscar iconos de colección"><div class="icon-bank">${ICON_BANK.length?ICON_BANK.map(icon=>`<button type="button" class="icon-option ${field.value===icon[0]?'selected':''}" data-action="choose-icon" data-icon="${icon[0]}" title="${e(icon[1])}">${iconHTML(icon[0])}<span>${e(icon[1])}</span></button>`).join(''):'<p class="icon-bank-warning">No se han cargado Uicons. Conéctate a Internet y vuelve a abrir Atlas.</p>'}</div>`:field.type==='select'?`<select id="field-${e(field.name)}" name="${e(field.name)}" required>${field.options.map(x=>`<option value="${e(x.value)}" ${x.value===field.value?'selected':''}>${e(x.label)}</option>`).join('')}</select>`:`<input id="field-${e(field.name)}" name="${e(field.name)}" ${field.required===false?'':'required'} value="${e(field.value||'')}" placeholder="${e(field.placeholder||'')}" maxlength="300">`}</div>`).join('');
    root.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-label="${e(title)}"><form id="dialog-form"><h2 class="dialog-title">${e(title)}</h2><p class="dialog-desc">${e(description)}</p>${html}<div class="dialog-buttons"><button class="button secondary" type="button" data-action="modal-close">Cancelar</button><button class="button" type="submit">${e(submitText)}</button></div></form></div>`;
    root.querySelector('.icon-search')?.addEventListener('input',ev=>{const q=ev.target.value.toLocaleLowerCase('es').trim();root.querySelectorAll('.icon-option').forEach(el=>{el.hidden=!el.textContent.toLocaleLowerCase('es').includes(q)});});
    const form=root.querySelector('form');form.querySelector('input:not([type="hidden"]),select')?.focus();
    form.addEventListener('submit',async evt=>{
      evt.preventDefault();const values=Object.fromEntries(new FormData(form));const submitButton=form.querySelector('[type="submit"]');submitButton.disabled=true;submitButton.textContent='Guardando…';
      try{await submit(values);closeModal();await refreshCatalog();toast('Guardado correctamente')}
      catch(err){toast(err.message,true);submitButton.disabled=false;submitButton.textContent=submitText}
    });
  }
  function currentCollectionId(){const r=route();return r.type==='coleccion'?r.id:null}
  function createCollection(collectionId){
    if(!state.admin)return;
    const parent=collectionId?c(collectionId):null;
    openModal('Nueva colección','Crea una carpeta que agrupe tus libros o subcolecciones.',[{name:'title',label:'Nombre de la colección',placeholder:'Por ejemplo, Grandes personajes'},{name:'icon',label:'Icono de la colección',type:'icon',value:'books'}],'Crear colección',v=>requestApi('api/collections',{title:v.title,icon:v.icon,parentPath:parent?.path||'biblioteca'}));
  }
  function createBook(collectionId){
    if(!state.admin)return;
    const groups=sortCollections(state.catalog.collections.slice());
    if(!groups.length){toast('Primero debes crear una colección',true);return}
    const chosen=collectionId||groups[0].id;
    openModal('Nuevo libro','Cada libro contiene una carpeta de páginas que se ordenarán alfabéticamente.',[
      {name:'title',label:'Nombre del libro',placeholder:'Por ejemplo, 01 Ciencias Naturales'},
      {name:'collection',label:'Colección',type:'select',value:chosen,options:groups.map(g=>({label:g.title,value:g.id}))}
    ],'Crear libro',v=>requestApi('api/books',{title:v.title,collectionPath:c(v.collection).path}));
  }
  function editMeta(kind,id){
    const item=kind==='book'?b(id):c(id);if(!item)return;
    openModal('Editar '+(kind==='book'?'libro':'colección'),'El nombre visible se puede cambiar sin renombrar la carpeta.',[
      {name:'title',label:'Nombre que verá el visitante',value:item.title},
      {name:'description',label:'Descripción (opcional)',value:item.description,required:false},
      ...(kind==='collection'?[{name:'icon',label:'Icono de la colección',type:'icon',value:item.icon||'books'}]:[])
    ],'Guardar cambios',v=>requestApi('api/metadata',{kind,path:item.path,title:v.title,description:v.description, ...(kind==='collection'?{icon:v.icon}:{})}));
  }
  function selectUpload(target,kind,multiple=false){
    if(!state.admin)return;
    const picker=$('#file-upload');state.fileTarget={target,kind};picker.value='';
    picker.multiple=multiple;picker.click();
  }
  async function uploadFile(file,target,kind){
    if(!file || !/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type))throw new Error('Formato no permitido; utiliza imágenes JPG, PNG, WebP, GIF o AVIF');
    const query=new URLSearchParams({target,kind,filename:file.name});
    const response=await fetch(`api/upload?${query}`,{method:'POST',body:file,headers:{'Content-Type':file.type}});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Error al subir '+file.name);
  }
  function movePage(bookId,pageId){
    const book=b(bookId),page=book?.pages.find(p=>p.id===pageId);if(!page)return;
    const opts=state.catalog.books.filter(x=>x.id!==bookId).sort(sortByTitle);
    if(!opts.length){toast('Necesitas otro libro para mover esta ficha',true);return}
    openModal('Mover ficha','La imagen original se moverá a la carpeta del libro que elijas.',[
      {name:'destination',label:`Destino de «${page.title}»`,type:'select',value:opts[0].id,options:opts.map(x=>({label:x.title,value:x.id}))}
    ],'Mover imagen',v=>requestApi('api/move-page',{src:page.src,targetBookPath:b(v.destination).path}));
  }
  function pageEntry(bookId,pageId){const book=b(bookId),page=book?.pages.find(p=>p.id===pageId);return page?{book,page}:null}
  function editPage(bookId,pageId){
    if(!state.admin)return;
    const item=pageEntry(bookId,pageId);if(!item)return;
    const {book,page}=item;
    const opts=state.catalog.books.slice().sort(sortByTitle);
    openModal('Editar ficha','Cambia el título (nombre del archivo), el libro de destino o abre el editor de notas.',[
      {name:'title',label:'Nombre de la ficha',value:page.title},
      {name:'destination',label:'Libro donde estará',type:'select',value:book.id,options:opts.map(x=>({label:x.title,value:x.id}))}
    ],'Guardar ficha',v=>requestApi('api/edit-page',{src:page.src,title:v.title,targetBookPath:b(v.destination).path}));
    const buttons=$('#modal-root .dialog-buttons');
    buttons.insertAdjacentHTML('afterbegin',`${button(ix('book','Editar notas'),'edit-notes',{book:bookId,page:pageId},'secondary','small')}${button(ix('trash','Eliminar ficha'),'delete-item',{kind:'page',book:bookId,page:pageId},'danger','small')}`);
  }

  function youtubeId(value){
    try{const u=new URL(value);const host=u.hostname.toLowerCase().replace(/^www\./,'');let id='';
      if(host==='youtu.be')id=u.pathname.split('/')[1];
      else if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host))id=u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]||'';
      return /^[\w-]{11}$/.test(id)?id:null;
    }catch{return null}
  }
  let youtubeAPIRequest = null;
  function youtubeAPI(){
    if(window.YT && typeof window.YT.Player==='function')return Promise.resolve(window.YT);
    if(youtubeAPIRequest)return youtubeAPIRequest;
    youtubeAPIRequest=new Promise((resolve,reject)=>{
      const prior=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=function(){if(typeof prior==='function')prior();resolve(window.YT)};
      const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';
      script.async=true;script.onerror=()=>reject(new Error('No se pudo cargar el reproductor de YouTube'));
      document.head.append(script);
    });
    return youtubeAPIRequest;
  }
  function videoTime(seconds){
    const n=Math.max(0,Math.floor(Number(seconds)||0));
    return Math.floor(n/3600)?`${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
  }
  function hydrateMedia(root){
    root.querySelectorAll('.atlas-youtube:not([data-ready])').forEach(node=>{
      const id=node.dataset.videoId,style=node.dataset.presentation==='podcast'?'podcast':'video';
      if(!/^[A-Za-z0-9_-]{11}$/.test(id)){node.remove();return}
      node.dataset.ready='1';node.contentEditable='false';
      const thumbnail='https://img.youtube.com/vi/'+id+'/hqdefault.jpg';
      if(style==='podcast'){
        // Una tarjeta compacta de aspecto audio, con vídeo de 206×206 visible al reproducir.
        // YouTube no autoriza una extracción de audio ni un iframe oculto.
        node.innerHTML=`<div class="youtube-podcast"><div class="youtube-podcast-art"><img src="${thumbnail}" loading="lazy" alt="Carátula del episodio"></div><div class="youtube-podcast-info"><strong>Episodio multimedia</strong><div class="podcast-player-row"><button type="button" class="youtube-play" data-podcast-toggle title="Reproducir o pausar" aria-label="Reproducir">${iconHTML('play')}</button><span class="podcast-time" data-podcast-now>0:00</span><input class="podcast-seek" type="range" min="0" max="1000" value="0" aria-label="Posición de reproducción" disabled><span class="podcast-time" data-podcast-duration>0:00</span></div><div class="podcast-player-caption">${iconHTML('video-camera')} Vídeo compacto · YouTube</div></div></div>`;
        const button=node.querySelector('[data-podcast-toggle]'),seek=node.querySelector('.podcast-seek');
        const art=node.querySelector('.youtube-podcast-art');
        const elapsed=node.querySelector('[data-podcast-now]'),duration=node.querySelector('[data-podcast-duration]');
        let player=null,starting=false,updater=null;
        function sync(){
          if(!node.isConnected){if(updater)clearInterval(updater);return}
          if(!player||typeof player.getCurrentTime!=='function')return;
          try{
            const total=player.getDuration()||0,now=player.getCurrentTime()||0;
            elapsed.textContent=videoTime(now);duration.textContent=videoTime(total);
            if(total>0&&!seek.matches(':active')){seek.disabled=false;seek.value=String(Math.round(now/total*1000))}
            const playing=player.getPlayerState()===1;
            button.innerHTML=iconHTML(playing?'pause':'play');button.setAttribute('aria-label',playing?'Pausar':'Reproducir');
          }catch{}
        }
        button.addEventListener('click',async ev=>{
          ev.preventDefault();ev.stopPropagation();
          if(player){
            try{player.getPlayerState()===1?player.pauseVideo():player.playVideo()}catch{toast('El vídeo todavía está cargando',true)}
            sync();return;
          }
          if(starting)return;starting=true;button.disabled=true;
          const slot=document.createElement('div');slot.id='atlas-yt-'+Math.random().toString(36).slice(2);slot.className='podcast-frame-slot';
          art.replaceChildren(slot);
          try{
            const YT=await youtubeAPI();if(!node.isConnected)return;
            player=new YT.Player(slot.id,{width:'206',height:'206',videoId:id,
              playerVars:{autoplay:1,playsinline:1,controls:1,rel:0},
              events:{onReady:event=>{button.disabled=false;event.target.playVideo();sync();updater=setInterval(sync,700)},
                onStateChange:sync,onError:()=>{button.disabled=false;toast('Este vídeo no permite reproducción incrustada',true)}}});
          }catch(error){
            // Degradación: seguir ofreciendo el reproductor nativo visible y compacto.
            art.innerHTML=`<iframe class="podcast-fallback-frame" title="Vídeo de YouTube" src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
            button.disabled=true;button.title='Utiliza los controles de YouTube en la carátula';
          }
        });
        seek.addEventListener('change',()=>{if(player){try{player.seekTo((player.getDuration()||0)*Number(seek.value)/1000,true);sync()}catch{}}});
      }else{
        node.innerHTML=`<button type="button" class="youtube-video-start" data-youtube-play><img src="${thumbnail}" loading="lazy" alt="Miniatura de YouTube"><span>${iconHTML('play')} Reproducir vídeo de YouTube</span></button>`;
        node.querySelector('[data-youtube-play]').addEventListener('click',ev=>{
          ev.preventDefault();ev.stopPropagation();
          node.innerHTML=`<iframe class="youtube-frame" title="Reproductor de YouTube" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1"></iframe>`;
        });
      }
    });
  }
  function noteHTML(editor){
    const clean=editor.cloneNode(true);
    clean.querySelectorAll('.atlas-youtube').forEach(node=>{
      const replacement=document.createElement('div');replacement.className='atlas-youtube';replacement.dataset.videoId=node.dataset.videoId;replacement.dataset.presentation=node.dataset.presentation||'video';node.replaceWith(replacement);
    });
    return clean.innerHTML;
  }

  function openNoteEditor(bookId,pageId){
    if(!state.admin)return;
    const item=pageEntry(bookId,pageId);if(!item)return;
    const {page,book}=item,root=$('#modal-root');root.hidden=false;
    const swatchColors=['#203f33','#3f7565','#1677a0','#2e579c','#7359a5','#a45e87','#b35b4c','#ce8938','#c69e37','#75864e','#111111','#7b8a82'];
    const highlights=['#f9e5a1','#d4edd5','#d2e9f8','#efd9ef','#f5d8cf','#e9e4b7'];
    root.innerHTML=`<div class="dialog notes-dialog" role="dialog" aria-modal="true" aria-label="Editor de notas"><h2 class="dialog-title">Notas · ${e(page.title)}</h2><p class="dialog-desc">Editor visual y HTML · las notas guardadas se verán también en GitHub Pages.</p>
      <div class="editor-mode-switch"><button type="button" data-editor-mode="visual" class="selected">${iconHTML('eye')} Visual</button><button type="button" data-editor-mode="code">${iconHTML('code')} HTML</button></div>
      <div class="editor-toolbar" aria-label="Formato de notas">
        <div class="editor-group"><select class="editor-select" id="note-block" title="Estilo de párrafo"><option value="p">Párrafo</option><option value="h2">Título H2</option><option value="h3">Título H3</option><option value="blockquote">Cita</option></select>
        <button type="button" data-editor-cmd="bold" title="Negrita">${iconHTML('bold')}</button><button type="button" data-editor-cmd="italic" title="Cursiva">${iconHTML('italic')}</button><button type="button" data-editor-cmd="underline" title="Subrayar">${iconHTML('underline')}</button><button type="button" id="note-ununderline" title="Quitar subrayado">${iconHTML('eraser')} U</button></div>
        <div class="editor-group"><button type="button" data-editor-cmd="insertUnorderedList" title="Lista con puntos">${iconHTML('list')}</button><button type="button" data-editor-cmd="insertOrderedList" title="Lista numerada">${iconHTML('list')}<span class="ordered-list-mark">1.</span></button><button type="button" data-editor-table title="Insertar tabla">${iconHTML('table')}</button></div>
        <div class="editor-group"><button type="button" data-editor-cmd="justifyLeft" title="Alinear a la izquierda">${iconHTML('align-left')}</button><button type="button" data-editor-cmd="justifyCenter" title="Centrar">${iconHTML('align-center')}</button><button type="button" data-editor-cmd="justifyRight" title="Alinear a la derecha">${iconHTML('align-right')}</button><button type="button" data-editor-cmd="justifyFull" title="Justificar">${iconHTML('align-justify')}</button></div>
        <div class="editor-group"><button type="button" data-editor-link>${iconHTML('link')} Enlace</button><button type="button" id="note-image-pick">${iconHTML('image')} Imagen</button><label class="editor-inline-control" title="Tamaño de la imagen seleccionada">Tamaño <select id="note-image-size" class="editor-select"><option value="25">25%</option><option value="50">50%</option><option value="75" selected>75%</option><option value="100">100%</option></select></label><label class="editor-inline-control" title="Alineación de la imagen seleccionada">Alinear <select id="note-image-align" class="editor-select"><option value="left">Izquierda</option><option value="center" selected>Centro</option><option value="right">Derecha</option></select></label><button type="button" id="note-video-button">${iconHTML('video-camera')} YouTube</button></div>
        <div class="editor-group"><span class="editor-label">Texto</span><div class="editor-swatches">${swatchColors.map(color=>`<button type="button" class="editor-swatch" data-color="${color}" title="Texto ${color}"><span style="background:${color}"></span></button>`).join('')}</div></div>
        <div class="editor-group"><span class="editor-label">Resaltar</span><div class="editor-swatches">${highlights.map(color=>`<button type="button" class="editor-swatch" data-highlight="${color}" title="Resaltar ${color}"><span style="background:${color}"></span></button>`).join('')}</div><button type="button" id="clear-highlight" title="Quitar resaltado">${iconHTML('eraser')} Quitar</button></div>
        <button type="button" id="clear-formats">${iconHTML('cross-circle')} Limpiar formato</button>
      </div>
      <div id="note-video-form" class="note-media-input" hidden><input type="url" id="note-youtube-url" placeholder="https://www.youtube.com/watch?v=…" aria-label="Enlace de YouTube"><select class="editor-select" id="note-youtube-style"><option value="video">Vídeo visible</option><option value="podcast">Tarjeta estilo podcast</option></select><button type="button" class="button small" id="note-youtube-insert">${iconHTML('plus')} Insertar</button></div>
      <input id="notes-asset-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden>
      <div id="note-rich-editor" class="note-rich-editor notes-content" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Escribe aquí tus apuntes…">${page.notes||''}</div>
      <textarea id="note-code-editor" class="note-code-editor" spellcheck="false" aria-label="Código HTML de las notas" hidden></textarea>
      <div class="note-edit-footer">Imágenes de notas: carpeta <strong>adjuntos</strong> del libro. Enlaces, tablas y vídeos se publicarán con las notas. Los vídeos utilizan el reproductor visible de YouTube.</div>
      <div class="dialog-buttons">${page.notes?`<button type="button" class="button danger" id="delete-note">${iconHTML('trash')} Eliminar notas</button>`:''}<button type="button" class="button secondary" data-action="modal-close">Cancelar</button><button type="button" class="button" id="save-note">${iconHTML('check')} Guardar notas</button></div></div>`;
    const editor=root.querySelector('#note-rich-editor'),code=root.querySelector('#note-code-editor');let mode='visual',savedRange=null;
    const remember=()=>{const sel=window.getSelection();if(sel.rangeCount && editor.contains(sel.anchorNode))savedRange=sel.getRangeAt(0).cloneRange()};
    const focusSelection=()=>{editor.focus();if(savedRange){const sel=window.getSelection();sel.removeAllRanges();sel.addRange(savedRange)}};
    function insertHTML(html){focusSelection();document.execCommand('insertHTML',false,html);remember()}
    function command(cmd,val=null){focusSelection();document.execCommand(cmd,false,val);remember()}
    editor.addEventListener('keyup',remember);editor.addEventListener('mouseup',remember);
    let selectedNoteImage=null;
    editor.addEventListener('click',evt=>{
      editor.querySelectorAll('img.note-asset.note-image-selected').forEach(img=>img.classList.remove('note-image-selected'));
      selectedNoteImage=evt.target.closest('img.note-asset');
      if(selectedNoteImage){selectedNoteImage.classList.add('note-image-selected');const width=(selectedNoteImage.style.width||'75%').replace('%','');root.querySelector('#note-image-size').value=['25','50','75','100'].includes(width)?width:'75';const ml=selectedNoteImage.style.marginLeft;const mr=selectedNoteImage.style.marginRight;root.querySelector('#note-image-align').value=ml==='auto'&&mr==='auto'?'center':ml==='auto'?'right':'left'}
    });
    root.querySelector('#note-image-size').addEventListener('change',evt=>{if(!selectedNoteImage){toast('Selecciona primero una imagen dentro de la nota');return}selectedNoteImage.style.width=evt.target.value+'%';selectedNoteImage.style.maxWidth='100%';selectedNoteImage.style.height='auto';selectedNoteImage.style.display='block';remember()});
    root.querySelector('#note-image-align').addEventListener('change',evt=>{if(!selectedNoteImage){toast('Selecciona primero una imagen dentro de la nota');return}selectedNoteImage.style.display='block';selectedNoteImage.style.marginTop='12px';selectedNoteImage.style.marginBottom='12px';selectedNoteImage.style.marginLeft=evt.target.value==='center'?'auto':evt.target.value==='right'?'auto':'0';selectedNoteImage.style.marginRight=evt.target.value==='center'?'auto':evt.target.value==='left'?'auto':'0';remember()});
    root.querySelectorAll('.editor-toolbar button').forEach(btn=>btn.addEventListener('mousedown',evt=>evt.preventDefault()));
    root.querySelectorAll('[data-editor-cmd]').forEach(btn=>btn.addEventListener('click',()=>command(btn.dataset.editorCmd)));
    root.querySelector('#note-block').addEventListener('change',ev=>command('formatBlock',ev.target.value));
    root.querySelectorAll('[data-color]').forEach(btn=>btn.addEventListener('click',()=>command('foreColor',btn.dataset.color)));
    root.querySelectorAll('[data-highlight]').forEach(btn=>btn.addEventListener('click',()=>command('hiliteColor',btn.dataset.highlight)));
    root.querySelector('#clear-highlight').addEventListener('click',()=>command('hiliteColor','transparent'));
    root.querySelector('#clear-formats').addEventListener('click',()=>command('removeFormat'));
    root.querySelector('#note-ununderline').addEventListener('click',()=>{focusSelection();if(document.queryCommandState('underline'))command('underline');else toast('Selecciona el texto subrayado antes de quitar el subrayado')});
    root.querySelector('[data-editor-table]').addEventListener('click',()=>insertHTML('<table><tbody><tr><th>Encabezado 1</th><th>Encabezado 2</th></tr><tr><td>Celda 1</td><td>Celda 2</td></tr><tr><td>Celda 3</td><td>Celda 4</td></tr></tbody></table><p><br></p>'));
    root.querySelector('[data-editor-link]').addEventListener('click',()=>{const href=prompt('Introduce un enlace https:// o mailto:');if(!href)return;if(!/^(https?:\/\/|mailto:)/i.test(href)){toast('Enlace inválido',true);return}command('createLink',href)});
    root.querySelector('#note-image-pick').addEventListener('click',()=>root.querySelector('#notes-asset-file').click());
    root.querySelector('#notes-asset-file').addEventListener('change',async ev=>{const file=ev.target.files?.[0];if(!file)return;try{const result=await uploadNoteAsset(file,book.path);insertHTML(`<img class="note-asset" src="${e(result.path)}" alt="${e(file.name)}"><p><br></p>`);toast('Imagen de la nota importada')}catch(err){toast(err.message,true)}ev.target.value=''});
    root.querySelector('#note-video-button').addEventListener('click',()=>{const area=root.querySelector('#note-video-form');area.hidden=!area.hidden;if(!area.hidden)root.querySelector('#note-youtube-url').focus()});
    root.querySelector('#note-youtube-insert').addEventListener('click',()=>{const id=youtubeId(root.querySelector('#note-youtube-url').value);if(!id){toast('Utiliza un enlace válido de YouTube (watch, shorts, youtu.be o embed)',true);return}const style=root.querySelector('#note-youtube-style').value;insertHTML(`<div class="atlas-youtube" data-video-id="${id}" data-presentation="${style}"></div><p><br></p>`);hydrateMedia(editor);root.querySelector('#note-video-form').hidden=true;toast('Vídeo añadido: '+(style==='podcast'?'tarjeta podcast':'reproductor de vídeo'))});
    root.querySelectorAll('[data-editor-mode]').forEach(btn=>btn.addEventListener('click',async()=>{
      const target=btn.dataset.editorMode;if(target===mode)return;
      if(target==='code'){code.value=noteHTML(editor);editor.hidden=true;code.hidden=false;mode='code';code.focus()}
      else{
        try{const result=await requestApi('api/preview-note',{html:code.value});editor.innerHTML=result.html;hydrateMedia(editor);code.hidden=true;editor.hidden=false;mode='visual';editor.focus();savedRange=null}
        catch(err){toast('No se pudo previsualizar el HTML: '+err.message,true);return}
      }
      root.querySelectorAll('[data-editor-mode]').forEach(el=>el.classList.toggle('selected',el.dataset.editorMode===mode));
      root.querySelector('.editor-toolbar').hidden=mode==='code';
    }));
    editor.addEventListener('paste',evt=>{evt.preventDefault();const plain=evt.clipboardData?.getData('text/plain')||'';document.execCommand('insertText',false,plain)});
    hydrateMedia(editor);editor.focus();
    root.querySelector('#delete-note')?.addEventListener('click',async evt=>{if(!confirm('¿Eliminar todas las notas de «'+page.title+'»? La imagen se conservará.'))return;evt.target.disabled=true;try{await requestApi('api/note',{src:page.src,html:''});closeModal();await refreshCatalog();toast('Notas eliminadas')}catch(err){evt.target.disabled=false;toast(err.message,true)}});
    root.querySelector('#save-note').addEventListener('click',async evt=>{evt.target.disabled=true;try{await requestApi('api/note',{src:page.src,html:mode==='code'?code.value:noteHTML(editor)});closeModal();await refreshCatalog();toast('Notas guardadas y publicables')}catch(err){evt.target.disabled=false;toast(err.message,true)}});
  }
  async function uploadNoteAsset(file,target){
    if(!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type))throw new Error('Solo PNG, JPG, WebP, GIF o AVIF');
    const query=new URLSearchParams({target,kind:'note-asset',filename:file.name});
    const response=await fetch('api/upload?'+query.toString(),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Error al subir imagen');return result;
  }
  function splitNotes(bookId,pageId){
    const item=pageEntry(bookId,pageId);if(!item)return;
    const {page}=item,root=$('#modal-root');root.hidden=false;
    root.innerHTML=`<div class="dialog split-notes-dialog" role="dialog" aria-modal="true" aria-label="Ficha y apuntes de ${e(page.title)}">
      <div class="split-notes-top"><div><span class="eyebrow">LECTURA EN PARALELO</span><h2 class="dialog-title">${e(page.title)}</h2></div><button class="split-close" type="button" data-action="modal-close" aria-label="Cerrar">${iconHTML('cross')}</button></div>
      <div class="split-notes-layout"><div class="split-note-page"><img src="${e(url(page.src))}" alt="Ficha de ${e(page.title)}"></div><div class="split-note-text notes-content">${page.notes||'<p>Esta ficha todavía no tiene notas.</p>'}</div></div>
      <div class="dialog-buttons"><button type="button" class="button secondary" data-action="modal-close">Cerrar</button>${state.admin?button(iconHTML('pencil')+' Editar nota','edit-notes',{book:bookId,page:pageId},'primary'):''}</div>
    </div>`;
    hydrateMedia(root);
  }
  function viewNotes(bookId,pageId){
    const item=pageEntry(bookId,pageId);if(!item)return;
    const {page}=item;const root=$('#modal-root');root.hidden=false;
    root.innerHTML=`<div class="dialog notes-dialog notes-page-modal" role="dialog" aria-modal="true" aria-label="Notas de ${e(page.title)}"><h2 class="dialog-title">${e(page.title)}</h2><div class="eyebrow">MIS APUNTES</div><div class="notes-content notes-view">${page.notes||'<p>No hay notas para esta ficha.</p>'}</div><div class="dialog-buttons"><button class="button secondary" type="button" data-action="modal-close">Cerrar</button>${state.admin?button(iconHTML('pencil')+' Editar','edit-notes',{book:bookId,page:pageId},'primary'):''}</div></div>`;
    hydrateMedia(root);
  }
  function deleteItem(kind,id,bookId,pageId){
    if(!state.admin)return;
    let item,description,path;
    if(kind==='page'){
      const entry=pageEntry(bookId,pageId);if(!entry)return;
      item=entry.page;path=item.src;description='Se retirará esta imagen y sus notas del libro.';
    }else{
      item=kind==='book'?b(id):c(id);if(!item)return;
      path=item.path;description=kind==='book'?'Se retirará el libro completo, incluyendo sus páginas y notas.':'Se retirará esta colección, sus subcolecciones, libros, portadas y fichas.';
    }
    openModal('Enviar a la papelera',`¿Seguro que quieres eliminar «${item.title}»? ${description} El contenido se conserva en .local/papelera para recuperarlo manualmente.`,[],'Sí, eliminar',async ()=>{
      await requestApi('api/delete',{kind,path});go('biblioteca');
    });
    const confirm=$('#dialog-form [type="submit"]');confirm.classList.add('danger');
  }
  async function exportGithub(){
    if(!state.admin)return;
    try{
      toast('Preparando carpeta pública de GitHub…');
      const result=await requestApi('api/export-github',{});
      const root=$('#modal-root');root.hidden=false;
      root.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-label="Exportación completada"><div class="eyebrow">ATLAS · GITHUB PAGES</div><h2 class="dialog-title">¡Exportación lista!</h2><p class="dialog-desc">Tu carpeta <strong>EXPORTAR_GITHUB</strong> se ha generado en la misma ubicación que INICIAR_BIBLIOTECA.bat.</p>
        <div class="export-summary"><span>${result.collections} colecciones</span><span>${result.books} libros</span><span>${result.pages} fichas</span></div>
        <p class="dialog-desc">Incluye notas públicas, portadas y todas las imágenes. No contiene servidor, SQLite ni botones de edición.</p>
        <div class="export-compression"><strong>${iconHTML('compress')} Optimización sin pérdida</strong><span>${result.compression?.optimized||0} archivos optimizados · ${formatBytes(result.compression?.savedBytes||0)} ahorrados · ${result.compression?.savedPercent||0}% menos en las imágenes que se pudieron optimizar.</span></div>
        <a class="button" href="${e(result.zip)}" download="${e(result.zip)}">${iconHTML('download')} Descargar ZIP público</a>
        <p class="export-help">Para GitHub: sube <strong>el contenido</strong> de la carpeta EXPORTAR_GITHUB a tu repositorio y configura Settings → Pages → Deploy from a branch → main → /(root).</p>
        <div class="dialog-buttons"><button class="button secondary" type="button" data-action="modal-close">Cerrar</button></div></div>`;
      toast('Carpeta EXPORTAR_GITHUB y ZIP creados correctamente');
    }catch(err){toast('Error de exportación: '+err.message,true)}
  }
  function formatBytes(bytes){const n=Number(bytes)||0;if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1)+' KB';if(n<1024*1024*1024)return (n/1024/1024).toFixed(2)+' MB';return (n/1024/1024/1024).toFixed(2)+' GB'}
  async function exportBackup(){
    if(!state.admin)return;
    try{
      toast('Preparando copia completa de Atlas…');
      const result=await requestApi('api/backup/export',{browserSettings:{favorites:[...state.favorites],readerMode:state.mode}});
      const a=document.createElement('a');a.href=result.downloadUrl;a.download=result.filename||'Atlas_Biblioteca_Respaldo.zip';document.body.append(a);a.click();a.remove();
      toast('Copia completa preparada ('+formatBytes(result.bytes)+')');
    }catch(err){toast('No se pudo exportar la copia: '+err.message,true)}
  }
  async function importBackupFile(file){
    if(!state.admin||!file)return;
    const warning='ATENCIÓN: importar esta copia reemplazará TODA la biblioteca actual: colecciones, libros, fichas, notas, portadas, adjuntos y avatar. Atlas creará antes una copia de emergencia automática. Esta acción no se puede deshacer desde la interfaz. ¿Quieres continuar?';
    if(!confirm(warning))return;
    try{
      toast('Guardando preferencias actuales y validando la copia ZIP…');
      await requestApi('api/backup/current-settings',{browserSettings:{favorites:[...state.favorites],readerMode:state.mode}});
      toast('Restaurando la copia ZIP. No cierres Atlas…');
      const response=await fetch('api/backup/import',{method:'POST',headers:{'Content-Type':'application/zip'},body:file});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo importar la copia');
      if(result.browserSettings){safeSet('atlas.favorites',result.browserSettings.favorites||[]);safeSet('atlas.readerMode',result.browserSettings.readerMode||'double');state.favorites=new Set(result.browserSettings.favorites||[]);state.mode=result.browserSettings.readerMode||'double'}
      await refreshCatalog();go('inicio');
      toast('Copia restaurada. Respaldo de emergencia: '+result.emergencyBackup);
    }catch(err){toast('No se pudo importar la copia: '+err.message,true)}
    finally{$('#backup-import-file').value=''}
  }

  function toggleFavorite(pageId){
    if(state.favorites.has(pageId))state.favorites.delete(pageId);else state.favorites.add(pageId);
    safeSet('atlas.favorites',[...state.favorites]);render();
  }

  /* Exportador PDF A4 sin librerías externas.
     Cada imagen se compone en un lienzo A4 de 2480x3508px (300 ppp)
     y se incorpora como JPEG directamente al PDF. */
  const txt = new TextEncoder();
  class PDFWriter{
    constructor(){this.chunks=[];this.length=0;this.offsets=[0];this.add('%PDF-1.4\n%Atlas PDF\n')}
    add(bytes){const chunk=typeof bytes==='string'?txt.encode(bytes):bytes;this.chunks.push(chunk);this.length+=chunk.byteLength}
    begin(n){this.offsets[n]=this.length;this.add(`${n} 0 obj\n`)}
    end(){this.add('endobj\n')}
    stream(n,header,bytes){this.begin(n);this.add(`<< ${header} /Length ${bytes.byteLength} >>\nstream\n`);this.add(bytes);this.add('\nendstream\n');this.end()}
    finish(objectCount){
      const xref=this.length;this.add(`xref\n0 ${objectCount+1}\n0000000000 65535 f \n`);
      for(let i=1;i<=objectCount;i++)this.add(`${String(this.offsets[i]).padStart(10,'0')} 00000 n \n`);
      this.add(`trailer\n<< /Size ${objectCount+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
      return new Blob(this.chunks,{type:'application/pdf'});
    }
  }
  async function pageToJpeg(page){
    const image=new Image();image.decoding='async';image.src=url(page.src);
    await image.decode();
    const w=2480,h=3508,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const context=canvas.getContext('2d',{alpha:false});
    context.fillStyle='#ffffff';context.fillRect(0,0,w,h);
    const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight);
    const dw=image.naturalWidth*scale,dh=image.naturalHeight*scale;
    context.drawImage(image,(w-dw)/2,(h-dh)/2,dw,dh);
    const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('No se pudo convertir imagen a JPG')),'image/jpeg',.91));
    canvas.width=0;canvas.height=0;
    return new Uint8Array(await jpeg.arrayBuffer());
  }
  async function exportPDF(book){
    if(pdfBusy)return;
    if(!book||!book.pages.length){toast('Este libro no tiene imágenes',true);return}
    pdfBusy=true;
    const count=book.pages.length,writer=new PDFWriter();
    try{
      writer.begin(1);writer.add('<< /Type /Catalog /Pages 2 0 R >>\n');writer.end();
      writer.begin(2);
      writer.add(`<< /Type /Pages /Kids [${book.pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] /Count ${count} >>\n`);
      writer.end();
      for(let i=0;i<count;i++){
        toast(`Preparando PDF: ${i+1} de ${count} páginas…`);
        // Give the UI a turn between pages so the progress remains visible.
        await new Promise(resolve=>setTimeout(resolve,10));
        const imageData=await pageToJpeg(book.pages[i]);
        const pageObj=3+3*i,imageObj=pageObj+1,contentObj=pageObj+2;
        writer.begin(pageObj);
        writer.add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Img${i+1} ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>\n`);
        writer.end();
        writer.stream(imageObj,'/Type /XObject /Subtype /Image /Width 2480 /Height 3508 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',imageData);
        writer.stream(contentObj,'',txt.encode(`q\n595.28 0 0 841.89 0 0 cm\n/Img${i+1} Do\nQ\n`));
      }
      const pdf=writer.finish(2+count*3);
      const temporary=URL.createObjectURL(pdf),a=document.createElement('a');
      a.href=temporary;a.download=(book.title.replace(/[\\/:*?"<>|]/g,'').trim()||'Libro')+'.pdf';
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(temporary),60000);
      toast(`PDF generado: ${count} páginas A4.`);
    }catch(error){toast('No se pudo exportar: '+error.message,true);console.error(error)}
    finally{pdfBusy=false}
  }

  document.addEventListener('click',async event=>{
    const trigger=event.target.closest('[data-action]');if(!trigger)return;
    event.preventDefault();const d=trigger.dataset;
    switch(d.action){
      case 'new-collection':createCollection(d.collection||currentCollectionId());break;
      case 'new-book':createBook(d.collection||currentCollectionId());break;
      case 'edit-meta':editMeta(d.kind,d.id);break;
      case 'upload-pages':{const book=b(d.book);if(book)selectUpload(book.path,'page',true);break}
      case 'upload-cover':{const item=d.kind==='book'?b(d.id):c(d.id);if(item)selectUpload(item.path,'cover');break}
      case 'move-page':movePage(d.book,d.page);break;
      case 'edit-page':editPage(d.book,d.page);break;
      case 'view-notes':viewNotes(d.book,d.page);break;
      case 'split-notes':splitNotes(d.book,d.page);break;
      case 'edit-notes':openNoteEditor(d.book,d.page);break;
      case 'delete-item':deleteItem(d.kind,d.id,d.book,d.page);break;
      case 'export-github':exportGithub();break;
      case 'settings':go('configuracion');break;
      case 'backup-export':exportBackup();break;
      case 'backup-import':$('#backup-import-file').click();break;
      case 'upload-avatar':selectUpload('biblioteca','avatar');break;
      case 'choose-icon':{
        const root=$('#modal-root');const hidden=root.querySelector('input[name="icon"]');
        if(hidden){hidden.value=d.icon;root.querySelectorAll('.icon-option').forEach(x=>x.classList.toggle('selected',x.dataset.icon===d.icon))}
        break;
      }
      case 'favorite':toggleFavorite(d.page);break;
      case 'letter':state.letter=d.letter;render();break;
      case 'read-book':go('leer/'+d.book+'/0');break;
      case 'go-book':go('libro/'+d.book);break;
      case 'go-home':go('inicio');break;
      case 'reader-prev':go(`leer/${d.book}/${d.index}`);break;
      case 'reader-next':go(`leer/${d.book}/${d.index}`);break;
      case 'mode':{
        state.mode=d.mode;safeSet('atlas.readerMode',d.mode);render();break
      }
      case 'zoom-in':setReaderZoom(state.zoom+.15);break;
      case 'zoom-out':setReaderZoom(state.zoom-.15);break;
      case 'pdf-book':exportPDF(b(d.book));break;
      case 'reader-fullscreen':toggleReaderFullscreen();break;
      case 'modal-close':closeModal();break;
    }
  });
  $('#file-upload').addEventListener('change',async event=>{
    const files=[...event.target.files];if(!files.length||!state.fileTarget)return;
    const {target,kind}=state.fileTarget;
    try{
      for(let i=0;i<files.length;i++){toast(`Subiendo ${i+1} de ${files.length}…`);await uploadFile(files[i],target,kind)}
      await refreshCatalog();toast(`${formatCount(files.length,'imagen importada','imágenes importadas')} correctamente.`);
    }catch(err){toast(err.message,true);await refreshCatalog()}
    finally{state.fileTarget=null}
  });
  $('#backup-import-file')?.addEventListener('change',event=>{const file=event.target.files?.[0];if(file)importBackupFile(file)});
  $('#global-search').addEventListener('input',event=>{
    state.query=event.target.value; if(route().type!=='buscar')go('buscar');else render();
  });
  $('#global-search').addEventListener('keydown',event=>{if(event.key==='Escape'){event.target.value='';state.query='';go('inicio');event.target.blur()}});
  $('#menu-toggle').addEventListener('click',()=>{ $('#sidebar').classList.toggle('mobile-open');$('#sidebar-shade').hidden=!$('#sidebar').classList.contains('mobile-open') });
  $('#sidebar-shade').addEventListener('click',closeMobile);
  $('#sidebar-add-collection')?.addEventListener('click',()=>createCollection(null));
  $('#header-avatar').addEventListener('click',()=>{if(state.admin)selectUpload('biblioteca','avatar')});
  $('#modal-root').addEventListener('click',event=>{if(event.target===$('#modal-root'))closeModal()});
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!$('#modal-root').hidden)closeModal();
    if(event.key==='/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName) && $('#modal-root').hidden){event.preventDefault();$('#global-search').focus()}
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||!$('#modal-root').hidden)return;
    if(route().type==='leer'){
      if(event.key==='ArrowRight'){event.preventDefault();navReader(1)}
      if(event.key==='ArrowLeft'){event.preventDefault();navReader(-1)}
    }
  });
  window.addEventListener('hashchange',()=>{state.letter='TODAS';render();if(!document.fullscreenElement)window.scrollTo({top:0,behavior:'instant'})});
  // GitHub Pages responde 404 a /api/status; esto habilita edición SOLO en Python local.
  Promise.all([
    fetch('api/status',{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null),
    fetch('catalogo.json',{cache:'no-store'}).then(x=>{if(!x.ok)throw new Error(`No se pudo leer catalogo.json (HTTP ${x.status})`);return x.json()})
  ]).then(([local,catalog])=>{
    const isPublic=document.documentElement.dataset.public==='1';
    const localHost=['localhost','127.0.0.1'].includes(location.hostname);
    state.admin=!isPublic && localHost && Boolean(local?.editor) && local?.version==='1.8';
    state.catalog=catalog;
    renderSidebar();render();
    if(!state.admin && !isPublic && localHost){
      main.insertAdjacentHTML('afterbegin',`<div class="admin-recovery"><strong>ATENCIÓN: estás viendo Atlas sin permisos de edición.</strong> Cierra esta pestaña y abre <code>INICIAR_BIBLIOTECA.bat</code> de la <strong>v1.8</strong>; utiliza únicamente la pestaña que se abra automáticamente. Si has abierto <code>127.0.0.1:8000</code> a mano, podrías estar entrando a una versión anterior.</div>`);
    }
    if(state.admin){console.info('Atlas v1.8: editor local activo · sesión',local.session)}
  }).catch(err=>{
    console.error(err);
    const isFile=location.protocol==='file:';
    const isPublic=document.documentElement.dataset.public==='1';
    const msg=isFile
      ? 'Has abierto index.html como archivo. Para editar, cierra esta pestaña, descomprime toda la carpeta y ejecuta INICIAR_BIBLIOTECA.bat. No abras index.html directamente.'
      : isPublic
        ? 'El catálogo publicado no se encuentra. Revisa que catalogo.json esté en la misma carpeta que index.html en GitHub Pages.'
        : 'No se pudo cargar el catálogo en esta dirección. Abre INICIAR_BIBLIOTECA.bat de esta versión y usa solamente la pestaña que se abra. Si falla, ejecuta DIAGNOSTICAR_ATLAS.bat.';
    const action=!isPublic ? `<p class="recovery-error">Detalle técnico: ${e(err.message)}<br>Dirección abierta: ${e(location.href)}</p><a class="button primary" href="http://127.0.0.1:8765/">Probar editor local en puerto 8765</a>` : `<p class="recovery-error">${e(err.message)}</p>`;
    main.innerHTML=empty('No pudimos abrir el catálogo',msg,action);
    toast('No se pudo cargar el catálogo: revisa el inicio local',true);
  });
})();
