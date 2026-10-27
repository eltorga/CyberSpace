from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json, mimetypes, os, re, shutil, uuid, io, zipfile, datetime, tempfile
from server_upgrade import media_list,media_manage,github_sync
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
MAX_UPLOAD=1024*1024*1024
DATA={'foros':'data/foros.json','posts':'data/posts.json','config':'data/config.json'}
class Handler(SimpleHTTPRequestHandler):
    def send_json(self,value,status=200):
        raw=json.dumps(value,ensure_ascii=False).encode('utf8');self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if urlsplit(self.path).path=='/api/media':
            return self.send_json(media_list(ROOT))
        if urlsplit(self.path).path=='/api/comments':
            file=ROOT/'data/comments.json'
            return self.send_json(json.loads(file.read_text('utf8')) if file.is_file() else {})
        if urlsplit(self.path).path=='/api/backup':
            output=io.BytesIO()
            with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
                for dirname in ('data','assets','css','js','admin'):
                    for f in (ROOT/dirname).rglob('*'):
                        if f.is_file():z.write(f,f.relative_to(ROOT).as_posix())
                for name in ('index.html','descarga.html','404.html','ADMIN.bat','LEEME.txt'):
                    if (ROOT/name).is_file():z.write(ROOT/name,name)
            raw=output.getvalue();self.send_response(200);self.send_header('Content-Type','application/zip');self.send_header('Content-Disposition','attachment; filename="eltorga-respaldo.zip"');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
        if urlsplit(self.path).path=='/admin':self.send_response(302);self.send_header('Location','/admin/');self.end_headers();return
        if urlsplit(self.path).path.startswith('/api/'):
            key=urlsplit(self.path).path.split('/')[-1]
            if key in DATA:
                try:self.send_json(json.loads((ROOT/DATA[key]).read_text(encoding='utf8')))
                except Exception as e:self.send_json({'error':str(e)},500)
                return
        super().do_GET()
    def do_POST(self):
        path=urlsplit(self.path).path
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<1 or length>MAX_UPLOAD: return self.send_json({'error':'Tamaño inválido o demasiado grande'},413)
            body=self.rfile.read(length)
            if path=='/api/github/sync':
                auth=self.headers.get('X-Github-Token','')
                return self.send_json(github_sync(ROOT,auth))
            if path=='/api/media/manage':
                return self.send_json(media_manage(ROOT,json.loads(body)))
            if path=='/api/restore':
                # Restaura el CONTENIDO editable de un respaldo completo, nunca el programa
                # o los permisos de Supabase. Sustituye data/ y assets/ en lugar de combinar.
                if not zipfile.is_zipfile(io.BytesIO(body)):
                    raise ValueError('El archivo seleccionado no es un ZIP válido')
                with zipfile.ZipFile(io.BytesIO(body)) as archive:
                    infos=[x for x in archive.infolist() if not x.is_dir()]
                    if len(infos)>10000 or sum(x.file_size for x in infos)>1024*1024*1024:
                        raise ValueError('Respaldo demasiado grande')
                    allowed_contents=[]
                    for info in infos:
                        name=info.filename
                        if name.startswith('/') or '\\' in name or '..' in Path(name).parts:
                            raise ValueError('Ruta peligrosa dentro del respaldo')
                        if name.startswith(('data/','assets/')):
                            allowed_contents.append(info)
                    names={x.filename for x in allowed_contents}
                    for required in DATA.values():
                        if required not in names:raise ValueError('Falta '+required)
                        data=json.loads(archive.read(required))
                        if not isinstance(data,dict if required.endswith('config.json') else list):
                            raise ValueError('JSON inválido en '+required)
                    for info in allowed_contents:
                        if info.filename.startswith('assets/'):
                            if Path(info.filename).name != '.gitkeep' and Path(info.filename).suffix.lower() not in {'.png','.jpg','.jpeg','.webp','.gif','.mp4','.webm','.avif','.svg','.ico','.woff2','.woff','.ttf','.json','.gitkeep'}:
                                raise ValueError('Formato de archivo multimedia no permitido: '+info.filename)
                    # Se guarda una copia automática antes de modificar ningún archivo.
                    snapshots=ROOT/'backups';snapshots.mkdir(exist_ok=True)
                    stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
                    snapshot=snapshots/('antes-de-restaurar-'+stamp+'-'+uuid.uuid4().hex[:4]+'.zip')
                    with zipfile.ZipFile(snapshot,'w',zipfile.ZIP_DEFLATED) as old:
                        for folder in ('data','assets'):
                            if (ROOT/folder).exists():
                                for f in (ROOT/folder).rglob('*'):
                                    if f.is_file():old.write(f,f.relative_to(ROOT).as_posix())
                    with tempfile.TemporaryDirectory(prefix='.eltorga-restauracion-',dir=ROOT) as temp:
                        stage=Path(temp)/'nuevo';stage.mkdir()
                        for info in allowed_contents:
                            dest=stage/info.filename
                            dest.parent.mkdir(parents=True,exist_ok=True)
                            # Descomprimir solo datos + multimedia; nunca ejecutar archivos ZIP.
                            dest.write_bytes(archive.read(info))
                        (stage/'data').mkdir(exist_ok=True)
                        (stage/'assets').mkdir(exist_ok=True)
                        old_dir=Path(temp)/'anterior';old_dir.mkdir()
                        committed=[]
                        try:
                            for folder in ('data','assets'):
                                original=ROOT/folder
                                if original.exists():original.rename(old_dir/folder)
                                (stage/folder).rename(original)
                                committed.append(folder)
                        except Exception:
                            for folder in reversed(committed):
                                if (ROOT/folder).exists():shutil.rmtree(ROOT/folder)
                            for folder in ('data','assets'):
                                if (old_dir/folder).exists() and not (ROOT/folder).exists():
                                    (old_dir/folder).rename(ROOT/folder)
                            raise
                return self.send_json({'ok':True,'pre_restore_backup':str(snapshot.relative_to(ROOT)),'replaced':['data','assets'],'note':'El programa y las tablas de Supabase no se modificaron'})
            if path.startswith('/api/save/'):
                key=path.rsplit('/',1)[-1]
                if key not in DATA:return self.send_json({'error':'Recurso inválido'},404)
                data=json.loads(body)
                if key in ('posts','foros') and (not isinstance(data,list) or any(not isinstance(x,dict) for x in data)):raise ValueError('Se esperaba una lista')
                if key=='config' and not isinstance(data,dict):raise ValueError('Se esperaba un objeto')
                if key=='posts':
                    seen=set()
                    for p in data:
                        p.setdefault('ID','post-'+uuid.uuid4().hex[:12])
                        if p['ID'] in seen:raise ValueError('IDs de publicaciones repetidos')
                        seen.add(p['ID'])
                dest=ROOT/DATA[key];temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8');temp.replace(dest)
                return self.send_json({'ok':True})
            if path.startswith('/api/upload/'):
                group=path.rsplit('/',1)[-1]
                if group not in ('logos','foros','posts','avatares','fondos','media'):return self.send_json({'error':'Carpeta inválida'},400)
                filename=unquote(self.headers.get('X-Filename','archivo'))
                ext=Path(filename).suffix.lower()
                allowed={'.png','.jpg','.jpeg','.webp','.gif','.svg','.mp4','.webm','.avif'}
                if ext not in allowed:return self.send_json({'error':'Formato no permitido'},415)
                signatures={'.png':body.startswith(b'\x89PNG\r\n\x1a\n'),'.jpg':body.startswith(b'\xff\xd8'),'.jpeg':body.startswith(b'\xff\xd8'),'.gif':body[:3]==b'GIF','.webp':body[:4]==b'RIFF' and body[8:12]==b'WEBP','.mp4':b'ftyp' in body[:16],'.webm':body.startswith(b'\x1a\x45\xdf\xa3'),'.avif':b'ftypavif' in body[:24] or b'ftypavis' in body[:24],'.svg':b'<svg' in body[:1024]}
                if not signatures.get(ext):return self.send_json({'error':'Archivo no coincide con el formato'},415)
                if ext=='.svg':return self.send_json({'error':'SVG deshabilitado por seguridad. Usa PNG o WEBP.'},415)
                clean=re.sub('[^a-zA-Z0-9_-]+','-',Path(filename).stem).strip('-')[:45] or 'imagen'
                name=clean+'-'+uuid.uuid4().hex[:8]+ext
                # Las carpetas de recursos pueden no existir después de descomprimir
                # un ZIP que no guardaba directorios vacíos. Crear siempre el destino.
                target=ROOT/'assets'/'media'/name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(body)
                return self.send_json({'ok':True,'path':f'assets/media/{name}'})
            return self.send_json({'error':'Ruta desconocida'},404)
        except (ValueError,json.JSONDecodeError) as e:self.send_json({'error':str(e)},400)
        except Exception as e:self.send_json({'error':str(e)},500)
if __name__=='__main__':
    import webbrowser
    print('Eltorga admin: http://127.0.0.1:8765/admin/')
    webbrowser.open('http://127.0.0.1:8765/admin/')
    ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
