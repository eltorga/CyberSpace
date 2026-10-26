
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

let state={books:[],translations:[],categories:[],settings:{},highlights:[],notes:[],media:[],collections:[],collection_items:[],favorites:[],history:[],image_projects:[]};
let view="home", currentBook="JHN", currentChapter=3, selectedVerse=0, selectedText="", selectedTranslation="rv1909", searchTerm="";
let activeCollectionId=null;
let selectedVerses=new Set(), currentVerses=[], imageVerseRef="", imageVerseText="";
function refs(){return [...selectedVerses].sort((a,b)=>a-b).map(n=>`${currentBook}.${currentChapter}.${n}`)}
function selectedRefs(){return refs().join(',')}
function refsInclude(value,refval){return String(value||'').split(',').includes(refval)}
function selectedLabel(){return `${book()?.es||''} ${currentChapter}:${[...selectedVerses].sort((a,b)=>a-b).join(', ')}`}
function multiNotes(){return state.notes.filter(n=>refs().some(r=>refsInclude(n.reference,r)))}
function multiMedia(){return state.media.filter(n=>refs().some(r=>refsInclude(n.reference,r)))}
function htmlPastel(hex){let c=String(hex||'#dfc78b').replace('#','');if(!/^[0-9a-f]{6}$/i.test(c))return '#f7f2e5';const n=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16));return '#'+n.map(x=>Math.round(x*.28+255*.72).toString(16).padStart(2,'0')).join('')}


function toast(msg){const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.remove("show"),2600);}
async function api(path,opts={}){const r=await fetch(path,{headers:{"Content-Type":"application/json",...(opts.headers||{})},...opts}); const data=await r.json(); if(!r.ok||data.ok===false) throw new Error(data.error||"Error"); return data;}
function book(){return state.books.find(b=>b.id===currentBook)||state.books[0];}
function translation(id){return state.translations.find(t=>t.id===id)||state.translations[0];}
function availableTranslations(){return state.translations;}

function ref(){return `${currentBook}.${currentChapter}.${selectedVerse}`;}
function humanRef(){const b=book(); return `${b?.es||""} ${currentChapter}:${selectedVerse}`;}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function isPublicItem(x){return Number(x?.is_public??1)===1;}
function coverPath(b){return state.book_covers?.[b.id] ? "/"+state.book_covers[b.id] : `/covers/${b.id}.svg`;}
function visibleBooks(){return state.books.filter(b=>state.settings.canon==="protestant" ? !b.deuterocanonical : true);}
function getHighlights(bid,ch,verse,tid=selectedTranslation){return state.highlights.filter(h=>h.book_id===bid&&Number(h.chapter)===Number(ch)&&Number(h.verse)===Number(verse)&&(h.translation_id===tid||!h.translation_id));}
function getNoteForReference(reference){return state.notes.filter(n=>refsInclude(n.reference,reference));}
function getMediaForReference(reference){return state.media.filter(m=>refsInclude(m.reference,reference));}
function getCollectionsForReference(reference){const ids=state.collection_items.filter(x=>x.item_type==="verse"&&refsInclude(x.reference,reference)).map(x=>x.collection_id); return state.collections.filter(c=>ids.includes(c.id));}
function favoriteActive(reference){return state.favorites.some(x=>x.reference===reference);}

function renderShell(){
  const nav=[
    ["home","Inicio","home"],["timeline","Línea de Tiempo","time-past"],["library","Biblioteca","book-alt"],["bible","Biblia","bookmark"],["compare","Comparar","book-alt"],
    ["collections","Colecciones","folder-open"],["media","Videos","play-alt"],["gallery","Galería","picture"],
    ["images","Editor","edit"],["settings","Configuración","settings"]
  ];
  $("#app").innerHTML=`
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark"><img src="senda-logo.png" alt="Libro abierto y cruz"></div><div><h1>Senda</h1><small>Biblia · Estudio</small></div></div>
      <div class="nav">${nav.map(n=>`<button data-view="${n[0]}" class="${view===n[0]?'active':''}"><i class="fi fi-rr-${n[2]}"></i>${n[1]}</button>`).join("")}</div>
      <div class="sidebar-bottom">
        <div class="status"><strong>Panel local</strong><span class="mode-dot">Edición habilitada</span></div>
        <button class="btn soft" id="backupBtn" title="Crear copia de seguridad ZIP de la base de datos y portadas"><i class="fi fi-rr-disk"></i> Respaldar Senda</button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="top-left"><button class="iconbtn mobile-only" id="menuBtn"><i class="fi fi-rr-menu-burger"></i></button><div><div class="page-title" id="pageTitle">Inicio</div><div class="crumb" id="crumb">Senda · Panel local</div></div></div>
        <div class="top-actions"><span class="save-status" id="saveStatus">Datos en SQLite · borradores en navegador</span><button class="btn soft" id="saveAllBtn" title="Confirmar cambios en SQLite"><i class="fi fi-rr-check"></i> Guardar cambios</button><div class="top-search"><i class="fi fi-rr-search"></i><input id="globalSearchInput" aria-label="Buscar en Senda" placeholder="Buscar libro, nota, colección…"></div><a class="btn soft" href="/sitio/" target="_blank" rel="noopener noreferrer" title="Ver el sitio público actualizado"><i class="fi fi-rr-eye"></i> Ver sitio</a></div>
      </header>
      <section class="content" id="content"></section>
    </main>
  </div>`;
  $$(".nav button").forEach(b=>b.onclick=()=>{view=b.dataset.view; $("#sidebar")?.classList.remove("open"); render();});
  $("#menuBtn").onclick=()=>$("#sidebar").classList.toggle("open");
  $("#globalSearchInput").onkeydown=e=>{if(e.key==="Enter"){searchTerm=e.target.value;view="search";render();setTimeout(()=>{const input=$("#searchInput");if(input){input.value=searchTerm;runSearch()}},10)}};
  $("#backupBtn").onclick=backup;
  $("#saveAllBtn").onclick=async()=>{try{const d=await api('/api/save',{method:'POST',body:'{}'});$('#saveStatus').textContent=d.publication?.ok===false?'Guardado · revisar sitio':'Guardado ✓';toast(d.publication?.ok===false?'Guardado local, pero falló la actualización del sitio.':'Cambios guardados y sitio actualizado en docs/.');}catch(e){toast(e.message)}};
}

function render(){
  renderShell();
  const titles={home:"Inicio",library:"Biblioteca",bible:"Biblia",compare:"Comparar",collections:"Colecciones",search:"Buscar",media:"Multimedia",images:"Editor",gallery:"Galería",timeline:"Línea de Tiempo",collection_detail:"Colección",settings:"Configuración"};
  $("#pageTitle").textContent=titles[view]||"Senda";
  const f={home:renderHome,library:renderLibrary,bible:renderBible,compare:renderCompare,collections:renderCollections,search:renderSearch,media:renderMedia,gallery:renderGallery,images:renderImages,timeline:renderTimeline,collection_detail:renderCollectionDetail,settings:renderSettings}[view]||renderHome;
  f();
  icons();
}

function renderHome(){
  const notes=state.notes.length, pics=state.image_projects.length+(state.illustrations||[]).length, favs=state.favorites.length, media=state.media.length;
  const last=state.history[0]?.reference;
  $("#content").innerHTML=`
  <div class="hero">
    <div class="hero-card">
      <div class="eyebrow">Senda · Biblia de estudio</div>
      <h2>Mi camino de estudio en la Palabra de Dios.</h2>
      <p>Un espacio personal para leer, comparar traducciones, guardar reflexiones, marcar pasajes y construir tus propias colecciones.</p>
      <button class="btn" id="continueBtn">${last?`Continuar ${esc(last)}`:"Abrir la Biblia"} <i class="fi fi-rr-arrow-right"></i></button>
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${notes}</div><small>Notas</small></div>
      <div class="stat"><div class="num">${media}</div><small>Videos</small></div>
      <div class="stat"><div class="num">${pics}</div><small>Imágenes</small></div>
      <div class="stat"><div class="num">${favs}</div><small>Favoritos</small></div>
    </div>
  </div>
  <div class="section-head"><h3>Comenzar</h3></div>
  <div class="grid-3">
    <div class="card" style="padding:18px"><div class="pill"><i class="fi fi-rr-book-alt"></i> Biblia</div><h3 style="margin:12px 0 6px">Lee por libro y capítulo</h3><p class="muted" style="font-size:12px;line-height:1.6">Los 73 libros ya están preparados. El canon se puede cambiar desde Configuración.</p><button class="btn soft" data-go="library">Ver biblioteca</button></div>
    <div class="card" style="padding:18px"><div class="pill"><i class="fi fi-rr-pencil"></i> Estudio</div><h3 style="margin:12px 0 6px">Marca lo que quieras recordar</h3><p class="muted" style="font-size:12px;line-height:1.6">Selecciona una palabra o un versículo y asigna una categoría de color.</p><button class="btn soft" data-go="bible">Empezar</button></div>
    <div class="card" style="padding:18px"><div class="pill"><i class="fi fi-rr-folder-open"></i> Colecciones</div><h3 style="margin:12px 0 6px">Construye tu biblioteca</h3><p class="muted" style="font-size:12px;line-height:1.6">Agrupa pasajes de distintos libros en colecciones con portada, color e icono.</p><button class="btn soft" data-go="collections">Ver colecciones</button></div>
  </div>
  <div class="section-head"><h3>Actividad reciente</h3><button class="btn soft" data-go="gallery">Abrir galería</button></div>
  <div id="homeMood" class="mood-masonry"></div>`;
  renderActivityMood();
  $$("[data-go]").forEach(b=>b.onclick=()=>{view=b.dataset.go;render()});
  $("#continueBtn").onclick=()=>{ if(last){const m=last.match(/^([A-Z0-9]+)\.(\d+)\.(\d+)$/); if(m){currentBook=m[1];currentChapter=+m[2];selectedVerse=+m[3];}} view="bible";render();};
}

function renderLibrary(){
  const arr=visibleBooks();
  const groups=[["OT","Antiguo Testamento"],["DC","Deuterocanónicos"],["NT","Nuevo Testamento"]];
  $("#content").innerHTML=`<div class="section-head"><div><h2 style="margin:0;font-family:Georgia,serif">Biblioteca bíblica</h2><div class="muted" style="font-size:12px;margin-top:4px">${arr.length} libros visibles · ${state.settings.canon==="protestant"?"canon protestante":"canon católico"}</div></div><div class="filters"><select class="select" id="libCanon"><option value="catholic" ${state.settings.canon!=="protestant"?"selected":""}>Católico · 73</option><option value="protestant" ${state.settings.canon==="protestant"?"selected":""}>Protestante · 66</option></select></div></div>
  <div class="card api-library-hint"><i class="fi fi-rr-check-circle"></i><span>Biblias en español sin API: Senda instala automáticamente 7 ediciones libres al abrir por primera vez. <strong id="bibleInstallSummary">Comprobando ediciones...</strong> <button class="text-link" id="refreshBibles">Actualizar estado</button></span></div>
  ${groups.map(g=>{const bs=arr.filter(b=>b.section===g[0]); if(!bs.length)return ""; return `<div class="section-head"><h3>${g[1]}</h3></div><div class="book-grid">${bs.map(b=>`<div class="card book-card" data-book-card="${b.id}"><img class="book-cover" src="${esc(coverPath(b))}" alt="${esc(b.es)}"><button class="book-cover-edit" data-book-cover="${b.id}" title="Cambiar portada"><i class="fi fi-rr-pencil"></i></button><div class="book-info"><strong>${esc(b.es)}</strong><span>${esc(b.en)} · ${b.chapters} capítulos</span>${b.deuterocanonical?`<span class="book-badge">Deuterocanónico</span>`:""}</div></div>`).join("")}</div>`}).join("")}`;
  $('#refreshBibles').onclick=()=>refreshBibleInstallation(true);
  refreshBibleInstallation(false);
  $("#libCanon").onchange=async()=>{try{const d=await api("/api/settings",{method:"POST",body:JSON.stringify({canon:$("#libCanon").value})});state.settings=d.settings;render()}catch(e){toast(e.message)}};
  $$('[data-book-cover]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openBookCoverModal(btn.dataset.bookCover)});
  $$('[data-book-card]').forEach(c=>c.onclick=()=>{currentBook=c.dataset.bookCard;currentChapter=1;selectedVerse=0;view="bible";render()});
}
function renderBible(){
  const b=book(); const t=translation(selectedTranslation);
  if(!availableTranslations().some(t=>t.id===selectedTranslation))selectedTranslation='onbv';
  $("#crumb").textContent=`${b?.es||""} · ${currentChapter}`;
  $("#content").innerHTML=`
  <div class="reader-shell">
    <div class="card reader-card">
      <div class="reader-toolbar">
        <select class="select" id="bookSelect">${visibleBooks().map(x=>`<option value="${x.id}" ${x.id===currentBook?"selected":""}>${esc(x.es)}</option>`).join("")}</select>
        <select class="select" id="chapterSelect">${Array.from({length:b?.chapters||1},(_,i)=>i+1).map(n=>`<option ${n===currentChapter?"selected":""}>${n}</option>`).join("")}</select>
        <select class="select" id="translationSelect">${availableTranslations().map(x=>`<option value="${x.id}" ${x.id===selectedTranslation?"selected":""}>${esc(x.abbr)} · ${esc(x.name)}</option>`).join("")}</select>
        <div class="chapter-nav"><button class="iconbtn" id="prevChapter"><i class="fi fi-rr-angle-left"></i></button><button class="iconbtn" id="nextChapter"><i class="fi fi-rr-angle-right"></i></button></div>
      </div>
      <div class="reader-title"><div><h2>${esc(b?.es||"Biblia")} ${currentChapter}</h2><small>${esc(t?.name||"")} · selecciona un versículo para estudiar</small></div><button class="iconbtn" id="readerCompare" title="Comparar traducciones"><i class="fi fi-rr-book-alt"></i></button></div>
      <div id="chapterStatus" class="empty" style="margin:15px 0">Cargando capítulo…</div>
      <div class="reader-text" id="readerText"></div>
    </div>
    <aside class="card side-panel" id="versePanel"><div class="side-title"><h3>Selecciona un versículo</h3></div><div class="empty" style="margin-top:12px">Al seleccionar un versículo aparecerán aquí sus notas, recursos y colecciones.</div></aside>
  </div>`;
  $("#bookSelect").onchange=()=>{currentBook=$("#bookSelect").value;currentChapter=1;selectedVerse=0;selectedVerses.clear();renderBible();};
  $("#chapterSelect").onchange=()=>{currentChapter=+$("#chapterSelect").value;selectedVerse=0;selectedVerses.clear();loadChapter();};
  $("#translationSelect").onchange=()=>{selectedTranslation=$("#translationSelect").value;const label=document.querySelector(".reader-title small");if(label)label.textContent=(translation(selectedTranslation)?.name||selectedTranslation)+" · selecciona un versículo para estudiar";loadChapter();};
  $("#prevChapter").onclick=()=>changeChapter(-1); $("#nextChapter").onclick=()=>changeChapter(1);
  $("#readerCompare").onclick=()=>{view="compare";render()};
  loadChapter();
}

function changeChapter(delta){
  const b=book(); let n=currentChapter+delta;
  if(n<1){const idx=visibleBooks().findIndex(x=>x.id===b.id); if(idx>0){currentBook=visibleBooks()[idx-1].id;currentChapter=visibleBooks()[idx-1].chapters}else return}
  else if(n>b.chapters){const idx=visibleBooks().findIndex(x=>x.id===b.id); if(idx<visibleBooks().length-1){currentBook=visibleBooks()[idx+1].id;currentChapter=1}else return}
  else currentChapter=n;
  selectedVerse=0;selectedVerses.clear(); renderBible();
}

async function loadChapter(){
  const status=$("#chapterStatus"), target=$("#readerText"); if(!status||!target)return;
  status.className="empty"; status.style.display="block";status.textContent=`Cargando ${book().es} ${currentChapter}…`;target.innerHTML="";
  try{
    const d=await api(`/api/scripture?translation=${encodeURIComponent(selectedTranslation)}&book=${encodeURIComponent(currentBook)}&chapter=${currentChapter}`);
    if(!d.verses?.length)throw new Error("No se recibieron versículos para este capítulo.");
    currentVerses=d.verses;renderVerses(d.verses);
    status.style.display="none";
    const at=$("#scriptureAttribution"); if(at)at.remove();
    if(d.attribution){const footer=document.createElement("div");footer.id="scriptureAttribution";footer.className="scripture-attribution";footer.textContent=d.attribution;target.after(footer);}
  }catch(e){
    status.className="warning";
    status.innerHTML=`<strong>No se pudo cargar el capítulo completo.</strong><p>${esc(e.message)}</p><button class="btn soft" id="retryChapter">Reintentar</button>`;
    $("#retryChapter").onclick=loadChapter;
    showVersePanel();
  }
}

function decorateText(text, hs){
  if(!hs.length)return esc(text);
  let out=esc(text);
  const ordered=[...hs].sort((a,b)=>String(b.selected_text||"").length-String(a.selected_text||"").length);
  ordered.forEach(h=>{
    const s=String(h.selected_text||"").trim();
    const style=`--hl:${h.color}`;
    if(!s){out=`<span class="highlighted" style="${style}">${out}</span>`;return;}
    const safe=esc(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    try{out=out.replace(new RegExp(safe),`<span class="highlighted" style="${style}">$&</span>`);}catch(_){}
  });
  return out;
}

function renderVerses(verses){
 const target=$("#readerText");if(!target)return;
 target.innerHTML=verses.map(v=>{
  const hs=getHighlights(currentBook,currentChapter,v.verse,selectedTranslation);
  const notes=state.notes.filter(n=>refsInclude(n.reference,`${currentBook}.${currentChapter}.${v.verse}`));
  const cat=state.collections.find(c=>c.id===+notes[0]?.collection_id)||state.categories.find(c=>c.id===notes[0]?.category_id);
  return `<div class="verse ${selectedVerses.has(v.verse)?"selected":""} ${cat?"verse-noted":""}" ${cat?`style="--note-color:${htmlPastel(cat.color)}"`:""} data-verse="${v.verse}" data-text="${esc(v.text)}" tabindex="0" role="button" aria-label="Seleccionar versículo ${v.verse}">
  <span class="verse-num">${v.verse}</span><span class="verse-text">${decorateText(v.text,hs)}</span>
  </div>`;
 }).join("") || `<div class="empty">No hay versículos disponibles.</div>`;
 $$(".verse",target).forEach(el=>{el.onclick=()=>selectVerse(+el.dataset.verse);el.onkeydown=e=>{if(e.key==='Enter')selectVerse(+el.dataset.verse)}});
 showVersePanel();
}

function selectVerse(v){
  if(selectedVerses.has(v))selectedVerses.delete(v);else selectedVerses.add(v);
  selectedVerse=selectedVerses.size?[...selectedVerses].sort((a,b)=>a-b)[0]:0;
  selectedText='';
  $$('.verse').forEach(x=>x.classList.toggle('selected',selectedVerses.has(+x.dataset.verse)));
  showVersePanel();
  if(selectedVerse)api('/api/history',{method:'POST',body:JSON.stringify({reference:ref()})}).catch(()=>{});
}

function selectedVerseData(){
  const el=$(`.verse[data-verse="${selectedVerse}"]`);
  return {text:el?.dataset.text||"",verse:selectedVerse};
}

function showVersePanel(){
 const p=$('#versePanel');if(!p)return;
 if(!selectedVerses.size){
  const prefix=currentBook+'.';
  const counts=[state.notes.filter(x=>x.reference.includes(prefix)).length,state.media.filter(x=>x.reference.includes(prefix)).length,state.image_projects.filter(x=>x.reference.includes(prefix)).length+(state.illustrations||[]).filter(x=>x.reference.startsWith(prefix)).length,state.favorites.filter(x=>x.reference.startsWith(prefix)).length];
  p.innerHTML=`<div class="side-title"><h3>${esc(book()?.es||'Libro')} · Estadísticas</h3></div><p class="muted mini">Selecciona uno o varios versículos. Pulsa nuevamente para deseleccionar.</p><div class="sidebar-stat-grid">${counts.map((n,i)=>`<div><i class="${['fi fi-rr-note','fi fi-rr-play-alt','fi fi-rr-picture','fi fi-rr-star'][i]}"></i><strong>${n}</strong><small>${['Notas','Videos','Imágenes','Favoritos'][i]}</small></div>`).join('')}</div>`;return;
 }
 const list=refs(), notes=multiNotes(), media=multiMedia();const first=list[0],fav=favoriteActive(first);
 p.innerHTML=`<div class="side-title"><div><h3>${esc(selectedLabel())}</h3><small class="muted">${list.length} versículo(s)</small></div>${list.length===1?`<button class="iconbtn ${fav?'is-fav':''}" id="panelFav" title="Favorito"><span class="fav-glyph">${fav?'★':'☆'}</span></button>`:''}</div>
 <div class="side-block"><div class="filters"><button class="btn soft" id="addNote"><i class="fi fi-rr-note"></i> Nueva nota</button><button class="btn soft" id="addMedia"><i class="fi fi-rr-play-alt"></i> Video</button>${list.length===1?`<button class="btn soft" id="createVerseImage"><i class="fi fi-rr-picture"></i> Imagen</button><button class="btn soft" id="addIllustration"><i class="fi fi-rr-picture"></i> Ilustración</button>`:''}</div></div>
 <div class="side-block"><strong class="side-subhead">Notas (${notes.length})</strong>${notes.map(n=>{const c=state.collections.find(x=>x.id===+n.collection_id)||state.categories.find(x=>x.id===n.category_id);return `<div class="note-preview note-compact" style="border-left:4px solid ${esc(c?.color||'#e5b84b')}"><h4>${esc(n.title||n.reference)}</h4><small>${esc(refsPretty(n.reference))} · ${esc(versionLabel(n))}</small><div class="note-actions"><button class="iconbtn" data-view-note="${n.id}" title="Ver nota"><i class="fi fi-rr-eye"></i></button><button class="iconbtn" data-edit-note="${n.id}" title="Editar"><i class="fi fi-rr-pencil"></i></button><button class="iconbtn" data-delete-note="${n.id}" title="Eliminar"><i class="fi fi-rr-trash"></i></button></div></div>`}).join('')||'<div class="muted mini">Sin notas.</div>'}</div>
 <div class="side-block"><strong class="side-subhead">Ilustraciones</strong><div class="illustration-inline">${(state.illustrations||[]).filter(x=>list.includes(x.reference)).map(x=>`<button type="button" data-view-illustration="${x.id}"><img src="/${esc(x.file_path)}" alt="${esc(x.title)}"></button>`).join('')||'<p class="muted mini">Sin ilustraciones.</p>'}</div></div>
 <div class="side-block"><strong class="side-subhead">Videos (${media.length})</strong>${media.map(m=>`<button class="video-chip" data-open-video="${m.id}"><i data-lucide="play"></i><span>${esc(m.title||'Video de YouTube')}<small>${esc(m.subtitle||'')}</small></span></button>`).join('')||'<div class="muted mini">Sin videos.</div>'}</div>`;
 if($('#panelFav'))$('#panelFav').onclick=toggleFavorite;
 $('#addNote').onclick=()=>openNoteModal();$('#addMedia').onclick=()=>openMediaModal();
 if($('#createVerseImage'))$('#createVerseImage').onclick=()=>{const v=selectedVerseData();imageVerseRef=ref();imageVerseText=v.text;view='images';render()};
 if($('#addIllustration'))$('#addIllustration').onclick=()=>openIllustrationModal();
 $$('[data-view-note]',p).forEach(b=>b.onclick=()=>viewNote(state.notes.find(n=>n.id==b.dataset.viewNote)));
 $$('[data-edit-note]',p).forEach(b=>b.onclick=()=>openNoteModal(state.notes.find(n=>n.id==b.dataset.editNote)));
 $$('[data-delete-note]',p).forEach(b=>b.onclick=()=>deleteItem('note',+b.dataset.deleteNote));
 $$('[data-open-video]',p).forEach(b=>b.onclick=()=>openYoutube(state.media.find(m=>m.id==b.dataset.openVideo)));
 $$('[data-view-illustration]',p).forEach(b=>b.onclick=()=>showIllustration((state.illustrations||[]).find(x=>x.id==b.dataset.viewIllustration)));
}

function viewNote(n){
 if(!n)return;
 openModal(`<div class="modal-head"><div><h3>${esc(n.title||'Nota')}</h3><div class="muted">${esc(n.reference)}</div></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div><article class="note-reading html">${n.html||''}</article><div class="modal-actions"><button class="btn soft" data-close>Cerrar</button><button class="btn primary" id="editViewingNote"><i class="fi fi-rr-pencil"></i> Editar</button></div>`);
 $("#editViewingNote").onclick=()=>openNoteModal(n);
}


const TEXT_COLORS=['#17202a','#374151','#a43b43','#b45309','#047857','#1d4ed8','#7c3aed','#ad3b77','#ffffff'];
const PASTEL_COLORS=['#fff1bd','#f9d2ce','#d6eafa','#d7efdf','#e9defa','#fce2c6','#f9dce7','#ccece9','#f1ead7','#ffffff'];
function icons(){
 const alias={'house':'home','bookmark':'bookmark','book-open':'book-alt','book-copy':'book-alt','folders':'folder-open','video':'play-alt','image':'picture','images':'picture','settings':'settings','search':'search','menu':'menu-burger','save':'disk','check':'check','pencil':'pencil','trash-2':'trash','eye':'eye','x':'cross-small','plus':'add','cloud-upload':'cloud-upload','refresh-cw':'refresh','chevron-down':'angle-down','chevron-left':'angle-left','chevron-right':'angle-right','flip-horizontal':'refresh','flip-vertical':'refresh','rotate-ccw':'refresh','table':'table','quote':'quote-right','link':'link','palette':'palette','highlighter':'highlighter','undo-2':'undo','redo-2':'redo','list':'list','list-ordered':'list-ol','align-left':'align-left','align-center':'align-center','align-right':'align-right','bold':'bold','italic':'italic','underline':'underline','strikethrough':'strikethrough','download':'download','upload':'upload','camera':'camera','key-round':'key','shield-check':'shield-check','info':'info','book-heart':'book-heart','folder-open':'folder-open','star':'star','book':'book-alt'};
 $$('[data-lucide]').forEach(el=>{const key=el.dataset.lucide;el.className='fi fi-rr-'+(alias[key]||key);el.removeAttribute('data-lucide')});
}
function coloredCategoryPicker(initial='important'){
 return `<div class="category-selector" id="categoryPicker"><button class="category-trigger" type="button" id="categoryTrigger"><span id="categoryCurrent"></span><i data-lucide="chevron-down"></i></button><div class="category-menu" id="categoryMenu" hidden>${state.categories.map(c=>`<button type="button" data-category="${esc(c.id)}" class="category-item"><span class="cat-swatch" style="background:${esc(c.color)}"></span><span>${esc(c.label)}</span></button>`).join('')}</div><input type="hidden" id="noteCategory" value="${esc(initial)}"></div>`;
}
function initCategoryPicker(){
 const hidden=$('#noteCategory'), menu=$('#categoryMenu');
 const update=()=>{const c=state.categories.find(x=>x.id===hidden.value)||state.categories[0];$('#categoryCurrent').innerHTML=`<span class="cat-swatch" style="background:${esc(c.color)}"></span><strong>${esc(c.label)}</strong>`;$$('[data-category]',menu).forEach(b=>b.classList.toggle('chosen',b.dataset.category===hidden.value));};
 $('#categoryTrigger').onclick=()=>{menu.hidden=!menu.hidden;icons()};
 $$('[data-category]',menu).forEach(btn=>btn.onclick=()=>{hidden.value=btn.dataset.category;menu.hidden=true;update()});update();
}
function editorHTML(id,value=''){
 const commands=[['bold','bold'],['italic','italic'],['underline','underline'],['strikeThrough','strikethrough'],['insertUnorderedList','list'],['insertOrderedList','list-ordered'],['justifyLeft','align-left'],['justifyCenter','align-center'],['justifyRight','align-right'],['undo','undo-2'],['redo','redo-2']];
 return `<div class="editor" data-editor="${id}"><div class="editor-toolbar refined-toolbar"><button type="button" data-format="p" title="Párrafo">P</button><button type="button" data-format="h2" title="Título">H2</button><button type="button" data-format="h3" title="Subtítulo">H3</button><button type="button" data-format="blockquote" title="Cita"><i class="fi fi-rr-quote-right"></i></button>${commands.map(([cmd,ico])=>`<button type="button" data-edit-cmd="${cmd}" title="${({bold:'Negrita',italic:'Cursiva',underline:'Subrayado',strikeThrough:'Tachado',insertUnorderedList:'Lista con viñetas',insertOrderedList:'Lista numerada',justifyLeft:'Alinear a la izquierda',justifyCenter:'Centrar',justifyRight:'Alinear a la derecha',undo:'Deshacer',redo:'Rehacer'})[cmd]||cmd}">${cmd==='insertOrderedList'?'<b class="ordered-list-symbol">1.</b>':`<i data-lucide="${ico}"></i>`}</button>`).join('')}
 <button type="button" data-role="link" title="Insertar enlace"><i data-lucide="link"></i></button><button type="button" data-role="quote" title="Cita"><i data-lucide="quote"></i></button>
 <div class="palette-wrap"><button type="button" data-toggle-palette="text" title="Color del texto"><i data-lucide="palette"></i><span class="small-caption">Texto</span></button><div class="swatch-pop" data-palette="text" hidden>${TEXT_COLORS.map(c=>`<button type="button" data-color="${c}" class="color-swatch" style="background:${c}" title="${c}"></button>`).join('')}</div></div>
 <div class="palette-wrap"><button type="button" data-toggle-palette="background" title="Resaltar texto"><i data-lucide="highlighter"></i><span class="small-caption">Fondo</span></button><div class="swatch-pop" data-palette="background" hidden>${PASTEL_COLORS.map(c=>`<button type="button" data-color="${c}" class="color-swatch" style="background:${c}" title="${c}"></button>`).join('')}</div></div>
 <button type="button" data-role="table-toggle" title="Insertar tabla"><i class="fi fi-rr-table"></i></button><div class="table-chooser" hidden><label>Insertar tabla · Filas <input type="number" data-role="tableRows" min="1" max="12" value="3"></label><label>Columnas <input type="number" data-role="tableCols" min="1" max="8" value="3"></label><button class="btn soft" type="button" data-role="table"><i data-lucide="table"></i> Insertar tabla</button></div></div>
 <div class="editor-body" id="${id}" contenteditable="true">${value}</div></div>`;
}
function setupRichEditor(id){
 const root=$(`[data-editor="${id}"]`), body=$('#'+id,root);let saved=null;
 const saveRange=()=>{const sel=window.getSelection();if(sel?.rangeCount&&body.contains(sel.anchorNode)){saved=sel.getRangeAt(0).cloneRange()}};
 const restore=()=>{body.focus();if(saved){const sel=window.getSelection();sel.removeAllRanges();sel.addRange(saved)}};
 body.addEventListener('mouseup',saveRange);body.addEventListener('keyup',saveRange);
 const execute=(cmd,val=null)=>{restore();document.execCommand(cmd,false,val);saveRange()};
 $$('[data-edit-cmd]',root).forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>execute(b.dataset.editCmd)});
 $$('[data-format]',root).forEach(b=>b.onclick=()=>execute('formatBlock',b.dataset.format));
 $('[data-role="quote"]',root).onclick=()=>execute('formatBlock','blockquote');
 $('[data-role="link"]',root).onclick=()=>{const url=prompt('Pega el enlace completo (https://)');if(url){if(!/^https:\/\//i.test(url))return toast('Solamente enlaces HTTPS');execute('createLink',url)}};
 $('[data-role="table-toggle"]',root).onclick=()=>{$('.table-chooser',root).hidden=!$('.table-chooser',root).hidden};
 $('[data-role="table"]',root).onclick=()=>{const rows=Math.min(12,Math.max(1,+$('[data-role="tableRows"]',root).value||1));const cols=Math.min(8,Math.max(1,+$('[data-role="tableCols"]',root).value||1));const markup='<table><tbody>'+Array.from({length:rows},()=>'<tr>'+Array.from({length:cols},()=>'<td>&nbsp;</td>').join('')+'</tr>').join('')+'</tbody></table><p></p>';execute('insertHTML',markup);$('.table-chooser',root).hidden=true};
 $$('[data-toggle-palette]',root).forEach(b=>b.onclick=()=>{const pal=$(`[data-palette="${b.dataset.togglePalette}"]`,root);pal.hidden=!pal.hidden});
 $$('[data-color]',root).forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const type=b.closest('[data-palette]').dataset.palette;execute(type==='text'?'foreColor':'hiliteColor',b.dataset.color);b.closest('[data-palette]').hidden=true}});
 icons();return body;
}
function openNoteModal(existing){
 if(!selectedVerses.size && !existing){toast('Selecciona uno o varios versículos');return}
 const r=existing?.reference||selectedRefs();
 openModal(`<div class="modal-head"><div><h3>${existing?'Editar nota':'Nueva nota'}</h3><div class="muted mini">${esc(existing?.reference||selectedLabel())}</div></div><button class="iconbtn" data-close><i data-lucide="x"></i></button></div>
 <div class="field"><label>Título</label><input class="input" id="noteTitle" value="${esc(existing?.title||'')}"></div>
 <div class="field"><label>Mi reflexión</label>${editorHTML('noteBody',existing?.html||'')}</div>
 <div class="field"><label>Significado a recordar · Colección</label>${collectionPicker('noteCollection',existing?.collection_id)}</div>
 <div class="modal-actions"><button class="btn soft" data-close>Cancelar</button><button class="btn primary" id="saveNote"><i data-lucide="save"></i> Guardar nota</button></div>`);
 initCollectionPicker('noteCollection');const body=setupRichEditor('noteBody');icons();
 // Recuperar borrador de la sesión en localStorage; la escritura definitiva sigue siendo SQLite.
 const draftKey='senda.note.'+(existing?.id||r);try{if(!existing&&localStorage.getItem(draftKey))body.innerHTML=localStorage.getItem(draftKey)}catch(e){}
 body.oninput=()=>{try{localStorage.setItem(draftKey,body.innerHTML)}catch(e){}};
 $('#saveNote').onclick=async()=>{if(!body.textContent.trim()){toast('Escribe tu reflexión antes de guardar.');return}
 try{const d=await api('/api/note',{method:'POST',body:JSON.stringify({id:existing?.id,scope:'verse',reference:r,title:$('#noteTitle').value.trim(),html:body.innerHTML.trim(),translation_id:existing?.translation_id||selectedTranslation,category_id:categoryForCollection(+$('#noteCollection').value),collection_id:+$('#noteCollection').value, is_public:true})});state=d.state;state=await api('/api/state');try{localStorage.removeItem(draftKey)}catch(e){}closeModal();renderVerses(currentVerses);toast('Nota guardada en SQLite');}catch(e){toast(e.message)}};
}

function openMediaModal(existing=null){
 if(!selectedVerses.size&&!existing){toast('Selecciona uno o varios versículos');return}
 const references=existing?.reference||selectedRefs();
 openModal(`<div class="modal-head"><h3>${existing?'Editar video':'Añadir video'}</h3><button class="iconbtn" data-close><i data-lucide="x"></i></button></div><p class="muted mini">${esc(references)}</p>
 <div class="field"><label>Título</label><input class="input" id="mediaTitle" value="${esc(existing?.title||'')}" placeholder="Título del video"></div>
 <div class="field"><label>Subtítulo</label><input class="input" id="mediaSubtitle" value="${esc(existing?.subtitle||'')}" placeholder="Descripción breve"></div>
 <div class="field"><label>Enlace de YouTube</label><input class="input" id="mediaUrl" value="${esc(existing?.youtube_url||'')}" placeholder="https://www.youtube.com/watch?v=..."></div>
 <div class="field"><label>Descripción o comentario personal</label>${editorHTML('mediaRichBody',existing?.description_html||esc(existing?.description||''))}</div>
 <div class="field"><label>Colección</label>${collectionPicker('mediaCollection',existing?.collection_id)}</div>
 <div class="modal-actions"><button class="btn soft" data-close>Cancelar</button><button class="btn primary" id="saveMedia"><i data-lucide="save"></i> Guardar video</button></div>`);
 initCollectionPicker('mediaCollection');const body=setupRichEditor('mediaRichBody');icons();
 $('#saveMedia').onclick=async()=>{const url=$('#mediaUrl').value.trim();if(!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)){toast('Introduce un enlace de YouTube válido');return}
 try{const d=await api('/api/media',{method:'POST',body:JSON.stringify({id:existing?.id,reference:references,kind:'video',title:$('#mediaTitle').value.trim(),subtitle:$('#mediaSubtitle').value.trim(),description_html:body.innerHTML,description:body.textContent.trim(),youtube_url:url,translation_id:existing?.translation_id||selectedTranslation,collection_id:+$('#mediaCollection').value})});state=d.state;closeModal();showVersePanel();toast('Video guardado en SQLite')}catch(e){toast(e.message)}};
}

function openCollectionPicker(){
  if(!selectedVerses.size){toast('Selecciona versículos primero');return}
  const groupRefs=refs();
  openModal(`<div class="modal-head"><div><h3>Añadir a colección</h3><div class="muted" style="font-size:11px;margin-top:3px">${esc(existing?.reference||selectedLabel())}</div></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div>
  <div class="export-list">${state.collections.map(c=>`<button class="btn soft" style="text-align:left" data-collection="${c.id}"><i class="${esc(c.icon)}"></i> ${esc(c.name)}</button>`).join("")||`<div class="empty">No tienes colecciones. Crea una desde Colecciones.</div>`}</div>
  <div class="modal-actions"><button class="btn soft" data-close>Cerrar</button><button class="btn primary" id="newCollectionFromPicker">Nueva colección</button></div>`);
  $$("[data-collection]").forEach(b=>b.onclick=async()=>{try{for(const reference of groupRefs){await api("/api/collection-item",{method:"POST",body:JSON.stringify({collection_id:+b.dataset.collection,item_type:"verse",reference})})}state=await api("/api/state");closeModal();showVersePanel();toast("Añadido a la colección");}catch(e){toast(e.message)}});
  $("#newCollectionFromPicker").onclick=()=>{closeModal();openCollectionModal()};
}

const SENDA_UICONS=['book-alt','book-open-cover','bookmark','star','heart','cross','dove','leaf','sun','moon','cloud','sparkles','crown','home','church','bell','pray','hands-praying','hands-holding-heart','hand-holding-heart','comment-alt','quote-right','pencil','scroll','document-signed','shield-check','lock','key','globe','world','compass','mountain','tree','flower','seedling','water','fire-flame-curved','lightbulb','eye','search','calendar','clock','gift','users','user','angel','music','music-alt','headphones','play','feather','diamond','flag','trophy','graduation-cap'];
const SENDA_COLORS=['#e5b84b','#d95c5c','#4f7cac','#5c9b6e','#8b6fb1','#e07a3f','#d98aa5','#6fa8c9','#8b6f47','#8a8f98','#bf9fbb','#91b3a7','#607d8b','#b0ab67','#bf7890'];
function openCollectionModal(existing=null){
 let icon=existing?.icon||'fi fi-rr-book-alt';let color=existing?.color||'#8b6f47';let coverTicket=null;
 openModal(`<div class="modal-head"><div><h3>${existing?'Editar colección':'Nueva colección'}</h3></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div>
 <div class="field"><label>Nombre</label><input class="input" id="colName" value="${esc(existing?.name||'')}"></div>
 <div class="field"><label>Descripción</label><textarea class="input" id="colDesc" rows="3">${esc(existing?.description||'')}</textarea></div>
 <div class="field"><label>Portada fotográfica de Unsplash (opcional)</label><div class="photo-search-bar"><input class="input" id="colPhotoQ" placeholder="Busca una imagen para esta colección"><button class="btn soft" id="colPhotoSearch"><i class="fi fi-rr-search"></i> Buscar</button></div><div id="colPhotoResults" class="photo-results"></div><p class="mini muted" id="colPhotoStatus">${existing?.cover?'La colección tiene portada guardada.':'También puedes dejar el fondo de color.'}</p></div>
 <div class="field"><label>Encuadre de la portada</label><div id="cropPreview" class="crop-preview" style="background:${esc(color)};${existing?.cover?'background-image:url(/'+esc(existing.cover)+')':''};background-position:${esc(existing?.cover_position||'50% 50%')}"></div><div class="crop-sliders"><label>Horizontal <input id="cropX" type="range" min="0" max="100" value="${parseInt(existing?.cover_position||'50',10)}"></label><label>Vertical <input id="cropY" type="range" min="0" max="100" value="${parseInt((existing?.cover_position||'50% 50%').split(' ')[1],10)||50}"></label></div></div>
 <div class="field"><label>Paleta de colores</label><div class="swatch-row">${SENDA_COLORS.map(c=>`<button class="color-swatch ${c===color?'active':''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div></div>
 <div class="field"><label>Icono cristiano o de estudio · ${SENDA_UICONS.length} opciones</label><div class="icon-picker">${SENDA_UICONS.map(k=>`<button class="icon-choice ${icon==='fi fi-rr-'+k?'active':''}" data-icon="fi fi-rr-${k}" title="${k}"><i class="fi fi-rr-${k}"></i></button>`).join('')}</div></div>
 <div class="modal-actions"><button class="btn soft" data-close>Cancelar</button><button class="btn primary" id="saveCollection">Guardar colección</button></div>`);
 ['cropX','cropY'].forEach(id=>$('#'+id).oninput=()=>{$('#cropPreview').style.backgroundPosition=$('#cropX').value+'% '+$('#cropY').value+'%'});
 $$('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color;$$('[data-color]').forEach(x=>x.classList.toggle('active',x===b))});
 $$('[data-icon]').forEach(b=>b.onclick=()=>{icon=b.dataset.icon;$$('[data-icon]').forEach(x=>x.classList.toggle('active',x===b))});
 $('#colPhotoSearch').onclick=async()=>{const box=$('#colPhotoResults');const status=$('#colPhotoStatus');status.textContent='Buscando en Unsplash…';try{const d=await api('/api/photos/search?q='+encodeURIComponent($('#colPhotoQ').value)+'&provider=unsplash');box.innerHTML=d.photos.map(p=>`<button type="button" class="photo-choice" data-cover-ticket="${esc(p.key)}"><img loading="lazy" src="${esc(p.thumb)}" alt="Foto de ${esc(p.photographer)}"></button>`).join('');$$('[data-cover-ticket]',box).forEach(b=>b.onclick=()=>{coverTicket=b.dataset.coverTicket;$$('[data-cover-ticket]',box).forEach(x=>x.classList.toggle('active',x===b));status.textContent='Portada seleccionada. Ajusta el encuadre en la vista previa.';if($('#cropPreview')){$('#cropPreview').style.backgroundImage='url('+JSON.stringify(b.querySelector('img').src)+')'}});if(!d.photos.length)status.textContent='No se encontraron fotografías.'}catch(e){status.textContent=e.message}};
 $("#saveCollection").onclick=async()=>{const name=$("#colName").value.trim();if(!name){toast('Escribe un nombre.');return}
 try{const d=await api('/api/collection',{method:'POST',body:JSON.stringify({id:existing?.id,name,description:$('#colDesc').value,cover:existing?.cover||'',color,icon,cover_position:$('#cropX').value+'% '+$('#cropY').value+'%',is_public:true})});state=d.state;if(coverTicket){const r=await api('/api/collection-cover',{method:'POST',body:JSON.stringify({id:d.id,ticket:coverTicket})});state=r.state}closeModal();render();toast('Colección guardada');}catch(e){toast(e.message)}};
}

function renderCollections(){
  $("#content").innerHTML=`<div class="section-head"><div><h2 style="margin:0;font-family:Georgia,serif">Mis colecciones</h2><div class="muted" style="font-size:12px;margin-top:4px">Agrupa versículos de distintos libros en tus propios estudios.</div></div><button class="btn primary" id="newCol"><i class="fi fi-rr-add"></i> Nueva colección</button></div>
  <div class="section-head"><h3>Colecciones esenciales</h3></div><div class="grid-5">${state.collections.filter(c=>c.is_default).map(c=>`<div class="card collection-card"><div class="collection-cover" style="background:${esc(c.color)}"><i class="${esc(c.icon)}"></i></div><div class="collection-body"><strong>${esc(c.name)}</strong><p>${esc(c.description||"Sin descripción")}</p><div style="display:flex;gap:6px;margin-top:10px"><button class="btn soft" data-edit-col="${c.id}">Editar</button><button class="btn soft" data-view-col="${c.id}">Abrir</button>${c.is_default?'':`<button class="btn danger" data-del-col="${c.id}">Eliminar</button>`}</div></div></div>`).join("")}</div><div class="section-head"><h3>Mis colecciones</h3></div><div class="grid-5">${state.collections.filter(c=>!c.is_default).map(c=>`<div class="card collection-card"><div class="collection-cover" style="background:${esc(c.color)}"><i class="${esc(c.icon)}"></i></div><div class="collection-body"><strong>${esc(c.name)}</strong><p>${esc(c.description||'Sin descripción')}</p><div class="filters"><button class="btn soft" data-edit-col="${c.id}">Editar</button><button class="btn soft" data-view-col="${c.id}">Abrir</button><button class="btn danger" data-del-col="${c.id}">Eliminar</button></div></div></div>`).join('')||'<div class="empty">Crea una colección personalizada.</div>'}</div>`;
  $$('.collection-card').forEach((card,i)=>{const cs=[...state.collections.filter(c=>c.is_default),...state.collections.filter(c=>!c.is_default)];const c=cs[i];if(!c)return;const photo=card.querySelector('.collection-cover');if(c.cover&&c.cover.startsWith('collection_covers/')){photo.style.backgroundImage='linear-gradient(0deg,#1115,#1111),url("/'+encodeURI(c.cover)+'")';photo.style.backgroundSize='cover';photo.style.backgroundPosition='center'}const badge=photo.querySelector('i');if(badge){badge.style.background='white';badge.style.color=c.color;badge.style.borderRadius='11px';badge.style.padding='12px';badge.style.fontSize='23px'}const title=card.querySelector('.collection-body strong');if(title)title.style.color=c.color;});
  $("#newCol").onclick=()=>openCollectionModal();
  $$("[data-edit-col]").forEach(b=>b.onclick=()=>openCollectionModal(state.collections.find(c=>c.id==b.dataset.editCol)));
  $$("[data-del-col]").forEach(b=>b.onclick=()=>deleteItem("collection",+b.dataset.delCol));
  $$("[data-view-col]").forEach(b=>b.onclick=()=>openCollection(+b.dataset.viewCol));
}
function openCollection(e){
  const id=+(e?.currentTarget?.dataset?.viewCol||e?.dataset?.viewCol||e); const c=state.collections.find(x=>x.id===id); if(!c)return;
  const items=state.collection_items.filter(x=>x.collection_id===id&&x.item_type==="verse");
  openModal(`<div class="modal-head"><div><h3>${esc(c.name)}</h3><div class="muted" style="font-size:11px">${items.length} versículo(s)</div></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div>
  <div class="note-list">${items.map(i=>{
    const notes=state.notes.filter(n=>refsInclude(n.reference,i.reference));
    const media=state.media.filter(m=>refsInclude(m.reference,i.reference));
    return `<div class="note-preview"><strong>${esc(i.reference)}</strong>
    ${notes.map(n=>`<div class="html"><strong>${esc(n.title||'Reflexión')}</strong><div>${n.html}</div></div>`).join('')}
    ${media.map(m=>`<div class="muted mini"><i class="fi fi-rr-play-alt"></i> ${esc(m.title||'Video')}</div>`).join('')}
    ${(state.illustrations||[]).filter(x=>x.reference===i.reference).map(x=>`<div class="collection-inline-visual"><img src="/${esc(x.file_path)}" alt="${esc(x.title)}"><span>${esc(x.title)}</span></div>`).join('')}
    ${state.image_projects.filter(x=>x.reference===i.reference).map(x=>`<div class="collection-inline-visual"><img src="${x.image_data}" alt="${esc(x.title)}"><span>${esc(x.title)}</span></div>`).join('')}
    <button class="btn soft" data-open-ref="${esc(i.reference)}" style="margin-top:8px">Abrir versículo</button></div>`
  }).join("")||`<div class="empty">Esta colección todavía está vacía.</div>`}</div>`);
  $$("[data-open-ref]").forEach(b=>b.onclick=()=>{const m=b.dataset.openRef.match(/^([A-Z0-9]+)\.(\d+)\.(\d+)$/); if(m){currentBook=m[1];currentChapter=+m[2];selectedVerse=+m[3];selectedVerses=new Set([selectedVerse]);closeModal();view="bible";render();}});
}

function renderCompare(){
  const b=book();
  $("#content").innerHTML=`<div class="section-head"><div><h2 style="margin:0;font-family:Georgia,serif">Comparar traducciones</h2><div class="muted" style="font-size:12px;margin-top:4px">La selección de versículo se sincroniza entre ambas columnas.</div></div>
  <div class="filters"><select class="select" id="cmpBook">${visibleBooks().map(x=>`<option value="${x.id}" ${x.id===currentBook?"selected":""}>${esc(x.es)}</option>`).join("")}</select><select class="select" id="cmpChapter">${Array.from({length:b.chapters},(_,i)=>`<option ${i+1===currentChapter?"selected":""}>${i+1}</option>`).join("")}</select></div></div>
  <div class="compare">
    <div class="card translation-pane"><header><strong id="cmpNameA">—</strong><select class="select" id="cmpA">${availableTranslations().map(t=>`<option value="${t.id}" ${t.id===selectedTranslation?"selected":""}>${esc(t.abbr)}</option>`).join("")}</select></header><div id="cmpVersesA" class="compare-verses"><div class="empty">Cargando…</div></div></div>
    <div class="card translation-pane"><header><strong id="cmpNameB">—</strong><select class="select" id="cmpB">${state.translations.map(t=>`<option value="${t.id}" ${t.id===(state.settings.compare_translation||"ntv")?"selected":""}>${esc(t.abbr)}</option>`).join("")}</select></header><div id="cmpVersesB" class="compare-verses"><div class="empty">Cargando…</div></div></div>
  </div>`;
  const load=async()=>{const a=$("#cmpA").value,bid=$("#cmpB").value; try{const [A,B]=await Promise.all([api(`/api/scripture?translation=${encodeURIComponent(a)}&book=${currentBook}&chapter=${currentChapter}`),api(`/api/scripture?translation=${encodeURIComponent(bid)}&book=${currentBook}&chapter=${currentChapter}`)]); renderCompareVerses(A,"cmpVersesA");renderCompareVerses(B,"cmpVersesB");$("#cmpNameA").textContent=A.translation;$("#cmpNameB").textContent=B.translation;}catch(e){$("#cmpVersesA").innerHTML=`<div class="warning">${esc(e.message)}</div>`;$("#cmpVersesB").innerHTML=`<div class="warning">${esc(e.message)}</div>`;}};
  $("#cmpBook").onchange=()=>{currentBook=$("#cmpBook").value;currentChapter=1;renderCompare()};
  $("#cmpChapter").onchange=()=>{currentChapter=+$("#cmpChapter").value;load()};
  $("#cmpA").onchange=load;$("#cmpB").onchange=load;load();
}
function renderCompareVerses(data,id){
  const box=$("#"+id); box.innerHTML=(data.verses||[]).map(v=>`<div class="compare-row ${v.verse===selectedVerse?"sync":""}" data-v="${v.verse}"><div class="compare-num">${v.verse}</div><div class="compare-text">${esc(v.text)}</div></div>`).join("")||`<div class="empty">Sin datos.</div>`;
  $$(".compare-row",box).forEach(x=>x.onclick=()=>{selectedVerse=+x.dataset.v; $$(".compare-row").forEach(y=>y.classList.toggle("sync",+y.dataset.v===selectedVerse));});
}

function renderSearch(){
  $("#content").innerHTML=`<div class="section-head"><div><h2 style="margin:0;font-family:Georgia,serif">Buscar</h2><div class="muted" style="font-size:12px;margin-top:4px">Busca en tus notas, colecciones, recursos y en los libros preparados.</div></div></div>
  <div class="searchbox"><input class="input" id="searchInput" value="${esc(searchTerm)}" placeholder="Ej. Juan 3:16, promesa, oración…"><button class="btn primary" id="searchBtn"><i class="fi fi-rr-search"></i> Buscar</button></div>
  <div id="searchResults" style="margin-top:16px"></div>`;
  $("#searchBtn").onclick=runSearch;$("#searchInput").onkeydown=e=>{if(e.key==="Enter")runSearch()};
}
function runSearch(){
  const q=$("#searchInput").value.trim().toLowerCase(); if(!q){$("#searchResults").innerHTML=`<div class="empty">Escribe algo para buscar.</div>`;return}
  const results=[];
  state.notes.forEach(n=>{const hay=(n.title+" "+n.html+" "+n.reference).toLowerCase();if(hay.includes(q))results.push({kind:"Nota",title:n.title||n.reference,ref:n.reference,html:n.html})});
  state.collections.forEach(c=>{if((c.name+" "+c.description).toLowerCase().includes(q))results.push({kind:"Colección",title:c.name,ref:`${state.collection_items.filter(i=>i.collection_id===c.id).length} elementos`,html:c.description})});
  visibleBooks().filter(b=>(b.es+" "+b.en+" "+b.id).toLowerCase().includes(q)).forEach(b=>results.push({kind:"Libro",title:b.es,ref:`${b.chapters} capítulos`,html:b.en}));
  $("#searchResults").innerHTML=results.map(r=>`<div class="note-preview" style="margin-bottom:8px"><span class="pill">${esc(r.kind)}</span><h4 style="margin-top:8px">${esc(r.title)}</h4><div class="muted" style="font-size:11px">${esc(r.ref)}</div><div class="html" style="margin-top:6px">${r.html||""}</div></div>`).join("")||`<div class="empty">No encontré resultados.</div>`;
}

function youtubeId(url){return (String(url||'').match(/(?:v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/)||[])[1]||''}
function mediaThumb(m){const id=youtubeId(m.youtube_url);return id?'https://img.youtube.com/vi/'+id+'/hqdefault.jpg':''}
function renderMedia(){
 $('#content').innerHTML=`<div class="section-head"><div><h2>Videos</h2><p class="muted mini">Tus videos asociados a versículos, organizados por sus portadas.</p></div></div><div class="video-board">${state.media.map(m=>`<button class="video-tile" style="border:1px solid ${esc(getColForItem(m)?.color||'#e8e8e5')}" data-open-video="${m.id}"><div class="video-cover">${mediaThumb(m)?`<img loading="lazy" src="${mediaThumb(m)}" alt="Portada del video">`:''}<span class="video-play"><i class="fi fi-rr-play"></i></span></div><strong>${esc(m.title||'Video')}</strong></button>`).join('')||'<div class="empty">Añade un video desde un versículo para verlo aquí.</div>'}</div>`;
 $$('[data-open-video]').forEach(b=>b.onclick=()=>openYoutube(state.media.find(m=>m.id==b.dataset.openVideo)));
}
function openYoutube(m){
 if(!m)return;
 const id=(m.youtube_url.match(/(?:v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/)||[])[1];
 if(!id){toast('Enlace de YouTube no reconocido');return}
 openModal(`<div class="modal-head"><div><h3>${esc(m.title||'Video')}</h3><div class="muted mini">${esc(m.subtitle||'')}</div></div><button class="iconbtn" data-close><i data-lucide="x"></i></button></div>
 <iframe style="width:100%;aspect-ratio:16/9;border:0;border-radius:14px" src="https://www.youtube.com/embed/${id}?rel=0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen></iframe>
 <p class="muted mini"><i class="fi fi-rr-bookmark"></i> ${esc(refsPretty(m.reference))} · ${esc(versionLabel(m))} <button class="text-link" id="mediaGoVerse">Abrir versículo ↗</button></p><div class="note-reading html media-description">${m.description_html||esc(m.description||'')}</div><div class="modal-actions"><button class="btn soft" id="editOpenedMedia"><i data-lucide="pencil"></i> Editar</button><button class="btn danger" id="deleteOpenedMedia"><i data-lucide="trash-2"></i> Eliminar</button></div>`);
 if($('#mediaGoVerse'))$('#mediaGoVerse').onclick=()=>{closeModal();openReference(m.reference,m.translation_id)};
 $('#editOpenedMedia').onclick=()=>openMediaModal(m);
 $('#deleteOpenedMedia').onclick=async()=>{closeModal();await deleteItem('media',m.id)};icons();
}

let galleryTab='all';
function refsPretty(s){return String(s||'').replace(/^([A-Z0-9]{3})\.(\d+)\.(\d+)$/,(_,id,c,v)=>`${state.books.find(b=>b.id===id)?.es||id} ${c}:${v}`)}
function galleryItems(){const created=state.image_projects.map(p=>({...p,type:'created',image:p.image_data,date:p.updated_at}));const illustrations=(state.illustrations||[]).map(p=>({...p,type:'illustration',image:'/'+p.file_path,date:p.updated_at}));return [...created,...illustrations].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))}
function renderGallery(){
 const all=galleryItems(), items=galleryTab==='all'?all:all.filter(x=>x.type===galleryTab);
 $('#content').innerHTML=`<div class="section-head"><div><h2>Galería</h2><p class="muted mini">Imágenes e ilustraciones asociadas a los versículos de Senda.</p></div></div><div class="gallery-tabs">${[['all','Todas'],['created','Imágenes creadas'],['illustration','Ilustraciones']].map(([v,l])=>`<button class="btn ${galleryTab===v?'primary':'soft'}" data-tab="${v}">${l}</button>`).join('')}</div><div class="mood-masonry">${items.map(x=>`<button class="mood-card gallery-colored" style="border-color:${esc(getColForItem(x)?.color||'#e8e8e5')}" data-gallery-type="${x.type}" data-gallery-id="${x.id}"><img loading="lazy" src="${esc(x.image||'')}" alt="${esc(x.title||'Imagen bíblica')}"><span class="mood-card-info"><strong>${esc(x.title||refsPretty(x.reference))}</strong><small>${esc(refsPretty(x.reference))} · ${esc(versionLabel(x))}</small></span></button>`).join('')||'<div class="empty">Tu galería está vacía. Selecciona un versículo para crear una imagen o subir una ilustración.</div>'}</div>`;
 $$('[data-tab]').forEach(b=>b.onclick=()=>{galleryTab=b.dataset.tab;renderGallery()});
 $$('[data-gallery-id]').forEach(b=>b.onclick=()=>{const id=+b.dataset.galleryId;if(b.dataset.galleryType==='created'){const p=state.image_projects.find(x=>x.id===id);if(p)showGalleryCreated(p)}else{const x=(state.illustrations||[]).find(x=>x.id===id);if(x)showIllustration(x)}});
}
function showGalleryCreated(p){
 openModal(`<div class="modal-head"><div><h3>${esc(p.title||'Imagen creada')}</h3><p class="muted mini">${esc(refsPretty(p.reference))} · ${esc(versionLabel(p))}</p></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div><img class="gallery-detail" src="${esc(p.image_data)}" alt="Imagen creada"><div class="modal-actions"><button class="btn soft" id="visitProject">Abrir versículo ↗</button><button class="btn soft" id="editProject"><i class="fi fi-rr-pencil"></i> Editar</button><button class="btn soft" id="saveProjectPNG"><i class="fi fi-rr-download"></i> Descargar</button><button class="btn danger" id="delProject">Eliminar</button></div>`);
 if($('#visitProject'))$('#visitProject').onclick=()=>{closeModal();openReference(p.reference,p.translation_id)};
 $('#editProject').onclick=()=>{closeModal();view='images';renderImages(p)};
 $('#saveProjectPNG').onclick=()=>{const a=document.createElement('a');a.href=p.image_data;a.download='Senda_'+p.id+'.png';a.click()};
 $('#delProject').onclick=async()=>{closeModal();await deleteItem('image_project',p.id)};icons();
}
function showIllustration(p){
 openModal(`<div class="modal-head"><div><h3>${esc(p.title)}</h3><p class="muted mini">${esc(refsPretty(p.reference))} · ${esc(versionLabel(p))}</p></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div><img class="gallery-detail" src="/${esc(p.file_path)}" alt="Ilustración"><div class="note-reading html media-description">${p.description_html||''}</div><div class="modal-actions"><button class="btn soft" id="visitIllustration">Abrir versículo ↗</button><button class="btn soft" id="editIllustration">Editar</button><button class="btn danger" id="deleteIllustration">Eliminar</button></div>`);
 if($('#visitIllustration'))$('#visitIllustration').onclick=()=>{closeModal();openReference(p.reference,p.translation_id)};
 $('#editIllustration').onclick=()=>openIllustrationModal(p);
 $('#deleteIllustration').onclick=async()=>{closeModal();await deleteItem('illustration',p.id)};icons();
}
function openIllustrationModal(existing=null){
 if(!existing&&selectedVerses.size!==1){toast('Selecciona un único versículo para subir una ilustración.');return}
 const reference=existing?.reference||ref();
 openModal(`<div class="modal-head"><div><h3>${existing?'Editar ilustración':'Subir ilustración'}</h3><p class="muted mini">${esc(refsPretty(reference))}</p></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div>
 <div class="field"><label>Título</label><input class="input" id="illTitle" value="${esc(existing?.title||'')}" placeholder="Ej.: El arca de Noé"></div>
 <div class="field"><label>Imagen JPG, PNG o WebP ${existing?'(opcional para conservar la actual)':''}</label><input class="input" id="illFile" type="file" accept="image/png,image/jpeg,image/webp"></div>
 <div class="field"><label>Descripción o reflexión</label>${editorHTML('illDescription',existing?.description_html||'')}</div>
 <div class="field"><label>Colección</label>${collectionPicker('illCollection',existing?.collection_id)}</div>
 <div class="modal-actions"><button class="btn soft" data-close>Cancelar</button><button class="btn primary" id="saveIllustration">Guardar ilustración</button></div>`);
 initCollectionPicker('illCollection');const body=setupRichEditor('illDescription');icons();
 $('#saveIllustration').onclick=async()=>{const file=$('#illFile').files[0];try{let dataURL='';if(file){if(file.size>6_000_000)throw Error('Máximo 6 MB.');dataURL=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file)})}const result=await api('/api/illustration',{method:'POST',body:JSON.stringify({id:existing?.id,reference,title:$('#illTitle').value.trim(),description_html:body.innerHTML,collection_id:+$('#illCollection').value,translation_id:existing?.translation_id||selectedTranslation,image_data:dataURL})});state=result.state;closeModal();toast('Ilustración guardada');if(view==='gallery')renderGallery();else showVersePanel();}catch(e){toast(e.message)}};
}
function activityCategory(item){
 const c=item.collection_id?state.collections.find(x=>x.id===+item.collection_id):state.collections.find(x=>state.collection_items.some(y=>y.collection_id===x.id&&String(item.reference||'').split(',').includes(y.reference)));
 if(c)return {color:c.color,icon:c.icon,label:c.name};
 const id=item.category_id||'important';return state.categories.find(x=>x.id===id)||state.categories[0];
}
function renderActivityMood(){const target=$('#homeMood');if(!target)return;
 const entries=[...state.notes.map(x=>({kind:'note',date:x.updated_at,item:x})),...state.media.map(x=>({kind:'video',date:x.updated_at,item:x})),...state.image_projects.map(x=>({kind:'created',date:x.updated_at,item:x})),...(state.illustrations||[]).map(x=>({kind:'illustration',date:x.updated_at,item:x}))].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,30);
 target.innerHTML=entries.map(({kind,item:x})=>{const c=activityCategory(x),icon=kind==='note'?(c?.icon||'fi fi-rr-note'):kind==='video'?'fi fi-rr-play-alt':'fi fi-rr-picture';const img=kind==='video'?mediaThumb(x):kind==='created'?x.image_data:kind==='illustration'?'/'+x.file_path:'';
 return `<button class="mood-card activity-tile" data-activity-kind="${kind}" data-activity-id="${x.id}" style="--activity-color:${esc(c?.color||'#c8a979')}">${img?`<img loading="lazy" src="${esc(img)}" alt="${esc(x.title||'')}"/>`:`<div class="mood-note-preview">${String(x.html||'').replace(/<[^>]+>/g,' ').slice(0,180)}</div>`}<span class="mood-card-info"><i class="${esc(icon)}"></i><strong>${esc(x.title||refsPretty(x.reference))}</strong><small>${esc(refsPretty(x.reference))} · ${esc(versionLabel(x))}</small></span></button>`}).join('')||'<div class="empty">Tus notas, videos e imágenes aparecerán aquí.</div>';
 $$('[data-activity-id]',target).forEach(b=>b.onclick=()=>{const x=entries.find(e=>e.kind===b.dataset.activityKind&&e.item.id==b.dataset.activityId)?.item;if(!x)return;if(b.dataset.activityKind==='note')viewNote(x);if(b.dataset.activityKind==='video')openYoutube(x);if(b.dataset.activityKind==='created')showGalleryCreated(x);if(b.dataset.activityKind==='illustration')showIllustration(x)});
}
let activeImageProjectId=null,studioImage=new Image(),studioImageSource='',studioImageCredit=null;
function renderImages(project=null){
 if(!project&&(!imageVerseRef||!imageVerseText)){ $('#content').innerHTML='<div class="card empty"><h2>Editor de imágenes</h2><p>Selecciona un versículo en Biblia o Biblioteca y pulsa Imagen. Cada imagen creada debe estar enlazada a un versículo.</p><button class="btn primary" id="goBibleFromEditor">Ir a la Biblia</button></div>';$('#goBibleFromEditor').onclick=()=>{view='bible';render()};return;}
 activeImageProjectId=project?.id||null;
 const cfg=project?JSON.parse(project.config_json||'{}'):{};
 const selectedRef=project?.reference||imageVerseRef,verseText=cfg.text??imageVerseText??selectedVerseData().text;
 $('#content').innerHTML=`<div class="section-head"><div><h2 style="margin:0">Editor de imágenes</h2><p class="muted mini">Cada imagen está enlazada a un versículo. Combina texto y fotografía de Unsplash o colores.</p></div></div>
 <div class="image-studio advanced-studio"><div class="card studio-controls">
 <div class="field"><label>Título de la imagen</label><input class="input" id="imgTitle" value="${esc(project?.title||'')}" placeholder="Una promesa que recordar"></div>
 <div class="field"><label>Referencia</label><input class="input" id="imgRef" value="${esc(selectedRef)}" readonly></div>
 <div class="field"><label>Texto bíblico</label><textarea class="input" id="imgText" rows="4">${esc(verseText)}</textarea></div>
 <div class="field"><label>Formato</label><select class="select" id="imgRatio"><option value="4:5" ${cfg.ratio==='4:5'||!cfg.ratio?'selected':''}>4:5 · Vertical</option><option value="1:1" ${cfg.ratio==='1:1'?'selected':''}>1:1 · Cuadrado</option></select></div>
 <div class="field"><label>Tipo de fondo</label><select class="select" id="imgMode"><option value="photo" ${cfg.mode==='photo'?'selected':''}>Fotografía</option><option value="gradient" ${cfg.mode==='gradient'||!cfg.mode?'selected':''}>Degradado</option><option value="solid" ${cfg.mode==='solid'?'selected':''}>Color sólido</option></select></div>
 <div class="field"><label>Buscar fotos por palabra</label><div class="photo-search-bar"><input class="input" id="photoQuery" placeholder="montañas, cielo, naturaleza..."><button class="btn soft" id="searchPhotos" type="button"><i data-lucide="search"></i></button></div>
 <div class="mini muted" id="photoStatus">Las claves se configuran en Configuración y permanecen en Windows.</div><div class="photo-results" id="photoResults"></div></div>
 <div class="field"><label>O subir imagen propia</label><input class="input" type="file" id="photoUpload" accept="image/*"></div>
 <div class="studio-colorrow"><label>Degradado 1 <input type="color" id="imgColor1" value="${esc(cfg.color1||'#192946')}"></label><label>Degradado 2 <input type="color" id="imgColor2" value="${esc(cfg.color2||'#7886a5')}"></label><label>Color base <input type="color" id="imgBase" value="${esc(cfg.base||'#18263d')}"></label><label>Texto <input type="color" id="imgFg" value="${esc(cfg.fg||'#ffffff')}"></label></div>
 <div class="editor-sliders">
 ${[['imgZoom','Zoom','50','300','100','%'],['imgX','Mover horizontal','-500','500','0',' px'],['imgY','Mover vertical','-500','500','0',' px'],['imgRotate','Rotación','-180','180','0','°'],['imgOpacity','Opacidad','0','100','100','%'],['imgBlur','Desenfoque','0','30','0',' px']].map(([id,title,min,max,def,suffix])=>`<div class="slider-line"><div><label for="${id}">${title}</label><output id="${id}Out">${cfg[id]??def}${suffix}</output></div><input type="range" id="${id}" min="${min}" max="${max}" value="${cfg[id]??def}" data-suffix="${suffix}"></div>`).join('')}
 </div><div class="filters"><button class="btn soft" id="imgFlipX"><i data-lucide="flip-horizontal"></i> Voltear horizontal</button><button class="btn soft" id="imgFlipY"><i data-lucide="flip-vertical"></i> Voltear vertical</button><button class="btn soft" id="imgReset"><i data-lucide="rotate-ccw"></i> Restablecer</button></div>
 <div class="filters studio-actions"><button class="btn primary" id="saveImg"><i data-lucide="save"></i> Guardar imagen</button><button class="btn soft" id="downloadImg"><i data-lucide="download"></i> Exportar PNG</button></div>
 <p class="mini muted" id="selectedPhotoCredit"></p>
 </div><div class="card studio-canvas-wrap"><div class="studio-canvas" id="canvasPreview"><canvas id="imgCanvas" width="800" height="1000" aria-label="Previsualización de imagen"></canvas></div><p class="muted mini">Arrastra la imagen con el ratón o con el dedo para cambiar su posición.</p></div></div>
`;
 // Reorganizar el editor en tres columnas: texto, vista previa y fondo.
 const oldLayout=$('.image-studio');
 if(oldLayout){const settings=oldLayout.querySelector('.studio-controls'),preview=oldLayout.querySelector('.studio-canvas-wrap');
 const left=document.createElement('div');left.className='card studio-typography';left.innerHTML='<h3>Texto y formato</h3>';
 Array.from(settings.querySelectorAll(':scope > .field')).slice(0,4).forEach(el=>left.appendChild(el));
 left.insertAdjacentHTML('beforeend',`<div class="field"><label>Fuente</label><select class="select" id="imgFont">${['Georgia','Inter','Lora','Merriweather','Playfair Display','Cormorant Garamond','EB Garamond','Libre Baskerville','Montserrat','Poppins','Nunito','Raleway','Oswald','Crimson Text','Alegreya','Source Serif 4','DM Serif Display','Roboto Slab','Noto Serif','Work Sans','Quicksand'].map(x=>`<option ${x===(cfg.font||'Georgia')?'selected':''}>${x}</option>`).join('')}</select></div>
 <div class="field"><label>Tamaño del texto</label><input id="imgTextSize" type="range" min="22" max="90" value="${cfg.textSize||43}"></div>
 <div class="field"><label>Alineación</label><select class="select" id="imgAlign"><option value="center">Centrada</option><option value="left">Izquierda</option><option value="right">Derecha</option></select></div>
 <div class="field"><label>Interlineado</label><input id="imgLineHeight" type="range" min="100" max="180" value="${cfg.lineHeight||136}"></div>
 <div class="field"><label>Sombra de texto</label><input id="imgTextShadow" type="range" min="0" max="30" value="${cfg.textShadow??9}"></div>`);
 settings.insertAdjacentHTML('afterbegin','<h3>Fondo y efectos</h3>');oldLayout.replaceChildren(left,preview,settings);oldLayout.classList.add('studio-3col');oldLayout.classList.remove('advanced-studio');
 $('#imgAlign').value=cfg.align||'center';}
 const fields=['imgText','imgRef','imgRatio','imgMode','imgColor1','imgColor2','imgBase','imgFg','imgFont','imgTextSize','imgAlign','imgLineHeight','imgTextShadow','imgZoom','imgX','imgY','imgRotate','imgOpacity','imgBlur'];
 fields.forEach(id=>{const e=$('#'+id);if(!e)return;e.oninput=()=>{if(e.type==='range'&&$('#'+id+'Out'))$('#'+id+'Out').textContent=e.value+e.dataset.suffix;if(id==='imgFont'&&document.fonts)document.fonts.load('600 45px '+JSON.stringify(e.value)).then(drawCanvas).catch(()=>{});drawCanvas()};e.onchange=drawCanvas});
 const styleMode=()=>{const m=$('#imgMode').value;$('#photoQuery').closest('.field').hidden=m!=='photo';$('#photoUpload').closest('.field').hidden=m!=='photo';$('.editor-sliders').hidden=m!=='photo';$('#imgFlipX').closest('.filters').hidden=m!=='photo';const labels=$$('.studio-colorrow label');labels[0].hidden=m!=='gradient';labels[1].hidden=m!=='gradient';labels[2].hidden=m==='gradient';};$('#imgMode').addEventListener('change',styleMode);styleMode();
 let flipX=!!cfg.flipX,flipY=!!cfg.flipY;
 $('#imgFlipX').onclick=()=>{flipX=!flipX;drawCanvas()};$('#imgFlipY').onclick=()=>{flipY=!flipY;drawCanvas()};
 $('#imgReset').onclick=()=>{['imgZoom','imgX','imgY','imgRotate','imgOpacity','imgBlur'].forEach((id,i)=>{const vals=[100,0,0,0,100,0];$('#'+id).value=vals[i];$('#'+id+'Out').textContent=vals[i]+$('#'+id).dataset.suffix});flipX=false;flipY=false;drawCanvas()};
 $('#downloadImg').onclick=()=>{drawCanvas();const a=document.createElement('a');a.href=$('#imgCanvas').toDataURL('image/png');a.download='Senda_'+($('#imgRef').value||'imagen').replace(/[^a-z0-9]+/gi,'_')+'.png';a.click()};
 $('#saveImg').onclick=()=>saveImageProject({flipX,flipY});
 $('#searchPhotos').onclick=async()=>{const q=$('#photoQuery').value.trim();const provider='unsplash';$('#photoStatus').textContent='Buscando fotografías…';$('#photoResults').innerHTML='';try{
 const d=await api('/api/photos/search?q='+encodeURIComponent(q)+'&provider='+provider);
 $('#photoStatus').textContent=`${d.photos.length} fotos encontradas. Selecciona una para usarla.`;
 $('#photoResults').innerHTML=d.photos.map(photo=>`<button type="button" data-photo="${esc(photo.key)}" class="photo-choice" title="Fotografía de ${esc(photo.photographer)}"><img src="${esc(photo.thumb)}" alt="Fotografía de ${esc(photo.photographer)}"></button>`).join('');
 $$('[data-photo]').forEach(b=>b.onclick=async()=>{const p=d.photos.find(x=>x.key===b.dataset.photo);b.disabled=true;$('#photoStatus').textContent='Cargando fotografía…';try{const res=await fetch('/api/photos/image?key='+encodeURIComponent(p.key));if(!res.ok)throw new Error('No se pudo recuperar la imagen');const blob=await res.blob();if(blob.size>6000000)throw new Error('Foto demasiado grande');const reader=new FileReader();reader.onload=()=>{studioImageSource=reader.result;studioImageCredit=p;loadStudioImage(studioImageSource);$('#imgMode').value='photo';styleMode();$('#selectedPhotoCredit').innerHTML=`Foto: <a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.photographer)} en Unsplash</a>`;$('#photoStatus').textContent='Foto preparada. Puedes moverla y editarla.'};reader.readAsDataURL(blob);}catch(e){toast(e.message)}finally{b.disabled=false}});
 }catch(e){$('#photoStatus').textContent=e.message}};
 $('#photoUpload').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>35*1024*1024){toast('Selecciona una imagen de hasta 35 MB');return}try{studioImageSource=await sendaOptimizeUpload(file);studioImageCredit=null;$('#imgMode').value='photo';styleMode();$('#selectedPhotoCredit').textContent='Imagen personal';loadStudioImage(studioImageSource)}catch(error){toast(error.message)}};
 const canvas=$('#imgCanvas');let drag=null;
 canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,startX:+$('#imgX').value,startY:+$('#imgY').value};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing'};
 canvas.onpointermove=e=>{if(!drag)return;const box=canvas.getBoundingClientRect(),factor=800/box.width;$('#imgX').value=Math.max(-500,Math.min(500,drag.startX+(e.clientX-drag.x)*factor));$('#imgY').value=Math.max(-500,Math.min(500,drag.startY+(e.clientY-drag.y)*factor));$('#imgXOut').textContent=$('#imgX').value+' px';$('#imgYOut').textContent=$('#imgY').value+' px';drawCanvas()};
 canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;canvas.style.cursor='grab'};
 if(cfg.bgImage){studioImageCredit=cfg.photoCredit||null;studioImageSource=cfg.bgImage;loadStudioImage(cfg.bgImage);if(studioImageCredit){const pc=studioImageCredit;$('#selectedPhotoCredit').innerHTML=`Foto: <a href="${esc(pc.link)}" target="_blank" rel="noopener noreferrer">${esc(pc.photographer)} en Unsplash</a>`}}else{studioImageSource='';studioImage=new Image();studioImageCredit=null;drawCanvas()}
 function gather(){return {flipX,flipY}};
 // Estado de inversión almacenado hasta el siguiente guardado.
 window.__sendaFlip=gather;
 icons();
}
function loadStudioImage(url){studioImage=new Image();studioImage.onload=drawCanvas;studioImage.onerror=()=>toast('No se pudo abrir esta imagen');studioImage.src=url}
function drawCanvas(){
 const canvas=$('#imgCanvas');if(!canvas)return;
 const ratio=$('#imgRatio').value==='1:1'?1:1.25,w=800,h=Math.round(800*ratio);canvas.width=w;canvas.height=h;
 const preview=$('#canvasPreview');preview.style.aspectRatio=`${w} / ${h}`;preview.style.width='min(500px, 100%)';preview.style.height='auto';
 const ctx=canvas.getContext('2d'),mode=$('#imgMode').value;
 if(mode==='gradient'){
  const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,$('#imgColor1').value);gradient.addColorStop(1,$('#imgColor2').value);ctx.fillStyle=gradient;
 }else ctx.fillStyle=$('#imgBase').value;
 ctx.fillRect(0,0,w,h);
 if(mode==='photo'&&studioImage.complete&&studioImage.naturalWidth){
  const zoom=+$('#imgZoom').value/100,ox=+$('#imgX').value,oy=+$('#imgY').value,rot=+$('#imgRotate').value*Math.PI/180;
  const flags=window.__sendaFlip?.()||{flipX:false,flipY:false};
  ctx.save();ctx.translate(w/2+ox,h/2+oy);ctx.rotate(rot);ctx.scale(flags.flipX?-1:1,flags.flipY?-1:1);
  ctx.globalAlpha=+$('#imgOpacity').value/100;ctx.filter=`blur(${$('#imgBlur').value}px)`;
  const cover=Math.max(w/studioImage.naturalWidth,h/studioImage.naturalHeight)*zoom;
  const iw=studioImage.naturalWidth*cover,ih=studioImage.naturalHeight*cover;
  ctx.drawImage(studioImage,-iw/2,-ih/2,iw,ih);ctx.restore();
 }
 // Sombra para legibilidad, sin añadir versión bíblica.
 const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,'rgba(0,0,0,0.14)');shade.addColorStop(0.5,'rgba(0,0,0,0.22)');shade.addColorStop(1,'rgba(0,0,0,0.28)');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
 ctx.fillStyle=$('#imgFg').value;ctx.textAlign=$('#imgAlign')?.value||'center';ctx.textBaseline='middle';
 const text=$('#imgText').value.trim();let size=+($('#imgTextSize')?.value||43),lines=[];const chosen=$('#imgFont')?.value||'Georgia';const fontName=/^[a-z0-9 ]+$/i.test(chosen)?chosen:'Georgia';while(size>=22){ctx.font=`600 ${size}px \"${fontName}\", Georgia`;lines=[];let line='';text.split(/\s+/).forEach(word=>{const v=line?line+' '+word:word;if(ctx.measureText(v).width>w*.78&&line){lines.push(line);line=word}else line=v});if(line)lines.push(line);if(lines.length*size*1.36<h*.58)break;size-=3}
 const lineH=size*(+($('#imgLineHeight')?.value||136)/100),start=h/2-(lines.length*lineH)/2;
 ctx.shadowColor='rgba(0,0,0,0.55)';ctx.shadowBlur=+($('#imgTextShadow')?.value||0);const align=$('#imgAlign')?.value||'center',textX=align==='left'?w*.11:align==='right'?w*.89:w/2;lines.forEach((l,i)=>ctx.fillText(l,textX,start+(i+0.2)*lineH));
 ctx.font='600 24px system-ui';ctx.textAlign='center';ctx.fillText(refsPretty($('#imgRef').value.trim()),w/2,start+lines.length*lineH+56);ctx.shadowBlur=0;
}
async function saveImageProject(flags={}){
 drawCanvas();const config={ratio:$('#imgRatio').value,mode:$('#imgMode').value,color1:$('#imgColor1').value,color2:$('#imgColor2').value,base:$('#imgBase').value,fg:$('#imgFg').value,text:$('#imgText').value,
 font:$('#imgFont').value,textSize:+$('#imgTextSize').value,align:$('#imgAlign').value,lineHeight:+$('#imgLineHeight').value,textShadow:+$('#imgTextShadow').value,
 ...Object.fromEntries(['imgZoom','imgX','imgY','imgRotate','imgOpacity','imgBlur'].map(id=>[id,+$('#'+id).value])),...flags,bgImage:studioImageSource,photoCredit:studioImageCredit};
 try{await api('/api/image-project',{method:'POST',body:JSON.stringify({id:activeImageProjectId,reference:$('#imgRef').value,title:$('#imgTitle').value,config,image_data:$('#imgCanvas').toDataURL('image/png'),translation_id:state.image_projects.find(p=>p.id===activeImageProjectId)?.translation_id||selectedTranslation,collection_id:+$('#imageCollection').value,is_public:true})});state=await api('/api/state');toast('Imagen guardada en tu biblioteca');renderImages(state.image_projects.find(x=>x.id===activeImageProjectId)||state.image_projects[0])}
 catch(e){toast(e.message)}
}

function renderSettings(){
 const st=state.settings, translations=availableTranslations();
 const dropdown=id=>translations.map(t=>`<option value="${t.id}" ${st[id]===t.id?'selected':''}>${esc(t.abbr)} · ${esc(t.name)}</option>`).join('');
 $('#content').innerHTML=`<div class="section-head"><div><h2>Configuración</h2><p class="muted mini">Las siete traducciones españolas se almacenan en tu equipo. No necesitas claves bíblicas.</p></div><button class="btn primary" id="saveSettings"><i class="fi fi-rr-disk"></i> Guardar cambios</button></div>
 <div class="settings-grid">
 <div class="card settings-card"><h3><i class="fi fi-rr-book-alt"></i> Lectura bíblica</h3>
 <div class="field"><label>Canon al abrir</label><select class="select" id="canon"><option value="catholic" ${st.canon==='catholic'?'selected':''}>Católico · 73 libros</option><option value="protestant" ${st.canon==='protestant'?'selected':''}>Protestante · 66 libros</option></select></div>
 <div class="field"><label>Versión principal</label><select class="select" id="mainT">${dropdown('main_translation')}</select></div>
 <div class="field"><label>Versión del comparador</label><select class="select" id="compareT">${dropdown('compare_translation')}</select></div>
 <div class="field"><label>Libro al iniciar</label><select class="select" id="defaultBook">${state.books.map(b=>`<option value="${b.id}" ${st.default_book===b.id?'selected':''}>${esc(b.es)}</option>`).join('')}</select></div>
 <div class="field"><label>Capítulo al iniciar</label><input class="input" id="defaultChapter" type="number" min="1" value="${st.default_chapter||1}"></div>
 </div><div class="card settings-card"><h3><i class="fi fi-rr-book-alt"></i> Traducciones disponibles</h3>
 <div class="muted mini">Senda obtiene las Biblias una sola vez desde eBible.org, y después funciona sin conexión. La Versión Biblia Libre puede contener solo parte del canon.</div>
 <div id="installVersionsStatus" class="senda-installs">Comprobando archivos…</div>
 <button class="btn soft" id="retryInstall"><i class="fi fi-rr-refresh"></i> Reintentar instalaciones pendientes</button>
 <p class="muted mini">No se utiliza API.Bible ni YouVersion. Las licencias y créditos se incluyen en la web pública.</p></div>
 <div class="card settings-card"><h3><i class="fi fi-rr-picture"></i> Unsplash · Fotografías</h3>
 <p class="muted mini">La clave Unsplash solo se utiliza para buscar fotografías, no para leer la Biblia.</p>
 <div class="field"><label>Access Key Unsplash ${st.unsplash_access_key_configured?'· guardada ✓':''}</label><input class="input" id="unsplashKey" type="password" autocomplete="new-password" placeholder="Clave opcional para fotografías"></div></div>
 <div class="card settings-card"><h3><i class="fi fi-rr-shield-check"></i> Datos y publicación</h3><p class="muted mini">Notas y colecciones en SQLite. Respaldar crea un ZIP privado. La carpeta docs/ es la única web pública y se actualiza al guardar cambios. Publica los cambios con GitHub Desktop o git push; no se incluyen claves, SQLite ni el panel de administración. Usa los textos bíblicos respetando el aviso de crédito y licencia incluidos.</p></div></div>`;
 $('#saveSettings').onclick=async()=>{const payload={canon:$('#canon').value,main_translation:$('#mainT').value,compare_translation:$('#compareT').value,default_book:$('#defaultBook').value,default_chapter:+$('#defaultChapter').value,unsplash_access_key:$('#unsplashKey').value};try{const d=await api('/api/settings',{method:'POST',body:JSON.stringify(payload)});state.settings=d.settings;selectedTranslation=d.settings.main_translation;toast('Preferencias guardadas');renderSettings()}catch(e){toast(e.message)}};
 $('#retryInstall').onclick=async()=>{try{await api('/api/bibles/sync',{method:'POST',body:JSON.stringify({force:false})});toast('Reintento iniciado. Verás el progreso en la consola.');refreshBibleInstallation(false)}catch(e){toast(e.message)}};
 refreshBibleInstallation(false);icons();
}
async function refreshBibleInstallation(showToast=false){
 try{const d=await api('/api/bibles'),list=d.bibles||[];
 const ready=list.filter(x=>x.installed).length;
 const el=$('#bibleInstallSummary');if(el)el.textContent=`${ready}/7 instaladas${d.running?' · preparando las demás…':''}`;
 const target=$('#installVersionsStatus');if(target)target.innerHTML=list.map(x=>`<div class="install-line"><span>${esc(x.name)}</span><span class="${x.installed?'status-ready':'status-wait'}">${x.installed?`${x.books} libros · ${x.chapters} capítulos`:x.status==='descargando'?'Descargando…':x.status==='error'?'Pendiente de reintento':'Pendiente'}</span></div>${x.status==='error'?`<div class="muted mini">${esc(x.error)}</div>`:''}`).join('');
 if(showToast)toast(`${ready} de 7 Biblias instaladas`);
 if(d.running&&!window.sendaBibleTimer){window.sendaBibleTimer=setInterval(async()=>{const here=document.querySelector('#installVersionsStatus')||document.querySelector('#bibleInstallSummary');if(!here){clearInterval(window.sendaBibleTimer);window.sendaBibleTimer=null;return;}await refreshBibleInstallation(false)},4500)}
 if(!d.running&&window.sendaBibleTimer){clearInterval(window.sendaBibleTimer);window.sendaBibleTimer=null}
 }catch(e){if(showToast)toast(e.message)}
}
function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"");}

function toggleFavorite(){
  if(!selectedVerse)return;
  const active=!favoriteActive(ref()); api("/api/favorite",{method:"POST",body:JSON.stringify({reference:ref(),active})}).then(d=>{state=d.state;showVersePanel();toast(active?"Añadido a favoritos":"Quitado de favoritos")}).catch(e=>toast(e.message));
}


function openModal(inner){const m=$("#modal");m.innerHTML=`<div class="modal">${inner}</div>`;m.classList.add("show");$$("[data-close]",m).forEach(x=>x.onclick=closeModal);m.onclick=e=>{if(e.target===m)closeModal()};}
function closeModal(){$("#modal").classList.remove("show");$("#modal").innerHTML=""}
async function backup(){try{const d=await api("/api/backup",{method:"POST",body:"{}"});toast(`Respaldo creado: ${d.name}`)}catch(e){toast(e.message)}}
async function deleteItem(kind,id){if(!confirm("¿Eliminar este elemento?"))return;try{const d=await api("/api/delete",{method:"POST",body:JSON.stringify({kind,id})});state=d.state;render();toast("Eliminado");}catch(e){toast(e.message)}}

function selectionBar(){
  const bar=$("#selectionBar");
  document.addEventListener("mouseup",()=>{
    const sel=window.getSelection();const text=sel?.toString().trim();if(!text){bar.style.display="none";return}
    const node=sel.anchorNode?.parentElement?.closest?.(".verse");if(!node){bar.style.display="none";return}
    selectedVerse=+node.dataset.verse;selectedText=text;bar.style.display="flex";
    const r=sel.getRangeAt(0).getBoundingClientRect();bar.style.left=Math.max(8,Math.min(window.innerWidth-180,r.left))+"px";bar.style.top=Math.max(8,r.top-50)+"px";
  });
  $$("#selectionBar button").forEach(b=>b.onclick=()=>{const a=b.dataset.action; if(a==="note")openNoteModal();bar.style.display="none"});
}

async function boot(){
  try{state=await api("/api/state");selectedTranslation=availableTranslations().some(t=>t.id===state.settings.main_translation)?state.settings.main_translation:'onbv';currentBook=state.settings.default_book||"JHN";currentChapter=+state.settings.default_chapter||3;selectedVerse=0;render();selectionBar();window.addEventListener("beforeunload",()=>{});}
  catch(e){document.body.innerHTML=`<div style="padding:40px;font-family:system-ui"><h2>Senda no pudo iniciar</h2><p>${esc(e.message)}</p><p>Comprueba que ejecutaste Senda.bat y que Python está instalado.</p></div>`}
}
boot();


// SENDA 1.1.7 - Organización uniforme, colecciones a página completa y línea de tiempo.
function categoryForCollection(id){const c=state.collections.find(x=>x.id===id);return state.categories.find(x=>x.label===c?.name)?.id||'important'}
function defaultCollectionId(){return state.collections.find(c=>c.is_default&&/importante|recordar/i.test(c.name))?.id||state.collections.find(c=>c.is_default)?.id||state.collections[0]?.id||0}
function collectionPicker(id,selected){const value=Number(selected||defaultCollectionId());return `<div class="collection-picker" data-picker="${id}"><button type="button" class="collection-picker-trigger" id="${id}Trigger"><span id="${id}Label"></span><i class="fi fi-rr-angle-down"></i></button><div class="collection-picker-menu" id="${id}Menu" hidden>${state.collections.map(c=>`<button type="button" class="collection-picker-option" data-choice="${c.id}"><span class="collection-dot" style="background:${esc(c.color)}"></span><i class="${esc(c.icon)}" style="color:${esc(c.color)}"></i>${esc(c.name)}</button>`).join('')}</div><input type="hidden" id="${id}" value="${value}"></div>`}
function initCollectionPicker(id){const v=$('#'+id),label=$('#'+id+'Label'),menu=$('#'+id+'Menu');if(!v||!menu)return;const update=()=>{const col=state.collections.find(c=>c.id==+v.value)||state.collections[0];if(col)label.innerHTML=`<span class="collection-dot" style="background:${esc(col.color)}"></span><i class="${esc(col.icon)}" style="color:${esc(col.color)}"></i><span>${esc(col.name)}</span>`};$('#'+id+'Trigger').onclick=()=>menu.hidden=!menu.hidden;$$('[data-choice]',menu).forEach(b=>b.onclick=()=>{v.value=b.dataset.choice;menu.hidden=true;update()});update()}
function openReference(reference,tid=''){const v=String(reference||'').split(',')[0].match(/^([A-Z0-9]{3})\.(\d+)\.(\d+)$/);if(!v)return toast('Referencia no válida');currentBook=v[1];currentChapter=+v[2];selectedVerse=+v[3];selectedVerses=new Set([selectedVerse]);if(tid&&state.translations.some(x=>x.id===tid))selectedTranslation=tid;view='bible';render()}
function getColForItem(item){return state.collections.find(c=>c.id==+item.collection_id)||state.collections.find(c=>c.id===defaultCollectionId())}
function activityEntries(){return [...state.notes.map(item=>({kind:'note',item,date:item.updated_at})),...state.media.map(item=>({kind:'video',item,date:item.updated_at})),...state.image_projects.map(item=>({kind:'image',item,date:item.updated_at})),...(state.illustrations||[]).map(item=>({kind:'illustration',item,date:item.updated_at}))].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))}
function versionLabel(item){return state.translations.find(t=>t.id===item.translation_id)?.abbr||item.translation_id||'Versión original no registrada'}
function styledActivity(entries,opts={}){return `<div class="mood-masonry v117-mood">${entries.map(({kind,item:x})=>{const c=getColForItem(x),clr=c?.color||'#b6ad9b',ic=kind==='note'?c?.icon:kind==='video'?'fi fi-rr-play-alt':'fi fi-rr-picture',img=kind==='image'?x.image_data:kind==='illustration'?'/'+x.file_path:kind==='video'?mediaThumb(x):'';return `<article class="v117-entry" style="--collection-color:${esc(clr)}"><button class="v117-cover" data-entry="${kind}:${x.id}">${img?`<img loading="lazy" src="${esc(img)}" alt="">`:`<div class="v117-note-extract">${esc((x.html||'').replace(/<[^>]+>/g,' ').slice(0,175))}</div>`}</button><div class="v117-caption"><i class="${esc(ic||'fi fi-rr-heart')}" style="color:${esc(clr)}"></i><div><strong>${esc(x.title||'Mi reflexión')}</strong><small>${esc(refsPretty(x.reference))} · ${esc(versionLabel(x))}</small></div></div><button class="v117-ref" data-go-ref="${esc(x.reference)}" data-version="${esc(x.translation_id||'')}" title="Ir a este versículo"><i class="fi fi-rr-arrow-up-right"></i></button></article>`}).join('')||'<div class="empty">Todavía no hay contenido.</div>'}</div>`}
function attachEntries(container=document){$$('[data-entry]',container).forEach(b=>b.onclick=()=>{const [kind,id]=b.dataset.entry.split(':'),item=(kind==='note'?state.notes:kind==='video'?state.media:kind==='image'?state.image_projects:state.illustrations).find(x=>x.id===+id);if(!item)return;if(kind==='note')viewNote(item);else if(kind==='video')openYoutube(item);else if(kind==='image')showGalleryCreated(item);else showIllustration(item)});$$('[data-go-ref]',container).forEach(b=>b.onclick=()=>openReference(b.dataset.goRef,b.dataset.version))}
function renderActivityMood(){const el=$('#homeMood');if(!el)return;el.outerHTML=`<div id="homeMood">${styledActivity(activityEntries().slice(0,18))}</div>`;attachEntries($('#homeMood'))}
function renderCollections(){const listing=(rows)=>`<div class="v117-collection-grid">${rows.map(c=>`<article class="v117-col-card" style="--collection-color:${esc(c.color)}"><button class="v117-col-open" data-open-col="${c.id}"><div class="v117-col-photo" style="background-color:${esc(c.color)};${c.cover?`background-image:url('/${esc(c.cover)}');`:''}background-position:${esc(c.cover_position||'50% 50%')}"></div><div class="v117-col-heading"><i class="${esc(c.icon)}" style="color:${esc(c.color)}"></i><span><strong>${esc(c.name)}</strong><small>${esc(c.description||'Colección bíblica')}</small></span></div></button><button class="v117-col-edit" data-edit-col="${c.id}" title="Opciones de la colección"><i class="fi fi-rr-pencil"></i></button></article>`).join('')}</div>`;$('#content').innerHTML=`<div class="section-head"><div><h2>Mis colecciones</h2><p class="muted mini">Todo tu estudio organizado por significado</p></div><button class="btn primary" id="newCol"><i class="fi fi-rr-add"></i> Nueva colección</button></div><div class="section-head"><h3>Colecciones esenciales</h3></div>${listing(state.collections.filter(c=>c.is_default))}<div class="section-head"><h3>Mis colecciones</h3></div>${listing(state.collections.filter(c=>!c.is_default))}`;$('#newCol').onclick=()=>openCollectionModal();$$('[data-open-col]').forEach(b=>b.onclick=()=>{activeCollectionId=+b.dataset.openCol;view='collection_detail';render()});$$('[data-edit-col]').forEach(b=>b.onclick=()=>{const c=state.collections.find(x=>x.id===+b.dataset.editCol);if(!c)return;openModal(`<div class="modal-head"><h3>${esc(c.name)}</h3><button class="iconbtn" data-close>×</button></div><div class="modal-actions"><button class="btn soft" id="modifyCol">Editar portada y datos</button>${c.is_default?'':'<button class="btn danger" id="removeCol">Eliminar colección</button>'}</div>`);$('#modifyCol').onclick=()=>openCollectionModal(c);if(!c.is_default)$('#removeCol').onclick=()=>{closeModal();deleteItem('collection',c.id)}})}
function renderCollectionDetail(){const c=state.collections.find(x=>x.id===activeCollectionId);if(!c){view='collections';renderCollections();return}const rows=activityEntries().filter(e=>+e.item.collection_id===c.id),legacy=state.collection_items.filter(x=>x.collection_id===c.id).map(x=>x.reference);const legacyR=legacy.filter(ref=>!rows.some(e=>refsInclude(e.item.reference,ref)));$('#content').innerHTML=`<div class="section-head"><button class="btn soft" id="backCollections"><i class="fi fi-rr-angle-left"></i> Colecciones</button></div><div class="v117-detail-banner" style="background-color:${esc(c.color)};${c.cover?`background-image:linear-gradient(#15151520,#15151538),url('/${esc(c.cover)}');`:''}background-position:${esc(c.cover_position||'50% 50%')}"></div><div class="v117-detail-intro"><i class="${esc(c.icon)}" style="color:${esc(c.color)}"></i><div><h2>${esc(c.name)}</h2><p>${esc(c.description||'')}</p><small>${rows.length} publicaciones · ${legacyR.length} referencias adicionales</small></div></div>${styledActivity(rows)}${legacyR.length?`<div class="section-head"><h3>Versículos guardados</h3></div><div class="v117-ref-list">${legacyR.map(r=>`<button class="pill" data-go-ref="${esc(r)}">${esc(refsPretty(r))} ↗</button>`).join('')}</div>`:''}`;$('#backCollections').onclick=()=>{view='collections';render()};attachEntries($('#content'))}
function timelineDate(value){const d=new Date(value);return Number.isNaN(+d)?'Sin fecha':d.toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'})}
function renderTimeline(){const p=state.profile||{},entries=activityEntries();const groups=new Map();entries.forEach(e=>{const d=timelineDate(e.date);if(!groups.has(d))groups.set(d,[]);groups.get(d).push(e)});$('#content').innerHTML=`<div class="timeline-header"><div class="timeline-cover" style="background-image:${p.cover?`url('/${esc(p.cover)}')`:'linear-gradient(130deg,#e6dbcc,#9caeb5)'};background-position:${esc(p.cover_position||'50% 50%')}">${state.mode==='local'?'<button class="timeline-cover-edit" id="editTimeline">Editar perfil y portada <i class="fi fi-rr-pencil"></i></button>':''}</div><div class="timeline-person"><div class="timeline-avatar">${p.avatar?`<img src="/${esc(p.avatar)}" alt="Foto de perfil">`:'<i class="fi fi-rr-user"></i>'}</div><div><h2>${esc(p.name||'Mi camino en la Palabra')}</h2><p>${esc(p.subtitle||'Mis estudios y reflexiones')}</p><small>${entries.length} publicaciones · Senda</small></div></div></div><div class="section-head"><h3>Mi Línea de Tiempo</h3><span class="muted mini">Recuerdos, reflexiones y recursos bíblicos</span></div><div class="timeline-feed">${[...groups].map(([day,items],i)=>`<section class="timeline-step"><span class="timeline-point"></span><div class="timeline-day">${esc(day)}</div>${styledActivity(items)}</section>`).join('')||'<div class="empty">La historia de tu estudio comenzará con tu primera nota.</div>'}</div>`;attachEntries($('#content'));const b=$('#editTimeline');if(b)b.onclick=openTimelineSettings}
async function toDataURL(file){if(!file)return null;if(file.size>6e6)throw Error('La imagen supera 6 MB');return new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=fail;r.readAsDataURL(file)})}
function openTimelineSettings(){const p=state.profile||{};openModal(`<div class="modal-head"><h3>Mi perfil y Línea de Tiempo</h3><button class="iconbtn" data-close>×</button></div><div class="field"><label>Nombre del perfil</label><input class="input" id="profileName" value="${esc(p.name||'Mi camino en la Palabra')}"></div><div class="field"><label>Subtítulo</label><input class="input" id="profileSub" value="${esc(p.subtitle||'')}"></div><div class="field"><label>Foto de perfil (JPG, PNG o WebP)</label><input class="input" type="file" accept="image/png,image/jpeg,image/webp" id="avatarFile"></div><div class="field"><label>Imagen de portada</label><input class="input" type="file" accept="image/png,image/jpeg,image/webp" id="timelineCoverFile"><div class="photo-search-bar" style="margin-top:10px"><input class="input" id="timelinePhotoQuery" placeholder="Buscar fotografías de Unsplash"><button class="btn soft" id="searchTimelineCover" type="button"><i class="fi fi-rr-search"></i> Buscar</button></div><div id="timelinePhotoResults" class="photo-results"></div><p class="mini muted" id="timelinePhotoCredit">Fotografías de Unsplash · Se mostrará el crédito en los resultados de búsqueda.</p></div><div class="field"><label>Recorte de portada</label><div class="crop-preview" id="timelineCropPreview" style="background-image:${p.cover?`url('/${esc(p.cover)}')`:'linear-gradient(130deg,#d7c9b8,#91a7ba)'};background-position:${esc(p.cover_position||'50% 50%')}"></div><div class="crop-sliders"><label>Horizontal <input type="range" id="timelineCropX" min="0" max="100" value="${parseInt(p.cover_position||'50',10)}"></label><label>Vertical <input type="range" id="timelineCropY" min="0" max="100" value="${parseInt((p.cover_position||'50% 50%').split(' ')[1],10)||50}"></label></div></div><div class="modal-actions"><button class="btn primary" id="saveProfile">Guardar perfil</button></div>`);let selectedUnsplashTicket=null;$('#searchTimelineCover').onclick=async()=>{try{const q=$('#timelinePhotoQuery').value.trim();if(!q)return toast('Escribe un término');const r=await api('/api/photos/search?provider=unsplash&q='+encodeURIComponent(q));$('#timelinePhotoResults').innerHTML=r.photos.map(p=>`<button class="photo-choice" data-photo-ticket="${esc(p.key)}" type="button" title="${esc(p.photographer||'')} · Unsplash"><img loading="lazy" src="${esc(p.thumb)}" alt="Fotografía de ${esc(p.photographer||'Unsplash')}"></button>`).join('');$$('[data-photo-ticket]').forEach(b=>b.onclick=()=>{selectedUnsplashTicket=b.dataset.photoTicket;$$('[data-photo-ticket]').forEach(x=>x.classList.toggle('active',x===b));$('#timelineCropPreview').style.backgroundImage='url('+JSON.stringify(b.querySelector('img').src)+')';const photo=r.photos.find(x=>x.key===selectedUnsplashTicket);$('#timelinePhotoCredit').textContent=(photo?.photographer||'')+' · Unsplash'})}catch(e){toast(e.message)}};$('#timelineCoverFile').onchange=async()=>{const f=$('#timelineCoverFile').files[0];if(f){selectedUnsplashTicket=null;$('#timelineCropPreview').style.backgroundImage='url('+JSON.stringify(await toDataURL(f))+')'}};['timelineCropX','timelineCropY'].forEach(id=>$('#'+id).oninput=()=>$('#timelineCropPreview').style.backgroundPosition=$('#timelineCropX').value+'% '+$('#timelineCropY').value+'%');$('#saveProfile').onclick=async()=>{try{for(const [kind,id] of [['avatar','avatarFile'],['cover','timelineCoverFile']]){const f=$('#'+id).files[0];if(f)await api('/api/custom-image',{method:'POST',body:JSON.stringify({kind,image_data:await toDataURL(f)})})}if(selectedUnsplashTicket&&!$('#timelineCoverFile').files[0])await api('/api/profile-unsplash',{method:'POST',body:JSON.stringify({ticket:selectedUnsplashTicket})});const r=await api('/api/profile',{method:'POST',body:JSON.stringify({name:$('#profileName').value,subtitle:$('#profileSub').value,cover_position:$('#timelineCropX').value+'% '+$('#timelineCropY').value+'%'})});state=r.state;closeModal();renderTimeline();toast('Perfil guardado')}catch(e){toast(e.message)}}}
function openBookCoverModal(bid){const bk=state.books.find(b=>b.id===bid);openModal(`<div class="modal-head"><h3>Portada · ${esc(bk?.es||bid)}</h3><button class="iconbtn" data-close>×</button></div><p class="muted mini">Esta portada reemplazará la provisional y aparecerá en el sitio público.</p><div class="field"><input type="file" id="bookCoverFile" accept="image/jpeg,image/png,image/webp"></div><div class="modal-actions"><button class="btn primary" id="saveBookCover">Guardar portada</button></div>`);$('#saveBookCover').onclick=async()=>{try{const f=$('#bookCoverFile').files[0];if(!f)return toast('Selecciona una imagen');const r=await api('/api/custom-image',{method:'POST',body:JSON.stringify({kind:'book_cover',book_id:bid,image_data:await toDataURL(f)})});state=r.state;closeModal();renderLibrary();toast('Portada actualizada')}catch(e){toast(e.message)}}}

const __renderImagesOriginal=renderImages;
renderImages=function(project=null){__renderImagesOriginal(project);const root=$('#content');if(!$('#imgCanvas',root)||$('#imageCollection'))return;const fields=$('.studio-controls',root)||root;const d=document.createElement('div');d.className='field';d.innerHTML=`<label>Colección</label>${collectionPicker('imageCollection',project?.collection_id)}`;fields.appendChild(d);initCollectionPicker('imageCollection')};


// ===== Senda v1.1.8 UI patch =====
(function(){
const V118_COMPARE_ICON='copy-alt';
const V118_NOTE_ICON='note';
const V118_VIDEO_ICON='play-alt';
const V118_IMAGE_ICON='picture';
const V118_ILLUS_ICON='camera';
const V118_FAVORITE_CHAR_ACTIVE='<i class="fi fi-sr-heart"></i>';
const V118_FAVORITE_CHAR_IDLE='<i class="fi fi-rr-heart"></i>';
let __escBound=false;
function ensureEscClear(){ if(__escBound) return; document.addEventListener('keydown',e=>{ if(e.key==='Escape' && selectedVerses && selectedVerses.size){ selectedVerses.clear(); selectedVerse=0; selectedText=''; $$('.verse').forEach(x=>x.classList.remove('selected')); showVersePanel(); } }); __escBound=true; }
function essentialCollectionsOrdered(){
  const defaults=state.collections.filter(c=>c.is_default);
  const others=state.collections.filter(c=>!c.is_default);
  const index = new Map((state.categories||[]).map((c,i)=>[String(c.label||'').toLowerCase(),i]));
  const score = c => {
    const name=String(c.name||'').toLowerCase();
    if(/importante|recordar/.test(name)) return -100;
    for(const [label,i] of index.entries()){ if(name.includes(label)) return i; }
    return 999;
  };
  defaults.sort((a,b)=>score(a)-score(b)||String(a.name).localeCompare(String(b.name)));
  others.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  return {defaults,others};
}
function entryIcon(kind,item){ const c=getColForItem?.(item); return kind==='note'?(c?.icon||'fi fi-rr-note'):kind==='video'?'fi fi-rr-play-alt':kind==='image'?'fi fi-rr-picture':'fi fi-rr-camera'; }
function entryThumb(kind,item){ return kind==='video'?mediaThumb(item):kind==='image'?item.image_data:kind==='illustration'?('/'+item.file_path):''; }
function entryBorder(item){ return getColForItem?.(item)?.color || '#e6d7b1'; }
function unifiedCard(kind,item){ const c=getColForItem?.(item); const clr=c?.color||'#d7be85'; const thumb=entryThumb(kind,item); const subtitle=`${refsPretty(item.reference)} · ${versionLabel(item)}`; return `<article class="v118-card" style="--collection-color:${esc(clr)}"><button class="v118-card-open" data-entry="${kind}:${item.id}">${thumb?`<div class="v118-thumb ${kind==='video'?'is-video':''}"><img loading="lazy" src="${esc(thumb)}" alt=""></div>`:`<div class="v118-note-preview">${esc((item.html||'').replace(/<[^>]+>/g,' ').trim().slice(0,220)||'Sin contenido')}</div>`}</button><div class="v118-meta"><div class="v118-meta-main"><i class="${esc(entryIcon(kind,item))}" style="color:${esc(clr)}"></i><div><strong>${esc(item.title||refsPretty(item.reference))}</strong><small>${esc(subtitle)}</small></div></div><button class="v118-open-ref" data-go-ref="${esc(item.reference)}" data-version="${esc(item.translation_id||'')}" type="button">Abrir versículo</button></div></article>`; }

renderShell=function(){
  ensureEscClear();
  const nav=[
    ['home','Inicio','home'],['timeline','Línea de Tiempo','time-past'],['library','Biblioteca','book-alt'],['bible','Biblia','bookmark'],['compare','Comparar',V118_COMPARE_ICON],
    ['collections','Colecciones','folder-open'],['gallery','Galería','picture'],['media','Videos','play-alt'],['notes','Notas','note'],['favorites','Favoritos','heart'],['images','Editor','edit'],['settings','Configuración','settings']
  ];
  $('#app').innerHTML=`<div class="app"><aside class="sidebar" id="sidebar"><div class="brand"><div class="brand-mark"><img src="senda-logo.png" alt="Libro abierto y cruz"></div><div><h1>Senda</h1><small>Biblia · Estudio</small></div></div><div class="nav">${nav.map(n=>`<button data-view="${n[0]}" class="${view===n[0]?'active':''}"><i class="fi fi-rr-${n[2]}"></i>${n[1]}</button>`).join('')}</div><div class="sidebar-bottom"><div class="status"><strong>Panel local</strong><span class="mode-dot">Edición habilitada</span></div><button class="btn soft" id="backupBtn"><i class="fi fi-rr-disk"></i> Respaldar Senda</button></div></aside><main class="main"><header class="topbar"><div class="top-left"><button class="iconbtn mobile-only" id="menuBtn"><i class="fi fi-rr-menu-burger"></i></button><div><div class="page-title" id="pageTitle">Inicio</div><div class="crumb" id="crumb">Senda · Panel local</div></div></div><div class="top-actions"><span class="save-status" id="saveStatus">Datos en SQLite · borradores en navegador</span><button class="btn soft" id="saveAllBtn"><i class="fi fi-rr-check"></i> Guardar cambios</button><div class="top-search"><i class="fi fi-rr-search"></i><input id="globalSearchInput" aria-label="Buscar en Senda" placeholder="Buscar libro, nota, colección…"></div><a class="btn soft" href="/sitio/" target="_blank" rel="noopener noreferrer" title="Ver el sitio público actualizado"><i class="fi fi-rr-eye"></i> Ver sitio</a></div></header><section class="content" id="content"></section></main></div>`;
  $$('.nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view; $('#sidebar')?.classList.remove('open'); render();});
  $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
  $('#globalSearchInput').onkeydown=e=>{if(e.key==='Enter'){searchTerm=e.target.value;view='search';render(); setTimeout(()=>{const input=$('#searchInput'); if(input){input.value=searchTerm; runSearch();}},10)}};
  $('#backupBtn').onclick=backup; $('#saveAllBtn').onclick=async()=>{try{await api('/api/save',{method:'POST',body:'{}'});$('#saveStatus').textContent=d.publication?.ok===false?'Guardado · revisar sitio':'Guardado ✓';toast(d.publication?.ok===false?'Guardado local, pero falló la actualización del sitio.':'Cambios guardados y sitio actualizado en docs/.');}catch(e){toast(e.message)}};
};

render=function(){
  renderShell();
  const titles={home:'Inicio',timeline:'Línea de Tiempo',library:'Biblioteca',bible:'Biblia',compare:'Comparar',collections:'Colecciones',gallery:'Galería',media:'Videos',notes:'Notas',favorites:'Favoritos',images:'Editor',settings:'Configuración',collection_detail:'Colección',search:'Buscar'};
  $('#pageTitle').textContent=titles[view]||'Senda';
  ({home:renderHome,timeline:renderTimeline,library:renderLibrary,bible:renderBible,compare:renderCompare,collections:renderCollections,gallery:renderGallery,media:renderMedia,notes:renderNotes,favorites:renderFavorites,images:renderImages,settings:renderSettings,collection_detail:renderCollectionDetail,search:renderSearch}[view]||renderHome)();
  icons();
};

styledActivity=function(entries){ return `<div class="v118-grid">${entries.map(e=>unifiedCard(e.kind,e.item)).join('')||'<div class="empty">Todavía no hay contenido.</div>'}</div>`; };
attachEntries=function(container=document){ $$('[data-entry]',container).forEach(b=>b.onclick=()=>{const [kind,id]=b.dataset.entry.split(':');const item=(kind==='note'?state.notes:kind==='video'?state.media:kind==='image'?state.image_projects:state.illustrations).find(x=>x.id===+id); if(!item)return; if(kind==='note')viewNote(item); else if(kind==='video')openYoutube(item); else if(kind==='image')showGalleryCreated(item); else showIllustration(item);}); $$('[data-go-ref]',container).forEach(b=>b.onclick=(e)=>{e.stopPropagation(); openReference(b.dataset.goRef,b.dataset.version)}); };

renderHome=function(){
  const notes=state.notes.length, pics=state.image_projects.length+(state.illustrations||[]).length, favs=state.favorites.length, mediaN=state.media.length;
  const last=state.history[0]?.reference;
  $('#content').innerHTML=`<div class="hero"><div class="hero-card"><div class="eyebrow">Senda · Biblia de estudio</div><h2>Mi camino de estudio en la Palabra de Dios.</h2><p>Un espacio personal para leer, comparar traducciones, guardar reflexiones, ordenar recursos y volver fácilmente a cada versículo.</p><button class="btn" id="continueBtn">${last?`Continuar ${esc(last)}`:'Abrir la Biblia'} <i class="fi fi-rr-arrow-right"></i></button></div><div class="stats"><div class="stat"><div class="num">${notes}</div><small>Notas</small></div><div class="stat"><div class="num">${mediaN}</div><small>Videos</small></div><div class="stat"><div class="num">${pics}</div><small>Imágenes</small></div><div class="stat"><div class="num">${favs}</div><small>Favoritos</small></div></div></div><div class="section-head v118-tight"><h3>Comenzar</h3></div><div class="grid-3"><div class="card" style="padding:18px"><div class="pill"><i class="fi fi-rr-bookmark"></i> Biblia</div><h3 style="margin:12px 0 6px">Lee por libro y capítulo</h3><p class="muted" style="font-size:12px;line-height:1.6">Los 73 libros ya están preparados para tu estudio.</p><button class="btn soft" data-go="library">Ver biblioteca</button></div><div class="card" style="padding:18px"><div class="pill"><i class="fi fi-rr-note"></i> Estudio</div><h3 style="margin:12px 0 6px">Notas, imágenes y recursos</h3><p class="muted" style="font-size:12px;line-height:1.6">Todo se enlaza con el versículo y con su traducción.</p><button class="btn soft" data-go="bible">Empezar</button></div><div class="card" style="padding:18px"><div class="pill"><i class="fi fi-rr-folder-open"></i> Colecciones</div><h3 style="margin:12px 0 6px">Construye tu biblioteca</h3><p class="muted" style="font-size:12px;line-height:1.6">Agrupa tus reflexiones con color, icono y portada.</p><button class="btn soft" data-go="collections">Ver colecciones</button></div></div><div class="section-head"><h3>Actividad reciente</h3></div>${styledActivity(activityEntries().slice(0,18))}`;
  $$('[data-go]').forEach(b=>b.onclick=()=>{view=b.dataset.go;render()});
  $('#continueBtn').onclick=()=>{ if(last){const m=last.match(/^([A-Z0-9]+)\.(\d+)\.(\d+)$/); if(m){currentBook=m[1];currentChapter=+m[2];selectedVerse=+m[3]; selectedVerses=new Set([selectedVerse]);}} view='bible'; render(); };
  attachEntries($('#content'));
};

renderMedia=function(){ const entries=state.media.map(item=>({kind:'video',item,date:item.updated_at})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))); $('#content').innerHTML=`<div class="section-head v118-page-head"><div><h2>Videos</h2><p class="muted mini">Todos los videos vinculados a tus versículos.</p></div></div>${styledActivity(entries)}`; attachEntries($('#content')); };
renderNotes=function(){ const entries=state.notes.map(item=>({kind:'note',item,date:item.updated_at})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))); $('#content').innerHTML=`<div class="section-head v118-page-head"><div><h2>Notas</h2><p class="muted mini">Todas tus reflexiones bíblicas.</p></div></div>${styledActivity(entries)}`; attachEntries($('#content')); };
renderFavorites=function(){ const items=state.favorites.map(f=>({reference:f.reference,title:refsPretty(f.reference),translation_id:'',kind:'favorite'})); $('#content').innerHTML=`<div class="section-head v118-page-head"><div><h2>Favoritos</h2><p class="muted mini">Tus versículos marcados con corazón.</p></div></div><div class="v118-grid">${items.map(x=>`<article class="v118-card v118-fav-card"><button class="v118-card-open" data-go-ref="${esc(x.reference)}"><div class="v118-note-preview v118-favorite-preview"><span class="v118-fav-heart"><i class="fi fi-sr-heart"></i></span><div><strong>${esc(x.title)}</strong><small>Favorito bíblico</small></div></div></button><div class="v118-meta"><div class="v118-meta-main"><span class="fav-glyph"><i class="fi fi-sr-heart"></i></span><div><strong>${esc(x.title)}</strong><small>${esc(refsPretty(x.reference))}</small></div></div><button class="v118-open-ref" data-go-ref="${esc(x.reference)}">Abrir versículo</button></div></article>`).join('')||'<div class="empty">Aún no tienes favoritos.</div>'}</div>`; attachEntries($('#content')); };

renderGallery=function(){ const all=galleryItems(), items=galleryTab==='all'?all:all.filter(x=>x.type===galleryTab); $('#content').innerHTML=`<div class="section-head v118-page-head"><div><h2>Galería</h2><p class="muted mini">Imágenes e ilustraciones asociadas a los versículos de Senda.</p></div></div><div class="gallery-tabs">${[['all','Todas'],['created','Imágenes creadas'],['illustration','Ilustraciones']].map(([v,l])=>`<button class="btn ${galleryTab===v?'primary':'soft'}" data-tab="${v}">${l}</button>`).join('')}</div>${styledActivity(items.map(x=>({kind:x.type==='created'?'image':'illustration',item:x,date:x.date})) )}`; $$('[data-tab]').forEach(b=>b.onclick=()=>{galleryTab=b.dataset.tab;renderGallery()}); attachEntries($('#content')); };

renderSearch=function(){ $('#content').innerHTML=`<div class="section-head"><div><h2>Buscar</h2><p class="muted mini">Busca libros, notas, videos, imágenes, ilustraciones o colecciones.</p></div></div><div class="field"><input class="input" id="searchInput" value="${esc(searchTerm||'')}" placeholder="Escribe una palabra y pulsa Enter"></div><div id="searchResults"></div>`; $('#searchInput').onkeydown=e=>{ if(e.key==='Enter') runSearch(); }; runSearch=function(){ searchTerm=$('#searchInput').value.trim().toLowerCase(); const matches=[]; const add=(kind,item,text)=>{ if(!searchTerm || String(text).toLowerCase().includes(searchTerm)) matches.push({kind,item,date:item.updated_at||item.created_at||''}); };
 add('collection',{id:-1,title:'',reference:''},''); (state.notes||[]).forEach(x=>add('note',x,[x.title,x.reference,(x.html||'').replace(/<[^>]+>/g,' ')].join(' '))); (state.media||[]).forEach(x=>add('video',x,[x.title,x.subtitle,x.reference].join(' '))); (state.image_projects||[]).forEach(x=>add('image',x,[x.title,x.reference].join(' '))); (state.illustrations||[]).forEach(x=>add('illustration',x,[x.title,x.reference,(x.description_html||'').replace(/<[^>]+>/g,' ')].join(' '))); const bookMatches=visibleBooks().filter(b=>!searchTerm || `${b.es} ${b.en}`.toLowerCase().includes(searchTerm)); $('#searchResults').innerHTML=(bookMatches.length?`<div class="section-head"><h3>Libros</h3></div><div class="v118-pill-grid">${bookMatches.map(b=>`<button class="pill" data-book-result="${b.id}">${esc(b.es)}</button>`).join('')}</div>`:'')+`<div class="section-head"><h3>Contenido</h3></div>${styledActivity(matches.sort((a,b)=>String(b.date).localeCompare(String(a.date))))}`; $$('[data-book-result]').forEach(b=>b.onclick=()=>{currentBook=b.dataset.bookResult;currentChapter=1;view='bible';render()}); attachEntries($('#searchResults')); }; runSearch(); };

renderCollections=function(){ const o=essentialCollectionsOrdered(); const listing=rows=>`<div class="v118-collection-grid">${rows.map(c=>`<article class="v118-col-card" style="--collection-color:${esc(c.color)}"><button class="v118-col-open" data-open-col="${c.id}"><div class="v118-col-photo" style="background-color:${esc(c.color)};${c.cover?`background-image:url('/${esc(c.cover)}');`:''}background-position:${esc(c.cover_position||'50% 50%')}"></div><div class="v118-col-heading"><div class="v118-col-title"><i class="${esc(c.icon)}" style="color:${esc(c.color)}"></i><span><strong>${esc(c.name)}</strong><small>${esc(c.description||'Colección bíblica')}</small></span></div></div></button><button class="v118-col-edit" data-edit-col="${c.id}" title="Opciones de la colección"><i class="fi fi-rr-pencil"></i></button></article>`).join('')}</div>`; $('#content').innerHTML=`<div class="section-head"><div><h2>Mis colecciones</h2><p class="muted mini">Todo tu estudio organizado por significado</p></div><button class="btn primary" id="newCol"><i class="fi fi-rr-add"></i> Nueva colección</button></div><div class="section-head"><h3>Colecciones esenciales</h3></div>${listing(o.defaults)}<div class="section-head"><h3>Mis colecciones</h3></div>${listing(o.others)}`; $('#newCol').onclick=()=>openCollectionModal(); $$('[data-open-col]').forEach(b=>b.onclick=()=>{activeCollectionId=+b.dataset.openCol;view='collection_detail';render()}); $$('[data-edit-col]').forEach(b=>b.onclick=(e)=>{e.stopPropagation(); const c=state.collections.find(x=>x.id===+b.dataset.editCol); if(!c)return; openModal(`<div class="modal-head"><h3>${esc(c.name)}</h3><button class="iconbtn" data-close>×</button></div><div class="modal-actions"><button class="btn soft" id="modifyCol">Editar portada y datos</button>${c.is_default?'':'<button class="btn danger" id="removeCol">Eliminar colección</button>'}</div>`); $('#modifyCol').onclick=()=>openCollectionModal(c); if(!c.is_default) $('#removeCol').onclick=()=>{closeModal(); deleteItem('collection',c.id)};}); };

renderCollectionDetail=function(){ const c=state.collections.find(x=>x.id===activeCollectionId); if(!c){view='collections'; renderCollections(); return} const rows=activityEntries().filter(e=>+e.item.collection_id===c.id),legacy=state.collection_items.filter(x=>x.collection_id===c.id).map(x=>x.reference); const legacyR=legacy.filter(ref=>!rows.some(e=>refsInclude(e.item.reference,ref))); $('#content').innerHTML=`<div class="section-head"><button class="btn soft" id="backCollections"><i class="fi fi-rr-angle-left"></i> Colecciones</button></div><div class="v118-detail-intro only"><i class="${esc(c.icon)}" style="color:${esc(c.color)}"></i><div><h2>${esc(c.name)}</h2><p>${esc(c.description||'')}</p><small>${rows.length} publicaciones · ${legacyR.length} referencias adicionales</small></div></div>${styledActivity(rows)}${legacyR.length?`<div class="section-head"><h3>Versículos guardados</h3></div><div class="v117-ref-list">${legacyR.map(r=>`<button class="pill" data-go-ref="${esc(r)}">${esc(refsPretty(r))}</button>`).join('')}</div>`:''}`; $('#backCollections').onclick=()=>{view='collections';render()}; attachEntries($('#content')); };

renderTimeline=function(){ const p=state.profile||{}, entries=activityEntries(); const groups=[]; const map=new Map(); entries.forEach(e=>{const d=timelineDate(e.date); if(!map.has(d)) map.set(d,[]); map.get(d).push(e)}); for(const [day,items] of map.entries()) groups.push({day,items}); $('#content').innerHTML=`<div class="timeline-header"><div class="timeline-cover" style="background-image:${p.cover?`url('/${esc(p.cover)}')`:'linear-gradient(130deg,#e6dbcc,#9caeb5)'};background-position:${esc(p.cover_position||'50% 50%')}">${state.mode==='local'?'<button class="timeline-cover-edit" id="editTimeline">Editar perfil y portada <i class="fi fi-rr-pencil"></i></button>':''}</div><div class="timeline-person v118-profile"><div class="timeline-avatar large">${p.avatar?`<img src="/${esc(p.avatar)}" alt="Foto de perfil">`:'<i class="fi fi-rr-user"></i>'}</div><div><h2>${esc(p.name||'César')}</h2><p>${esc(p.subtitle||'Mis estudios y reflexiones')}</p><small>${entries.length} publicaciones · Senda</small></div></div></div><div class="section-head"><h3>Mi Línea de Tiempo</h3><span class="muted mini">Recuerdos, reflexiones y recursos bíblicos</span></div><div class="v118-timeline">${groups.map((g,i)=>`<section class="v118-time-row ${i%2===0?'left':'right'}"><div class="v118-time-day">${esc(g.day)}</div><div class="v118-time-items">${styledActivity(g.items)}</div></section>`).join('')||'<div class="empty">La historia de tu estudio comenzará con tu primera nota.</div>'}</div>`; attachEntries($('#content')); const b=$('#editTimeline'); if(b)b.onclick=openTimelineSettings; };

renderVerses=function(verses){ const target=$('#readerText'); if(!target)return; target.innerHTML=verses.map(v=>{ const refv=`${currentBook}.${currentChapter}.${v.verse}`; const hs=getHighlights(currentBook,currentChapter,v.verse,selectedTranslation); const notes=state.notes.filter(n=>refsInclude(n.reference,refv)); const videos=state.media.filter(m=>refsInclude(m.reference,refv)); const images=state.image_projects.filter(m=>refsInclude(m.reference,refv)); const ills=(state.illustrations||[]).filter(m=>refsInclude(m.reference,refv)); const fav=favoriteActive(refv); const noteCol=state.collections.find(x=>x.id===+notes[0]?.collection_id)||state.categories.find(x=>x.id===notes[0]?.category_id); const glyphs=[notes.length?'<i class="fi fi-rr-note" title="Notas"></i>':'',videos.length?'<i class="fi fi-rr-play-alt" title="Videos"></i>':'',images.length?'<i class="fi fi-rr-picture" title="Imágenes"></i>':'',ills.length?'<i class="fi fi-rr-camera" title="Ilustraciones"></i>':'',fav?'<span class="fav-glyph inline"><i class="fi fi-sr-heart"></i></span>':''].join(''); return `<div class="verse ${selectedVerses.has(v.verse)?'selected':''} ${noteCol?'verse-noted':''}" ${noteCol?`style="--note-color:${htmlPastel(noteCol.color)}"`:''} data-verse="${v.verse}" data-text="${esc(v.text)}" tabindex="0" role="button"><span class="verse-num">${v.verse}</span><span class="verse-glyphs">${glyphs}</span><span class="verse-text">${decorateText(v.text,hs)}</span></div>`; }).join('') || `<div class="empty">No hay versículos disponibles.</div>`; $$('.verse',target).forEach(el=>{el.onclick=()=>selectVerse(+el.dataset.verse); el.onkeydown=e=>{if(e.key==='Enter')selectVerse(+el.dataset.verse)}}); showVersePanel(); };

showVersePanel=function(){ const p=$('#versePanel'); if(!p)return; if(!selectedVerses.size){ const prefix=currentBook+'.'; const counts=[state.notes.filter(x=>x.reference.includes(prefix)).length,state.media.filter(x=>x.reference.includes(prefix)).length,state.image_projects.filter(x=>x.reference.includes(prefix)).length+(state.illustrations||[]).filter(x=>x.reference.startsWith(prefix)).length,state.favorites.filter(x=>x.reference.startsWith(prefix)).length]; p.innerHTML=`<div class="side-title"><h3>${esc(book()?.es||'Libro')} · Estadísticas</h3></div><p class="muted mini">Selecciona uno o varios versículos. Pulsa nuevamente o presiona Esc para deseleccionar.</p><div class="sidebar-stat-grid">${counts.map((n,i)=>`<div><i class="${['fi fi-rr-note','fi fi-rr-play-alt','fi fi-rr-picture','fi fi-rr-picture','fi fi-rr-heart'][i]}"></i><strong>${n}</strong><small>${['Notas','Videos','Imágenes','Ilustraciones','Favoritos'][i]}</small></div>`).join('')}</div>`; return; }
 const list=refs(), notes=multiNotes(), media=multiMedia(), first=list[0], fav=favoriteActive(first), images=state.image_projects.filter(x=>list.some(r=>refsInclude(x.reference,r))), ills=(state.illustrations||[]).filter(x=>list.some(r=>refsInclude(x.reference,r)));
 p.innerHTML=`<div class="side-title"><div><h3>${esc(selectedLabel())}</h3><small class="muted">${list.length} versículo(s)</small></div>${list.length===1?`<button class="iconbtn ${fav?'is-fav':''}" id="panelFav" title="Favorito"><span class="fav-glyph">${fav?V118_FAVORITE_CHAR_ACTIVE:V118_FAVORITE_CHAR_IDLE}</span></button>`:''}</div><div class="side-block"><div class="filters"><button class="btn soft" id="addNote"><i class="fi fi-rr-note"></i> Nueva nota</button><button class="btn soft" id="addMedia"><i class="fi fi-rr-play-alt"></i> Video</button>${list.length===1?`<button class="btn soft" id="createVerseImage"><i class="fi fi-rr-picture"></i> Imagen</button><button class="btn soft" id="addIllustration"><i class="fi fi-rr-camera"></i> Ilustración</button>`:''}</div></div><div class="side-block"><strong class="side-subhead">Notas (${notes.length})</strong>${notes.map(n=>{const c=state.collections.find(x=>x.id===+n.collection_id)||state.categories.find(x=>x.id===n.category_id);return `<div class="note-preview note-compact" style="border-left:4px solid ${esc(c?.color||'#e5b84b')}"><h4>${esc(n.title||n.reference)}</h4><small>${esc(refsPretty(n.reference))} · ${esc(versionLabel(n))}</small><div class="note-actions"><button class="iconbtn" data-view-note="${n.id}" title="Ver nota"><i class="fi fi-rr-eye"></i></button><button class="iconbtn" data-edit-note="${n.id}" title="Editar"><i class="fi fi-rr-pencil"></i></button><button class="iconbtn" data-delete-note="${n.id}" title="Eliminar"><i class="fi fi-rr-trash"></i></button></div></div>`}).join('')||'<div class="muted mini">Sin notas.</div>'}</div><div class="side-block"><strong class="side-subhead">Imágenes</strong><div class="illustration-inline">${images.map(x=>`<button type="button" data-view-image="${x.id}"><img src="${esc(x.image_data)}" alt="${esc(x.title)}"></button>`).join('')||'<p class="muted mini">Sin imágenes.</p>'}</div></div><div class="side-block"><strong class="side-subhead">Ilustraciones</strong><div class="illustration-inline">${ills.map(x=>`<button type="button" data-view-illustration="${x.id}"><img src="/${esc(x.file_path)}" alt="${esc(x.title)}"></button>`).join('')||'<p class="muted mini">Sin ilustraciones.</p>'}</div></div><div class="side-block"><strong class="side-subhead">Videos (${media.length})</strong>${media.map(m=>`<button class="video-chip video-chip-rich" data-open-video="${m.id}"><img class="video-chip-thumb" src="${esc(mediaThumb(m))}" alt=""><span><strong>${esc(m.title||'Video de YouTube')}</strong><small>${esc(refsPretty(m.reference))} · ${esc(versionLabel(m))}</small></span></button>`).join('')||'<div class="muted mini">Sin videos.</div>'}</div>`;
 if($('#panelFav'))$('#panelFav').onclick=toggleFavorite; $('#addNote').onclick=()=>openNoteModal(); $('#addMedia').onclick=()=>openMediaModal(); if($('#createVerseImage'))$('#createVerseImage').onclick=()=>{const v=selectedVerseData(); imageVerseRef=ref(); imageVerseText=v.text; view='images'; render()}; if($('#addIllustration'))$('#addIllustration').onclick=()=>openIllustrationModal(); $$('[data-view-note]',p).forEach(b=>b.onclick=()=>viewNote(state.notes.find(n=>n.id==b.dataset.viewNote))); $$('[data-edit-note]',p).forEach(b=>b.onclick=()=>openNoteModal(state.notes.find(n=>n.id==b.dataset.editNote))); $$('[data-delete-note]',p).forEach(b=>b.onclick=()=>deleteItem('note',+b.dataset.deleteNote)); $$('[data-open-video]',p).forEach(b=>b.onclick=()=>openYoutube(state.media.find(m=>m.id==b.dataset.openVideo))); $$('[data-view-illustration]',p).forEach(b=>b.onclick=()=>showIllustration((state.illustrations||[]).find(x=>x.id==b.dataset.viewIllustration))); $$('[data-view-image]',p).forEach(b=>b.onclick=()=>showGalleryCreated((state.image_projects||[]).find(x=>x.id==b.dataset.viewImage))); };

collectionPicker=function(id,selected){ const ordered=[...essentialCollectionsOrdered().defaults,...essentialCollectionsOrdered().others]; const value=selected?Number(selected):''; return `<div class="collection-picker" data-picker="${id}"><button type="button" class="collection-picker-trigger" id="${id}Trigger"><span id="${id}Label"></span><i class="fi fi-rr-angle-down"></i></button><div class="collection-picker-menu" id="${id}Menu" hidden><button type="button" class="collection-picker-option" data-choice=""><span class="collection-dot empty"></span><span>Ninguna</span></button>${ordered.map(c=>`<button type="button" class="collection-picker-option" data-choice="${c.id}"><span class="collection-dot" style="background:${esc(c.color)}"></span><i class="${esc(c.icon)}" style="color:${esc(c.color)}"></i>${esc(c.name)}</button>`).join('')}</div><input type="hidden" id="${id}" value="${value}"></div>`; };
initCollectionPicker=function(id){ const v=$('#'+id),label=$('#'+id+'Label'),menu=$('#'+id+'Menu'); if(!v||!menu)return; const update=()=>{ const col=state.collections.find(c=>String(c.id)===String(v.value)); label.innerHTML=col?`<span class="collection-dot" style="background:${esc(col.color)}"></span><i class="${esc(col.icon)}" style="color:${esc(col.color)}"></i><span>${esc(col.name)}</span>`:`<span class="collection-dot empty"></span><span>Ninguna</span>`; }; $('#'+id+'Trigger').onclick=()=>menu.hidden=!menu.hidden; $$('[data-choice]',menu).forEach(b=>b.onclick=()=>{v.value=b.dataset.choice; menu.hidden=true; update()}); update(); };

openNoteModal=function(existing){ if(!selectedVerses.size && !existing){toast('Selecciona uno o varios versículos');return} const r=existing?.reference||selectedRefs(); openModal(`<div class="modal-head"><div><h3>${existing?'Editar nota':'Nueva nota'}</h3><div class="muted mini">${esc(existing?.reference||selectedLabel())}</div></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div><div class="field"><label>Título</label><input class="input" id="noteTitle" value="${esc(existing?.title||'')}"></div><div class="field"><label>Mi reflexión</label>${editorHTML('noteBody',existing?.html||'')}</div><div class="field"><label>Colección</label>${collectionPicker('noteCollection',existing?.collection_id)}</div><div class="modal-actions"><button class="btn soft" data-close>Cancelar</button><button class="btn primary" id="saveNote"><i class="fi fi-rr-disk"></i> Guardar nota</button></div>`); initCollectionPicker('noteCollection'); const body=setupRichEditor('noteBody'); icons(); $('#saveNote').onclick=async()=>{ if(!body.textContent.trim()) return toast('Escribe tu reflexión antes de guardar.'); if(!$('#noteCollection').value) return toast('Debes elegir una colección.'); try{ const d=await api('/api/note',{method:'POST',body:JSON.stringify({id:existing?.id,scope:'verse',reference:r,title:$('#noteTitle').value.trim(),html:body.innerHTML.trim(),translation_id:existing?.translation_id||selectedTranslation,category_id:categoryForCollection(+$('#noteCollection').value),collection_id:+$('#noteCollection').value,is_public:true})}); state=d.state; closeModal(); renderVerses(currentVerses); toast('Nota guardada en SQLite'); }catch(e){toast(e.message)}; }; };

openMediaModal=function(existing=null){ if(!selectedVerses.size&&!existing){toast('Selecciona uno o varios versículos');return} const references=existing?.reference||selectedRefs(); openModal(`<div class="modal-head"><h3>${existing?'Editar video':'Añadir video'}</h3><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div><p class="muted mini">${esc(references)}</p><div class="field"><label>Título</label><input class="input" id="mediaTitle" value="${esc(existing?.title||'')}" placeholder="Título del video"></div><div class="field"><label>Subtítulo</label><input class="input" id="mediaSubtitle" value="${esc(existing?.subtitle||'')}" placeholder="Descripción breve"></div><div class="field"><label>Enlace de YouTube</label><input class="input" id="mediaUrl" value="${esc(existing?.youtube_url||'')}" placeholder="https://www.youtube.com/watch?v=..."></div><div class="field"><label>Descripción o comentario personal</label>${editorHTML('mediaRichBody',existing?.description_html||esc(existing?.description||''))}</div><div class="field"><label>Colección</label>${collectionPicker('mediaCollection',existing?.collection_id)}</div><div class="modal-actions"><button class="btn soft" data-close>Cancelar</button><button class="btn primary" id="saveMedia"><i class="fi fi-rr-disk"></i> Guardar video</button></div>`); initCollectionPicker('mediaCollection'); const body=setupRichEditor('mediaRichBody'); icons(); $('#saveMedia').onclick=async()=>{const url=$('#mediaUrl').value.trim(); if(!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) return toast('Introduce un enlace de YouTube válido'); if(!$('#mediaCollection').value) return toast('Debes elegir una colección.'); try{ const d=await api('/api/media',{method:'POST',body:JSON.stringify({id:existing?.id,reference:references,kind:'video',title:$('#mediaTitle').value.trim(),subtitle:$('#mediaSubtitle').value.trim(),description_html:body.innerHTML,description:body.textContent.trim(),youtube_url:url,translation_id:existing?.translation_id||selectedTranslation,collection_id:+$('#mediaCollection').value})}); state=d.state; closeModal(); showVersePanel(); toast('Video guardado en SQLite'); }catch(e){toast(e.message)}; }; };

openIllustrationModal=function(existing=null){ if(!existing&&selectedVerses.size!==1){toast('Selecciona un único versículo para subir una ilustración.');return} const reference=existing?.reference||ref(); openModal(`<div class="modal-head"><div><h3>${existing?'Editar ilustración':'Subir ilustración'}</h3><p class="muted mini">${esc(refsPretty(reference))}</p></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div><div class="field"><label>Título</label><input class="input" id="illTitle" value="${esc(existing?.title||'')}" placeholder="Ej.: El arca de Noé"></div><div class="field"><label>Imagen JPG, PNG o WebP ${existing?'(opcional para conservar la actual)':''}</label><input class="input" id="illFile" type="file" accept="image/png,image/jpeg,image/webp"></div><div class="field"><label>Descripción o reflexión</label>${editorHTML('illDescription',existing?.description_html||'')}</div><div class="field"><label>Colección</label>${collectionPicker('illCollection',existing?.collection_id)}</div><div class="modal-actions"><button class="btn soft" data-close>Cancelar</button><button class="btn primary" id="saveIllustration">Guardar ilustración</button></div>`); initCollectionPicker('illCollection'); const body=setupRichEditor('illDescription'); icons(); $('#saveIllustration').onclick=async()=>{const file=$('#illFile').files[0]; if(!$('#illCollection').value) return toast('Debes elegir una colección.'); try{let dataURL=''; if(file){ dataURL=await sendaOptimizeUpload(file) } const result=await api('/api/illustration',{method:'POST',body:JSON.stringify({id:existing?.id,reference,title:$('#illTitle').value.trim(),description_html:body.innerHTML,collection_id:+$('#illCollection').value,translation_id:existing?.translation_id||selectedTranslation,image_data:dataURL})}); state=result.state; closeModal(); toast('Ilustración guardada'); if(view==='gallery')renderGallery(); else showVersePanel(); }catch(e){toast(e.message)}; } };

const __saveImageProjectOriginal=saveImageProject; saveImageProject=async function(flags={}){ if(!$('#imageCollection')?.value) return toast('Debes elegir una colección.'); return __saveImageProjectOriginal(flags); };

renderSettings=(function(orig){ return function(){ orig(); const root=$('#content'); if(!root||$('#contentToolsCard')) return; const card=document.createElement('div'); card.id='contentToolsCard'; card.className='card'; card.style.marginTop='18px'; card.style.padding='18px'; card.innerHTML=`<div class="section-head"><div><h3>Importar o exportar contenido</h3><p class="muted mini">Mueve tu progreso entre versiones sin rehacer notas, videos, imágenes ni portadas.</p></div></div><div class="filters"><button class="btn soft" id="exportContentBtn"><i class="fi fi-rr-download"></i> Exportar contenido</button><label class="btn soft" for="importContentFile"><i class="fi fi-rr-upload"></i> Importar contenido</label><input type="file" id="importContentFile" accept=".zip" style="display:none"></div><p class="mini muted">Este respaldo incluye base de datos, ilustraciones, colecciones, perfil, portadas y contenido enlazado.</p>`; root.appendChild(card); const pub=document.createElement('div'); pub.className='card'; pub.style.cssText='margin-top:18px;padding:18px'; pub.innerHTML=`<h3><i class="fi fi-rr-globe"></i> Sitio web unificado</h3><p class="muted mini">Cada cambio guardado actualiza <strong>docs/</strong>, la carpeta pública del repositorio. Para que aparezca en GitHub Pages, confirma los archivos y sincroniza el repositorio desde GitHub Desktop (o git push). El panel y la base de datos quedan en tu equipo.</p><div class="filters"><a class="btn soft" href="/sitio/" target="_blank" rel="noopener noreferrer"><i class="fi fi-rr-eye"></i> Vista previa</a><button class="btn soft" id="rebuildSiteBtn"><i class="fi fi-rr-refresh"></i> Actualizar sitio</button></div>`; root.appendChild(pub); $('#rebuildSiteBtn').onclick=async()=>{try{const r=await api('/api/refresh-site',{method:'POST',body:'{}'});toast(r.ok?`Sitio actualizado: ${r.files} archivos · ${r.bibles} Biblias`:'No se pudo actualizar el sitio')}catch(e){toast(e.message)}}; $('#exportContentBtn').onclick=async()=>{ try{ const res=await fetch('/api/content-export',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); if(!res.ok) throw new Error('No se pudo exportar el contenido'); const blob=await res.blob(); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='Senda_Contenido.zip'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),3000); }catch(e){toast(e.message)} }; $('#importContentFile').onchange=async()=>{ const f=$('#importContentFile').files[0]; if(!f) return; try{ const data=await toDataURL(f); const r=await api('/api/content-import',{method:'POST',body:JSON.stringify({zip_data:data})}); state=r.state; toast('Contenido importado correctamente'); render(); }catch(e){toast(e.message)} }; }; })(renderSettings);

})();


// ===== Senda v1.1.8.1: edición directa en el lienzo =====
(function(){
const oldRenderImage=renderImages;
const oldDrawCanvas=drawCanvas;
function getCanvasConfig(){
 const by=id=>$('#'+id);
 const num=(id,def)=>Number(by(id)?.value??def);
 const txt=(id,def)=>by(id)?.value??def;
 return {ratio:txt('imgRatio','4:5'),mode:txt('imgMode','gradient'),color1:txt('imgColor1','#192946'),color2:txt('imgColor2','#7886a5'),base:txt('imgBase','#18263d'),fg:txt('imgFg','#ffffff'),text:txt('imgText',''),font:txt('imgFont','Georgia'),textSize:num('imgTextSize',43),align:txt('imgAlign','center'),lineHeight:num('imgLineHeight',136),textShadow:num('imgTextShadow',9),imgZoom:num('imgZoom',100),imgX:num('imgX',0),imgY:num('imgY',0),imgRotate:num('imgRotate',0),imgOpacity:num('imgOpacity',100),imgBlur:num('imgBlur',0),textX:num('imgTextX',50),textY:num('imgTextY',47)};
}
function manualLines(ctx,text,maxWidth){
 const result=[];
 for(const paragraph of String(text).replace(/\r\n?/g,'\n').split('\n')){
  if(!paragraph.trim()){result.push(paragraph);continue;}
  let line='';
  for(const chunk of (paragraph.match(/\S+\s*/g)||[paragraph])){
   const next=line+chunk;
   if(line&&ctx.measureText(next).width>maxWidth){result.push(line.trimEnd());line=chunk.trimStart();}
   else line=next;
  }
  result.push(line.trimEnd());
 }
 return result.length?result:[''];
}
function metrics(ctx,text,w,h,config){
 let size=config.textSize,lines=[];
 while(size>=16){
  ctx.font=`600 ${size}px ${JSON.stringify(config.font)}, Georgia, serif`;
  lines=manualLines(ctx,text,w*.78);
  if(lines.length*size*(config.lineHeight/100)<=h*.69)break;
  size-=2;
 }
 const lh=size*(config.lineHeight/100);
 return {size,lines,lh};
}
function normalizeEditableText(el){
 return (el?.innerText||'').replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/\n{3,}/g,'\n\n').replace(/\n$/,'');
}
function updateEditableOverlay(data){
 const overlay=$('#sendaVerseEditable'),handle=$('#sendaVerseDrag');
 const canvas=$('#imgCanvas');if(!overlay||!canvas)return;
 const ctx=canvas.getContext('2d'),w=800,h=canvas.height;
 const m=metrics(ctx,data.text,w,h,data),ratio=canvas.getBoundingClientRect().width/800||.5;
 overlay.style.left=data.textX+'%'; overlay.style.top=data.textY+'%';
 overlay.style.width='78%'; overlay.style.color=data.fg;overlay.style.textAlign=data.align;
 overlay.style.fontFamily=`${JSON.stringify(data.font)}, Georgia, serif`;overlay.style.fontSize=Math.max(10,m.size*ratio)+'px';
 overlay.style.lineHeight=String(data.lineHeight/100);overlay.style.textShadow=`0 1px ${Math.max(0,data.textShadow*ratio)}px rgba(0,0,0,.55)`;
 handle.style.left=data.textX+'%';handle.style.top=data.textY+'%';
 const xo=$('#imgTextXOut'),yo=$('#imgTextYOut');if(xo)xo.textContent=data.textX+'%';if(yo)yo.textContent=data.textY+'%';
}
// El texto del versículo aparece como elemento editable encima del canvas;
// el PNG se genera componiendo el fondo y las mismas líneas en el canvas.
drawCanvas=function(){
 const canvas=$('#imgCanvas');if(!canvas)return;
 const c=getCanvasConfig(),w=800,h=c.ratio==='1:1'?800:1000;
 canvas.width=w;canvas.height=h;
 const preview=$('#canvasPreview');if(preview){preview.style.aspectRatio=`${w}/${h}`;preview.style.width='min(500px,100%)';preview.style.height='auto';}
 const ctx=canvas.getContext('2d');
 if(c.mode==='gradient'){
  const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,c.color1);grad.addColorStop(1,c.color2);ctx.fillStyle=grad;
 }else ctx.fillStyle=c.base;
 ctx.fillRect(0,0,w,h);
 if(c.mode==='photo'&&studioImage?.complete&&studioImage?.naturalWidth){
  const cover=Math.max(w/studioImage.naturalWidth,h/studioImage.naturalHeight)*c.imgZoom/100;
  const iw=studioImage.naturalWidth*cover,ih=studioImage.naturalHeight*cover;
  const flags=window.__sendaFlip?.()||{flipX:false,flipY:false};
  ctx.save();ctx.translate(w/2+c.imgX,h/2+c.imgY);ctx.rotate(c.imgRotate*Math.PI/180);ctx.scale(flags.flipX?-1:1,flags.flipY?-1:1);
  ctx.globalAlpha=c.imgOpacity/100;ctx.filter=`blur(${c.imgBlur}px)`;ctx.drawImage(studioImage,-iw/2,-ih/2,iw,ih);ctx.restore();
 }
 const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,'rgba(0,0,0,.14)');shade.addColorStop(.5,'rgba(0,0,0,.22)');shade.addColorStop(1,'rgba(0,0,0,.28)');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
 if(window.__sendaExporting||!$('#sendaVerseEditable')){
  const {size,lines,lh}=metrics(ctx,c.text,w,h,c);
  ctx.fillStyle=c.fg;ctx.font=`600 ${size}px ${JSON.stringify(c.font)}, Georgia, serif`;ctx.textAlign=c.align;
  const textX=(w*c.textX/100)+(c.align==='left'?-w*.39:c.align==='right'?w*.39:0);
  const start=h*c.textY/100-(lines.length-1)*lh/2;
  ctx.textBaseline='middle';ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=c.textShadow;
  lines.forEach((line,i)=>ctx.fillText(line,textX,start+i*lh));
  ctx.shadowBlur=0;
 }
 // La referencia bíblica no es parte del texto editable.
 ctx.font='600 24px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c.fg;
 ctx.fillText(refsPretty($('#imgRef')?.value||''),w/2,h*.9);
 updateEditableOverlay(c);
};
renderImages=function(project=null){
 oldRenderImage(project);
 const preview=$('#canvasPreview'),canvas=$('#imgCanvas'),textarea=$('#imgText');
 if(!preview||!canvas||!textarea)return;
 const cfg=project?JSON.parse(project.config_json||'{}'):{};
 const left=$('.studio-typography')||$('.studio-controls');
 if(left){
  const editorHelp=document.createElement('div');editorHelp.className='v1181-direct-instructions';
  editorHelp.innerHTML='';
  const textField=textarea.closest('.field');if(textField){textField.hidden=true;textField.after(editorHelp);}else left.prepend(editorHelp);
  const pos=document.createElement('div');pos.className='v1181-position-controls';
  pos.innerHTML=`<div class="slider-line"><div><label for="imgTextX">Texto · horizontal</label><output id="imgTextXOut">${cfg.textX??50}%</output></div><input type="range" id="imgTextX" min="10" max="90" step="1" value="${cfg.textX??50}"></div><div class="slider-line"><div><label for="imgTextY">Texto · vertical</label><output id="imgTextYOut">${cfg.textY??47}%</output></div><input type="range" id="imgTextY" min="10" max="78" step="1" value="${cfg.textY??47}"></div>`;
  editorHelp.after(pos);
  $('#imgTextX').oninput=drawCanvas;$('#imgTextY').oninput=drawCanvas;
 }
 preview.style.position='relative';
 const editable=document.createElement('div');editable.id='sendaVerseEditable';editable.className='v1181-verse-editor';editable.contentEditable='true';editable.spellcheck=true;
 editable.setAttribute('role','textbox'); editable.setAttribute('aria-label','Editar texto bíblico directamente sobre la imagen');editable.setAttribute('aria-multiline','true');
 editable.innerText=textarea.value;
 const drag=document.createElement('button');drag.type='button';drag.id='sendaVerseDrag';drag.className='v1181-verse-drag';drag.title='Arrastra para mover el texto';drag.setAttribute('aria-label','Mover el texto');drag.innerHTML='<span>✥</span>';
 preview.appendChild(editable);preview.appendChild(drag);
 editable.addEventListener('input',()=>{textarea.value=normalizeEditableText(editable);drawCanvas()});
 editable.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))});
 editable.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();editable.blur();}});
 let start=null;
 drag.addEventListener('pointerdown',e=>{e.preventDefault();start={x:e.clientX,y:e.clientY,px:+$('#imgTextX').value,py:+$('#imgTextY').value};drag.setPointerCapture(e.pointerId)});
 drag.addEventListener('pointermove',e=>{if(!start)return;const rect=preview.getBoundingClientRect();const nx=Math.max(10,Math.min(90,start.px+(e.clientX-start.x)/rect.width*100)),ny=Math.max(10,Math.min(78,start.py+(e.clientY-start.y)/rect.height*100));$('#imgTextX').value=Math.round(nx);$('#imgTextY').value=Math.round(ny);drawCanvas()});
 drag.addEventListener('pointerup',()=>start=null);drag.addEventListener('pointercancel',()=>start=null);
 const originalDownload=$('#downloadImg')?.onclick;
 if($('#downloadImg'))$('#downloadImg').onclick=()=>{window.__sendaExporting=true;drawCanvas();try{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='Senda_'+($('#imgRef').value||'imagen').replace(/[^a-z0-9]+/gi,'_')+'.png';a.click()}finally{window.__sendaExporting=false;drawCanvas()}};
 // La vista previa comienza sin texto dibujado en el canvas: solo la capa editable.
 drawCanvas();
};
saveImageProject=async function(flags={}){
 if(!$('#imageCollection')?.value)return toast('Debes elegir una colección.');
 const editable=$('#sendaVerseEditable');if(editable)$('#imgText').value=normalizeEditableText(editable);
 const c=getCanvasConfig();
 if(!c.text.trim())return toast('Escribe el texto bíblico antes de guardar.');
 const config={...c,...flags,bgImage:studioImageSource,photoCredit:studioImageCredit};
 window.__sendaExporting=true;drawCanvas();
 const dataURL=$('#imgCanvas').toDataURL('image/png');window.__sendaExporting=false;drawCanvas();
 try{
  const result=await api('/api/image-project',{method:'POST',body:JSON.stringify({id:activeImageProjectId,reference:$('#imgRef').value,title:$('#imgTitle').value,config,image_data:dataURL,translation_id:state.image_projects.find(p=>p.id===activeImageProjectId)?.translation_id||selectedTranslation,collection_id:+$('#imageCollection').value,is_public:true})});
  state=result.state||await api('/api/state');
  toast('Imagen guardada en tu biblioteca');
  const saved=state.image_projects.find(x=>x.id===(result.id||activeImageProjectId))||state.image_projects[0];
  renderImages(saved);
 }catch(e){toast(e.message)}
};

// El ZIP de respaldo puede contener biblias, fotos y SQLite: ya no usa el límite de 6 MB de imágenes.
const oldRenderSettings=renderSettings;
renderSettings=function(){
 oldRenderSettings();
 const input=$('#importContentFile');if(!input)return;
 input.onchange=async()=>{
  const f=input.files?.[0];if(!f)return;
  if(f.size>150*1024*1024){toast('El respaldo supera 150 MB.');return;}
  if(!confirm('¿Importar este respaldo? Se reemplazarán los datos locales actuales. Haz un respaldo antes de continuar.'))return;
  try{
   const r=await fetch('/api/content-import',{method:'POST',headers:{'Content-Type':'application/zip'},body:f});
   const data=await r.json();if(!r.ok||data.ok===false)throw Error(data.error||'No se pudo importar el respaldo');
   state=data.state;toast('Contenido importado correctamente');render();
  }catch(e){toast(e.message)}
 };
};
})();

// ===== Senda 1.1.8.2 · acabados y carga eficiente de fotografías =====
(function(){
  const heartOutline='<i class="fi fi-rr-heart" aria-hidden="true"></i>';
  const heartFilled='<i class="fi fi-sr-heart" aria-hidden="true"></i>';
  const categoryOf=x=>state.collections.find(c=>Number(c.id)===Number(x.collection_id))||state.collections.find(c=>c.is_default&&/importante|recordar/i.test(c.name));
  const iconFor=(kind,x)=>kind==='note'?(categoryOf(x)?.icon||'fi fi-rr-note'):kind==='video'?'fi fi-rr-play-alt':kind==='image'?'fi fi-rr-picture':'fi fi-rr-camera';
  const thumbFor=(kind,x)=>kind==='video'?mediaThumb(x):kind==='image'?x.image_data:kind==='illustration'?'/'+x.file_path:'';
  function card(kind,x){
    const c=categoryOf(x),color=c?.color||'#bdab89',img=thumbFor(kind,x),subtitle=`${refsPretty(x.reference)} · ${versionLabel(x)}`;
    return `<article class="v1182-card" style="--collection-color:${esc(color)}"><button class="v1182-eye" title="Ver versículo" aria-label="Ver versículo" data-go-ref="${esc(x.reference)}" data-version="${esc(x.translation_id||'')}"><i class="fi fi-rr-eye"></i></button><button class="v1182-card-content" data-entry="${kind}:${x.id}">${img?`<img class="v1182-card-photo ${kind==='video'?'v1182-video-photo':''}" loading="lazy" src="${esc(img)}" alt="${esc(x.title||'')}">`:`<div class="v1182-note-html" style="background:${htmlPastel(color)}"><div class="v1182-rich-note html">${x.html||'<p>Sin contenido</p>'}</div></div>`}</button><div class="v1182-card-caption"><i class="${esc(iconFor(kind,x))}" style="color:${esc(color)}"></i><div><strong>${esc(x.title||refsPretty(x.reference))}</strong><small>${esc(subtitle)}</small></div></div></article>`;
  }
  styledActivity=function(entries){return `<div class="v1182-masonry">${entries.map(e=>card(e.kind,e.item)).join('')||'<div class="empty">Todavía no hay contenido.</div>'}</div>`};
  const oldFavoriteToggle=toggleFavorite;
  toggleFavorite=async function(){
    if(!selectedVerses.size||selectedVerses.size!==1)return;
    const r=ref(),active=!favoriteActive(r);
    try{
      const d=await api('/api/favorite',{method:'POST',body:JSON.stringify({reference:r,active,translation_id:selectedTranslation,verse_text:selectedVerseData().text})});
      state=d.state;
      renderVerses(currentVerses);
      toast(active?'Añadido a favoritos':'Quitado de favoritos');
    }catch(e){toast(e.message)}
  };
  const oldRenderVerses=renderVerses;
  renderVerses=function(verses){
    oldRenderVerses(verses);
    const root=$('#readerText');if(!root)return;
    $$('.verse',root).forEach(node=>{
      const number=+node.dataset.verse,r=`${currentBook}.${currentChapter}.${number}`;
      node.querySelector('.verse-glyphs')?.remove();
      const counts=[state.notes.some(x=>refsInclude(x.reference,r)),state.media.some(x=>refsInclude(x.reference,r)),state.image_projects.some(x=>refsInclude(x.reference,r)),(state.illustrations||[]).some(x=>refsInclude(x.reference,r)),state.favorites.some(x=>x.reference===r)];
      const icons=['fi fi-rr-note','fi fi-rr-play-alt','fi fi-rr-picture','fi fi-rr-camera','fi fi-rr-heart'];
      const labels=['Notas','Videos','Imágenes','Ilustraciones','Favorito'];
      const deco=document.createElement('div');deco.className='v1182-verse-decor';deco.setAttribute('aria-hidden','true');
      counts.forEach((yes,i)=>{if(yes){const glyph=document.createElement('i');glyph.className=icons[i];glyph.title=labels[i];deco.appendChild(glyph)}});
      const row=document.createElement('div');row.className='v1182-verse-row';node.before(row);row.append(deco,node);
    });
    patchVersePanel();
  };
  const oldShowVersePanel=showVersePanel;
  showVersePanel=function(){oldShowVersePanel();patchVersePanel()};
  function patchVersePanel(){
    const p=$('#versePanel');if(!p)return;
    const button=$('#panelFav',p);
    if(button){button.innerHTML=favoriteActive(ref())?heartFilled:heartOutline;button.onclick=toggleFavorite;}
    $$('.note-preview.note-compact',p).forEach((node,i)=>{
      const n=multiNotes()[i];if(!n)return;
      node.querySelector('.note-actions')?.remove();
      node.setAttribute('role','button');node.tabIndex=0;node.classList.add('v1182-note-click');
      node.onclick=()=>viewNote(n);node.onkeydown=e=>{if(e.key==='Enter')viewNote(n)};
    });
  }
  viewNote=function(n){
    if(!n)return;
    openModal(`<div class="modal-head"><div><h3>${esc(n.title||'Nota')}</h3><p class="muted mini">${esc(refsPretty(n.reference))} · ${esc(versionLabel(n))}</p></div><button class="iconbtn" data-close><i class="fi fi-rr-cross-small"></i></button></div><article class="note-reading html">${n.html||''}</article><div class="modal-actions"><button class="btn soft" id="visitNote"><i class="fi fi-rr-eye"></i> Ver versículo</button><button class="btn soft" id="editViewingNote"><i class="fi fi-rr-pencil"></i> Editar</button><button class="btn danger" id="deleteViewingNote"><i class="fi fi-rr-trash"></i> Eliminar</button></div>`);
    $('#visitNote').onclick=()=>{closeModal();openReference(n.reference,n.translation_id)};
    $('#editViewingNote').onclick=()=>openNoteModal(n);
    $('#deleteViewingNote').onclick=()=>{closeModal();deleteItem('note',n.id)};
  };
  const favChapterCache=new Map();
  async function hydrateFavoriteTexts(root){
    const holders=$$('[data-fav-snippet]',root);
    await Promise.all(holders.map(async el=>{
      const entry=state.favorites.find(f=>f.reference===el.dataset.favSnippet);if(!entry)return;
      if(entry.verse_text){el.textContent=entry.verse_text;return}
      const match=entry.reference.match(/^([A-Z0-9]{3})\.(\d+)\.(\d+)$/);if(!match)return;
      const tid=entry.translation_id||state.settings.main_translation||'onbv';const key=[tid,match[1],match[2]].join(':');
      if(!favChapterCache.has(key))favChapterCache.set(key,api(`/api/scripture?translation=${encodeURIComponent(tid)}&book=${match[1]}&chapter=${match[2]}`));
      try{const result=await favChapterCache.get(key);const v=(result.verses||[]).find(x=>+x.verse===+match[3]);el.textContent=v?.text||'Versículo guardado';}catch(e){el.textContent='Versículo guardado';}
    }));
  }
  renderFavorites=function(){
    const items=state.favorites||[];
    $('#content').innerHTML=`<div class="section-head v118-page-head"><div><h2>Favoritos</h2><p class="muted mini">Tus versículos guardados para recordar.</p></div></div><div class="v1182-masonry">${items.map(f=>{const tid=f.translation_id||state.settings.main_translation||'onbv',abbr=state.translations.find(t=>t.id===tid)?.abbr||tid;return `<article class="v1182-card v1182-favorite"><button class="v1182-eye" title="Ver versículo" data-go-ref="${esc(f.reference)}" data-version="${esc(tid)}"><i class="fi fi-rr-eye"></i></button><div class="v1182-fav-body"><i class="fi fi-sr-heart v1182-fav-icon"></i><blockquote data-fav-snippet="${esc(f.reference)}">${esc(f.verse_text||'Cargando versículo…')}</blockquote></div><div class="v1182-card-caption"><i class="fi fi-rr-heart"></i><div><strong>${esc(refsPretty(f.reference))}</strong><small>${esc(abbr)} · ${esc(refsPretty(f.reference))}</small></div></div></article>`}).join('')||'<div class="empty">Aún no tienes favoritos.</div>'}</div>`;
    attachEntries($('#content'));hydrateFavoriteTexts($('#content'));
  };

  const previousPicker=collectionPicker;
  collectionPicker=function(id,selected){return previousPicker(id,selected).replaceAll('class="collection-dot empty"','class="collection-dot v1182-none"');};
  const previousInitPicker=initCollectionPicker;
  initCollectionPicker=function(id){previousInitPicker(id);const fix=()=>{$$('#'+id+'Label .collection-dot.empty, #'+id+'Menu .collection-dot.empty').forEach(x=>{x.classList.remove('empty');x.classList.add('v1182-none')});};fix();$('#'+id+'Menu')?.addEventListener('click',()=>setTimeout(fix,0));};
  const previousTimeline=renderTimeline;
  renderTimeline=function(){
    previousTimeline();const person=$('.timeline-person');if(!person)return;
    person.classList.add('v1182-profile-layout');
    const counts=[['note',state.notes.length,'Notas'],['picture',state.image_projects.length,'Imágenes'],['camera',(state.illustrations||[]).length,'Ilustraciones'],['play-alt',state.media.length,'Videos'],['heart',state.favorites.length,'Favoritos']];
    const stats=document.createElement('div');stats.className='v1182-profile-stats';stats.innerHTML=counts.map(([icon,n,name])=>`<div title="${name}"><i class="fi fi-rr-${icon}"></i><strong>${n}</strong><small>${name}</small></div>`).join('');person.appendChild(stats);
  };

  // JPEG y PNG recién subidos se optimizan localmente desde el navegador.
  // No se procesan archivos que llegan del sistema de restauración ZIP.
  window.sendaOptimizeUpload=async function(file){
    if(!(file instanceof Blob))throw new Error('Selecciona una imagen válida.');
    if(file.size>35*1024*1024)throw new Error('La imagen supera el máximo de 35 MB antes de optimizar.');
    const original=()=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
    if(file.type==='image/webp'||(file.size<75_000))return original();
    if(!['image/png','image/jpeg'].includes(file.type))return original();
    try{
      const img=await createImageBitmap(file),maxDimension=2500;
      const scale=Math.min(1,maxDimension/Math.max(img.width,img.height));
      const cv=document.createElement('canvas');cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);
      const ctx=cv.getContext('2d',{willReadFrequently:false});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,cv.width,cv.height);img.close?.();
      if(file.type==='image/png'){
        // Conservar la fidelidad de gráficos PNG, especialmente transparencias.
        if(file.size<950_000 && scale===1)return original();
        // Si hay transparencia, conservar PNG original para no degradar bordes de arte.
        const sample=document.createElement('canvas');sample.width=48;sample.height=48;
        const sc=sample.getContext('2d');sc.drawImage(cv,0,0,48,48);
        const px=sc.getImageData(0,0,48,48).data;let alpha=false;
        for(let i=3;i<px.length;i+=4){if(px[i]<250){alpha=true;break}}
        if(alpha)return original();
      }
      const result=await new Promise(resolve=>cv.toBlob(resolve,'image/webp',.92));
      if(!result || result.size>=file.size*.98 || result.size>6_000_000)return original();
      return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(result)});
    }catch(e){return original()}
  };
  const oldToDataURL=toDataURL;
  toDataURL=async function(file){return window.sendaOptimizeUpload(file)};
})();

// ===== Senda 1.2.1 · guardado automático local y publicación sin exportar a GitHub =====
(function(){
  'use strict';
  const delay=1450;
  let activeAutosaver=null;

  function updateSaveIndicator(label, problem=false){
    const el=$('#saveStatus');
    if(el){el.textContent=label;el.classList.toggle('senda-save-error',problem);}
  }
  function makeAutosaver({root, endpoint, build, isValid, savedId, selector,
                          getExtra, onSaved, onClose, idle=delay, statusParent}){
    if(!root)return null;
    const status=document.createElement('span');status.className='senda-auto-label';
    status.textContent='Autoguardado activado';
    (statusParent||root.querySelector('.modal-actions')||root).prepend(status);
    let id=savedId||null, last='', timer=null, pending=null, closed=false, lastError=false;
    const snapshot=()=>{
      const value=build(id);
      if(getExtra)value.__extra=getExtra();
      return JSON.stringify(value);
    };
    last=savedId ? snapshot() : '';
    const isDirty=()=>snapshot()!==last;
    const setStatus=(message,fail=false)=>{
      if(root.isConnected)status.textContent=message;
      updateSaveIndicator(message,fail);
      lastError=fail;
    };
    const autosaver={
      get dirty(){return isDirty();}, get pending(){return !!pending;},
      async flush(force=false){
        clearTimeout(timer);
        if(closed)return true;
        // Un único escritor por formulario: evita duplicados cuando se crea una nota.
        if(pending){try{await pending;}catch(_){return false;} if(!isDirty())return !lastError;}
        if(!isDirty())return !lastError;
        if(!isValid()){
          setStatus('Borrador pendiente: completa los datos necesarios');return false;
        }
        const payload=build(id), extra=getExtra?getExtra():undefined;
        const submitted=JSON.stringify({...payload,...(getExtra?{__extra:extra}:{})});
        setStatus('Guardando automáticamente…');
        pending=(async()=>{
          const result=await api(endpoint,{method:'POST',body:JSON.stringify(payload)});
          id=result.id||id;
          if(result.state)state=result.state;
          if(onSaved)await onSaved(result,id,extra);
          // Guardar exactamente el estado enviado: nunca borrar cambios nuevos
          // que el usuario haya hecho mientras estaba activa la petición.
          last=JSON.stringify({...payload,id,...(getExtra?{__extra:extra}:{})});
          if(result.publication?.ok===false){
            setStatus('Datos guardados; error al actualizar la web',true);
          }else{
            setStatus('Guardado automáticamente ✓ · listo para GitHub Desktop');
          }
          return true;
        })();
        try{
          await pending;
        }catch(e){setStatus('Error al guardar: '+e.message,true);return false;}
        finally{pending=null;}
        if(isDirty())autosaver.schedule();
        return true;
      },
      schedule(){
        if(closed)return;
        clearTimeout(timer);
        if(!isDirty()){if(!lastError)status.textContent='Todo guardado ✓';return;}
        status.textContent='Cambios pendientes…';
        updateSaveIndicator('Autoguardado pendiente…');
        timer=setTimeout(()=>{autosaver.flush();},idle);
      },
      async close(){
        clearTimeout(timer);
        const ok=await autosaver.flush(true);
        if(!ok && isDirty() && isValid()){
          toast('No se pudo guardar. Revisa tu conexión con el panel.');return;
        }
        closed=true;
        if(activeAutosaver===autosaver)activeAutosaver=null;
        if(onClose)onClose();
        closeModal();
      }
    };
    activeAutosaver=autosaver;
    root.addEventListener('input',e=>{
      if(e.target.matches('input,textarea,select,[contenteditable]') || e.target.closest('[contenteditable]'))autosaver.schedule();
    });
    root.addEventListener('change',()=>autosaver.schedule());
    root.addEventListener('click',e=>{
      if(e.target.closest('[data-choice],[data-color],[data-icon],[data-cover-ticket],[data-edit-cmd],[data-format],[data-role="quote"],[data-role="table"]')){
        // Los controles de edición modifican el DOM en su handler antes de propagarse.
        autosaver.schedule();
      }
    });
    for(const body of root.querySelectorAll('[contenteditable="true"]')){
      const watcher=new MutationObserver(()=>autosaver.schedule());
      watcher.observe(body,{subtree:true,characterData:true,childList:true,attributes:true});
    }
    if(root.closest('#modal')){
      root.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>autosaver.close());
      $('#modal').onclick=e=>{if(e.target===$('#modal'))autosaver.close();};
    }
    if(selector){const button=root.querySelector(selector); if(button)button.onclick=async()=>{
      if(!isValid())return toast('Completa los datos obligatorios.');
      const ok=await autosaver.flush(true);
      if(ok)await autosaver.close();
    };}
    return autosaver;
  }

  // Cada editor permanece abierto durante el autoguardado: no pierde el foco.
  const noteModalBefore=openNoteModal;
  openNoteModal=function(existing){
    noteModalBefore(existing);
    const root=$('#modal .modal'),body=$('#noteBody');if(!root||!body)return;
    const reference=existing?.reference||selectedRefs();
    const draftKey='senda.note.'+(existing?.id||reference);
    if(!existing){try{const saved=localStorage.getItem(draftKey);if(saved)body.innerHTML=saved;}catch(_){}}
    let currentId=existing?.id||null;
    const getBody=()=>body.innerHTML.trim();
    const save=makeAutosaver({root,endpoint:'/api/note',selector:'#saveNote',savedId:currentId,
      isValid:()=>!!body.textContent.trim() && !!$('#noteCollection')?.value,
      build:id=>({id:id||undefined,scope:'verse',reference,title:$('#noteTitle').value.trim(),
        html:getBody(),translation_id:existing?.translation_id||selectedTranslation,
        category_id:categoryForCollection(+$('#noteCollection').value),
        collection_id:+$('#noteCollection').value,is_public:existing?.is_public!==0}),
      onSaved:(_result,id)=>{currentId=id;try{localStorage.removeItem(draftKey);}catch(_){}},
      onClose:()=>{if(typeof renderVerses==='function' && $('#readerText'))renderVerses(currentVerses);
        else if(typeof render==='function')render();}
    });
    body.addEventListener('input',()=>{try{localStorage.setItem(draftKey,getBody())}catch(_){}});
    if(!save)return;
  };

  const videoModalBefore=openMediaModal;
  openMediaModal=function(existing=null){
    videoModalBefore(existing);
    const root=$('#modal .modal'),body=$('#mediaRichBody');if(!root||!body)return;
    const reference=existing?.reference||selectedRefs();
    makeAutosaver({root,endpoint:'/api/media',selector:'#saveMedia',savedId:existing?.id||null,
      isValid:()=>/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test($('#mediaUrl')?.value.trim()||'') && !!$('#mediaCollection')?.value,
      build:id=>({id:id||undefined,reference,kind:'video',title:$('#mediaTitle').value.trim(),
        subtitle:$('#mediaSubtitle').value.trim(),description_html:body.innerHTML,
        description:body.textContent.trim(),youtube_url:$('#mediaUrl').value.trim(),
        translation_id:existing?.translation_id||selectedTranslation,
        collection_id:+$('#mediaCollection').value,is_public:existing?.is_public!==0}),
      onClose:()=>{if($('#versePanel'))showVersePanel();else render();}
    });
  };

  const collectionModalBefore=openCollectionModal;
  openCollectionModal=function(existing=null){
    collectionModalBefore(existing);
    const root=$('#modal .modal');if(!root||!$('#colName'))return;
    let lastTicket='';
    const photoTicket=()=>root.querySelector('[data-cover-ticket].active')?.dataset.coverTicket||'';
    makeAutosaver({root,endpoint:'/api/collection',selector:'#saveCollection',savedId:existing?.id||null,
      isValid:()=>!!$('#colName')?.value.trim(),
      getExtra:photoTicket,
      build:id=>({id:id||undefined,name:$('#colName').value.trim(),description:$('#colDesc').value,
        cover:state.collections.find(x=>+x.id===+id)?.cover||existing?.cover||'',
        color:root.querySelector('[data-color].active')?.dataset.color||existing?.color||'#8b6f47',
        icon:root.querySelector('[data-icon].active')?.dataset.icon||existing?.icon||'fi fi-rr-book-alt',
        cover_position:$('#cropX').value+'% '+$('#cropY').value+'%',
        is_public:existing?.is_public!==0}),
      onSaved:async (_result,id,ticket)=>{
        if(ticket&&ticket!==lastTicket){
          const r=await api('/api/collection-cover',{method:'POST',body:JSON.stringify({id,ticket})});
          if(r.state)state=r.state;
          lastTicket=ticket;
        }
      },
      onClose:()=>render()
    });
  };

  // Las preferencias se guardan en cuanto se cambia un campo válido.
  const settingsBefore=renderSettings;
  renderSettings=function(){
    settingsBefore();
    const root=$('#content');if(!root||!$('#saveSettings'))return;
    const controls=['canon','mainT','compareT','defaultBook','defaultChapter','unsplashKey'];
    const build=()=>({canon:$('#canon').value,main_translation:$('#mainT').value,
      compare_translation:$('#compareT').value,default_book:$('#defaultBook').value,
      default_chapter:+$('#defaultChapter').value,unsplash_access_key:$('#unsplashKey').value});
    let last=JSON.stringify(build()),timer=null,busy=null;
    const status=document.createElement('span');status.className='senda-auto-label';status.textContent='Autoguardado de preferencias activo';
    $('#saveSettings').parentElement.appendChild(status);
    const flush=async()=>{
      clearTimeout(timer);if(busy)await busy;
      const payload=build(),snap=JSON.stringify(payload);
      if(snap===last)return true;
      if(!payload.default_chapter||payload.default_chapter<1){status.textContent='Escribe un capítulo válido';return false;}
      status.textContent='Guardando preferencias…';
      busy=api('/api/settings',{method:'POST',body:JSON.stringify(payload)});
      try{const d=await busy;last=snap;state.settings=d.settings;selectedTranslation=d.settings.main_translation;
        status.textContent=d.publication?.ok===false?'Preferencias guardadas; web pendiente':'Preferencias guardadas automáticamente ✓';
        updateSaveIndicator(status.textContent,d.publication?.ok===false);
      }catch(e){status.textContent='Error: '+e.message;updateSaveIndicator(status.textContent,true);return false}
      finally{busy=null;}
      if(JSON.stringify(build())!==last)timer=setTimeout(flush,1000);
      return true;
    };
    for(const id of controls){const el=$('#'+id);if(!el)continue;
      const mark=()=>{clearTimeout(timer);status.textContent='Preferencias pendientes…';timer=setTimeout(flush,1300);};
      el.addEventListener('input',mark);el.addEventListener('change',mark);
    }
    $('#saveSettings').onclick=async()=>{if(await flush())toast('Preferencias guardadas')};
  };

  // Las imágenes del editor siguen guardándose con su botón para evitar
  // generar PNG pesados mientras se ajustan el texto y los efectos.

  // El botón de la barra confirma cualquier editor abierto y actualiza docs/.
  // Corrige también el controlador anterior, que consultaba un valor inexistente.
  const shellBefore=renderShell;
  renderShell=function(){
    shellBefore();
    const save=$('#saveAllBtn');
    if(save)save.onclick=async()=>{
      try{
        if(activeAutosaver?.dirty){const ok=await activeAutosaver.flush(true);if(!ok)return toast('Hay un borrador que necesita revisión');}
        const d=await api('/api/save',{method:'POST',body:'{}'});
        const good=d.publication?.ok!==false;
        updateSaveIndicator(good?'Guardado ✓ · listo para GitHub Desktop':'Guardado local · error de publicación',!good);
        toast(good?'Cambios guardados y web pública actualizada.':'Guardado local, pero no se pudo actualizar la web.');
      }catch(e){updateSaveIndicator('Error al guardar',true);toast(e.message)}
    };
  };
})();

// Senda 1.2.1 · Autoguardado de los textos y el recorte del perfil.
(function(){
 const original=openTimelineSettings;
 openTimelineSettings=function(){
   original();
   const modal=$('#modal .modal');if(!modal||!$('#profileName'))return;
   let timer=null, last=JSON.stringify({name:$('#profileName').value,subtitle:$('#profileSub').value,
     cover_position:$('#timelineCropX').value+'% '+$('#timelineCropY').value});
   const label=document.createElement('p');label.className='senda-auto-label';
   label.textContent='Nombre, subtítulo y recorte se autoguardan. Las fotos requieren Guardar perfil.';
   modal.querySelector('.modal-actions')?.prepend(label);
   const flush=async()=>{
     clearTimeout(timer);
     const payload={name:$('#profileName')?.value||'',subtitle:$('#profileSub')?.value||'',
       cover_position:($('#timelineCropX')?.value||'50')+'% '+($('#timelineCropY')?.value||'50')+'%'};
     const current=JSON.stringify(payload);if(current===last)return;
     label.textContent='Autoguardando datos del perfil…';
     try{const r=await api('/api/profile',{method:'POST',body:JSON.stringify(payload)});
       state=r.state;last=current;
       label.textContent=r.publication?.ok===false?'Perfil guardado; web pública pendiente':'Datos del perfil autoguardados ✓';
     }catch(e){label.textContent='Error al autoguardar perfil: '+e.message;}
   };
   for(const id of ['profileName','profileSub','timelineCropX','timelineCropY']){
     const el=$('#'+id);if(!el)continue;
     const change=()=>{clearTimeout(timer);label.textContent='Perfil con cambios pendientes…';timer=setTimeout(flush,1700)};
     el.addEventListener('input',change);el.addEventListener('change',change);
   }
 };
})();
