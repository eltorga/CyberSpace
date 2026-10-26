# Cambios de Senda v1.1.8.1

- Editor de imágenes: texto editable encima de la propia previsualización, saltos de línea manuales, posicionamiento con arrastre y controles horizontal/vertical.
- Los proyectos guardan el texto y las coordenadas; el PNG final incorpora el texto en su posición.
- Importación de contenido ZIP sin el antiguo límite de 6 MB del cargador de imágenes.
- Respaldo portátil: excluye credenciales privadas y puede restaurar SQLite, proyectos, portadas, perfil y Biblias instaladas.
- Conserva la v1.1.8: Línea de Tiempo alterna, nuevas vistas Notas/Favoritos, tarjetas, navegación al versículo, indicadores en el lector y menú reorganizado.

# Historial de Senda

## v1.1.7 · Línea de Tiempo y biblioteca organizada

- Nueva Línea de Tiempo personal y pública; portada, avatar y recorte visual.
- Nuevas páginas individuales para colecciones; cuadrícula de cuatro columnas y portadas altas.
- Migración conservadora para asignar contenido antiguo sin colección a «Importante / recordar».
- Parser USFM revisado y reparación automática de capítulos con restos de `|strong="..."`.
- Conservación de la traducción del versículo original en notas y nuevos videos, imágenes e ilustraciones.
- Selector único y obligatorio de colección en los formularios; editor HTML simplificado.
- Portadas manuales para libros bíblicos mediante botón flotante en Biblioteca.
- Ajuste de miniaturas de Unsplash, editor de recorte y paleta visual uniforme.
- Contadores: Notas, Videos, Imágenes y Favoritos.
- El ZIP público incluye perfil, Línea de Tiempo, portadas e información de colección, sin credenciales ni código administrativo.
- Mantiene las siete traducciones españolas libres o parciales configuradas en v1.1.6; se obtienen al instalar en Windows, no vienen embebidas en este ZIP.

## v1.1.8.2 · Mejoras de presentación y compresión local

- Galería, Inicio, Videos, Notas, Colecciones y Línea de Tiempo usan tarjetas de altura variable, con ojo flotante para ir al versículo.
- Unificado el estilo de notas con papel pastel y HTML enriquecido.
- Favoritos guardan texto y traducción del versículo (migración SQLite compatible) y se muestran sin duplicación visual.
- Corazones UIcons regulares/sólidos en lugar de caracteres Unicode.
- Selector «Ninguna» compacto.
- Contadores en el perfil y retrato ampliado.
- Indicadores de contenido exteriores al texto seleccionable.
- Fotografías manuales optimizadas en el navegador mediante WebP de alta calidad cuando la reducción de tamaño compensa; no se recomprimen respaldos importados.

## 1.2.1 — GitHub Pages, autoguardado e interfaz pública limpia
- Ocultados en la web pública el aviso «versión pública» y la etiqueta «Modo público / Solo lectura». El resto del sitio queda intacto.
- Se incluye `index.html` en la raíz para publicar desde `/(root)`, compartiendo la misma web de `docs/`.
- Se mantiene `Senda.bat` y su administrador local en puerto 8787.
- Autoguardado de notas, videos, colecciones, campos del perfil y preferencias con indicadores de estado.
- El editor gráfico conserva el botón Guardar imagen para evitar PNG repetidos; su guardado sincroniza automáticamente `docs/`.
- Corregido el botón general de guardar cambios; `site.json` no se reescribe sin variaciones de contenido.
- Importar/Exportar contenido como respaldo sigue disponible; no hay exportación para GitHub.
