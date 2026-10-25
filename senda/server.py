# -*- coding: utf-8 -*-
"""
Senda - Biblia de estudio
Servidor local para Windows (stdlib only).
El panel local actualiza directamente /docs, el único sitio web de GitHub Pages.
"""
from __future__ import annotations
import json, os, re, sqlite3, shutil, tempfile, zipfile, html, time, threading, webbrowser, base64, io
from pathlib import Path
from datetime import datetime, timezone, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent
APP = ROOT / "app"
PUBLIC = ROOT / "docs"
DATA = ROOT / "data"
CONFIG = ROOT / "config"
COVERS = ROOT / "covers"
BACKUPS = ROOT / "backups"
ILLUSTRATIONS = ROOT / "illustrations"
COLLECTION_COVERS = ROOT / "collection_covers"
PROFILE = ROOT / "profile"
PROFILE_FILE = CONFIG / "profile.json"
BOOK_COVERS_FILE = CONFIG / "book_covers.json"
BIBLES = DATA / "bibles"
DB = DATA / "senda.sqlite3"
SETTINGS_FILE = CONFIG / "settings.json"
HOST = "127.0.0.1"
PORT = int(os.environ.get("SENDA_PORT", "8765"))
VERSION = "1.2.0"
CACHE_DAYS = 25

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def log(message):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}", flush=True)

def read_json(path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

BOOKS = read_json(DATA / "books.json", [])
TRANSLATIONS = read_json(DATA / "translations.json", [])
CATEGORIES = read_json(DATA / "categories.json", [])

DEFAULT_SETTINGS = {
    "canon": "catholic",
    "main_translation": "onbv",
    "compare_translation": "rv1909",
    "default_book": "JHN",
    "default_chapter": 3,
    "theme": "light",
    "public_export": {
        "bible": True, "notes": True, "highlights": True, "collections": True,
        "favorites": True, "covers": True, "images": True, "media": True,
        "history": False
    },
    "youversion_app_key": "",
    
    
    "unsplash_access_key": "",
    "esv_api_key": "",
    "provider_map": {},
    "youversion_custom_versions": []
}

def get_settings():
    s = read_json(SETTINGS_FILE, {}) or {}
    out = dict(DEFAULT_SETTINGS)
    out.update(s)
    pe = dict(DEFAULT_SETTINGS["public_export"])
    pe.update(s.get("public_export", {}))
    out["public_export"] = pe
    if out.get("main_translation") not in ("onbv","rv1909","bes","pddpt","bll","sblm","vbl"): out["main_translation"]="onbv"
    if out.get("compare_translation") not in ("onbv","rv1909","bes","pddpt","bll","sblm","vbl"): out["compare_translation"]="rv1909"
    return out

def save_settings(s):
    s=dict(s)
    # Las API retiradas ya no forman parte de la configuración v1.1.4.
    for legacy in ('youversion_app_key','esv_api_key','pexels_api_key','api_bible_key','api_bible_version_map','provider_map','youversion_custom_versions'):
        s.pop(legacy,None)
    write_json(SETTINGS_FILE, s)

def db_connect():
    DATA.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = db_connect()
    con.executescript("""
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS highlights(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
      start_offset INTEGER NOT NULL DEFAULT 0, end_offset INTEGER NOT NULL DEFAULT 0,
      selected_text TEXT NOT NULL DEFAULT '', color TEXT NOT NULL,
      category_id TEXT NOT NULL, translation_id TEXT NOT NULL DEFAULT 'kjv',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL DEFAULT 'verse',
      reference TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      translation_id TEXT NOT NULL DEFAULT 'kjv',
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('video','podcast')),
      title TEXT NOT NULL DEFAULT '',
      youtube_url TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collections(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#8b6f47',
      icon TEXT NOT NULL DEFAULT 'fi fi-rr-book-alt',
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_items(
      collection_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      reference TEXT NOT NULL,
      PRIMARY KEY(collection_id,item_type,reference)
    );
    CREATE TABLE IF NOT EXISTS favorites(
      reference TEXT PRIMARY KEY, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL, visited_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS image_projects(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
      config_json TEXT NOT NULL DEFAULT '{}',
      image_data TEXT NOT NULL DEFAULT '',
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS illustrations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL, title TEXT NOT NULL, description_html TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL, collection_id INTEGER,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bible_cache(
      translation_id TEXT NOT NULL, reference TEXT NOT NULL,
      payload_json TEXT NOT NULL, fetched_at TEXT NOT NULL,
      etag TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(translation_id,reference)
    );
    """)
    # Migraciones incrementales: conservan los datos escritos en versiones anteriores.
    if "description" not in [r[1] for r in con.execute("PRAGMA table_info(media)")]:
        con.execute("ALTER TABLE media ADD COLUMN description TEXT NOT NULL DEFAULT ''")
    for table, column, decl in [("notes","category_id","TEXT NOT NULL DEFAULT 'important'"),("collections","is_default","INTEGER NOT NULL DEFAULT 0")]:
        if column not in [r[1] for r in con.execute(f"PRAGMA table_info({table})")]:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
    for column in ('cover_credit','cover_link'):
        if column not in [x[1] for x in con.execute('PRAGMA table_info(collections)')]:
            con.execute(f"ALTER TABLE collections ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
    for cat in CATEGORIES:
        name=cat.get("label",cat['id'])
        exists=con.execute("SELECT id FROM collections WHERE name=? AND is_default=1",(name,)).fetchone()
        if not exists:
            # No duplicar una colección personalizada con exactamente el mismo nombre.
            existing=con.execute("SELECT id FROM collections WHERE name=? LIMIT 1",(name,)).fetchone()
            if existing: con.execute("UPDATE collections SET is_default=1 WHERE id=?",(existing[0],))
            else: con.execute("INSERT INTO collections(name,description,color,icon,is_public,created_at,updated_at,is_default) VALUES(?,?,?,?,1,?,?,1)",
                (name,"Colección predeterminada de estudio bíblico",cat['color'],cat.get('icon','fi fi-rr-book-alt'),now(),now()))
    # Las traducciones comerciales jamás se guardan en el caché persistente.
    con.execute("DELETE FROM bible_cache WHERE provider='api_bible'")
    for name,decl in (("subtitle", "TEXT NOT NULL DEFAULT ''"),("description_html", "TEXT NOT NULL DEFAULT ''")):
        if name not in [r[1] for r in con.execute("PRAGMA table_info(media)")]:
            con.execute(f"ALTER TABLE media ADD COLUMN {name} {decl}")
    # v1.1.7: mantener las categorías de los datos existentes y asignar una colección inicial.
    for table in ('notes','media','image_projects'):
        cols=[r[1] for r in con.execute(f'PRAGMA table_info({table})')]
        if 'collection_id' not in cols:
            con.execute(f'ALTER TABLE {table} ADD COLUMN collection_id INTEGER')
        if table in ('media','image_projects') and 'translation_id' not in cols:
            con.execute(f"ALTER TABLE {table} ADD COLUMN translation_id TEXT NOT NULL DEFAULT ''")
    for table in ('illustrations',):
        if 'translation_id' not in [r[1] for r in con.execute(f'PRAGMA table_info({table})')]:
            con.execute(f"ALTER TABLE {table} ADD COLUMN translation_id TEXT NOT NULL DEFAULT ''")
    if 'cover_position' not in [r[1] for r in con.execute('PRAGMA table_info(collections)')]:
        con.execute("ALTER TABLE collections ADD COLUMN cover_position TEXT NOT NULL DEFAULT '50% 50%'")
    important=con.execute("SELECT id FROM collections WHERE is_default=1 AND (lower(name) LIKE '%importante%' OR lower(name) LIKE '%recordar%') LIMIT 1").fetchone()
    if not important: important=con.execute('SELECT id FROM collections WHERE is_default=1 ORDER BY id LIMIT 1').fetchone()
    if important:
        cid=important[0]
        for table in ('notes','media','image_projects','illustrations'):
            con.execute(f'UPDATE {table} SET collection_id=? WHERE collection_id IS NULL OR collection_id=0',(cid,))
    # 1.1.8.2: guardar traducción y texto del favorito para mostrarlo como lectura.
    favcols=[r[1] for r in con.execute('PRAGMA table_info(favorites)')]
    if 'translation_id' not in favcols:
        con.execute("ALTER TABLE favorites ADD COLUMN translation_id TEXT NOT NULL DEFAULT ''")
    if 'verse_text' not in favcols:
        con.execute("ALTER TABLE favorites ADD COLUMN verse_text TEXT NOT NULL DEFAULT ''")
    con.commit()
    con.close()

def q(sql, params=()):
    con = db_connect()
    try:
        return [dict(r) for r in con.execute(sql, params).fetchall()]
    finally:
        con.close()

def q1(sql, params=()):
    rows = q(sql, params)
    return rows[0] if rows else None

def mutate(sql, params=()):
    con = db_connect()
    try:
        cur = con.execute(sql, params)
        con.commit()
        return cur.lastrowid
    finally:
        con.close()

def update(sql, params=()):
    con = db_connect()
    try:
        cur = con.execute(sql, params)
        con.commit()
        return cur.rowcount
    finally:
        con.close()

def all_translations():
    return TRANSLATIONS

def user_translation_by_id(tid):
    return next((t for t in TRANSLATIONS if t['id']==tid), None)

# Ediciones descargables oficialmente de eBible.org y redistribuibles con sus créditos.
# Nunca convertir las traducciones comerciales a formato local por una API de lectura.
BIBLE_INSTALLABLE = {
    'onbv': {'slug': 'spaonbv', 'license': 'CC BY-SA 4.0', 'credit': 'Biblica® Open Nueva Biblia Viva™. Copyright © 2006, 2008 by Biblica, Inc. Licencia Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0). Fuente original: https://www.biblica.com y https://open.bible. Distribución vía https://ebible.org/bible/details.php?id=spaonbv . No se han realizado modificaciones intencionales en el contenido bíblico.', 'scope': 'Completa', 'name': 'Biblica® Open Nueva Biblia Viva'},
    'rv1909': {'slug': 'spaRV1909', 'license': 'Dominio público', 'credit': 'Santa Biblia — Reina Valera 1909. Dominio público. Fuente: https://ebible.org/bible/details.php?id=spaRV1909', 'scope': 'Completa', 'name': 'Reina-Valera 1909'},
    'bes': {'slug': 'spabes', 'license': 'Dominio público', 'credit': 'La Biblia en Español Sencillo 2026, traducida y editada por Irma Flores, AudioBiblia.org. Publicada como dominio público. https://ebible.org/find/details.php?id=spabes', 'scope': 'Completa', 'name': 'Biblia en Español Sencillo'},
    'pddpt': {'slug': 'spapddpt', 'license': 'CC BY 4.0', 'credit': 'Palabra de Dios para ti. Copyright © 2020 Asociación Bíblica Latinoamericana. Licencia Creative Commons Attribution 4.0 (CC BY 4.0). Se atribuye a Asociación Bíblica Latinoamericana / Latinamerican Textual Bible Foundation. Fuente: https://ebible.org/Bible/details.php?id=spapddpt. Sin alteraciones intencionales del contenido bíblico.', 'scope': 'Completa', 'name': 'Palabra de Dios para ti'},
    'bll': {'slug': 'spabll', 'license': 'Dominio público', 'credit': 'Santa Biblia libre Latinoamericano. Dominio público; borrador en revisión. https://ebible.org/find/details.php?id=spabll', 'scope': 'En revisión', 'name': 'Biblia Libre Latinoamericana'},
    'sblm': {'slug': 'spablm', 'license': 'Dominio público', 'credit': 'Santa Biblia libre para el mundo. David Williams y Michael Paul Johnson. Dominio público, traducción en revisión. https://ebible.org/details.php?id=spablm', 'scope': 'En revisión', 'name': 'Santa Biblia Libre para el Mundo'},
    'vbl': {'slug': 'spavbl', 'license': 'CC BY-SA 4.0', 'credit': 'Versión Biblia Libre. Copyright © 2018-2020 Jonathan Gallagher y Shelly Barrios de Ávila. Bajo CC BY-SA 4.0: confirmar aviso incluido en edición oficial. Fuente https://ebible.org/details.php?id=spavbl', 'scope': 'Parcial: principalmente Nuevo Testamento', 'name': 'Versión Biblia Libre'},
}

USFM_IDS={"GEN":"GEN","EXO":"EXO","LEV":"LEV","NUM":"NUM","DEU":"DEU","JOS":"JOS","JDG":"JDG","RUT":"RUT","1SA":"1SA","2SA":"2SA","1KI":"1KI","2KI":"2KI","1CH":"1CH","2CH":"2CH","EZR":"EZR","NEH":"NEH","EST":"EST","JOB":"JOB","PSA":"PSA","PRO":"PRO","ECC":"ECC","SNG":"SNG","ISA":"ISA","JER":"JER","LAM":"LAM","EZK":"EZK","DAN":"DAN","HOS":"HOS","JOL":"JOL","AMO":"AMO","OBA":"OBA","JON":"JON","MIC":"MIC","NAM":"NAM","HAB":"HAB","ZEP":"ZEP","HAG":"HAG","ZEC":"ZEC","MAL":"MAL","MAT":"MAT","MRK":"MRK","LUK":"LUK","JHN":"JHN","ACT":"ACT","ROM":"ROM","1CO":"1CO","2CO":"2CO","GAL":"GAL","EPH":"EPH","PHP":"PHP","COL":"COL","1TH":"1TH","2TH":"2TH","1TI":"1TI","2TI":"2TI","TIT":"TIT","PHM":"PHM","HEB":"HEB","JAS":"JAS","1PE":"1PE","2PE":"2PE","1JN":"1JN","2JN":"2JN","3JN":"3JN","JUD":"JUD","REV":"REV"}

def clean_usfm(s):
    # Mantener las palabras originales; retirar atributos Strong/lemma y marcadores USFM.
    s = re.sub(r"\\(?:f|fe|ef|x)\s+.*?\\(?:f|fe|ef|x)\\\*", " ", s, flags=re.S)
    s = re.sub(r"\\(?:\+?w|wg|wh)\s+([^|\\]*?)\|[^\\]*?\\(?:\+?w|wg|wh)\\\*", r"\1", s, flags=re.I|re.S)
    # Reparar capítulos importados por versiones antiguas, que dejaban |strong="H...".
    s = re.sub(r"\|(?:strong|lemma|morph|x-[\w-]+|src|gloss)\s*=\s*[\x22\x27][^\x22\x27]*[\x22\x27]", "", s, flags=re.I)
    s = re.sub(r"\\[+\w-]+\*?", " ", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    return html.unescape(s).strip()

def repair_installed_bibles():
    # Migración idempotente de las ediciones ya descargadas; evita una segunda descarga.
    tag=BIBLES/'.clean_v117'
    if tag.exists(): return
    changed=0
    for f in BIBLES.glob('*/*.json'):
        if f.name=='manifest.json': continue
        try:
            obj=read_json(f,{})
            if not isinstance(obj,dict) or 'verses' not in obj: continue
            dirty=False
            for v in obj['verses']:
                before=str(v.get('text',''))
                after=clean_usfm(before) if '|strong=' in before or '|lemma=' in before or '\\w' in before else before
                if after!=before: v['text']=after;dirty=True
            if dirty:write_json(f,obj);changed+=1
        except Exception as e: log(f'Advertencia al limpiar {f.name}: {e}')
    tag.parent.mkdir(parents=True,exist_ok=True);tag.write_text(now(),encoding='utf-8')
    log(f'Lecturas corregidas: {changed} capítulos con etiquetas USFM antiguas.')

def parse_usfm(text):
    book=re.search(r"\\id\s+([1-3]?[A-Z]{2,3})",text)
    if not book:return None,{}
    bid=book.group(1)
    if bid not in USFM_IDS:return None,{}
    # Escanear por tokens sin confundir las cabeceras con el contenido del versículo.
    tokens=list(re.finditer(r"\\(c|v)\s+([^\\\s]+)",text))
    result={};ch=0
    for i,m in enumerate(tokens):
        typ,num=m.groups()
        if typ=='c':
            try:ch=int(num)
            except ValueError:ch=0
            continue
        if not ch:continue
        vm=re.match(r"(\d+)",num)
        if not vm:continue
        n=int(vm.group(1)); body=text[m.end():tokens[i+1].start() if i+1<len(tokens) else len(text)]
        content=clean_usfm(body)
        if content:result.setdefault(ch,[]).append({'verse':n,'text':content})
    return bid,result

_INSTALL_LOCK=threading.Lock()
_INSTALL_STATUS={}
_INSTALL_RUNNING=False

def bible_install_status():
    out=[]
    for tid,info in BIBLE_INSTALLABLE.items():
        folder=BIBLES/tid
        count=sum(1 for p in folder.glob('*.json') if p.name!='manifest.json') if folder.exists() else 0
        meta=read_json(folder/'manifest.json',{}) or {}
        progress=_INSTALL_STATUS.get(tid,{})
        out.append({'id':tid,'name':info['name'],'chapters':count,'books':meta.get('books',0),
          'installed':count>=15,'license':info['license'],'scope':info['scope'],
          'status':progress.get('status','lista' if count>=15 else 'pendiente'),
          'error':progress.get('error','')})
    return out

def install_bible(tid):
    if tid not in BIBLE_INSTALLABLE:raise ValueError('Traducción no incluida en el catálogo libre')
    item=BIBLE_INSTALLABLE[tid];slug=item['slug'];url=f'https://ebible.org/Scriptures/{slug}_usfm.zip'
    # Si el usuario guardó el ZIP oficial manualmente, importa sin red.
    manual=ROOT/'Biblias_USFM'/f'{slug}_usfm.zip'
    if manual.is_file():
        if manual.stat().st_size>36*1024*1024:raise RuntimeError('ZIP de entrada demasiado grande (>36 MB).')
        content=manual.read_bytes()
        log(f'Importando archivo USFM local: {manual.name}')
    else:
        req=Request(url,headers={'User-Agent':'Senda/1.1.6 personal Bible study (support: eBible.org)'})
        try:
            with urlopen(req,timeout=95) as res:
                content=res.read(36*1024*1024+1)
                if len(content)>36*1024*1024:raise RuntimeError('Archivo USFM demasiado grande (>36 MB).')
        except Exception as e:raise RuntimeError(f'No pude obtener {item["name"]} desde eBible.org: {e}')
    import io
    bookids=set();total=0
    with zipfile.ZipFile(io.BytesIO(content)) as z, tempfile.TemporaryDirectory(prefix='senda_usfm_') as tmp:
        docs=[x for x in z.infolist() if not x.is_dir() and x.filename.lower().endswith(('.usfm','.sfm','.txt')) and x.file_size<5*1024*1024]
        if not docs:raise RuntimeError('El archivo oficial no contiene ficheros USFM reconocibles.')
        desttmp=Path(tmp)
        for member in docs:
            txt=z.read(member).decode('utf-8-sig',errors='replace')
            bid,chs=parse_usfm(txt)
            if not bid or not chs:continue
            bookids.add(bid)
            for ch,verses in chs.items():
                if not verses:continue
                write_json(desttmp/f'{bid}.{ch}.json',{'translation_id':tid,'translation':item['name'],
                    'verses':verses,'attribution':item['credit'],'provider':'offline'})
                total+=1
        if total<15:raise RuntimeError(f'La descarga parece incompleta: {total} capítulos importados. No se reemplazará ninguna instalación previa.')
        write_json(desttmp/'manifest.json',{'version':tid,'name':item['name'],'books':len(bookids),
            'chapters':total,'license':item['license'],'source':url,'installed_at':now(),
            'text_modifications':'Solo se retiraron las etiquetas de formato USFM; texto no revisado deliberadamente.'})
        (desttmp/'CREDITOS_Y_LICENCIA.txt').write_text(item['credit']+'\nFuente: '+url+'\n',encoding='utf-8')
        dest=BIBLES/tid;dest.mkdir(parents=True,exist_ok=True)
        for f in desttmp.iterdir():os.replace(f,dest/f.name)
    log(f'Biblia instalada: {tid} — {len(bookids)} libros y {total} capítulos.')
    return {'id':tid,'books':len(bookids),'chapters':total,'source':url}

def _install_worker(force=False):
    global _INSTALL_RUNNING
    try:
        for tid in BIBLE_INSTALLABLE:
            if not force and (BIBLES/tid/'manifest.json').exists():continue
            _INSTALL_STATUS[tid]={'status':'descargando','error':''}
            log(f'Descargando Biblia en español: {BIBLE_INSTALLABLE[tid]["name"]}…')
            try:
                install_bible(tid)
                try: sync_public_site()
                except Exception as pubexc: log('Error al actualizar docs/ tras instalar Biblia: ' + str(pubexc))
                _INSTALL_STATUS[tid]={'status':'lista','error':''}
            except Exception as e:
                _INSTALL_STATUS[tid]={'status':'error','error':str(e)}
                log(f'No se instaló {tid}: {e}')
    finally:
        with _INSTALL_LOCK:_INSTALL_RUNNING=False

def start_bible_install(force=False):
    global _INSTALL_RUNNING
    with _INSTALL_LOCK:
        if _INSTALL_RUNNING:return False
        if not force and all((BIBLES/tid/'manifest.json').exists() for tid in BIBLE_INSTALLABLE):return False
        _INSTALL_RUNNING=True
    threading.Thread(target=_install_worker,args=(force,),daemon=True,name='SendaBiblias').start()
    return True

def local_bible_chapter(tid,bid,chapter):
    f=BIBLES/tid/f'{bid}.{chapter}.json'
    return read_json(f) if f.exists() else None

def public_state():
    s = get_settings()
    pe = s["public_export"]
    result = {
        "version": VERSION, "mode": "public", "generated_at": now(),
        "books": BOOKS,
        "translations": TRANSLATIONS,
        "categories": CATEGORIES,
        "settings": {"canon":s["canon"],"main_translation":s["main_translation"],
                     "compare_translation":s["compare_translation"],"default_book":s["default_book"],
                     "default_chapter":s["default_chapter"],"theme":s["theme"]},
        "highlights": q("SELECT * FROM highlights ORDER BY id") if pe["highlights"] else [],
        "notes": q("SELECT * FROM notes ORDER BY updated_at DESC") if pe["notes"] else [],
        "media": q("SELECT * FROM media ORDER BY id") if pe["media"] else [],
        "collections": q("SELECT * FROM collections ORDER BY is_default DESC,name") if pe["collections"] else [],
        "collection_items": q("SELECT * FROM collection_items") if pe["collections"] else [],
        "favorites": q("SELECT * FROM favorites") if pe["favorites"] else [],
        "history": q("SELECT * FROM history ORDER BY visited_at DESC LIMIT 100") if pe["history"] else [],
        "image_projects": q("SELECT id,reference,title,config_json,image_data,is_public,created_at,updated_at FROM image_projects ORDER BY updated_at DESC") if pe["images"] else [],
        "illustrations": q("SELECT * FROM illustrations ORDER BY updated_at DESC") if pe["images"] else [],
        "profile": read_json(PROFILE_FILE,{"name":"Mi camino en la Palabra","subtitle":"Mis estudios y reflexiones","avatar":"","cover":"","cover_position":"50% 50%"}),
        "book_covers": read_json(BOOK_COVERS_FILE,{})
    }
    # La web estática sólo propone traducciones realmente aptas para ese modo.
    public_tids={t['id'] for t in result['translations']}
    default_tid='onbv' if 'onbv' in public_tids else next(iter(public_tids),'')
    if result['settings']['main_translation'] not in public_tids:
        result['settings']['main_translation']=default_tid
    if result['settings']['compare_translation'] not in public_tids:
        result['settings']['compare_translation']=default_tid
    result['bible_credits']={tid:info['credit'] for tid,info in BIBLE_INSTALLABLE.items()}
    result['external_scripture_notice']='Las ediciones disponibles fueron importadas desde eBible.org y conservan sus créditos y condiciones de redistribución.'
    result['licensed_versions']=[{'abbr':t['abbr'],'name':t['name'],'url':f"https://www.bible.com/es/versions/{t['provider_ref']}"}
        for t in TRANSLATIONS if t.get('provider')=='youversion' and t.get('language')=='es' and t.get('provider_ref')]
    return result

def safe_settings():
    s=get_settings()
    for name in ("youversion_app_key","api_bible_key","esv_api_key","unsplash_access_key"):
        s[name+"_configured"]=bool(s.get(name) or (os.environ.get("SENDA_YVP_APP_KEY") if name=="youversion_app_key" else ""))
        s.pop(name,None)
    return s

def local_state():
    return {
        "version":VERSION,"mode":"local","books":BOOKS,"translations":all_translations(),"categories":CATEGORIES,
        "settings":safe_settings(),"highlights":q("SELECT * FROM highlights ORDER BY id DESC"),
        "notes":q("SELECT * FROM notes ORDER BY updated_at DESC"),"media":q("SELECT * FROM media ORDER BY id DESC"),
        "collections":q("SELECT * FROM collections ORDER BY name"),"collection_items":q("SELECT * FROM collection_items"),
        "favorites":q("SELECT * FROM favorites"),"history":q("SELECT * FROM history ORDER BY visited_at DESC LIMIT 100"),"bible_installs":bible_install_status(),
        "image_projects": q("SELECT * FROM image_projects ORDER BY updated_at DESC"),
        "illustrations": q("SELECT * FROM illustrations ORDER BY updated_at DESC"),
        "profile": read_json(PROFILE_FILE,{"name":"Mi camino en la Palabra","subtitle":"Mis estudios y reflexiones","avatar":"","cover":"","cover_position":"50% 50%"}),
        "book_covers": read_json(BOOK_COVERS_FILE,{})
    }

def json_response(handler, payload, status=200):
    if (status == 200 and handler.command == 'POST' and
            urlparse(handler.path).path in _SYNC_ON_POST and
            isinstance(payload, dict) and payload.get('ok')):
        try:
            payload['publication'] = sync_public_site()
        except Exception as exc:
            log('No se pudo actualizar docs/: ' + str(exc))
            payload['publication'] = {'ok': False, 'error': str(exc)}
    body=json.dumps(payload,ensure_ascii=False).encode("utf-8")
    handler.send_response(status); handler.send_header("Content-Type","application/json; charset=utf-8")
    handler.send_header("Content-Length",str(len(body))); handler.send_header("Cache-Control","no-store"); handler.end_headers()
    handler.wfile.write(body)

def error(handler,message,status=400,detail=None):
    json_response(handler,{"ok":False,"error":message,"detail":detail},status)

def http_json(url, headers=None, timeout=25):
    h={"Accept":"application/json","User-Agent":"Senda/1.1"}
    if headers: h.update(headers)
    req=Request(url,headers=h)
    with urlopen(req,timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8")),dict(r.headers)

def norm(s):
    return re.sub(r"[^a-z0-9áéíóúüñ]+","",(s or "").lower())

def resolve_getbible_abbr(t):
    s=get_settings(); mapped=s.get("provider_map",{}).get(t["id"],"")
    if mapped: return mapped
    if t.get("provider_ref"): return t["provider_ref"]
    if t["id"]=="kjv": return "kjv"
    catalog,_=http_json("https://api.getbible.net/v2/translations.json")
    items=catalog if isinstance(catalog,list) else list(catalog.values()) if isinstance(catalog,dict) else []
    targets={norm(t["name"]),norm(t.get("abbr","")),norm(t["id"])}
    for item in items:
        vals={norm(item.get("name","")),norm(item.get("translation","")),norm(item.get("abbreviation","")),norm(item.get("abbr",""))}
        if targets & vals:
            ab=item.get("abbreviation") or item.get("abbr")
            if ab:
                s.setdefault("provider_map",{})[t["id"]]=ab.lower(); save_settings(s); return ab.lower()
    return ""

def book_for_id(book_id):
    return next((b for b in BOOKS if b["id"]==book_id),None)

def cached(translation_id,reference):
    row=q1("SELECT * FROM bible_cache WHERE translation_id=? AND reference=?",(translation_id,reference))
    if not row: return None
    try:
        dt=datetime.fromisoformat(row["fetched_at"])
        if datetime.now(timezone.utc)-dt < timedelta(days=CACHE_DAYS):
            return json.loads(row["payload_json"])
    except Exception: pass
    return None

def cache_put(tid,ref,payload,provider,etag=""):
    con=db_connect()
    con.execute("""INSERT INTO bible_cache(translation_id,reference,payload_json,fetched_at,etag,provider)
                   VALUES(?,?,?,?,?,?)
                   ON CONFLICT(translation_id,reference) DO UPDATE SET payload_json=excluded.payload_json,
                   fetched_at=excluded.fetched_at,etag=excluded.etag,provider=excluded.provider""",
                (tid,ref,json.dumps(payload,ensure_ascii=False),now(),etag,provider))
    con.commit(); con.close()

def normalize_verses(payload,translation):
    verses=[]
    if isinstance(payload,dict):
        for obj in payload.values():
            if isinstance(obj,dict) and isinstance(obj.get("verses"),list):
                for v in obj["verses"]:
                    if v.get("verse") is not None:
                        verses.append({"verse":int(v["verse"]),"text":v.get("text",""),"name":v.get("name","")})
    verses.sort(key=lambda x:x["verse"])
    return {"translation":translation["name"],"translation_id":translation["id"],"verses":verses}

def fetch_getbible(t,book,chapter):
    abbr=resolve_getbible_abbr(t)
    if not abbr: raise RuntimeError(f"No encontré {t['name']} en el catálogo de GetBible. Configura otro proveedor en Configuración.")
    if book.get("deuterocanonical"):
        raise RuntimeError(f"{t['name']} no incluye este libro deuterocanónico. Selecciona una traducción que lo contenga.")
    # Los números internos de Senda incluyen siete libros deuterocanónicos entre AT y NT.
    number=int(book['number'])-(7 if book['section']=='NT' else 0)
    url=f"https://api.getbible.net/v2/{quote(abbr)}/{number}/{int(chapter)}.json"
    payload,headers=http_json(url)
    verses=payload.get('verses',[]) if isinstance(payload,dict) else []
    if not verses: raise RuntimeError(f"GetBible no devolvió versículos de {book['es']} {chapter} en {t['name']}.")
    return {"translation":t['name'],"translation_id":t['id'],"verses":[
        {"verse":int(v['verse']),"text":v.get('text',''),"name":v.get('name','')} for v in verses]},"getbible"

def api_bible_bibles(key):
    payload,_=http_json("https://rest.api.bible/v1/bibles",{"api-key":key})
    return payload.get("data",[])

def find_api_bible_id(t,key):
    # Únicamente los Bible ID realmente autorizados por esta clave.
    mapped=get_settings().get("api_bible_version_map",{}).get(t["id"],"")
    if mapped: return mapped
    hits=api_bible_catalog(key)
    match=next((x for x in hits if x["alias"]==t["id"]),None)
    if not match:
        raise RuntimeError(f"{t['abbr']} no está en el catálogo de traducciones autorizado de tu API.Bible. Ve a Configuración → Comprobar Biblias.")
    return match['id']

def api_bible_catalog(key):
    results=[]
    for b in api_bible_bibles(key):
        abbr=norm(" ".join(str(b.get(x,"")) for x in ("abbreviation","abbreviationLocal")))
        name=norm(" ".join(str(b.get(x,"")) for x in ("name","nameLocal")))
        alias=""
        if "nbla" in abbr or "nueva biblia de las americas" in name: alias="nbla"
        elif "ntv" in abbr or "nueva traduccion viviente" in name: alias="ntv"
        if alias:
            results.append({"alias":alias,"id":b.get("id",""),"name":b.get("nameLocal") or b.get("name") or alias,
                "abbr":b.get("abbreviationLocal") or b.get("abbreviation") or alias,"copyright":b.get("copyright","")})
    return results

def extract_api_bible_verses(blocks):
    """Agrupa nodos JSON con attrs.verseId (no parte el texto por números dentro del versículo)."""
    acc={}; active=[None]
    def walk(node):
        if isinstance(node,list):
            for child in node: walk(child)
            return
        if not isinstance(node,dict): return
        attrs=node.get('attrs') or {}
        if node.get('name')=='verse':
            raw=attrs.get('number')
            if raw and re.fullmatch(r'\d+',str(raw)):
                active[0]=int(raw);acc.setdefault(active[0],[])
            return
        vid=attrs.get('verseId') or ''
        m=re.search(r'\.(\d+)$',str(vid))
        if m:
            active[0]=int(m.group(1));acc.setdefault(active[0],[])
        if node.get('type')=='text' and active[0] and node.get('text'):
            acc[active[0]].append(str(node['text']))
        walk(node.get('items',[]))
    walk(blocks)
    return [{"verse":k,"text":re.sub(r'\s+',' ',''.join(v)).strip()} for k,v in sorted(acc.items()) if ''.join(v).strip()]

def fetch_api_bible(t,book,chapter,key):
    bible_id=find_api_bible_id(t,key)
    bp,_=http_json(f"https://rest.api.bible/v1/bibles/{quote(bible_id)}/books",{"api-key":key})
    books=bp.get("data",[])
    candidates=[b for b in books if norm(b.get("nameLocal",""))==norm(book["es"]) or norm(b.get("name",""))==norm(book["en"])]
    if not candidates: candidates=[b for b in books if b.get("id","").upper()==book["id"]]
    if not candidates: raise RuntimeError(f"{book['es']} no figura en la traducción {t['abbr']} de API.Bible.")
    bid=candidates[0]["id"]
    cp,_=http_json(f"https://rest.api.bible/v1/bibles/{quote(bible_id)}/books/{quote(bid)}/chapters",{"api-key":key})
    c=next((x for x in cp.get('data',[]) if str(x.get('number'))==str(chapter)),None)
    if not c: raise RuntimeError(f"No existe {book['es']} {chapter} en {t['abbr']}.")
    params=urlencode({'content-type':'json','include-notes':'false','include-titles':'false','include-verse-numbers':'true'})
    payload,_=http_json(f"https://rest.api.bible/v1/bibles/{quote(bible_id)}/chapters/{quote(c['id'])}?{params}",{"api-key":key})
    data=payload.get('data',{})
    verses=extract_api_bible_verses(data.get('content',[]))
    if not verses: raise RuntimeError("API.Bible no devolvió versículos estructurados para este capítulo; no se mostrará texto incompleto.")
    return {"translation":t['name'],"translation_id":t['id'],"verses":verses,"attribution":data.get('copyright','')},"api_bible"

def fetch_esv(t,book,chapter,key):
    if not key: raise RuntimeError("Configura tu clave de ESV API en Configuración para usar ESV.")
    ref=f"{book['en']} {chapter}"
    url="https://api.esv.org/v3/passage/text/?"+"q="+quote(ref)+"&include-headings=false&include-footnotes=false&include-verse-numbers=true&include-short-copyright=false&include-passage-references=false"
    payload,_=http_json(url,{"Authorization":f"Token {key}"})
    text=(payload.get("passages") or [""])[0]
    pairs=re.findall(r"\[(\d{1,3})\]\s*(.*?)(?=\s*\[\d{1,3}\]|$)",text,re.S)
    verses=[{"verse":int(n),"text":re.sub(r"\s+"," ",tx).strip(),"name":f"{book['en']} {chapter}:{n}"} for n,tx in pairs]
    if not verses and text: verses=[{"verse":1,"text":re.sub(r"\s+"," ",text).strip(),"name":f"{book['en']} {chapter}:1"}]
    return {"translation":t["name"],"translation_id":t["id"],"verses":verses},"esv_api"

YVP_API = "https://api.youversion.com/v1"
YVP_CATALOG_MEMORY={"key":"","time":0,"licensed":[],"all":[]}

def yv_key():
    return os.environ.get("SENDA_YVP_APP_KEY", "").strip() or get_settings().get("youversion_app_key", "").strip()

def yv_json(path, query=""):
    key=yv_key()
    if not key: raise RuntimeError("Introduce tu App Key en Configuración → YouVersion y pulsa Guardar.")
    try:
        payload,_=http_json(YVP_API+path+query,{"X-YVP-App-Key":key,"Accept":"application/json"},timeout=25)
        return payload
    except HTTPError as exc:
        if exc.code==401: raise RuntimeError("YouVersion 401: App Key inválida o no reconocida. Regenera la clave en YouVersion Platform.")
        if exc.code==403: raise RuntimeError("YouVersion 403: la clave es válida, pero tu aplicación no tiene permiso para ese contenido. Revisa las licencias del editor.")
        if exc.code==404: raise RuntimeError(f"YouVersion 404: identificador o ruta inexistente ({path}). Esto NO confirma un problema de licencia.")
        if exc.code==422: raise RuntimeError("YouVersion 422: parámetros de la consulta inválidos. Comprueba la versión de Senda.")
        if exc.code==429: raise RuntimeError("YouVersion 429: límite de consultas alcanzado. Espera unos minutos.")
        raise RuntimeError(f"Error de YouVersion ({exc.code}) en {path}.")
    except (TimeoutError,URLError) as exc:
        raise RuntimeError(f"No se pudo conectar con YouVersion: {exc.reason if isinstance(exc,URLError) else 'Tiempo agotado'}")

def _catalog_pages(all_available=False):
    """Solo pide versiones en español; cada resultado corresponde a una licencia o a un catálogo público."""
    entries=[]; token=''
    for _ in range(15):
        params={'language_ranges[]':'es','page_size':'99'}
        if all_available: params['all_available']='true'
        if token: params['page_token']=token
        data=yv_json('/bibles','?'+urlencode(params))
        entries.extend(data.get('data',[]) if isinstance(data,dict) else [])
        token=data.get('next_page_token','') if isinstance(data,dict) else ''
        if not token: break
    return entries

def yv_catalog(force=False, include_all=False):
    # El catálogo licenciado nunca incluye la clave y se mantiene en RAM hasta 10 min.
    key=yv_key()
    if not key: raise RuntimeError("Configura la App Key de YouVersion en Senda primero.")
    cached=YVP_CATALOG_MEMORY
    if force or key!=cached['key'] or time.time()-cached['time']>600:
        cached.update({'key':key,'time':time.time(),'licensed':_catalog_pages(False),'all':[]})
    if include_all and not cached['all']:
        cached['all']=_catalog_pages(True)
    return cached['licensed'], cached['all']

def norm_yv_name(s):
    import unicodedata
    s=unicodedata.normalize('NFD',str(s or '').lower())
    return re.sub('[^a-z0-9]+','', ''.join(c for c in s if unicodedata.category(c)!='Mn'))

def find_yv_version(t, entries):
    """Primero ID oficial autorizado, luego abreviatura EXACTA, luego título explícito."""
    by_id={int(v['id']):v for v in entries if str(v.get('id','')).isdigit()}
    if str(t.get('provider_ref','')).isdigit() and int(t['provider_ref']) in by_id:
        return by_id[int(t['provider_ref'])]
    targets={norm_yv_name(t.get('abbr')),norm_yv_name(t.get('name'))}-{''}
    for v in entries:
        names={norm_yv_name(v.get('abbreviation')),norm_yv_name(v.get('localized_abbreviation')),
               norm_yv_name(v.get('title')),norm_yv_name(v.get('localized_title'))}-{''}
        if targets & names: return v
    return None

class VerseHTMLParser(HTMLParser):
    """Extrae texto solamente de nodos de versículo; omite encabezados y etiquetas de números."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items={}; self.active=None; self.stack=[]; self.omit=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs); cl=set((a.get('class') or '').split())
        n=a.get('v') or a.get('data-verse') or (a.get('data-verse-number') if 'verse' in cl else None)
        if n is None and cl & {'v','verse','yv-v'}: n=a.get('id','')
        m=re.search(r'(\d+)$',str(n)) if n is not None else None
        if m and (tag in ('span','div','p')):
            num=int(m.group(1)); self.active=num; self.items.setdefault(num,[])
        self.stack.append((tag,self.active))
        if cl & {'yv-vlbl','versenum','verse-number','v-num','yv-verse-number'}: self.omit+=1
        if tag=='br' and self.active and self.omit==0: self.items[self.active].append(' ')
    def handle_endtag(self,tag):
        if not self.stack:return
        # pop matching tag, preserve previous verse context for nested spans
        for j in range(len(self.stack)-1,-1,-1):
            if self.stack[j][0]==tag:
                self.stack=self.stack[:j];break
        self.active=self.stack[-1][1] if self.stack else None
        self.omit=0
    def handle_data(self,data):
        if self.active is not None and not self.omit: self.items[self.active].append(data)
    def result(self):
        return [{"verse":k,"text":' '.join(''.join(v).split())} for k,v in sorted(self.items.items()) if ''.join(v).strip()]

def resolve_yv_id(t):
    licensed,_=yv_catalog()
    result=find_yv_version(t,licensed)
    if result: return int(result['id'])
    raise RuntimeError(f"{t['name']} no aparece en el catálogo español autorizado para tu aplicación. En Configuración pulsa «Consultar catálogo español» y revisa las licencias de YouVersion. Puedes leer RV1909 sin clave.")

def fetch_youversion(t,book,chapter):
    bid=resolve_yv_id(t)
    meta=yv_json(f"/bibles/{bid}")
    path=f"/bibles/{bid}/passages/{book['id']}.{chapter}"
    try: obj=yv_json(path,"?format=html&include_headings=false&include_notes=false")
    except RuntimeError as exc:
        if '404' not in str(exc): raise
        obj={}
    parser=VerseHTMLParser(); parser.feed(obj.get('content') or '')
    verses=parser.result()
    if len(verses)<2:
        listing=yv_json(f"/bibles/{bid}/books/{book['id']}/chapters/{chapter}/verses")
        vi=listing.get('data') or []
        if isinstance(vi,dict): vi=vi.get('data',[])
        ids=[]
        for v in vi:
            try: ids.append(int(v['id']))
            except (KeyError,TypeError,ValueError): continue
        ids=list(dict.fromkeys(ids))[:180]
        if not ids: raise RuntimeError("YouVersion no devolvió la lista de versículos de este capítulo.")
        def one(n):
            v=yv_json(f"/bibles/{bid}/passages/{book['id']}.{chapter}.{n}","?format=text")
            return {"verse":n,"text":re.sub(r'\s+',' ',html.unescape(v.get('content',''))).strip()}
        with ThreadPoolExecutor(max_workers=4) as pool: verses=sorted(pool.map(one,ids),key=lambda x:x['verse'])
    return {"translation":meta.get('localized_title') or t['name'],"translation_id":t['id'],"verses":verses,
        "attribution":meta.get('copyright') or meta.get('promotional_content') or '',"publisher_url":meta.get('publisher_url') or '',
        "provider":"youversion"},"youversion"

def yv_access_status():
    licensed,all_v=yv_catalog(include_all=True)
    results=[]
    for t in TRANSLATIONS:
        if t.get('provider')!='youversion' or t.get('language')!='es': continue
        lic=find_yv_version(t,licensed); platform=find_yv_version(t,all_v)
        status='licensed' if lic else ('requires_license' if platform else 'not_found')
        label='Autorizada en el catálogo' if lic else ('Requiere aceptar o solicitar licencia editorial' if platform else 'No encontrada en el catálogo español de la API')
        results.append({'id':t['id'],'name':t['name'],'status':status,'detail':label,
                        'api_id':(lic or platform or {}).get('id')})
    return results

def yv_spanish_catalog():
    licensed,all_v=yv_catalog(include_all=True)
    allowed_ids={x['id'] for x in licensed}
    return {'authorized':[{'id':int(v['id']), 'abbr':v.get('abbreviation') or v.get('localized_abbreviation') or '',
                           'name':v.get('localized_title') or v.get('title') or '',
                           'copyright':v.get('copyright') or '', 'language':v.get('language_tag') or ''} for v in licensed],
            'total_platform':len(all_v),'authorized_count':len(allowed_ids),'requested':yv_access_status()}

def scripture(translation_id,book_id,chapter):
    t=user_translation_by_id(translation_id);book=book_for_id(book_id)
    if not t or not book:raise RuntimeError('Libro o traducción no válida.')
    payload=local_bible_chapter(translation_id,book_id,chapter)
    if payload:return payload
    progress=next((v for v in bible_install_status() if v['id']==translation_id),None)
    if progress and progress['status']=='descargando':
        raise RuntimeError('Se está preparando esta traducción en español. Espera un momento y pulsa Reintentar.')
    if progress and progress['status']=='error':
        raise RuntimeError('No se pudo instalar automáticamente esta Biblia: '+progress['error'])
    if not (BIBLES/translation_id/'manifest.json').exists():
        start_bible_install()
        raise RuntimeError('Senda está descargando por primera vez las Biblias. Necesitas Internet solo para la instalación inicial. Reintenta en unos segundos.')
    raise RuntimeError(f'El libro {book["es"]}, capítulo {chapter}, no forma parte de esta edición. Algunas traducciones son parciales o aún están en revisión.')


class SafeRichHTML(HTMLParser):
    ALLOWED={'p','div','br','strong','b','em','i','u','s','strike','blockquote','h1','h2','h3','h4','ul','ol','li','a','table','thead','tbody','tr','td','th','span','font','sup','sub'}
    STYLES={'color','background-color','text-align','font-weight','font-style','text-decoration'}
    def __init__(self): super().__init__(convert_charrefs=True);self.parts=[];self.stack=[]
    def handle_starttag(self,tag,attrs):
        if tag not in self.ALLOWED:return
        out=[]
        for k,v in attrs:
            if k=='href' and tag=='a' and v and v.lower().startswith('https://'):
                out.append('href="'+html.escape(v,quote=True)+'" rel="noopener noreferrer" target="_blank"')
            elif k in ('color','bgcolor') and v and re.fullmatch(r'#[0-9a-fA-F]{6}',v):
                out.append(k+'="'+v+'"')
            elif k=='style' and v:
                vals=[]
                for declaration in v.split(';'):
                    if ':' not in declaration:continue
                    key,value=(x.strip().lower() for x in declaration.split(':',1))
                    if key in ('color','background-color') and re.fullmatch(r'#[0-9a-f]{3,8}|rgba?\([0-9, .]+\)|[a-z]{3,15}',value):vals.append(key+':'+value)
                    elif key=='text-align' and value in ('left','right','center','justify'):vals.append(key+':'+value)
                if vals:out.append('style="'+html.escape(';'.join(vals),quote=True)+'"')
        self.parts.append('<'+tag+(' '+' '.join(out) if out else '')+'>');
        if tag!='br':self.stack.append(tag)
    def handle_endtag(self,tag):
        if tag in self.ALLOWED and tag in self.stack:
            while self.stack:
                x=self.stack.pop();self.parts.append('</'+x+'>')
                if x==tag:break
    def handle_data(self,data):self.parts.append(html.escape(data))
    def result(self):
        while self.stack:self.parts.append('</'+self.stack.pop()+'>')
        return ''.join(self.parts)

def safe_rich(text):
    parser=SafeRichHTML();parser.feed(str(text or '')[:150000]);return parser.result()

def require_collection(data):
    try: cid=int(data.get('collection_id') or 0)
    except (ValueError,TypeError):cid=0
    if not cid or not q1('SELECT id FROM collections WHERE id=?',(cid,)):
        raise RuntimeError('Debes elegir una colección válida antes de guardar.')
    return cid

def save_entity(kind,data):
    if kind in ('note','media','image_project'):require_collection(data)
    t=now()
    if kind=="highlight":
        return mutate("""INSERT INTO highlights(book_id,chapter,verse,start_offset,end_offset,selected_text,color,category_id,translation_id,created_at,updated_at)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?)""",(data["book_id"],int(data["chapter"]),int(data["verse"]),int(data.get("start_offset",0)),int(data.get("end_offset",0)),data.get("selected_text",""),data["color"],data["category_id"],data.get("translation_id","kjv"),t,t))
    if kind=="note":
        cat=data.get("category_id","important")
        if data.get("id"):
            update("UPDATE notes SET scope=?,reference=?,title=?,html=?,translation_id=?,is_public=?,updated_at=?,category_id=? WHERE id=?",(data.get("scope","verse"),data["reference"],data.get("title",""),safe_rich(data.get("html","")),data.get("translation_id","kjv"),int(bool(data.get("is_public",True))),t,cat,int(data["id"])))
            if data.get('collection_id'): update('UPDATE notes SET collection_id=? WHERE id=?',(int(data['collection_id']),int(data['id'])))
            return int(data["id"])
        ident=mutate("""INSERT INTO notes(scope,reference,title,html,translation_id,is_public,created_at,updated_at,category_id)
                         VALUES(?,?,?,?,?,?,?,?,?)""",(data.get("scope","verse"),data["reference"],data.get("title",""),safe_rich(data.get("html","")),data.get("translation_id","kjv"),int(bool(data.get("is_public",True))),t,t,cat))
        if data.get("collection_id"):update("UPDATE notes SET collection_id=? WHERE id=?",(int(data["collection_id"]),ident))
        return ident
    if kind=="media":
        if data.get("id"):
            update("UPDATE media SET reference=?,kind='video',title=?,youtube_url=?,description=?,subtitle=?,description_html=?,is_public=?,updated_at=? WHERE id=?",(data["reference"],data.get("title",""),data["youtube_url"],data.get("description",""),data.get("subtitle",""),safe_rich(data.get("description_html","")),int(bool(data.get("is_public",True))),t,int(data["id"])))
            update('UPDATE media SET collection_id=?,translation_id=? WHERE id=?',(int(data.get('collection_id') or 0) or None,data.get('translation_id',''),int(data['id'])))
            return int(data["id"])
        ident=mutate("""INSERT INTO media(reference,kind,title,youtube_url,description,subtitle,description_html,is_public,created_at,updated_at)
                         VALUES(?,'video',?,?,?,?,?,?,?,?)""",(data["reference"],data.get("title",""),data["youtube_url"],data.get("description",""),data.get("subtitle",""),safe_rich(data.get("description_html","")),int(bool(data.get("is_public",True))),t,t))
        update("UPDATE media SET collection_id=?,translation_id=? WHERE id=?",(int(data.get("collection_id") or 0) or None,data.get("translation_id", ""),ident))
        return ident
    if kind=="collection":
        if data.get("id"):
            update("UPDATE collections SET name=?,description=?,cover=?,color=?,icon=?,is_public=?,updated_at=? WHERE id=?",(data["name"],data.get("description",""),data.get("cover",""),data.get("color","#8b6f47"),data.get("icon","fi fi-rr-book-alt"),int(bool(data.get("is_public",True))),t,int(data["id"])))
            update('UPDATE collections SET cover_position=? WHERE id=?',(data.get('cover_position','50% 50%'),int(data['id'])))
            return int(data["id"])
        ident=mutate("""INSERT INTO collections(name,description,cover,color,icon,is_public,created_at,updated_at)
                         VALUES(?,?,?,?,?,?,?,?)""",(data["name"],data.get("description",""),data.get("cover",""),data.get("color","#8b6f47"),data.get("icon","fi fi-rr-book-alt"),int(bool(data.get("is_public",True))),t,t))
        update("UPDATE collections SET cover_position=? WHERE id=?",(data.get("cover_position","50% 50%"),ident))
        return ident
    if kind=="image_project":
        # Una imagen nueva siempre debe proceder de un versículo concreto.
        if not data.get('id') and not re.fullmatch(r'[A-Z0-9]{3}\.\d{1,3}\.\d{1,3}',str(data.get('reference',''))):
            raise RuntimeError('Selecciona un único versículo antes de crear la imagen.')
        if len(data.get('image_data',''))>10_000_000:raise RuntimeError('La imagen supera el límite de 7.5 MB codificados.')
        if not str(data.get('image_data','')).startswith('data:image/png;base64,'):raise RuntimeError('La imagen debe ser un PNG generado por Senda.')
        if data.get("id"):
            update("UPDATE image_projects SET reference=?,title=?,config_json=?,image_data=?,is_public=?,updated_at=? WHERE id=?",(data["reference"],data.get("title",""),json.dumps(data.get("config",{}),ensure_ascii=False),data.get("image_data",""),int(bool(data.get("is_public",True))),t,int(data["id"])))
            update('UPDATE image_projects SET collection_id=?,translation_id=? WHERE id=?',(int(data.get('collection_id') or 0) or None,data.get('translation_id',''),int(data['id'])))
            return int(data["id"])
        ident=mutate("""INSERT INTO image_projects(reference,title,config_json,image_data,is_public,created_at,updated_at)
                         VALUES(?,?,?,?,?,?,?)""",(data["reference"],data.get("title",""),json.dumps(data.get("config",{}),ensure_ascii=False),data.get("image_data",""),int(bool(data.get("is_public",True))),t,t))
        update("UPDATE image_projects SET collection_id=?,translation_id=? WHERE id=?",(int(data.get("collection_id") or 0) or None,data.get("translation_id",""),ident))
        return ident
    raise RuntimeError("Entidad no soportada.")

def safe_image_bytes(data_url):
    import base64
    m = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", str(data_url or ""), re.I)
    if not m: raise RuntimeError("Utiliza una imagen JPG, PNG o WebP válida.")
    body = base64.b64decode(m.group(2), validate=True)
    if len(body) > 6_000_000 or not body: raise RuntimeError("La imagen debe pesar menos de 6 MB.")
    mime = m.group(1).lower()
    magic = {'png': body.startswith(b'\x89PNG\r\n\x1a\n'),
             'jpeg': body.startswith(b'\xff\xd8\xff'),
             'webp': body[:4] == b'RIFF' and body[8:12] == b'WEBP'}
    if not magic[mime]: raise RuntimeError("El contenido no coincide con el formato de imagen.")
    return body, ('jpg' if mime == 'jpeg' else mime)

def save_illustration(data):
    import secrets
    reference=str(data.get('reference','')).strip()
    if not re.fullmatch(r'[A-Z0-9]{3}\.\d{1,3}\.\d{1,3}',reference):
        raise RuntimeError('La ilustración debe enlazarse desde un único versículo.')
    title=str(data.get('title','')).strip()[:150]
    if not title: raise RuntimeError('Escribe el título de la ilustración.')
    old=q1('SELECT * FROM illustrations WHERE id=?',(int(data['id']),)) if data.get('id') else None
    path=old['file_path'] if old else ''
    if data.get('image_data'):
        content,ext=safe_image_bytes(data['image_data'])
        ILLUSTRATIONS.mkdir(parents=True,exist_ok=True)
        filename=secrets.token_hex(16)+'.'+ext
        (ILLUSTRATIONS/filename).write_bytes(content)
        path='illustrations/'+filename
        if old and old['file_path'] != path:
            (ROOT/old['file_path']).unlink(missing_ok=True)
    if not path: raise RuntimeError('Selecciona una imagen.')
    c_id=require_collection(data)
    values=(reference,title,safe_rich(data.get('description_html','')),path,c_id,now())
    if old:
        update('UPDATE illustrations SET reference=?, title=?, description_html=?, file_path=?, collection_id=?, updated_at=? WHERE id=?',(*values,old['id']))
        update('UPDATE illustrations SET translation_id=? WHERE id=?',(data.get('translation_id',''),old['id']))
        if c_id:mutate('INSERT OR IGNORE INTO collection_items(collection_id,item_type,reference) VALUES(?,?,?)',(c_id,'verse',reference))
        return old['id']
    ident=mutate('INSERT INTO illustrations(reference,title,description_html,file_path,collection_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',(*values,now()))
    update('UPDATE illustrations SET translation_id=? WHERE id=?',(data.get('translation_id',''),ident))
    if c_id:mutate('INSERT OR IGNORE INTO collection_items(collection_id,item_type,reference) VALUES(?,?,?)',(c_id,'verse',reference))
    return ident

def save_collection_cover(ticket, collection_id):
    import secrets
    with PHOTO_SEARCH_LOCK:
        item=PHOTO_SEARCH_CACHE.get(ticket)
    if not item or item.get('provider')!='unsplash' or time.time()-item['created']>3600:
        raise RuntimeError('La foto expiró; vuelve a buscarla.')
    # La descarga pasa por el servidor para no guardar tokens ni URLs de fotografías en el sitio.
    req=Request(item['full'],headers={'User-Agent':'Senda/1.1.5'})
    with urlopen(req,timeout=25) as r:
        content_type=r.headers.get('Content-Type','')
        raw=r.read(6_000_001)
    if len(raw)>6_000_000 or not content_type.startswith('image/'):
        raise RuntimeError('Imagen demasiado grande o formato inesperado.')
    extension='png' if raw.startswith(b'\x89PNG') else 'jpg' if raw.startswith(b'\xff\xd8') else 'webp' if raw[8:12]==b'WEBP' else None
    if not extension:raise RuntimeError('Formato de imagen no permitido.')
    COLLECTION_COVERS.mkdir(exist_ok=True)
    filename=secrets.token_hex(12)+'.'+extension
    (COLLECTION_COVERS/filename).write_bytes(raw)
    path='collection_covers/'+filename
    update('UPDATE collections SET cover=?,cover_credit=?,cover_link=?,updated_at=? WHERE id=?',(path,item.get('photographer',''),item.get('link',''),now(),collection_id))
    return path

def save_profile_unsplash(ticket):
    # Sólo se permiten resultados entregados por la búsqueda oficial del servidor.
    with PHOTO_SEARCH_LOCK:
        item=PHOTO_SEARCH_CACHE.get(str(ticket))
    if not item or item.get('provider')!='unsplash' or time.time()-item.get('created',0)>3600:
        raise RuntimeError('La fotografía ya no está disponible; repite la búsqueda.')
    from urllib.parse import urlsplit
    host=urlsplit(item['full']).hostname
    if host not in ('images.unsplash.com','plus.unsplash.com'):
        raise RuntimeError('La fotografía procede de un dominio no autorizado.')
    with urlopen(Request(item['full'],headers={'User-Agent':'Senda/1.1.7'}),timeout=25) as r:
        raw=r.read(6_000_001);mime=r.headers.get('Content-Type','')
    if len(raw)>6_000_000 or not mime.startswith('image/'):
        raise RuntimeError('Imagen demasiado grande o no reconocida.')
    suffix='jpg' if raw.startswith(b'\xff\xd8\xff') else 'png' if raw.startswith(b'\x89PNG') else 'webp' if raw.startswith(b'RIFF') and raw[8:12]==b'WEBP' else ''
    if not suffix:raise RuntimeError('Formato no admitido.')
    PROFILE.mkdir(exist_ok=True)
    filename='cover.'+suffix
    (PROFILE/filename).write_bytes(raw)
    cfg=read_json(PROFILE_FILE,{}) or {}
    cfg['cover']='profile/'+filename
    write_json(PROFILE_FILE,cfg)
    return cfg['cover']

def save_custom_asset(data):
    import secrets
    kind=data.get('kind')
    if kind not in ('avatar','cover','book_cover'): raise RuntimeError('Tipo de imagen no válido')
    content,ext=safe_image_bytes(data.get('image_data',''))
    if kind=='book_cover':
        bid=str(data.get('book_id',''))
        if not any(b['id']==bid for b in BOOKS):raise RuntimeError('Libro desconocido')
        dest=ROOT/'book_covers';dest.mkdir(exist_ok=True)
        name=f'{bid}.{ext}';(dest/name).write_bytes(content)
        cfg=read_json(BOOK_COVERS_FILE,{}) or {};cfg[bid]='book_covers/'+name;write_json(BOOK_COVERS_FILE,cfg)
        return cfg[bid]
    PROFILE.mkdir(exist_ok=True)
    name=f'{kind}.{ext}';(PROFILE/name).write_bytes(content)
    cfg=read_json(PROFILE_FILE,{}) or {}
    cfg[kind]='profile/'+name
    write_json(PROFILE_FILE,cfg)
    return cfg[kind]

def save_profile_fields(data):
    cfg=read_json(PROFILE_FILE,{}) or {}
    for key in ('name','subtitle'):
        if key in data:cfg[key]=str(data[key])[:160]
    if 'cover_position' in data and re.fullmatch(r'\d{1,3}% \d{1,3}%',str(data['cover_position'])):
        cfg['cover_position']=data['cover_position']
    write_json(PROFILE_FILE,cfg)
    return cfg


def build_content_zip():
    temp=Path(tempfile.mkdtemp(prefix="senda_content_"))
    try:
        zip_path=temp/f"Senda_Contenido_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.zip"
        with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED) as z:
            if DB.exists():
                source=db_connect()
                snap=sqlite3.connect(':memory:')
                source.backup(snap)
                with tempfile.NamedTemporaryFile(suffix='.db',delete=False) as f:
                    tmp_db=f.name
                dest_con=sqlite3.connect(tmp_db); snap.backup(dest_con); dest_con.close(); snap.close(); source.close()
                z.write(tmp_db,'senda.sqlite3'); os.unlink(tmp_db)
            if SETTINGS_FILE.exists():
                safe=get_settings()
                for secret in ('api_bible_key','youversion_app_key','esv_api_key','pexels_api_key','unsplash_access_key'):
                    safe.pop(secret,None)
                z.writestr('settings.json', json.dumps(safe,ensure_ascii=False,indent=2))
            for src,dest in ((PROFILE_FILE,'config/profile.json'),(BOOK_COVERS_FILE,'config/book_covers.json')):
                if src.exists(): z.write(src,dest)
            for folder in (BIBLES,ILLUSTRATIONS,COLLECTION_COVERS,PROFILE,ROOT/'book_covers'):
                if folder.exists():
                    for item in folder.rglob('*'):
                        if item.is_file():
                            z.write(item,str(item.relative_to(ROOT)))
        return zip_path
    except Exception:
        shutil.rmtree(temp,ignore_errors=True); raise

def _decode_data_url(value:str)->bytes:
    value=str(value or '')
    if ',' in value and value.lstrip().startswith('data:'): value=value.split(',',1)[1]
    return base64.b64decode(value)

def restore_content_zip(blob:bytes):
    temp=Path(tempfile.mkdtemp(prefix='senda_restore_'))
    try:
        zip_path=temp/'import.zip'; zip_path.write_bytes(blob)
        extract=temp/'extracted'; extract.mkdir()
        with zipfile.ZipFile(zip_path) as z:
            if len(z.infolist())>12000 or sum(x.file_size for x in z.infolist())>600*1024*1024:
                raise RuntimeError('El respaldo es demasiado grande o contiene demasiados archivos.')
            for name in z.namelist():
                pure=Path(name)
                if pure.is_absolute() or '..' in pure.parts: continue
                if pure.name == '': continue
                target=extract/pure
                target.parent.mkdir(parents=True,exist_ok=True)
                with z.open(name) as src, open(target,'wb') as dst:
                    shutil.copyfileobj(src,dst)
        imported_db=(extract/'senda.sqlite3')
        # Copia preventiva automática: facilita restaurar el estado anterior.
        if imported_db.exists() and DB.exists():
            pre=build_content_zip()
            BACKUPS.mkdir(parents=True,exist_ok=True)
            target=BACKUPS/f"Senda_Antes_Importar_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.zip"
            shutil.copy2(pre,target)
            shutil.rmtree(pre.parent,ignore_errors=True)
            log(f'Respaldo preventivo: {target.name}')
        if imported_db.exists():
            DB.parent.mkdir(parents=True,exist_ok=True)
            for suffix in ('-wal','-shm'):
                Path(str(DB)+suffix).unlink(missing_ok=True)
            shutil.copy2(imported_db,DB)
        pairs=[(extract/'settings.json',SETTINGS_FILE),(extract/'config'/'profile.json',PROFILE_FILE),(extract/'config'/'book_covers.json',BOOK_COVERS_FILE)]
        for src,dest in pairs:
            if src.exists():
                dest.parent.mkdir(parents=True,exist_ok=True)
                if dest==SETTINGS_FILE:
                    current=get_settings()
                    imported=read_json(src,{}) or {}
                    for key in ('unsplash_access_key',):
                        if current.get(key) and not imported.get(key): imported[key]=current[key]
                    save_settings(imported)
                else: shutil.copy2(src,dest)
        folders=[(extract/'illustrations',ILLUSTRATIONS),(extract/'collection_covers',COLLECTION_COVERS),(extract/'profile',PROFILE),(extract/'book_covers',ROOT/'book_covers'),(extract/'data'/'bibles',BIBLES)]
        for src,dest in folders:
            if src.exists():
                if dest.exists(): shutil.rmtree(dest,ignore_errors=True)
                shutil.copytree(src,dest)
        init_db()
        return local_state()
    finally:
        shutil.rmtree(temp,ignore_errors=True)

# /docs es la ÚNICA web pública: se actualiza en su lugar, sin ZIP de publicación.
# Nunca se copia SQLite, config/settings.json, el .bat ni el servidor a /docs.
_PUBLISH_LOCK = threading.RLock()
_PUBLISH_MANIFEST = PUBLIC / ".senda-generated.json"
_IMAGE_DATA_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$", re.I)


def _publish_copy(source: Path, relative: str, generated: set):
    """Sincroniza un archivo permitido sin modificarlo si ya es idéntico."""
    source = source.resolve()
    destination = (PUBLIC / relative).resolve()
    if not destination.is_relative_to(PUBLIC.resolve()):
        raise RuntimeError('Ruta de publicación no válida')
    destination.parent.mkdir(parents=True, exist_ok=True)
    if (not destination.is_file() or
            source.stat().st_size != destination.stat().st_size or
            source.stat().st_mtime_ns > destination.stat().st_mtime_ns):
        shutil.copy2(source, destination)
    generated.add(relative)


def _publish_asset(path, folder, generated):
    """Publica exclusivamente archivos referenciados de la carpeta esperada."""
    if not isinstance(path, str) or not path.startswith(folder + '/'):
        return False
    suffix = Path(path).suffix.lower()
    if suffix not in ('.png', '.jpg', '.jpeg', '.webp'):
        return False
    src = (ROOT / path).resolve()
    if not src.is_relative_to((ROOT / folder).resolve()) or not src.is_file():
        return False
    _publish_copy(src, path, generated)
    return True


def sync_public_site():
    """Prepara GitHub Pages en /docs con lo público y las Biblias ya instaladas.

    No usa credenciales GitHub ni hace push: el usuario decide cuándo subir commits.
    No falla si las Biblias se están instalando; el sitio se actualiza al finalizar.
    """
    with _PUBLISH_LOCK:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        old = read_json(_PUBLISH_MANIFEST, []) or []
        if not isinstance(old, list):
            old = []
        generated = set()
        for name, source in (
            ('index.html', APP / 'public_index.html'),
            ('public.js', APP / 'public.js'),
            ('styles.css', APP / 'styles.css'),
            ('favicon.png', APP / 'favicon.png'),
            ('senda-logo.png', APP / 'senda-logo.png'),
        ):
            if source.is_file():
                _publish_copy(source, name, generated)
        (PUBLIC / '.nojekyll').touch(exist_ok=True)
        generated.add('.nojekyll')

        site = public_state()
        options = get_settings()['public_export']
        # Respetar las opciones de la publicación y las marcas individuales de privacidad.
        for name in ('notes', 'highlights', 'media', 'collections', 'favorites',
                     'history', 'image_projects', 'illustrations'):
            if not options.get(name, True):
                site[name] = []
        for name in ('notes', 'media', 'collections', 'image_projects'):
            site[name] = [row for row in site[name] if row.get('is_public', 1)]
        published_collections = {row['id'] for row in site['collections']}
        site['collection_items'] = [row for row in site['collection_items']
                                    if row.get('collection_id') in published_collections]
        for name in ('notes', 'media', 'image_projects', 'illustrations'):
            # No publicar entradas de colecciones marcadas como privadas.
            site[name] = [row for row in site[name] if not row.get('collection_id')
                          or row['collection_id'] in published_collections]

        covers = {}
        if options.get('covers', True):
            for book in BOOKS:
                rel = f"covers/{book['id']}.svg"
                source = COVERS / f"{book['id']}.svg"
                if source.is_file():
                    _publish_copy(source, rel, generated)
                    covers[book['id']] = rel
        site['covers'] = covers

        # Exportación ligera: las imágenes del editor son archivos independientes,
        # no cadenas base64 dentro de un JSON gigante que llegue al límite de GitHub.
        for project in site['image_projects']:
            value = project.get('image_data') or ''
            match = _IMAGE_DATA_RE.fullmatch(value)
            if match:
                body = base64.b64decode(match.group(2), validate=True)
                if len(body) > 12 * 1024 * 1024:
                    raise RuntimeError('Imagen demasiado grande para publicación')
                ext = 'jpg' if match.group(1).lower() == 'jpeg' else match.group(1).lower()
                rel = f"assets/images/{int(project['id'])}.{ext}"
                dest = PUBLIC / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                if not dest.is_file() or dest.stat().st_size != len(body) or dest.read_bytes() != body:
                    dest.write_bytes(body)
                project['image_data'] = rel
                generated.add(rel)

        for illustration in site['illustrations']:
            _publish_asset(illustration.get('file_path', ''), 'illustrations', generated)
        for collection in site['collections']:
            _publish_asset(collection.get('cover', ''), 'collection_covers', generated)
        profile = site.get('profile', {})
        if isinstance(profile, dict):
            for key in ('avatar', 'cover'):
                _publish_asset(profile.get(key, ''), 'profile', generated)
        # Exportar sólo las portadas personalizadas mencionadas en el índice.
        book_covers = site.get('book_covers', {})
        if isinstance(book_covers, dict):
            for path in book_covers.values():
                _publish_asset(path, 'book_covers', generated)

        offline_ids = []
        if options.get('bible', True):
            for tr in site['translations']:
                tid = tr.get('id', '')
                if not tr.get('public_export'):
                    continue
                folder = BIBLES / tid
                if not (folder / 'manifest.json').is_file():
                    continue
                offline_ids.append(tid)
                for source in folder.iterdir():
                    if source.is_file() and source.suffix.lower() in ('.json', '.txt'):
                        _publish_copy(source, f'data/bibles/{tid}/{source.name}', generated)
        site['offline_ids'] = offline_ids
        site['translations'] = [t for t in site['translations'] if t['id'] in offline_ids]
        if offline_ids:
            if site['settings']['main_translation'] not in offline_ids:
                site['settings']['main_translation'] = offline_ids[0]
            if site['settings']['compare_translation'] not in offline_ids:
                site['settings']['compare_translation'] = offline_ids[min(1, len(offline_ids) - 1)]
        else:
            site['settings']['main_translation'] = ''
            site['settings']['compare_translation'] = ''
        site['installation_pending'] = not bool(offline_ids)

        # Escritura atómica: evita que el lector encuentre un JSON incompleto.
        dest = PUBLIC / 'data' / 'site.json'
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(site, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        tmp.replace(dest)
        generated.add('data/site.json')

        for rel in set(old) - generated:
            # Sólo borrar archivos que este generador creó previamente.
            candidate = (PUBLIC / rel).resolve()
            if candidate.is_relative_to(PUBLIC.resolve()) and candidate.is_file():
                candidate.unlink()
        write_json(_PUBLISH_MANIFEST, sorted(generated))
        log(f'Sitio actualizado en docs/: {len(offline_ids)} Biblias; {len(generated)} archivos públicos')
        return {'ok': True, 'files': len(generated), 'bibles': len(offline_ids),
                'site_path': 'docs/', 'pending_bibles': not bool(offline_ids)}


_SYNC_ON_POST = {
    '/api/save', '/api/settings', '/api/profile-unsplash', '/api/custom-image',
    '/api/profile', '/api/illustration', '/api/collection-cover', '/api/highlight',
    '/api/note', '/api/media', '/api/collection', '/api/image-project',
    '/api/collection-item', '/api/favorite', '/api/delete', '/api/content-import',
}

PHOTO_SEARCH_CACHE={}
PHOTO_SEARCH_LOCK=threading.Lock()

def photos_search(query,provider):
    query=query.strip()[:100]
    if len(query)<2: raise RuntimeError('Introduce al menos dos letras para buscar imágenes.')
    if provider != 'unsplash': raise RuntimeError('Solo se admite Unsplash.')
    settings=get_settings()
    key=settings.get('pexels_api_key','') if provider=='pexels' else settings.get('unsplash_access_key','')
    if not key: raise RuntimeError(f'Configura tu clave de {provider.title()} en Configuración para buscar fotos.')
    if provider=='pexels':
        payload,_=http_json('https://api.pexels.com/v1/search?'+urlencode({'query':query,'per_page':15}),{'Authorization':key})
        raw=[{'id':str(x['id']),'src':x['src'].get('medium') or x['src'].get('original'),
              'full':x['src'].get('large2x') or x['src'].get('original'),
              'photographer':x.get('photographer',''),'link':x.get('url',''),'download_location':''} for x in payload.get('photos',[])]
    else:
        payload,_=http_json('https://api.unsplash.com/search/photos?'+urlencode({'query':query,'per_page':24}),{'Authorization':'Client-ID '+key,'Accept-Version':'v1'})
        raw=[{'id':str(x['id']),'src':x.get('urls',{}).get('small'),
              'full':x.get('urls',{}).get('regular'),'photographer':x.get('user',{}).get('name',''),
              'link':x.get('links',{}).get('html','').split('?')[0]+'?utm_source=senda&utm_medium=referral','download_location':x.get('links',{}).get('download_location','')} for x in payload.get('results',[])]
    import secrets
    out=[]
    with PHOTO_SEARCH_LOCK:
        if len(PHOTO_SEARCH_CACHE)>150: PHOTO_SEARCH_CACHE.clear()
        for x in raw:
            ticket=secrets.token_urlsafe(15)
            PHOTO_SEARCH_CACHE[ticket]={**x,'provider':provider,'created':time.time()}
            out.append({'key':ticket,'thumb':x['src'],'photographer':x['photographer'],'link':x['link'],'provider':provider})
    return {'photos':out,'provider':provider}

def serve_photo(handler,ticket):
    with PHOTO_SEARCH_LOCK:
        record=PHOTO_SEARCH_CACHE.get(ticket)
    if not record or time.time()-record['created']>3600: raise RuntimeError('La fotografía expiró: busca de nuevo.')
    from urllib.parse import urlsplit
    url=record['full']
    host=urlsplit(url).hostname or ''
    if record['provider']=='pexels' and host!='images.pexels.com': raise RuntimeError('Origen de imagen no válido.')
    if record['provider']=='unsplash' and host not in ('images.unsplash.com','plus.unsplash.com'): raise RuntimeError('Origen de imagen no válido.')
    if record['provider']=='unsplash' and record['download_location']:
        token=get_settings().get('unsplash_access_key','')
        # Notificación requerida por Unsplash cuando una imagen se elige para utilizarse.
        try: http_json(record['download_location'],{'Authorization':'Client-ID '+token},timeout=10)
        except Exception as e: log('No se confirmó descarga en Unsplash: '+str(e))
    req=Request(url,headers={'User-Agent':'Senda/1.1.4'})
    with urlopen(req,timeout=25) as response:
        content_type=response.headers.get('Content-Type','image/jpeg')
        if not content_type.startswith('image/'): raise RuntimeError('La URL no devolvió una imagen.')
        body=response.read(6_000_001)
    if len(body)>6_000_000: raise RuntimeError('Esta imagen es demasiado grande (máximo 6 MB).')
    handler.send_response(200);handler.send_header('Content-Type',content_type);handler.send_header('Content-Length',str(len(body)));handler.send_header('Cache-Control','private, max-age=120');handler.end_headers();handler.wfile.write(body)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(APP),**kwargs)
    def log_message(self,fmt,*args): pass
    def do_GET(self):
        parsed=urlparse(self.path); path=parsed.path
        if path == '/sitio':
            self.send_response(302); self.send_header('Location', '/sitio/'); self.end_headers(); return
        if path.startswith('/sitio/'):
            self.directory = str(PUBLIC)
            self.path = path[len('/sitio'):] or '/'
            return super().do_GET()
        if path.startswith(('/illustrations/','/collection_covers/','/profile/','/book_covers/')):
            folder=next((x for prefix,x in (('/illustrations/',ILLUSTRATIONS),('/collection_covers/',COLLECTION_COVERS),('/profile/',PROFILE),('/book_covers/',ROOT/'book_covers')) if path.startswith(prefix)),ILLUSTRATIONS)
            name=Path(path).name
            p=folder/name
            if not p.is_file() or p.suffix.lower() not in ('.jpg','.jpeg','.png','.webp'):
                self.send_error(404);return
            import mimetypes
            body=p.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(name)[0] or 'image/jpeg');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','private, max-age=300');self.end_headers();self.wfile.write(body);return
        if path.startswith("/covers/"):
            name=Path(path).name
            target=COVERS/name
            if target.exists() and target.suffix.lower()==".svg":
                body=target.read_bytes()
                self.send_response(200); self.send_header("Content-Type","image/svg+xml"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body); return
            self.send_error(404); return
        if path=="/api/state": json_response(self,local_state()); return
        if path=="/api/bibles": json_response(self,{"ok":True,"bibles":bible_install_status(),"running":_INSTALL_RUNNING}); return
        if path=="/api/scripture":
            qs=parse_qs(parsed.query)
            try:
                tid=qs.get("translation",["kjv"])[0]; bid=qs.get("book",["JHN"])[0]; ch=int(qs.get("chapter",["3"])[0])
                payload=scripture(tid,bid,ch); log(f"Biblia cargada: {tid} {bid} {ch}"); json_response(self,{"ok":True,**payload}); return
            except Exception as e: log(f"Error Biblia: {e}"); error(self,str(e),502); return
        if path=="/api/youversion/status":
            try: json_response(self,{"ok":True,"versions":yv_access_status()}); return
            except Exception as e: error(self,str(e),502); return
        if path=="/api/youversion/catalog":
            try: json_response(self,{"ok":True,**yv_spanish_catalog()}); return
            except Exception as e: error(self,str(e),502); return
        if path=="/api/getbible/catalog":
            try: data,_=http_json("https://api.getbible.net/v2/translations.json"); json_response(self,{"ok":True,"catalog":data}); return
            except Exception as e: error(self,str(e),502); return
        if path=="/api/api-bible/catalog_DISABLED":
            try:
                key=get_settings().get('api_bible_key','').strip()
                if not key: raise RuntimeError('Guarda antes tu API key de API.Bible en Configuración.')
                json_response(self,{"ok":True,"bibles":api_bible_catalog(key)})
            except Exception as e: error(self,str(e),502)
            return
        if path=="/api/photos/search":
            query=parse_qs(parsed.query)
            try: json_response(self,{"ok":True,**photos_search(query.get('q',[''])[0],query.get('provider',['unsplash'])[0])})
            except Exception as e: error(self,str(e),502)
            return
        if path=="/api/photos/image":
            key=parse_qs(parsed.query).get('key',[''])[0]
            try: serve_photo(self,key)
            except Exception as e: error(self,str(e),404)
            return
        if path=="/api/health": json_response(self,{"ok":True,"version":VERSION,"db":DB.exists(),"books":len(BOOKS),"translations":len(TRANSLATIONS)}); return
        return super().do_GET()
    def do_POST(self):
        parsed=urlparse(self.path); length=int(self.headers.get("Content-Length","0") or 0)
        if length<0 or length>150*1024*1024:
            error(self,"La petición supera el tamaño permitido (150 MB).",413); return
        raw=self.rfile.read(length)
        if parsed.path=="/api/content-import" and self.headers.get('Content-Type','').startswith('application/zip'):
            try:
                state_after=restore_content_zip(raw)
                log('Contenido importado desde respaldo ZIP')
                json_response(self,{"ok":True,"state":state_after})
            except Exception as exc:
                log('Error al importar contenido: '+str(exc))
                error(self,str(exc),400)
            return
        try: data=json.loads(raw.decode("utf-8")) if raw else {}
        except Exception: error(self,"JSON inválido",400); return
        try:
            if parsed.path=="/api/profile-unsplash":
                path=save_profile_unsplash(data.get('ticket',''))
                json_response(self,{'ok':True,'path':path,'state':local_state()});return
            if parsed.path=="/api/custom-image":
                path=save_custom_asset(data);json_response(self,{'ok':True,'path':path,'state':local_state()});return
            if parsed.path=="/api/profile":
                save_profile_fields(data);json_response(self,{'ok':True,'state':local_state()});return
            if parsed.path=="/api/illustration":
                ident=save_illustration(data)
                log(f'Ilustración guardada #{ident}')
                json_response(self,{'ok':True,'id':ident,'state':local_state()});return
            if parsed.path=="/api/collection-cover":
                cid=int(data.get('id') or 0)
                if not q1('SELECT id FROM collections WHERE id=?',(cid,)):
                    raise RuntimeError('Guarda primero la colección.')
                path=save_collection_cover(str(data.get('ticket','')),cid)
                json_response(self,{'ok':True,'cover':path,'state':local_state()});return
            if parsed.path=="/api/bibles/sync":
                started=start_bible_install(force=bool(data.get('force',False)))
                json_response(self,{"ok":True,"started":started,"bibles":bible_install_status()});return
            if parsed.path=="/api/bible/install":
                error(self,"Las siete Biblias se instalan automáticamente al iniciar Senda. No necesitas API keys.",410);return
            if parsed.path=="/api/bible/install_DISABLED":
                result=install_bible(str(data.get('translation','')))
                json_response(self,{'ok':True,'result':result,'state':local_state()});return
            if parsed.path=="/api/api-bible/select_DISABLED":
                version=data.get('alias','');bible_id=data.get('id','')
                if version not in ('nbla','ntv'): raise RuntimeError('Traducción desconocida.')
                key=get_settings().get('api_bible_key','').strip()
                allowed=api_bible_catalog(key)
                if not any(x['id']==bible_id and x['alias']==version for x in allowed): raise RuntimeError('Bible ID no autorizado con tu clave actual.')
                config=get_settings();config.setdefault('api_bible_version_map',{})[version]=bible_id;save_settings(config)
                json_response(self,{"ok":True,"settings":safe_settings()});return
            if parsed.path=="/api/save":
                con=db_connect();con.execute('PRAGMA wal_checkpoint(PASSIVE)');con.close()
                log('Cambios guardados en SQLite');json_response(self,{'ok':True,'saved_at':now()});return
            if parsed.path=="/api/settings":
                s=get_settings()
                allowed={"canon","main_translation","compare_translation","default_book","default_chapter","theme","public_export","unsplash_access_key"}
                for k,v in data.items():
                    if k not in allowed: continue
                    if (k.endswith("_key") or k.endswith("_access_key")) and not v: continue # contraseña vacía no borra la guardada
                    s[k]=v
                if "public_export" in data:
                    pe=dict(DEFAULT_SETTINGS["public_export"]); pe.update(data["public_export"]); s["public_export"]=pe
                save_settings(s); log("Configuración guardada"); json_response(self,{"ok":True,"settings":safe_settings()}); return
            if parsed.path=="/api/youversion/select":
                version_id=int(data.get('id',0))
                licensed,_=yv_catalog()
                entry=next((v for v in licensed if int(v.get('id',0))==version_id),None)
                if not entry: raise RuntimeError('La versión no aparece en tu catálogo autorizado de YouVersion.')
                alias='yv'+str(version_id)
                existing=next((t for t in TRANSLATIONS if t.get('provider')=='youversion' and find_yv_version(t,[entry])),None)
                s=get_settings()
                if existing: alias=existing['id']
                else:
                    custom=s.get('youversion_custom_versions',[])
                    if not any(x['id']==alias for x in custom):
                        custom.append({'id':alias,'name':entry.get('localized_title') or entry.get('title') or alias,
                          'abbr':entry.get('abbreviation') or entry.get('localized_abbreviation') or alias,
                          'language':'es','provider':'youversion','provider_ref':version_id,
                          'license':'copyright','public_export':False})
                        s['youversion_custom_versions']=custom[:99]
                s['main_translation']=alias; save_settings(s)
                log(f'Traducción española elegida en catálogo autorizado: {alias}')
                json_response(self,{'ok':True,'translation_id':alias,'state':local_state()});return
            if parsed.path in ("/api/highlight","/api/note","/api/media","/api/collection","/api/image-project"):
                kind={"api/highlight":"highlight","api/note":"note","api/media":"media","api/collection":"collection","api/image-project":"image_project"}[parsed.path.lstrip("/")]
                ident=save_entity(kind,data); log(f"{kind} guardado #{ident}"); json_response(self,{"ok":True,"id":ident,"state":local_state()}); return
            if parsed.path=="/api/collection-item":
                cid=int(data["collection_id"]); con=db_connect(); con.execute("INSERT OR IGNORE INTO collection_items(collection_id,item_type,reference) VALUES(?,?,?)",(cid,data["item_type"],data["reference"])); con.commit(); con.close()
                log(f"Elemento agregado a colección #{cid}"); json_response(self,{"ok":True,"state":local_state()}); return
            if parsed.path=="/api/favorite":
                ref=data["reference"]; con=db_connect()
                if data.get("active",True):
                    tid=str(data.get('translation_id','') or get_settings().get('main_translation','onbv'))[:40]
                    verse_text=str(data.get('verse_text',''))[:6000]
                    con.execute("INSERT OR IGNORE INTO favorites(reference,created_at,translation_id,verse_text) VALUES(?,?,?,?)",(ref,now(),tid,verse_text))
                    con.execute("UPDATE favorites SET translation_id=?, verse_text=? WHERE reference=? AND (verse_text='' OR translation_id='')",(tid,verse_text,ref))
                else: con.execute("DELETE FROM favorites WHERE reference=?",(ref,))
                con.commit(); con.close(); json_response(self,{"ok":True,"state":local_state()}); return
            if parsed.path=="/api/history":
                mutate("INSERT INTO history(reference,visited_at) VALUES(?,?)",(data["reference"],now())); json_response(self,{"ok":True}); return
            if parsed.path=="/api/delete":
                kind=data["kind"]; ident=int(data["id"]); table={"note":"notes","media":"media","collection":"collections","image_project":"image_projects","highlight":"highlights","illustration":"illustrations"}[kind]
                if kind=="collection":
                    if q1("SELECT is_default FROM collections WHERE id=?",(ident,)) and q1("SELECT is_default FROM collections WHERE id=?",(ident,))["is_default"]:
                        error(self,"Las colecciones predeterminadas no se pueden eliminar.",403); return
                    update("DELETE FROM collection_items WHERE collection_id=?",(ident,))
                if kind=='illustration':
                    row=q1('SELECT file_path FROM illustrations WHERE id=?',(ident,))
                    if row and str(row['file_path']).startswith('illustrations/'):
                        (ROOT/row['file_path']).unlink(missing_ok=True)
                update(f"DELETE FROM {table} WHERE id=?",(ident,)); log(f"{kind} eliminado #{ident}"); json_response(self,{"ok":True,"state":local_state()}); return
            if parsed.path=="/api/backup":
                stamp=datetime.now().strftime("%Y-%m-%d_%H-%M-%S"); dest=BACKUPS/f"Senda_Backup_{stamp}.zip"; dest.parent.mkdir(exist_ok=True)
                with zipfile.ZipFile(dest,"w",zipfile.ZIP_DEFLATED) as z:
                    if DB.exists():
                        source=db_connect()
                        snap=sqlite3.connect(':memory:')
                        source.backup(snap)
                        with tempfile.NamedTemporaryFile(suffix='.db',delete=False) as f: tmp_db=f.name
                        dest_con=sqlite3.connect(tmp_db);snap.backup(dest_con);dest_con.close();snap.close();source.close()
                        z.write(tmp_db,"senda.sqlite3");os.unlink(tmp_db)
                    if SETTINGS_FILE.exists():
                        sanitized=get_settings()
                        for secret in ('api_bible_key','youversion_app_key','esv_api_key','pexels_api_key','unsplash_access_key'):
                            sanitized.pop(secret,None)
                        z.writestr('settings.json',json.dumps(sanitized,ensure_ascii=False,indent=2))
                    for cfg in (PROFILE_FILE,BOOK_COVERS_FILE):
                        if cfg.exists():z.write(cfg,str(cfg.relative_to(ROOT)))
                    for folder in (COVERS,BIBLES,ILLUSTRATIONS,COLLECTION_COVERS,PROFILE,ROOT/"book_covers"):
                        if folder.exists():
                            for p in folder.rglob("*"):
                                if p.is_file(): z.write(p,str(p.relative_to(ROOT)))
                log(f"Respaldo creado: {dest.name}"); json_response(self,{"ok":True,"file":str(dest),"name":dest.name}); return
            if parsed.path=="/api/content-export":
                zip_path=build_content_zip(); size=zip_path.stat().st_size
                self.send_response(200); self.send_header("Content-Type","application/zip"); self.send_header("Content-Disposition",f'attachment; filename="{zip_path.name}"'); self.send_header("Content-Length",str(size)); self.end_headers()
                with open(zip_path,'rb') as f: shutil.copyfileobj(f,self.wfile)
                log(f"Contenido exportado: {zip_path.name}"); shutil.rmtree(zip_path.parent,ignore_errors=True); return
            if parsed.path=="/api/content-import":
                state_after=restore_content_zip(_decode_data_url(data.get('zip_data','')))
                log('Contenido importado desde respaldo'); json_response(self,{"ok":True,"state":state_after}); return
            if parsed.path=="/api/refresh-site":
                json_response(self,sync_public_site()); return
            error(self,"Ruta POST no encontrada",404)
        except Exception as e: log(f"Error: {e}"); error(self,str(e),500)

def ensure_files():
    DATA.mkdir(exist_ok=True); BIBLES.mkdir(exist_ok=True); CONFIG.mkdir(exist_ok=True); COVERS.mkdir(exist_ok=True); BACKUPS.mkdir(exist_ok=True); ILLUSTRATIONS.mkdir(exist_ok=True); COLLECTION_COVERS.mkdir(exist_ok=True)
    if not SETTINGS_FILE.exists(): save_settings(DEFAULT_SETTINGS)
    else:
        existing=read_json(SETTINGS_FILE,{}) or {}
        if any(k in existing for k in ("api_bible_key","youversion_app_key","api_bible_version_map")):save_settings(existing)
    for i,b in enumerate(BOOKS,1):
        p=COVERS/f"{b['id']}.svg"
        if not p.exists():
            title=html.escape(b["es"])
            svg=f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
<rect width="600" height="800" rx="42" fill="#f2efe8"/>
<rect x="24" y="24" width="552" height="752" rx="32" fill="none" stroke="#c9c1b2" stroke-width="3"/>
<circle cx="300" cy="275" r="92" fill="#20252b"/>
<path d="M300 210v130M235 275h130" stroke="#fff" stroke-width="16" stroke-linecap="round"/>
<text x="300" y="455" text-anchor="middle" font-family="Georgia,serif" font-size="42" fill="#20252b">{title}</text>
<text x="300" y="510" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" letter-spacing="4" fill="#8b6f47">SENDA · {i:02d}</text>
</svg>"""
            p.write_text(svg,encoding="utf-8")

def main():
    ensure_files(); init_db(); repair_installed_bibles()
    try: sync_public_site()
    except Exception as exc: log('No fue posible preparar docs/: ' + str(exc))
    start_bible_install()
    log(f"Senda {VERSION} iniciando"); log(f"Base de datos: {'OK' if DB.exists() else 'ERROR'}")
    log(f"Libros: {len(BOOKS)} | Traducciones configuradas: {len(TRANSLATIONS)}"); log(f"Panel local: http://{HOST}:{PORT}")
    log(f"Vista previa del sitio: http://{HOST}:{PORT}/sitio/")
    server=ThreadingHTTPServer((HOST,PORT),Handler)
    if os.environ.get('SENDA_NO_BROWSER')!='1':
        threading.Timer(1.25,lambda:webbrowser.open(f'http://{HOST}:{PORT}')).start()
    try: server.serve_forever()
    except KeyboardInterrupt: log("Senda detenida")
    finally: server.server_close()

if __name__=="__main__": main()
