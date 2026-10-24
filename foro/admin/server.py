from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json, mimetypes, os, re, shutil, uuid
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
MAX_UPLOAD=30*1024*1024
DATA={'foros':'data/foros.json','posts':'data/posts.json','config':'data/config.json'}
class Handler(SimpleHTTPRequestHandler):
    def send_json(self,value,status=200):
        raw=json.dumps(value,ensure_ascii=False).encode('utf8');self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
    def do_GET(self):
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
                if group not in ('logos','foros','posts','avatares','fondos'):return self.send_json({'error':'Carpeta inválida'},400)
                filename=unquote(self.headers.get('X-Filename','archivo'))
                ext=Path(filename).suffix.lower()
                allowed={'.png','.jpg','.jpeg','.webp','.gif','.svg','.mp4','.webm','.avif'}
                if ext not in allowed:return self.send_json({'error':'Formato no permitido'},415)
                signatures={'.png':body.startswith(b'\x89PNG\r\n\x1a\n'),'.jpg':body.startswith(b'\xff\xd8'),'.jpeg':body.startswith(b'\xff\xd8'),'.gif':body[:3]==b'GIF','.webp':body[:4]==b'RIFF' and body[8:12]==b'WEBP','.mp4':b'ftyp' in body[:16],'.webm':body.startswith(b'\x1a\x45\xdf\xa3'),'.avif':b'ftypavif' in body[:24] or b'ftypavis' in body[:24],'.svg':b'<svg' in body[:1024]}
                if not signatures.get(ext):return self.send_json({'error':'Archivo no coincide con el formato'},415)
                if ext=='.svg':return self.send_json({'error':'SVG deshabilitado por seguridad. Usa PNG o WEBP.'},415)
                clean=re.sub('[^a-zA-Z0-9_-]+','-',Path(filename).stem).strip('-')[:45] or 'imagen'
                name=clean+'-'+uuid.uuid4().hex[:8]+ext
                target=ROOT/'assets'/group/name;target.write_bytes(body)
                return self.send_json({'ok':True,'path':f'assets/{group}/{name}'})
            return self.send_json({'error':'Ruta desconocida'},404)
        except (ValueError,json.JSONDecodeError) as e:self.send_json({'error':str(e)},400)
        except Exception as e:self.send_json({'error':str(e)},500)
if __name__=='__main__':
    import webbrowser
    print('Eltorga admin: http://127.0.0.1:8765/admin/')
    webbrowser.open('http://127.0.0.1:8765/admin/')
    ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
