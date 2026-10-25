"""Local-only additions for Eltorga administration. No GitHub token persisted."""
import json, re, uuid, urllib.request, urllib.error
from pathlib import Path

VALID_FOLDER = re.compile(r'^[\w\- ]{1,64}$',re.U)

def reply(handler, value, status=200):
    handler.send_json(value,status)

def media_list(root):
    base=root/'assets'
    folders=['General']
    media=base/'media'
    media.mkdir(parents=True,exist_ok=True)
    folders += sorted(d.name for d in media.iterdir() if d.is_dir() and not d.name.startswith('.'))
    resources=[]
    for f in base.rglob('*'):
        if not f.is_file() or f.name.startswith('.') or f.suffix.lower() not in ('.png','.jpg','.jpeg','.webp','.gif','.avif','.mp4','.webm'):
            continue
        resources.append({'path':f.relative_to(root).as_posix(),'name':f.name,'size':f.stat().st_size,'folder':f.parent.name if f.parent!=media else 'General'})
    return {'folders':folders,'files':sorted(resources,key=lambda x:x['path'])}

def valid_file(root,name):
    if not isinstance(name,str) or not name.startswith('assets/') or '\\' in name or '..' in Path(name).parts:
        raise ValueError('Ruta de multimedia inválida')
    path=(root/name).resolve()
    if not path.is_relative_to((root/'assets').resolve()) or not path.is_file():
        raise ValueError('No existe el archivo seleccionado')
    return path

def media_manage(root,payload):
    media=root/'assets'/'media';media.mkdir(parents=True,exist_ok=True)
    action=payload.get('action')
    if action=='create_folder':
        folder=str(payload.get('folder','')).strip()
        if not VALID_FOLDER.fullmatch(folder) or folder=='General':raise ValueError('Nombre de carpeta inválido')
        (media/folder).mkdir(exist_ok=True)
        return {'ok':True}
    if action=='copy':
        source=valid_file(root,payload.get('path'))
        folder=str(payload.get('folder','General')).strip()
        if folder!='General' and not VALID_FOLDER.fullmatch(folder):raise ValueError('Carpeta inválida')
        destdir=media if folder=='General' else media/folder
        if not destdir.is_dir():raise ValueError('Primero crea la carpeta')
        dest=destdir/source.name
        if dest.resolve()!=source and dest.exists():dest=destdir/(source.stem+'-'+uuid.uuid4().hex[:6]+source.suffix)
        if dest.resolve()!=source:
            import shutil;shutil.copy2(source,dest)
        return {'ok':True,'path':dest.relative_to(root).as_posix()}
    if action=='delete':
        file=valid_file(root,payload.get('path'))
        rel=file.relative_to(root).as_posix()
        for name in ('posts','foros','config'):
            data=(root/'data'/f'{name}.json').read_text('utf8')
            if rel in data:raise ValueError('Este archivo está referenciado en '+name+'. Quita la referencia antes de eliminarlo.')
        file.unlink()
        return {'ok':True}
    if action=='delete_folder':
        folder=str(payload.get('folder','')).strip()
        if not VALID_FOLDER.fullmatch(folder) or folder=='General':raise ValueError('Carpeta inválida')
        (media/folder).rmdir()  # only empty
        return {'ok':True}
    raise ValueError('Acción multimedia inválida')

def github_sync(root, token):
    if not token or len(token)>300 or any(ch.isspace() for ch in token):raise ValueError('Introduce un token GitHub de solo lectura')
    settings=json.loads((root/'data/config.json').read_text('utf8'))
    repo=settings.get('giscus',{}).get('repo','')
    if not re.fullmatch(r'[\w.-]+/[\w.-]+',repo):raise ValueError('Repositorio de Giscus inválido')
    owner,name=repo.split('/')
    posts=json.loads((root/'data/posts.json').read_text('utf8'))
    query='''query($owner:String!,$name:String!,$after:String){ repository(owner:$owner,name:$name){discussions(first:100,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor}nodes{title number url comments(last:20){totalCount nodes{bodyText createdAt url author{login avatarUrl}}}}}} }'''
    nodes=[];after=None
    for i in range(15):
        content=json.dumps({'query':query,'variables':{'owner':owner,'name':name,'after':after}}).encode()
        req=urllib.request.Request('https://api.github.com/graphql',data=content,headers={'Authorization':'Bearer '+token,'User-Agent':'Eltorga-LocalAdmin','Content-Type':'application/json','Accept':'application/vnd.github+json'})
        try:
            with urllib.request.urlopen(req,timeout=25) as result: response=json.load(result)
        except urllib.error.HTTPError as e:
            raise ValueError('GitHub respondió '+str(e.code)+'. Comprueba permisos, acceso y token.')
        if response.get('errors'):raise ValueError(str(response['errors'][0].get('message','Error GraphQL')))
        block=(response.get('data') or {}).get('repository')
        if not block:raise ValueError('No se encontró el repositorio o no tienes permisos')
        nodes.extend(block['discussions']['nodes'])
        page=block['discussions']['pageInfo'];after=page['endCursor']
        if not page['hasNextPage']:break
    cache={}; found=[]
    for p in posts:
        term='eltorga-'+str(p.get('ID',''))
        # Giscus title search is a contains-term match. Require unique matching by title.
        matches=[d for d in nodes if term in d['title']]
        if len(matches)!=1:continue
        d=matches[0];cs=d['comments']['nodes'];last=cs[-1] if cs else None
        item={'count':d['comments']['totalCount'],'url':d['url'],'discussionNumber':d['number'],'last':{'user':last['author']['login'] if last and last.get('author') else 'Usuario','avatar':last['author']['avatarUrl'] if last and last.get('author') else '', 'date':last['createdAt'],'url':last['url']} if last else None}
        item['recent']=[{'user':c['author']['login'] if c.get('author') else 'Usuario','avatar':c['author']['avatarUrl'] if c.get('author') else '', 'date':c['createdAt'],'url':c['url'],'text':str(c.get('bodyText',''))[:600]} for c in cs];cache[p['ID']]=item;found.append({'title':p.get('TITULO',''),'postId':p['ID'],**item})
    (root/'data/comments.json').write_text(json.dumps(cache,ensure_ascii=False,indent=2),encoding='utf8')
    return {'ok':True,'matched':len(found),'discussions_scanned':len(nodes),'posts_total':len(posts),'comments':found}

# v0.2.4: explorador con carpetas anidadas y referencias seguras.
import shutil

def _folder_path(root, folder):
    if not isinstance(folder,str): raise ValueError('Carpeta inválida')
    if folder in ('', '/', 'General'): folder=''
    folder=folder.strip('/')
    chunks=folder.split('/') if folder else []
    if any(not VALID_FOLDER.fullmatch(c) or c in ('.','..') for c in chunks) or len(chunks)>6:
        raise ValueError('Carpeta inválida. Máximo 6 niveles.')
    base=(root/'assets/media').resolve()
    target=base.joinpath(*chunks).resolve()
    if not target.is_relative_to(base):raise ValueError('Carpeta fuera de la biblioteca')
    return target

def _refs(root, rel):
    results=[]
    def scan(value,key,label):
        if isinstance(value,str):
            if rel in value:results.append(label+(' · '+key if key else ''))
        elif isinstance(value,dict):
            for k,v in value.items():scan(v,str(k),label)
        elif isinstance(value,list):
            for i,v in enumerate(value):scan(v,key+'['+str(i)+']',label)
    for name in ('posts','foros','config'):
        filename=root/'data'/f'{name}.json'
        if not filename.is_file():continue
        data=json.loads(filename.read_text('utf8'))
        if name=='posts':
            for p in data:
                scan(p,'','Publicación: '+str(p.get('TITULO','Sin título')))
        elif name=='foros':
            for r in data:
                scan(r,'','Estructura: '+ ' / '.join(str(r.get(k,'')) for k in ('SECCION','FORO','SUBFORO') if r.get(k)))
        else:scan(data,'','Configuración del sitio')
    return list(dict.fromkeys(results))

def media_list(root):
    base=(root/'assets/media');base.mkdir(parents=True,exist_ok=True)
    folders=['']+sorted(p.relative_to(base).as_posix() for p in base.rglob('*') if p.is_dir())
    files=[]
    for f in (root/'assets').rglob('*'):
        if f.is_file() and not f.name.startswith('.') and f.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.gif','.avif','.mp4','.webm'):
            rel=f.relative_to(root).as_posix()
            loc=f.parent.relative_to(base).as_posix() if f.is_relative_to(base) else ''
            if loc=='.':loc=''
            files.append({'path':rel,'name':f.name,'size':f.stat().st_size,'folder':loc,'legacy':not f.is_relative_to(base),'references':_refs(root,rel)})
    return {'folders':folders,'files':sorted(files,key=lambda f:f['path'])}

def media_manage(root,payload):
    action=payload.get('action');media=root/'assets/media';media.mkdir(parents=True,exist_ok=True)
    if action=='references':
        f=valid_file(root,payload.get('path'))
        return {'references':_refs(root,f.relative_to(root).as_posix())}
    if action=='create_folder':
        folder=_folder_path(root,payload.get('folder',''))
        if folder==media.resolve():raise ValueError('Indica el nombre de la carpeta')
        folder.mkdir(parents=True,exist_ok=True)
        return {'ok':True}
    if action=='delete_folder':
        folder=_folder_path(root,payload.get('folder',''))
        if folder==media.resolve():raise ValueError('No puedes eliminar la carpeta raíz')
        folder.rmdir();return {'ok':True}
    if action in ('move','copy'):
        original=valid_file(root,payload.get('path'))
        target=_folder_path(root,payload.get('folder',''))
        if not target.is_dir():raise ValueError('La carpeta no existe')
        new=target/original.name
        if new.resolve()==original.resolve():return {'ok':True,'path':original.relative_to(root).as_posix()}
        if new.exists():new=target/(original.stem+'-'+uuid.uuid4().hex[:6]+original.suffix)
        rel=original.relative_to(root).as_posix();newrel=new.relative_to(root).as_posix()
        refs=_refs(root,rel)
        if action=='copy':shutil.copy2(original,new)
        else:
            # Prepare every JSON before touching files; references remain consistent.
            changes={}
            for name in ('posts','foros','config'):
                p=root/'data'/f'{name}.json'
                if p.exists():
                    raw=p.read_text('utf8')
                    if rel in raw:
                        data=json.loads(raw)
                        def replace(v):
                            if isinstance(v,str):return v.replace(rel,newrel)
                            if isinstance(v,list):return [replace(x) for x in v]
                            if isinstance(v,dict):return {k:replace(x) for k,x in v.items()}
                            return v
                        changes[p]=json.dumps(replace(data),ensure_ascii=False,indent=2)
            shutil.copy2(original,new)
            for p,contents in changes.items():
                tmp=p.with_suffix('.tmp');tmp.write_text(contents,'utf8');tmp.replace(p)
            original.unlink()
        return {'ok':True,'path':newrel,'references_updated':len(refs) if action=='move' else 0}
    if action=='delete':
        original=valid_file(root,payload.get('path'))
        refs=_refs(root,original.relative_to(root).as_posix())
        if refs:return {'ok':False,'error':'La imagen todavía se utiliza en:', 'references':refs}
        original.unlink();return {'ok':True}
    raise ValueError('Acción multimedia inválida')
