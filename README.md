# Dreamy Sprout Farm · La Torre del Erudito

Juego de granja top-down en HTML5 canvas donde **el estudio es el motor del avance**:
tu `world.json` (generado desde el vault de Obsidian) se convierte en mazmorras, y el
maná que ganas estudiando es lo único que permite hacer crecer la granja.

## Cómo jugar

```bash
cd ~/Documents/dreamyland-game && python3 -m http.server 8765
```

Y abrir http://localhost:8765 — **tiene que servirse por http://**, no con doble clic,
porque el juego lee `world.json` con `fetch`.

| Tecla | Acción |
|---|---|
| WASD / flechas | Moverte |
| Shift | Correr |
| 1-5 | Elegir objeto del hotbar |
| Espacio | Usar el objeto en la casilla marcada |
| E | Interactuar (torre, cofre, mercado, puerta, animales) |
| Esc | Cerrar cualquier panel |

**Móvil:** joystick abajo a la izquierda + botones ✋ (usar) / 🤝 (interactuar) abajo a la
derecha — aparecen solos en pantallas táctiles, no hace falta configurar nada.

### El bucle

```
Estudias en la 🗼 Torre        →  XP · oro · ✨ maná
      ↓
Arar (1 ✨) · Plantar (3 ✨)   →  la granja consume maná
      ↓
Sin maná no puedes sembrar    →  vuelves a estudiar
```

Regeneración pasiva: +1 ✨ cada 15 min. El maná máximo sube con tu nivel (20 + 5 por nivel).

**Granja:** ara → planta → riega (la regadera se recarga en cualquier orilla) → duerme en
la puerta de la casa → los cultivos **regados** suben una etapa → cosecha → vende en el cofre.
Vacas y gallinas dan leche y huevos una vez por día; el destello indica que tienen algo.

**Torre del Erudito** (tecla E frente a la torre, o el botón 🗼 del HUD):

- **Mazmorras** — un libro = una mazmorra. Salas secuenciales con 3 corazones; fallar quita
  un corazón, acertar daña al monstruo. Al limpiar todas las salas se abre el jefe.
  Perder no borra el progreso de las salas ya limpiadas.
- **Desafío de enlaces** — minijuego que aparece dentro del combate: unes 3 conceptos con sus
  definiciones (sacados de las `cartas` del mismo libro). Sin errores = golpe limpio.
- **Grimorio** — flashcards con Leitner (cajas de 0 a 5, intervalos 0/1/2/4/7/15 días).
  La *misión de refuerzo* ordena primero tus 8 puntos más fallados.
- **Repaso** — 10 preguntas al azar de todos los libros, sin repetir en el mismo día.
- **Progreso** — nivel `√(XP/50)+1`, título, racha 🔥 (con escudo 🛡 cada 5 días),
  meta diaria 🎯 de 10 acciones y mapa de dominio por libro.

Mazmorras con todas las salas + jefe pasan a **Archivo** (Dominio completo) y sus preguntas
solo reaparecen en el repaso.

**Mercado** (botón 🐔 del HUD, o tecla E junto al gallinero): compra gallinas (180🪙, dan 1 huevo/día)
y vacas (450🪙, dan 1 leche/día) con el oro que ganas estudiando o vendiendo cosechas. Cada corral
tiene un tope (10 gallinas / 6 vacas) para que siga siendo manejable.

**Nube** (botón ☁ del HUD): guarda y carga tu progreso en Firebase con un código corto, para
seguir la misma partida en otro dispositivo. Sin configurar Firebase el juego funciona igual,
solo que guarda nada más en este navegador — ver [GUIA-DESPLIEGUE.md](GUIA-DESPLIEGUE.md).

## Contenido: `world.json`

El juego lee `world.json` de la raíz — el mismo formato que genera tu pipeline
(`build-world.mjs`: vault → Gemini → world.json). Para actualizar el contenido basta con
**sobrescribir ese archivo**; no hay que tocar el código.

El progreso se guarda **por id**, así que al regenerar:

- las salas limpiadas y los jefes vencidos se conservan (`mazmorras[].id`, `salas[].id`);
- las cajas de Leitner se conservan por `cartas[].id`;
- los libros y cartas nuevos aparecen desde cero y el juego avisa *"¡Contenido nuevo!"*
  cuando cambia `version`.

### Mazmorras agregadas a mano: `world-custom.json`

`world.json` lo **regenera el pipeline desde cero** en cada corrida, así que cualquier
mazmorra que agregues ahí a mano se perdería en la próxima actualización del vault.

Para contenido que quieres que sobreviva a eso (ej. un repaso de examen que no viene de un
libro del vault), agrégalo a **`world-custom.json`** en vez de `world.json` — mismo formato,
solo el array `mazmorras` (y opcionalmente `cartas`). El juego siempre fusiona ambos archivos
al cargar (`Study.mergeCustomContent()` en `src/study.js`), así que:

- el pipeline puede regenerar `world.json` las veces que quiera sin tocar `world-custom.json`;
- si por accidente un `id` se repite entre los dos archivos, gana `world.json` y el duplicado
  de `world-custom.json` se ignora (con aviso en consola);
- el progreso de estas mazmorras se guarda igual, por id, como cualquier otra.

Sprites de monstruos: el campo `sprite` se mapea a emoji
(`ghost cultist golem eye snake imp bat slime lich wolf`) en `MONSTER_EMOJI` de
[src/study.js](src/study.js).

## Guardado

`localStorage` (clave `dreamy-sprout-farm-v1`), autoguardado cada 20 s, al dormir y al cerrar.
Guarda granja + progreso de estudio. Para empezar de cero:
`localStorage.removeItem('dreamy-sprout-farm-v1')` en la consola.

Para tener el mismo progreso en el celular y la laptop, o para no perderlo si borras el
navegador, sincroniza con Firebase (botón ☁, sin costo en el tier gratis) — instrucciones
completas, con todos los comandos, en **[GUIA-DESPLIEGUE.md](GUIA-DESPLIEGUE.md)**.

## Publicar el juego

El juego es 100% estático (HTML/CSS/JS + `world.json`), así que vive perfecto en GitHub Pages.
Ver **[GUIA-DESPLIEGUE.md](GUIA-DESPLIEGUE.md)** para subirlo a GitHub, activar Pages y
conectar Firebase paso a paso, con los comandos exactos.

## Estructura

```
index.html            página + HUD (DOM, se mantiene nítido) + controles táctiles
style.css
world.json            contenido de estudio — lo regenera tu pipeline de Obsidian
world-custom.json     mazmorras agregadas a mano (ej. repasos de examen) — el pipeline NO la toca
src/assets.js         carga de sheets + atlas de regiones nombradas
src/world.js          generación del mapa, autotiling y capa estática pre-renderizada
src/study.js          La Torre del Erudito: mazmorras, combate, grimorio, repaso, niveles
src/market.js         mercado de animales (comprar gallinas/vacas con oro)
src/save.js           persistencia en localStorage
src/firebase-config.js credenciales del proyecto Firebase (públicas, no secretas)
src/cloud.js           sincronización manual con Firestore por código corto
src/game.js            bucle, jugador, animales, cultivos, maná, día/noche, HUD, joystick táctil
tools/bake.py          compone sprites derivados desde el pack original
assets/sprites/        sheets recortados y sprites horneados (sí se publican)
assets/sprout-lands/   pack original sin tocar (NO se publica, ver .gitignore)
firestore.rules         reglas de seguridad de Firestore
firebase.json           config del Firebase CLI (solo Firestore, sin Hosting)
GUIA-DESPLIEGUE.md      cómo subir esto a GitHub Pages + conectar Firebase
```

### Decisiones técnicas

- **Autotiling nine-slice**: los tilesets de césped y tierra del pack traen un set 3×3 + tiras.
  `nineSlice()` elige la pieza según los 4 vecinos, así los lagos y caminos tienen bordes redondeados.
- **Capa estática pre-renderizada**: césped y caminos se dibujan una sola vez en un canvas del
  tamaño del mundo (1440×1024) y cada frame se hace blit solo del rectángulo visible.
- **Agua animada por patrón**: se rellena el viewport con un `CanvasPattern` alineado a coordenadas
  de mundo y la capa estática se dibuja encima; el agua asoma por los huecos alfa de los bordes.
- **Y-sorting**: props, animales y jugador se ordenan por la Y de su base, así se camina por detrás
  de los árboles y la casa.
- **Sprites horneados**: el pack entrega la casa como piezas de tileset. `tools/bake.py` la compone
  (tejado + muro ensanchado con la ventana centrada + puerta + chimenea) y genera las texturas de
  tierra arada y regada. Ejecutar `python3 tools/bake.py` si se quieren cambiar.

## Créditos

Assets — From: **Sprout Lands** — By: **Cup Nooble**.
Uso no comercial. El pack no se puede redistribuir por separado.
La composición visual toma como referencia el estilo de *Little Dreamyland* (Starmixu).
