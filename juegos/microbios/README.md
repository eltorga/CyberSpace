# Microbios! — Juego web de cartas

Juego original de cartas de órganos y microbios, inspirado en la categoría de juegos de colección y sabotaje. **No es una reproducción oficial ni está afiliado a Tranjis Games ni a Virus!** Las ilustraciones son emoji del sistema, no arte oficial.

## Abrir localmente

Abre `index.html` en un navegador moderno. No requiere instalación, servidor, cuentas ni API.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub (por ejemplo `microbios-web`).
2. Sube `index.html`, `style.css` y `game.js` a la raíz del repositorio.
3. Abre Settings → Pages → Build and deployment → Deploy from a branch.
4. Selecciona la rama `main` y la carpeta `/ (root)`, y guarda.
5. Espera la publicación y abre la URL que muestra GitHub Pages.

## Controles

Elige una carta de tu mano. Pulsa **Jugar carta** y, si corresponde, selecciona el objetivo. Puedes **descartar una carta** para renovar tu mano. El objetivo es reunir cuatro órganos sanos de colores distintos.

## Configuración inicial

- 3 IA
- Dificultad Normal
- Música activada
- Efectos activados

## Alcance y limitaciones

- Incluye 1–3 IA con cuatro perfiles de selección de jugadas.
- Contiene cartas especiales propias (intercambio, trasplante, contagio).
- No incluye multijugador online ni guardado de partidas.
- La música se sintetiza mediante Web Audio API. El navegador puede bloquearla hasta la primera interacción.
- El tipo de órgano multicolor es una carta comodín con reglas simplificadas. La victoria se comprueba por cuatro órganos sanos; la regla de colores distintos está controlada al colocar y robar, pero los intercambios de cuerpos pueden generar combinaciones distintas.
- La adaptación no pretende reproducir íntegramente todas las reglas, cartas y excepciones de Virus! comercial.
