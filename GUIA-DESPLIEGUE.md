# Guía de despliegue — GitHub Pages + Firebase

Esta guía cubre, en orden, todo lo necesario para:

1. Subir **Dreamy Sprout Farm** a GitHub.
2. Publicarlo gratis en **GitHub Pages** (así lo juegas desde el celular sin instalar nada).
3. Crear un proyecto de **Firebase** y conectarlo para que tu progreso se sincronice entre
   dispositivos con el botón ☁ del juego.

Todo son comandos de terminal — cópialos y pégalos tal cual, cambiando solo lo que se indica
entre `<ángulos>`.

---

## 0. Requisitos (una sola vez)

```bash
# git ya lo tienes (macOS lo trae). Verifica:
git --version

# GitHub CLI — para crear el repo y activar Pages sin salir de la terminal
brew install gh
gh auth login          # sigue el flujo interactivo (elige GitHub.com → HTTPS → abrir navegador)

# Firebase CLI — para crear el proyecto y publicar las reglas de Firestore
npm install -g firebase-tools
firebase login         # abre el navegador para iniciar sesión con tu cuenta de Google
```

Confirma que ambos quedaron listos:

```bash
gh auth status
firebase projects:list
```

---

## 1. Subir el proyecto a GitHub

```bash
cd ~/Documents/dreamyland-game

git init
git add .
git commit -m "Dreamy Sprout Farm: granja + Torre del Erudito"

# crea el repo en tu cuenta de GitHub y lo deja como "origin", todo en un paso
gh repo create dreamy-sprout-farm --public --source=. --remote=origin --push
```

- Usa `--private` en vez de `--public` si no quieres que se vea el código (GitHub Pages
  funciona igual con repos privados si tienes plan Pro; con cuenta gratis tiene que ser público
  para que Pages sea gratis).
- Si el nombre `dreamy-sprout-farm` ya existe en tu cuenta, cambia `--public` por otro nombre,
  ej. `dreamy-sprout-farm-hugo`.

El `.gitignore` ya excluye `assets/sprout-lands/` (el pack original de Sprout Lands) porque su
licencia no permite redistribuir el pack completo — solo los sprites ya usados/compuestos en
`assets/sprites/`, que sí se suben y sí puedes redistribuir dentro de tu juego (con crédito,
que ya está en el footer).

---

## 2. Activar GitHub Pages

**Opción rápida (CLI):**

```bash
gh api -X POST repos/:owner/:repo/pages -f "source[branch]=main" -f "source[path]=/"
```

**Si eso falla** (a veces la API de Pages es quisquillosa recién creado el repo), hazlo desde
la web — tarda 30 segundos:

1. Abre `https://github.com/<tu-usuario>/dreamy-sprout-farm/settings/pages`
2. En **Build and deployment → Source**, elige **Deploy from a branch**.
3. En **Branch**, elige **main** y carpeta **/ (root)**. Guardar.

A los 1-2 minutos tu juego queda publicado en:

```
https://<tu-usuario>.github.io/dreamy-sprout-farm/
```

Puedes verificar cuándo terminó el despliegue con:

```bash
gh api repos/:owner/:repo/pages/builds/latest -q .status
```

### Actualizar el juego más adelante

Cada vez que cambies código, sprites o `world.json`:

```bash
cd ~/Documents/dreamyland-game
git add .
git commit -m "describe aquí el cambio"
git push
```

GitHub Pages se re-publica solo en 1-2 minutos.

---

## 3. Crear el proyecto de Firebase

```bash
# el id debe ser único en todo Firebase — si está tomado, prueba otra variante
firebase projects:create dreamy-sprout-farm --display-name "Dreamy Sprout Farm"
```

Si prefieres hacerlo desde la web: `https://console.firebase.google.com` → **Crear proyecto**
→ nómbralo → puedes desactivar Google Analytics (no lo usamos).

### Crear la base de datos Firestore

La forma más confiable es la consola (la creación de la base pide elegir región desde una UI):

1. Abre `https://console.firebase.google.com/project/<TU-PROYECTO>/firestore`
2. **Crear base de datos** → modo **producción** → elige la región más cercana (ej. `nam5` o
   `southamerica-east1`) → **Habilitar**.

(También existe `firebase firestore:databases:create "(default)" --location=nam5` por CLI, pero
requiere una versión reciente de `firebase-tools`; si te da error, usa la consola.)

### Vincular este proyecto local con Firebase

```bash
cd ~/Documents/dreamyland-game
firebase use --add
# te muestra una lista — elige el proyecto que acabas de crear
# cuando pregunte el alias, escribe: default
```

Esto crea un archivo `.firebaserc` (puedes commitearlo, solo guarda el nombre del proyecto).

### Publicar las reglas de seguridad

El repo ya incluye `firestore.rules` (permite leer/escribir por código corto, sin login — ver
el comentario dentro del archivo). Publícalas:

```bash
firebase deploy --only firestore:rules
```

---

## 4. Conectar el juego a tu Firebase

### 4.1 Crear la app Web y obtener su configuración

```bash
firebase apps:create WEB "Dreamy Sprout Farm Web"
```

Te va a imprimir un **App ID** (algo como `1:1234567890:web:abcdef`). Úsalo aquí:

```bash
firebase apps:sdkconfig WEB <APP_ID_QUE_TE_DIO_EL_COMANDO_ANTERIOR>
```

Esto imprime un objeto JS con `apiKey`, `authDomain`, `projectId`, etc.

Si prefieres la web: **Configuración del proyecto** (⚙️) → pestaña **General** → sección
**Tus apps** → **Agregar app → Web** (icono `</>`) → nómbrala → te muestra el mismo objeto.

### 4.2 Pegar la configuración en el juego

Abre [src/firebase-config.js](src/firebase-config.js) y reemplaza los valores `TU_...` por los
que acabas de obtener:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "dreamy-sprout-farm.firebaseapp.com",
  projectId: "dreamy-sprout-farm",
  storageBucket: "dreamy-sprout-farm.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
};
```

Estos valores **no son secretos** — así funciona toda app web de Firebase; lo que protege tus
datos son las reglas de Firestore (`firestore.rules`), no ocultar esta config. Es seguro
subirlos a un repo público.

Sube el cambio:

```bash
git add src/firebase-config.js
git commit -m "Conectar Firebase"
git push
```

### 4.3 Probar la sincronización

1. Abre tu juego publicado (`https://<tu-usuario>.github.io/dreamy-sprout-farm/`) o
   `localhost:8765` en local.
2. Pulsa el botón **☁** del HUD.
3. Pulsa **🎲 Nuevo** para generar un código corto (ej. `h8x2qz`) — anótalo.
4. Pulsa **☁⬆ Guardar en la nube**.
5. Abre el juego en otro dispositivo/navegador, entra al panel ☁, escribe el mismo código y
   pulsa **☁⬇ Cargar de la nube** — debería traer tu granja y tu progreso de estudio.

El botón ☁ es **manual a propósito** (como en el ícono ☁ del proyecto anterior): tú decides
cuándo subir y cuándo bajar, para que nunca te sobrescriba una partida sin avisar.

---

## 5. Cómo sigue entrando el contenido nuevo (world.json)

Esto no cambia por publicar en GitHub Pages: tu pipeline de Obsidian sigue regenerando
`world.json` en `~/Documents/dreamyland-game/world.json`. Solo falta el último paso, **subirlo**:

```bash
cd ~/Documents/dreamyland-game
git add world.json
git commit -m "Actualizar contenido de estudio"
git push
```

El progreso del jugador se conserva por `id` (ver README, sección *Contenido: world.json*), así
que republicar no borra salas limpiadas ni cajas de Leitner.

---

## 6. Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Pantalla en blanco / "Error: no se pudo cargar world.json" | Revisa que Pages ya haya terminado de desplegar (`gh api repos/:owner/:repo/pages/builds/latest -q .status` debe decir `built`) |
| El juego carga pero el panel ☁ dice "Firebase no configurado" | Falta rellenar `src/firebase-config.js` con tus valores reales (paso 4.2) y hacer `git push` |
| `firebase deploy --only firestore:rules` da "no project active" | Falta `firebase use --add` dentro de la carpeta del proyecto (paso 3) |
| Al cargar de la nube no aparece nada | El código no coincide exactamente (son sensibles a mayúsculas/minúsculas — el juego los guarda en minúsculas) o nunca guardaste antes con **☁⬆** desde ese código |
| `gh repo create` dice que el nombre ya existe | Usa otro nombre de repo, ej. `dreamy-sprout-farm-2026` |
| Los sprites no cargan en local pero sí en GitHub Pages (o viceversa) | Asegúrate de abrir siempre por `http://` (`python3 -m http.server`), nunca con doble clic al `.html` |
