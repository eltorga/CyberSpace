from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parent.parent
DEST=ROOT/'PARA_GITHUB'
DEST.mkdir(exist_ok=True)
for name in ('index.html','descarga.html'):
    shutil.copy2(ROOT/name,DEST/name)
for dirname in ('assets','data','js'):
    src=ROOT/dirname;dst=DEST/dirname
    if dst.exists():shutil.rmtree(dst)
    if src.is_dir():shutil.copytree(src,dst)
(DEST/'.nojekyll').write_text('')
print('Listo:',DEST)
print('Sube el CONTENIDO de esta carpeta al repositorio o carpeta configurada para GitHub Pages.')
