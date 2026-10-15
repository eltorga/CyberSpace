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
  const ICON_BANK = [
    ['books','Libros','📚'],['book','Lectura','📖'],['globe','Mundo','🌐'],['microscope','Ciencia','🔬'],
    ['graduation-cap','Educación','🎓'],['rocket','Espacio','🚀'],['palette','Arte','🎨'],['music','Música','🎵'],
    ['leaf','Naturaleza','🌿'],['atom','Física','⚛️'],['camera','Fotografía','📷'],['heart','Bienestar','♥'],
    ['map','Geografía','🗺️'],['computer','Tecnología','💻'],['stethoscope','Medicina','🩺'],
    ['calculator','Matemáticas','🔢'],['building','Ciudades','🏛️'],['landmark','Historia','🏛️'],
    ['film','Cine','🎞️'],['flask','Química','⚗️'],['star','Destacados','⭐'],['folder','Archivo','📁'],
    ['lightbulb','Ideas','💡'],['trophy','Logros','🏆'],['flower','Botánica','🌼'],
    ['school','Escuela','🏫'],['pencil','Escritura','✎'],['user','Biografías','👤'],['sun','Sol','☀️']
  ];
  const iconHTML = (name,cls='') => `<i class="fi fi-rr-${e(ICON_BANK.some(x=>x[0]===name)?name:'books')} ${cls}" aria-hidden="true"></i>`;
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
  function booksIn(id, recursive=false){return state.catalog.books.filter(book=>book.collectionId===id || (recursive && descendants(id).has(book.collectionId))).sort(sortByTitle)}
  function getAllPages(){return state.catalog.books.flatMap(book=>book.pages.map(page=>({page,book}))).sort((a,b)=>collator.compare(a.page.title,b.page.title))}
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
    const groups=state.catalog.collections.filter(x=>!x.parentId).sort(sortByTitle);
    const nav=$('#collections-nav');
    nav.innerHTML=groups.length ? groups.map(x=>`<a href="#/coleccion/${x.id}" class="nav-link" data-collection-link="${e(x.id)}"><span class="sidebar-collection-icon" style="color:${palettes(x.id).ink}">${iconHTML(x.icon)}</span><span>${e(x.title)}</span></a>`).join('') : '<span class="sidebar-empty">Aún no hay colecciones</span>';
    $('#sidebar-add-collection').hidden=!state.admin;
    $('#sidebar-export-github').hidden=!state.admin;
    $('#header-avatar').title=state.admin?'Cambiar imagen de perfil':'Imagen de perfil';
    $('#header-avatar').disabled=!state.admin;
    $('#avatar-image').src=url(state.catalog.settings?.avatar || 'assets/avatar.svg') + (state.admin?'?v='+encodeURIComponent(state.catalog.generatedAt||''):'');
    $('#sidebar-count').textContent=`${formatCount(state.catalog.stats.pages,'ficha','fichas')} · ${formatCount(state.catalog.stats.books,'libro','libros')}`;
    $('#sync-label').textContent=state.admin?'Editor local activo':'Biblioteca pública';
  }
  function updateNav(r){
    document.querySelectorAll('[data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===r.type || (r.type==='coleccion'&&n.dataset.nav==='biblioteca')));
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
    return `<div class="book-cover ${book.cover?'':'no-image'} ${className}" style="--book-bg:${colors.book}">${book.cover?`<img src="${e(url(book.cover))}" alt="Portada de ${e(book.title)}" loading="lazy">`:`<span class="cover-flourish">✦</span><span class="cover-rule"></span><span class="cover-title">${e(book.title)}</span><span class="cover-rule"></span><span class="cover-foot">ATLAS · BIBLIOTECA</span>`}</div>`;
  }
  function collectionCard(collection){
    const colors=palettes(collection.id);const total=booksIn(collection.id,true).length;
    const visual=`<a class="collection-card" href="#/coleccion/${collection.id}"><div class="collection-illustration" style="--card-background:${colors.bg};--card-color:${colors.ink}">${collection.cover?`<img src="${e(url(collection.cover))}" loading="lazy" alt="Portada ${e(collection.title)}">`:`<span class="collection-glyph">${iconHTML(collection.icon)}</span>`}</div><div class="collection-info"><span class="collection-type">COLECCIÓN</span><span class="collection-name">${e(collection.title)}</span><span class="collection-count">${formatCount(total,'libro','libros')} · explorar →</span></div></a>`;
    return `<div class="collection-card-wrap">${visual}${state.admin?`<button class="collection-card-edit" type="button" data-action="edit-meta" data-kind="collection" data-id="${e(collection.id)}" title="Editar colección" aria-label="Editar colección ${e(collection.title)}">${iconHTML('pencil')}</button>`:''}</div>`;
  }
  function bookCard(book){
    return `<article class="book-card"><a href="#/libro/${book.id}" class="book-link">${cover(book)}<div class="book-title">${e(book.title)}</div><div class="book-meta">${formatCount(book.pageCount,'ficha','fichas')}</div></a>${state.admin?`<button type="button" class="book-more" data-action="edit-meta" data-kind="book" data-id="${e(book.id)}" title="Editar libro">${iconHTML('pencil')}</button>`:''}</article>`;
  }
  function pageCard(item){
    const {page,book}=item; const fav=state.favorites.has(page.id);
    return `<article class="page-card"><a href="#/leer/${book.id}/${page.index}" class="page-thumbnail"><img src="${e(url(page.src))}" alt="${e(page.title)}" loading="lazy"></a>${state.admin?`<button class="page-edit-toggle" type="button" data-action="edit-page" data-book="${e(book.id)}" data-page="${e(page.id)}" aria-label="Editar ficha ${e(page.title)}" title="Editar ficha">${iconHTML('pencil')}</button>`:''}<button aria-label="${fav?'Quitar de favoritos':'Añadir a favoritos'}" title="${fav?'Quitar de favoritos':'Añadir a favoritos'}" class="favorite-toggle ${fav?'is-fav':''}" type="button" data-action="favorite" data-page="${e(page.id)}">${fav?'♥':'♡'}</button><div class="page-title" title="${e(page.title)}">${e(page.title)}</div>${page.notes?`<button type="button" class="page-note-link" data-action="view-notes" data-book="${e(book.id)}" data-page="${e(page.id)}">${iconHTML('book')} Ver notas</button>`:''}</article>`;
  }
  function pageGroups(items){
    const sections=[];let cur='';let acc=[];
    for(const item of items){const letter=alphabet(item.page.title);if(cur!==letter){if(acc.length)sections.push({letter:cur,items:acc});cur=letter;acc=[]}acc.push(item)}
    if(acc.length)sections.push({letter:cur,items:acc});
    return sections.map(group=>`<section><h2 class="letter-section">${e(group.letter)}</h2><div class="pages-grid">${group.items.map(item=>pageCard(item,true)).join('')}</div></section>`).join('');
  }
  function alphabet(str){const v=String(str||'').trim().charAt(0).toLocaleUpperCase('es'); return letters.includes(v)?v:'#'}
  function alphaBar(){return `<div class="alpha-wrap" aria-label="Filtrar por letra">${['TODAS',...letters].map(l=>`<button class="alpha-button ${state.letter===l?'active':''}" type="button" data-action="letter" data-letter="${e(l)}" title="${l==='TODAS'?'Mostrar todas':l}">${l==='TODAS'?'Todo':l}</button>`).join('')}</div>`}
  function empty(title,description,action=''){return `<div class="muted-panel"><div class="empty-icon">✧</div><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`}
  function pathLine(parts){return `<div class="path-line"><a href="#/inicio">Inicio</a>${parts.map(p=>`<span>›</span>${p.href?`<a href="${e(p.href)}">${e(p.text)}</a>`:`<strong>${e(p.text)}</strong>`}`).join('')}</div>`}
  function bookGrid(items){return items.length?`<div class="book-grid">${items.map(bookCard).join('')}</div>`:empty('Todavía no hay libros','Crea un libro y agrega una carpeta de imágenes para verlo aquí.',state.admin?button('+ Nuevo libro','new-book',{},'primary'):'')}

  function renderHome(){
    setTopBreadcrumb('Inicio');
    const top=state.catalog.collections.filter(x=>!x.parentId).sort(sortByTitle);
    const highlighted=state.catalog.books.slice().sort(sortByTitle).slice(0,6);
    main.innerHTML=`<section class="hero"><div class="hero-text"><div class="hero-eyebrow">TU ENCICLOPEDIA PERSONAL</div><h1>Un universo de ideas,<br><em>en tus propias páginas.</em></h1><p>Explora el conocimiento en libros visuales. Organiza, descubre y disfruta cada ficha a tu ritmo.</p></div><div class="hero-books" aria-hidden="true"><div class="hero-book"></div><div class="hero-book"></div><div class="hero-book"></div></div></section>
    <section class="stats-row"><div class="stat-card"><div class="stat-symbol">▤</div><div><div class="stat-value">${state.catalog.stats.collections}</div><div class="stat-name">Colecciones</div></div></div><div class="stat-card"><div class="stat-symbol">▥</div><div><div class="stat-value">${state.catalog.stats.books}</div><div class="stat-name">Libros</div></div></div><div class="stat-card"><div class="stat-symbol">▦</div><div><div class="stat-value">${state.catalog.stats.pages}</div><div class="stat-name">Fichas visuales</div></div></div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Explora tus colecciones</h2><p class="section-sub">Cada colección guarda una historia por descubrir.</p></div><a class="inline-link" href="#/biblioteca">Ver biblioteca <span>↗</span></a></div>${top.length?`<div class="collection-grid">${top.map(collectionCard).join('')}</div>`:empty('Tu biblioteca comienza aquí','Crea una colección y coloca dentro carpetas con libros.',state.admin?button('+ Crear colección','new-collection',{},'primary'):'')}</section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Libros de la biblioteca</h2><p class="section-sub">Una selección de tus libros, siempre disponibles.</p></div><a class="inline-link" href="#/biblioteca">Ver todos <span>↗</span></a></div>${highlighted.length?bookGrid(highlighted):empty('Tus próximos libros aparecerán aquí','Usa el editor local o añade carpetas dentro de biblioteca/.')}</section>`;
  }
  function renderLibrary(){
    setTopBreadcrumb('Mi biblioteca');
    const top=state.catalog.collections.filter(x=>!x.parentId).sort(sortByTitle);
    const controls=state.admin?button('+ Nueva colección','new-collection',{},'primary'):'';
    main.innerHTML=heading('TODAS TUS OBRAS','Mi biblioteca','Colecciones y libros ordenados, con espacio para seguir creciendo.',controls)+`<section class="section"><div class="section-head"><h2 class="section-title">Colecciones</h2></div>${top.length?`<div class="collection-grid">${top.map(collectionCard).join('')}</div>`:empty('Sin colecciones','Crea una para comenzar.')}</section><section class="section"><div class="section-head"><h2 class="section-title">Todos los libros</h2><span class="toolbar-muted">${formatCount(state.catalog.books.length,'libro','libros')}</span></div>${bookGrid(state.catalog.books.slice().sort(sortByTitle))}</section>`;
  }
  function renderCollection(id){
    const collection=c(id);if(!collection){return notFound()}
    setTopBreadcrumb(collection.title);
    const chain=parents(id);
    const children=state.catalog.collections.filter(x=>x.parentId===id).sort(sortByTitle);
    const books=booksIn(id);
    const pagesTotal=booksIn(id,true).reduce((sum,book)=>sum+book.pageCount,0);
    const controls=state.admin?actions([button('+ Nuevo libro','new-book',{collection:id},'primary'),button('+ Subcolección','new-collection',{collection:id}),button('Cambiar portada','upload-cover',{kind:'collection',id}),button('Editar','edit-meta',{kind:'collection',id},'quiet'),button('Eliminar colección','delete-item',{kind:'collection',id},'danger')]):'';
    main.innerHTML=pathLine([{text:'Biblioteca',href:'#/biblioteca'},...chain.map((x,i)=>({text:x.title,href:i===chain.length-1?null:'#/coleccion/'+x.id}))])+
      heading('COLECCIÓN',collection.title,collection.description || `${formatCount(booksIn(id,true).length,'libro','libros')} y ${formatCount(pagesTotal,'ficha','fichas')} en esta colección.`,controls)+
      (children.length?`<section class="section"><div class="section-head"><h2 class="section-title">Subcolecciones</h2></div><div class="collection-grid">${children.map(collectionCard).join('')}</div></section>`:'')+
      `<section class="section"><div class="section-head"><div><h2 class="section-title">Libros</h2><p class="section-sub">Ordenados de la A a la Z</p></div><span class="toolbar-muted">${formatCount(books.length,'libro','libros')}</span></div>${books.length?bookGrid(books):empty('No hay libros todavía','Crea un libro en esta colección o añade una carpeta con páginas.',state.admin?button('+ Nuevo libro','new-book',{collection:id},'primary'):'')}</section>`;
  }
  function renderBook(id){
    const book=b(id);if(!book)return notFound();
    setTopBreadcrumb(book.title);
    const chain=book.collectionId?parents(book.collectionId):[];
    const controls=state.admin?actions([button('Subir imágenes','upload-pages',{book:id},'primary'),button('Portada','upload-cover',{kind:'book',id}),button('Editar','edit-meta',{kind:'book',id},'quiet'),button('Eliminar libro','delete-item',{kind:'book',id},'danger')]):'';
    const ordered=book.pages.filter(p=>state.letter==='TODAS'||alphabet(p.title)===state.letter).map(page=>({page,book}));
    main.innerHTML=pathLine([{text:'Biblioteca',href:'#/biblioteca'},...chain.map(x=>({text:x.title,href:'#/coleccion/'+x.id})),{text:book.title}])+
      `<div class="intro-panel"><div class="intro-cover">${cover(book)}</div><div class="intro-body"><div class="eyebrow">LIBRO VISUAL</div><h2>${e(book.title)}</h2><p>${e(book.description || 'Tu colección de fichas ilustradas, organizada automáticamente por el nombre de cada imagen.')}</p><div class="feature-list"><span>▦ ${formatCount(book.pageCount,'ficha','fichas')}</span><span>⌁ Orden alfabético</span><span>▣ Formato visual</span></div><div class="intro-actions">${button('▶ Abrir libro','read-book',{book:id},'primary',book.pages.length?'':'')}${button('↓ Exportar PDF','pdf-book',{book:id})}${controls}</div></div></div>`+
      `<section class="section"><div class="section-head"><h2 class="section-title">Índice de fichas</h2><span class="toolbar-muted">${book.pageCount} en total</span></div>${alphaBar()}${ordered.length?`<div class="pages-grid">${ordered.map(pageCard).join('')}</div>`:empty('No hay fichas con esta letra',book.pageCount===0?'Agrega imágenes en la carpeta paginas/.':'Elige otra letra del índice.')}</section>`;
    if(!book.pageCount){const read=main.querySelector('[data-action="read-book"]');if(read)read.disabled=true;const pdf=main.querySelector('[data-action="pdf-book"]');if(pdf)pdf.disabled=true;}
  }
  function renderPageIndex(type){
    const faves=type==='favoritos';setTopBreadcrumb(faves?'Favoritos':'Todas las fichas');
    let items=getAllPages().filter(item=>!faves||state.favorites.has(item.page.id));
    if(state.letter!=='TODAS')items=items.filter(item=>alphabet(item.page.title)===state.letter);
    main.innerHTML=heading(faves?'TU SELECCIÓN':'ÍNDICE GENERAL',faves?'Mis favoritos':'Todas las fichas',faves?'Estas páginas se guardan como favoritas en este navegador.':'Busca por la primera letra del nombre de cada ficha.')+alphaBar()+
      (items.length?pageGroups(items):empty(faves?'Aún no tienes favoritos':'Ninguna ficha encontrada',faves?'Toca el corazón de cualquier ficha para guardarla aquí.':'Agrega imágenes y se organizarán automáticamente en este índice.'));
  }
  function renderSearch(){
    setTopBreadcrumb('Resultados de búsqueda');
    const q=state.query.trim();const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
    const match=t=>norm(t).includes(norm(q));
    const books=q?state.catalog.books.filter(x=>match(x.title)||match(x.description)).sort(sortByTitle):[];
    const groups=q?state.catalog.collections.filter(x=>match(x.title)).sort(sortByTitle):[];
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
    const pages=book.pages;const index=Math.max(0,Math.min(pages.length-1,pageNumber));
    if(pages.length===0){main.innerHTML=empty('Este libro todavía está vacío','Agrega imágenes para comenzar a leer.',button('Volver al libro','go-book',{book:id}));return}
    const double=state.mode==='double';const start=double?Math.floor(index/2)*2:index;
    const visible=pages.slice(start,start+(double?2:1));const step=double?2:1;
    const isFav=state.favorites.has(pages[start].id);
    const previous=Math.max(0,start-step);const next=Math.min(pages.length-1,start+step);
    main.innerHTML=`<div class="reader-shell"><div class="reader-header"><div><a class="inline-link" href="#/libro/${id}">← Volver al libro</a><h1 class="reader-title" style="margin-top:12px">${e(book.title)}</h1><div class="reader-subtitle">${e(readerPageNames(visible))}</div></div><div class="reader-controls"><div class="toggle-group" aria-label="Modo de lectura"><button type="button" data-action="mode" data-mode="single" class="${!double?'selected':''}" aria-pressed="${!double}">▯ Una página</button><button type="button" data-action="mode" data-mode="double" class="${double?'selected':''}" aria-pressed="${double}">▣ Dos páginas</button></div>${button(isFav?'♥ Favorita':'♡ Favorito','favorite',{page:pages[start].id},'secondary','small')}${state.admin?button(iconHTML('pencil')+' Editar ficha','edit-page',{book:id,page:pages[start].id},'secondary','small reader-edit-page'):''}${button('↓ PDF','pdf-book',{book:id},'secondary','small')}</div></div>
      <div class="reader-canvas" id="reader-canvas"><button class="reader-arrow" data-action="reader-prev" data-book="${id}" data-index="${previous}" ${start===0?'disabled':''} aria-label="Página anterior">‹</button><div class="reader-spread ${double?'two':'one'}" style="transform:scale(${state.zoom})">${visible.map(page=>`<img src="${e(url(page.src))}" alt="Ficha ${e(page.title)}">`).join('')}</div><button class="reader-arrow" data-action="reader-next" data-book="${id}" data-index="${next}" ${next===start?'disabled':''} aria-label="Página siguiente">›</button></div>
      <div class="reader-bottom"><div class="zoom-group"><button data-action="zoom-out" aria-label="Reducir">−</button><span>${Math.round(state.zoom*100)}%</span><button data-action="zoom-in" aria-label="Ampliar">+</button></div><div class="reader-progress"><span style="width:${Math.round(((start+visible.length)/pages.length)*100)}%"></span></div><span class="reader-number">${start+1}${double&&visible.length===2?'–'+(start+2):''} / ${pages.length}</span></div><p class="reader-tip">Usa las flechas ← → del teclado para pasar páginas.</p>
      <section class="reader-notes"><div class="section-head"><h2 class="section-title">Apuntes de estas fichas</h2><span class="toolbar-muted">Textos y enlaces complementarios</span></div><div class="reader-notes-grid">${visible.map(page=>`<article class="reader-note-card"><div class="note-head"><strong>${e(page.title)}</strong>${state.admin?button(iconHTML('pencil')+' Editar notas','edit-notes',{book:id,page:page.id},'secondary','small'):''}</div>${page.notes?`<div class="notes-content">${page.notes}</div>`:'<p class="note-placeholder">Esta ficha todavía no tiene notas.</p>'}</article>`).join('')}</div></section></div>`;
  }
  function notFound(){setTopBreadcrumb('No encontrada');main.innerHTML=empty('Página no encontrada','El libro o colección puede haber cambiado de carpeta.',button('Volver al inicio','go-home'))}
  function render(){
    const r=route();updateNav(r);closeMobile();
    document.title=`Atlas · ${r.type==='inicio'?'Mi biblioteca':r.type}`;
    switch(r.type){
      case 'inicio':renderHome();break;
      case 'biblioteca':renderLibrary();break;
      case 'coleccion':renderCollection(r.id);break;
      case 'libro':renderBook(r.id);break;
      case 'leer':renderReader(r.id,r.index);break;
      case 'paginas':case 'favoritos':renderPageIndex(r.type);break;
      case 'buscar':renderSearch();break;
      default:notFound();
    }
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
    const html=fields.map(field=>`<div class="field"><label for="field-${e(field.name)}">${e(field.label)}</label>${field.type==='icon'?`<input type="hidden" id="field-${e(field.name)}" name="${e(field.name)}" value="${e(field.value||'books')}"><div class="icon-bank">${ICON_BANK.map(icon=>`<button type="button" class="icon-option ${field.value===icon[0]?'selected':''}" data-action="choose-icon" data-icon="${icon[0]}" title="${e(icon[1])}">${iconHTML(icon[0])}<span>${e(icon[1])}</span></button>`).join('')}</div>`:field.type==='select'?`<select id="field-${e(field.name)}" name="${e(field.name)}" required>${field.options.map(x=>`<option value="${e(x.value)}" ${x.value===field.value?'selected':''}>${e(x.label)}</option>`).join('')}</select>`:`<input id="field-${e(field.name)}" name="${e(field.name)}" ${field.required===false?'':'required'} value="${e(field.value||'')}" placeholder="${e(field.placeholder||'')}" maxlength="300">`}</div>`).join('');
    root.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-label="${e(title)}"><form id="dialog-form"><h2 class="dialog-title">${e(title)}</h2><p class="dialog-desc">${e(description)}</p>${html}<div class="dialog-buttons"><button class="button secondary" type="button" data-action="modal-close">Cancelar</button><button class="button" type="submit">${e(submitText)}</button></div></form></div>`;
    const form=root.querySelector('form');form.querySelector('input,select')?.focus();
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
    const groups=state.catalog.collections.slice().sort(sortByTitle);
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
    buttons.insertAdjacentHTML('afterbegin',`${button('Editar notas','edit-notes',{book:bookId,page:pageId},'secondary','small')}${button('Eliminar ficha','delete-item',{kind:'page',book:bookId,page:pageId},'danger','small')}`);
  }
  function openNoteEditor(bookId,pageId){
    if(!state.admin)return;
    const item=pageEntry(bookId,pageId);if(!item)return;
    const {page}=item,root=$('#modal-root');root.hidden=false;
    root.innerHTML=`<div class="dialog notes-dialog" role="dialog" aria-modal="true" aria-label="Editor de notas"><h2 class="dialog-title">Notas · ${e(page.title)}</h2><p class="dialog-desc">Escribe apuntes, añade enlaces y dales formato. Serán públicos al exportar a GitHub Pages.</p>
      <div class="editor-toolbar" aria-label="Herramientas de formato">
        <button type="button" data-editor-cmd="bold" title="Negrita"><b>B</b></button><button type="button" data-editor-cmd="italic" title="Cursiva"><em>I</em></button>
        <button type="button" data-editor-cmd="underline" title="Subrayado"><u>U</u></button>
        <button type="button" data-editor-block="h2" title="Título">H2</button><button type="button" data-editor-block="h3" title="Subtítulo">H3</button>
        <button type="button" data-editor-block="p" title="Párrafo">¶</button><button type="button" data-editor-cmd="insertUnorderedList" title="Lista">☷</button>
        <button type="button" data-editor-cmd="insertOrderedList" title="Lista numerada">1.</button><button type="button" data-editor-link title="Insertar enlace">${iconHTML('globe')} Enlace</button>
        <label class="editor-color-label" title="Color de texto">Color <input type="color" id="note-color" value="#285548"></label>
      </div>
      <div id="note-rich-editor" class="note-rich-editor notes-content" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Escribe aquí tus apuntes de esta ficha…">${page.notes||''}</div>
      <div class="note-edit-footer"><span>Solo se permiten formatos y enlaces seguros (HTTP, HTTPS o mailto).</span></div>
      <div class="dialog-buttons">${page.notes?`<button type="button" class="button danger" id="delete-note">Eliminar notas</button>`:''}<button type="button" class="button secondary" data-action="modal-close">Cancelar</button><button type="button" class="button" id="save-note">Guardar notas</button></div></div>`;
    const editor=$('#note-rich-editor');editor.focus();
    root.querySelectorAll('[data-editor-cmd]').forEach(btn=>btn.addEventListener('click',()=>{editor.focus();document.execCommand(btn.dataset.editorCmd,false,null)}));
    root.querySelectorAll('[data-editor-block]').forEach(btn=>btn.addEventListener('click',()=>{editor.focus();document.execCommand('formatBlock',false,btn.dataset.editorBlock)}));
    root.querySelector('[data-editor-link]').addEventListener('click',()=>{
      const href=prompt('Dirección del enlace (https://...)');if(!href)return;
      if(!/^(https?:\/\/|mailto:)/i.test(href)){toast('Enlace no válido: utiliza https://, http:// o mailto:',true);return}
      editor.focus();document.execCommand('createLink',false,href);
    });
    root.querySelector('#note-color').addEventListener('change',evt=>{editor.focus();document.execCommand('foreColor',false,evt.target.value)});
    editor.addEventListener('paste',evt=>{evt.preventDefault();const plain=evt.clipboardData?.getData('text/plain')||'';document.execCommand('insertText',false,plain)});
    root.querySelector('#delete-note')?.addEventListener('click',async evt=>{
      if(!confirm('¿Eliminar las notas de «'+page.title+'»? La imagen permanecerá en su libro.'))return;
      evt.target.disabled=true;
      try{await requestApi('api/note',{src:page.src,html:''});closeModal();await refreshCatalog();toast('Notas eliminadas correctamente')}
      catch(err){evt.target.disabled=false;toast(err.message,true)}
    });
    root.querySelector('#save-note').addEventListener('click',async evt=>{
      evt.target.disabled=true;
      try{await requestApi('api/note',{src:page.src,html:editor.innerHTML});closeModal();await refreshCatalog();toast('Notas guardadas y listas para exportar')}
      catch(err){evt.target.disabled=false;toast(err.message,true)}
    });
  }
  function viewNotes(bookId,pageId){
    const item=pageEntry(bookId,pageId);if(!item)return;
    const {page}=item;const root=$('#modal-root');root.hidden=false;
    root.innerHTML=`<div class="dialog notes-dialog" role="dialog" aria-modal="true" aria-label="Notas de ${e(page.title)}"><h2 class="dialog-title">${e(page.title)}</h2><div class="eyebrow">MIS APUNTES</div><div class="notes-content notes-view">${page.notes||'<p>No hay notas para esta ficha.</p>'}</div><div class="dialog-buttons"><button class="button secondary" type="button" data-action="modal-close">Cerrar</button>${state.admin?button(iconHTML('pencil')+' Editar','edit-notes',{book:bookId,page:pageId},'primary'):''}</div></div>`;
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
        <a class="button" href="${e(result.zip)}" download="${e(result.zip)}">↓ Descargar ZIP público</a>
        <p class="export-help">Para GitHub: sube <strong>el contenido</strong> de la carpeta EXPORTAR_GITHUB a tu repositorio y configura Settings → Pages → Deploy from a branch → main → /(root).</p>
        <div class="dialog-buttons"><button class="button secondary" type="button" data-action="modal-close">Cerrar</button></div></div>`;
      toast('Carpeta EXPORTAR_GITHUB y ZIP creados correctamente');
    }catch(err){toast('Error de exportación: '+err.message,true)}
  }
  function toggleFavorite(pageId){
    if(state.favorites.has(pageId))state.favorites.delete(pageId);else state.favorites.add(pageId);
    safeSet('atlas.favorites',[...state.favorites]);render();
  }
  function navReader(dir){
    const r=route();if(r.type!=='leer')return;
    const book=b(r.id);if(!book)return;
    const start=state.mode==='double'?Math.floor(r.index/2)*2:r.index;
    const step=state.mode==='double'?2:1;
    const n=Math.max(0,Math.min(book.pages.length-1,start+step*dir));
    go(`leer/${book.id}/${n}`);
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
      case 'edit-notes':openNoteEditor(d.book,d.page);break;
      case 'delete-item':deleteItem(d.kind,d.id,d.book,d.page);break;
      case 'export-github':exportGithub();break;
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
      case 'zoom-in':state.zoom=Math.min(1.8,Math.round((state.zoom+.15)*100)/100);render();break;
      case 'zoom-out':state.zoom=Math.max(.7,Math.round((state.zoom-.15)*100)/100);render();break;
      case 'pdf-book':exportPDF(b(d.book));break;
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
  $('#global-search').addEventListener('input',event=>{
    state.query=event.target.value; if(route().type!=='buscar')go('buscar');else render();
  });
  $('#global-search').addEventListener('keydown',event=>{if(event.key==='Escape'){event.target.value='';state.query='';go('inicio');event.target.blur()}});
  $('#menu-toggle').addEventListener('click',()=>{ $('#sidebar').classList.toggle('mobile-open');$('#sidebar-shade').hidden=!$('#sidebar').classList.contains('mobile-open') });
  $('#sidebar-shade').addEventListener('click',closeMobile);
  $('#sidebar-add-collection').addEventListener('click',()=>createCollection(null));
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
  window.addEventListener('hashchange',()=>{state.letter='TODAS';render();window.scrollTo({top:0,behavior:'instant'})});
  // GitHub Pages responde 404 a /api/status; esto habilita edición SOLO en Python local.
  Promise.all([
    fetch('api/status',{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null),
    fetch('catalogo.json',{cache:'no-store'}).then(x=>{if(!x.ok)throw new Error(`HTTP ${x.status}`);return x.json()})
  ]).then(([local,catalog])=>{
    const isPublic=document.documentElement.dataset.public==='1';
    const localHost=['localhost','127.0.0.1'].includes(location.hostname);
    state.admin=!isPublic && localHost && Boolean(local?.editor) && local?.version>=3;
    state.catalog=catalog;
    renderSidebar();render();
    if($('#admin-banner'))$('#admin-banner').hidden=!state.admin;
    if(!state.admin && !isPublic && localHost){
      main.insertAdjacentHTML('afterbegin',`<div class="admin-recovery"><strong>ATENCIÓN: estás viendo Atlas sin permisos de edición.</strong> Cierra esta pestaña y abre <code>INICIAR_BIBLIOTECA.bat</code> de la <strong>v3</strong>; utiliza únicamente la pestaña que se abra automáticamente. Si has abierto <code>127.0.0.1:8000</code> a mano, podrías estar entrando a una versión anterior.</div>`);
    }
    if(state.admin){console.info('Atlas v3: editor local activo · sesión',local.session)}
  }).catch(err=>{
    console.error(err);
    main.innerHTML=empty('No pudimos abrir el catálogo','Inicia el servidor con «python tools/server.py» y abre http://localhost:8000. Si estás en GitHub Pages, revisa que el archivo catalogo.json exista.');
    toast('Error al cargar el catálogo',true);
  });
})();
