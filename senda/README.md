# Senda — Biblia de estudio v1.2.0 | un solo proyecto para GitHub Pages

Senda conserva el panel de administración local y la web pública **en un único proyecto**. Ya no existe "Exportar a GitHub": el sitio dentro de `docs/` se actualiza automáticamente cuando editas y guardas. **Exportar contenido** e **Importar contenido** siguen funcionando para tus respaldos.

## Carpetas importantes

| Ubicación | Función | ¿Se publica en GitHub Pages? |
| --- | --- | --- |
| `docs/` | **Sitio web público**, HTML, CSS, JS, contenido y Biblias autorizadas | Sí, esta es la web |
| `Senda.bat` | Arranca el administrador en Windows | No se ejecuta en GitHub |
| `app/` y `server.py` | Código fuente y administrador local | No se ejecutan en GitHub Pages |
| `data/senda.sqlite3` | Notas y datos privados del editor | **Nunca** (ignorado por Git) |
| `data/bibles/` | Biblias locales descargadas | No: se copian sólo ediciones públicas a `docs/data/bibles/` |
| `config/settings.json` | Preferencias y clave opcional de Unsplash | **Nunca** (ignorado por Git) |
| `backups/` | Respaldos locales | **Nunca** (ignorado por Git) |

## Instalación en Windows

1. Extrae todo el ZIP en una carpeta, por ejemplo `Documentos\Senda`.
2. Instala **Python 3.9 o posterior** y ejecuta `Senda.bat`.
3. Panel: <http://127.0.0.1:8765>. Previsualización pública: <http://127.0.0.1:8765/sitio/> o el botón **Ver sitio**.
4. Senda descarga en segundo plano las siete traducciones abiertas de eBible.org que falten. La primera vez necesitas Internet. En Configuración puedes ver su estado y reintentar.
5. Los cambios (notas, videos, colecciones, imágenes, perfil, favoritos y preferencias) se guardan en la base local y **actualizan `docs/`**. También existe **Configuración → Actualizar sitio** si necesitas regenerarlo manualmente. Los archivos públicos se crean aunque todavía no haya ninguna Biblia instalada; en ese caso el lector mostrará un aviso hasta que finalice la instalación.

## Publicar en GitHub, una sola vez

1. Crea un **repositorio GitHub** (puede ser público para usar GitHub Pages en planes gratuitos).
2. Sube esta carpeta como repositorio mediante **GitHub Desktop** (File → Add local repository / Create repository here) y publica/`push` al repositorio remoto. **No uses la opción de exportación**: aquí no existe.
3. En GitHub abre **Settings → Pages → Build and deployment**. Elige **Deploy from a branch**, rama `main`, carpeta **`/docs`**. Guarda.
4. GitHub Pages publicará `https://USUARIO.github.io/REPOSITORIO/` (o tu propio dominio). Si el repositorio se llama `USUARIO.github.io`, queda `https://USUARIO.github.io/`.
5. Para actualizar: usa el panel local normalmente, verifica **Ver sitio**, después en GitHub Desktop revisa los archivos cambiados, haz **Commit** y pulsa **Push origin**. Cuando Pages despliegue el commit aparecerán los cambios. No hace falta generar ni subir otro ZIP por publicación.

**Importante:** Guardar no sube ni publica automáticamente cambios a GitHub. El código no almacena tokens GitHub ni realiza pushes sin permiso. GitHub Pages **no puede ejecutar** Python ni SQLite: tu administrador funciona sólo en Windows y no hay panel administrativo accesible desde el sitio público.

### Protección de datos

- Solamente se copia a `docs/` la información habilitada en la configuración pública y marcada como pública (se excluyen notas, videos, imágenes o colecciones marcadas privadas y el material de sus colecciones privadas). La publicación **es visible para cualquiera con acceso al sitio**: revisa qué quieres compartir antes de hacer push.
- **No subas el ZIP íntegro arrastrándolo al editor de archivos de GitHub.** El `.gitignore` se aplica a Git/GitHub Desktop, pero el cargador web de GitHub no garantiza que respete los archivos ignorados. Usa GitHub Desktop o Git desde la carpeta raíz.
- `docs/` se genera automáticamente y puede contener fotografías y contenido personal **que sí elegiste publicar**. Verifica antes de cada commit.
- Los archivos `docs/data/bibles/` se toman exclusivamente de traducciones que el proyecto marca como redistribuibles; respeta las licencias y créditos correspondientes (en `docs/data/site.json`). La primera descarga se realiza desde eBible.org.
- GitHub no es un respaldo de tu SQLite privado. **Configuración → Exportar contenido** descarga ZIP completo para recuperar el progreso; **Importar contenido** lo restaura (con respaldo preventivo). No se incluyen claves API en el ZIP.

## Actualizar desde Senda 1.1.8.2

1. Cierra el Senda anterior y conserva una copia de su carpeta.
2. Extrae esta versión en una carpeta nueva.
3. Copia tu antiguo `data/senda.sqlite3` y `data/bibles/`, además de `config/settings.json`, `config/profile.json`, `config/book_covers.json`, `profile/`, `illustrations/`, `collection_covers/`, `book_covers/` cuando existan. O importa el ZIP **Exportar contenido** de tu versión anterior desde Configuración.
4. Abre `Senda.bat`. Las migraciones de base de datos se aplican sin borrar tus notas y `docs/` se crea o actualiza.
5. Comprueba la previsualización pública antes de sincronizar con GitHub.

## Detalles

- Sin dependencias adicionales de Python; servidor basado en biblioteca estándar, enlazado a **127.0.0.1**.
- Las imágenes creadas por el editor se guardan en `docs/assets/images/` para evitar JSON enormes; al abrirse en GitHub Pages funcionan como antes.
- Los archivos públicos antiguos sin referencia se limpian al regenerar para que no permanezcan imágenes eliminadas.
- Los elementos editables, notificaciones, importación/exportación de contenido, biblioteca, lector, comparador, notas, favoritos, colecciones, editor de imágenes, videos y Línea de Tiempo siguen disponibles.
