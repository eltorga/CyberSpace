# Senda — Biblia de estudio v1.2.1 · GitHub Pages + administrador local

**Un único proyecto:** abres **`Senda.bat`** para editar en tu PC y GitHub Desktop detecta los cambios de la **misma carpeta** que ya utilizas como repositorio. No hay una función de «Exportar para GitHub»; **Exportar contenido** se conserva como copia de seguridad privada.

## Lo que es importante entender

- La web es estática (HTML, CSS, JavaScript y JSON) y GitHub Pages puede mostrarla sin instalar nada en su servidor.
- El administrador se ejecuta **solo en tu computadora** con Windows/Python mediante `Senda.bat`, no en GitHub Pages.
- Editar una nota, video o colección completa y válida inicia **autoguardado** después de ~1,5 segundos de inactividad. Las preferencias y los datos del perfil también se autoguardan. El editor gráfico conserva **Guardar imagen** para no generar archivos PNG grandes con cada movimiento. El resto de las acciones (añadir a favoritos, borrar, subir imagen, etc.) ya se guardan al confirmarse. No se autoguardan entradas incompletas o inválidas.
- Cada acción guardada se escribe en SQLite local y **se refleja inmediatamente en `docs/`**. El estado en la parte superior indica si está guardado o pendiente. El botón **Guardar cambios** queda como alternativa manual.
- El autoguardado **no hace commit ni push**: se mantiene tu flujo con GitHub Desktop.
- La web de GitHub Pages muestra el contenido publicado, y el administrador local abierto mediante **`Senda.bat`** es donde se edita y autoguarda. GitHub Pages no ejecuta servidores.

## Estructura

| Archivo/carpeta | Para qué sirve |
|---|---|
| **`index.html`** | Página pública de entrada si GitHub Pages publica la raíz `/` del repositorio. Carga la misma web situada en `docs/`. |
| **`docs/index.html`** | Página pública de entrada si GitHub Pages ya publica `/docs`. |
| **`docs/`** | **Único contenido del sitio público**: `styles.css`, `public.js`, `data/site.json`, portadas e imágenes. Generado automáticamente, sin exportaciones de publicación. |
| `Senda.bat` | Arranca el editor local en **http://127.0.0.1:8787**. |
| `server.py` y `app/` | Administrador local; no se ejecutan en GitHub Pages. |
| `data/senda.sqlite3` | Base de datos PRIVADA (excluida de Git mediante `.gitignore`). |
| `config/settings.json` | Preferencias y clave opcional privadas (excluidas de Git). |
| `backups/` | Copias ZIP privadas (no se sincronizan). |

## Actualizar tu web ya publicada desde GitHub Desktop

1. **Haz una copia completa de tu carpeta/repositorio actual**, incluyendo los archivos privados. Cierra el panel si está abierto.
2. Abre **GitHub Desktop** y selecciona tu repositorio local de Senda. Puedes ver su carpeta con **Repository → Show in Explorer**.
3. **Copia el contenido de la carpeta `Senda/` de este ZIP en la raíz de tu repositorio existente**, combinando carpetas y reemplazando los archivos del programa. **No borres `.git/`, `data/senda.sqlite3`, `data/bibles/`, `profile/`, `illustrations/`, `collection_covers/`, `book_covers/` ni tus archivos privados**. Si antes usabas una versión antigua, conserva esos datos de tu copia.
4. Instala Python 3.9+ si aún no lo tienes. Ejecuta **`Senda.bat`**. Deja abierta la consola del servidor mientras editas.
5. Administrador: **http://127.0.0.1:8787**. Previsualización pública: **http://127.0.0.1:8787/sitio/** (botón **Ver sitio**).
6. Crea/edita contenido normalmente. Observa **«Guardado automáticamente ✓»**. Si falta información esencial, termina el formulario o pulsa **Guardar**. Las modificaciones se generan dentro de `docs/`.
7. En **GitHub Desktop → Changes**, revisa los nuevos/actualizados archivos `docs/` y `index.html`; haz **Commit to main** y luego **Push origin**. GitHub Pages desplegará los cambios después. Nada se sube con solo guardar en el administrador.

## Ajustes de GitHub Pages

Puedes mantener la configuración que ya funciona:

- Si Pages usa **`main` → `/docs`**, abre `docs/index.html` como siempre. **No necesitas cambiar nada.**
- Si Pages usa **`main` → `/(root)`**, ahora existe **`index.html`** en la raíz, que carga la **misma web** usando los archivos de `docs/`.

La ruta a los recursos es relativa, así que sirve para `usuario.github.io/repositorio/` y dominios personalizados correctamente configurados. **No subas tu base SQLite ni contraseñas**. Con GitHub Desktop la regla `.gitignore` las excluye si no se habían registrado antes; si ya estuvieron versionadas, hay que retirarlas del seguimiento de Git por separado.

## Copias de seguridad e importación

En **Configuración → Exportar contenido** se descarga un ZIP para guardar fuera de tu repositorio. Contiene tus datos locales, Biblia descargadas, notas, imágenes y portadas, pero no incluye la clave privada de Unsplash. **Importar contenido** restaura un ZIP de respaldo válido; crea una copia previa cuando corresponde. No es una exportación para GitHub ni un sustituto de `Commit`/`Push`.

## Uso sin Internet / Biblias

El programa descarga inicialmente las siete traducciones de eBible.org autorizadas para publicación, si aún no están instaladas. **El ZIP del proyecto no incluye los textos bíblicos completos**: para verlos en GitHub Pages, deja terminar la instalación en el administrador y sincroniza los nuevos archivos `docs/data/bibles/`. Respeta las condiciones de licencia y créditos. Si la descarga aún no ha terminado, la web mostrará un aviso en el lector.

## Privacidad

Solo se publican los elementos permitidos por `public_export` y marcados como públicos. Las notas y colecciones privadas no se incluyen. **Revisa el contenido de `docs/data/site.json` y las fotografías antes de publicar**, porque todo lo enviado a GitHub Pages podrá ser leído por quien visite el sitio. El panel escucha solo en `127.0.0.1` y no expone tu base de datos al sitio público.

## Cambios v1.2.1

- Eliminados de la web pública el aviso superior de edición y el indicador inferior de modo de lectura. La navegación comienza directamente con la interfaz Senda.

- Entrada HTML desde la raíz compatible con GitHub Pages, sin duplicar los datos del sitio público.
- Puerto local **8787** para panel y previsualización pública.
- Autoguardado diferido para notas, videos, colecciones, preferencias y datos del perfil; las imágenes del editor se guardan con su botón por seguridad y rendimiento.
- Indicador visible de guardado, pendientes y errores.
- Corregido el botón de guardado general del panel anterior.
- Archivo público JSON no se vuelve a escribir si el contenido no ha cambiado.
- Conservados **Exportar contenido / Importar contenido** y GitHub Desktop como única acción de publicación remota.
