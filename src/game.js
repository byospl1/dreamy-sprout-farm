// Dreamy Sprout Farm — main loop, player, animals, farming and HUD.

// Resolución interna de la cámara: se recalcula con la ventana para que el
// juego llene la pantalla completa sin estirar los sprites (misma escala,
// más o menos mundo visible según el tamaño de la ventana).
const ZOOM = 3; // px de pantalla por px de juego
const VIEW_MIN_W = 320, VIEW_MAX_W = 960;
const VIEW_MIN_H = 200, VIEW_MAX_H = 600;
let VIEW_W = 384; // 24 tiles, valor inicial hasta el primer resize
let VIEW_H = 240; // 15 tiles

const DIR_DOWN = 0, DIR_UP = 1, DIR_LEFT = 2, DIR_RIGHT = 3;
const DIR_VEC = [[0, 1], [0, -1], [-1, 0], [1, 0]];

const MIN_PER_SEC = 4;      // game minutes per real second
const DAY_START = 6 * 60;
const DAY_END = 26 * 60;    // 2am, forced collapse

const PRICES = { wheat: 30, eggplant: 55, milk: 90, egg: 35 };
const ITEM_SPRITE = {
  wheat: "itemWheat", eggplant: "itemEgg", milk: "itemMilk", egg: "itemEggFarm",
};
const ITEM_NAME = { wheat: "Trigo", eggplant: "Berenjena", milk: "Leche", egg: "Huevo" };

const SLOTS = [
  { key: "hoe", label: "Azada", icon: "toolHoe", action: "hoe" },
  { key: "wheat", label: "Semilla de trigo", icon: "seedWheat", action: "seed", crop: "wheat" },
  { key: "eggplant", label: "Semilla de berenjena", icon: "seedEgg", action: "seed", crop: "eggplant" },
  { key: "can", label: "Regadera", icon: "toolCan", action: "water" },
  { key: "basket", label: "Recolectar", icon: "basket", action: "harvest" },
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

function resizeCanvas() {
  let w = Math.round(window.innerWidth / ZOOM / 2) * 2;
  let h = Math.round(window.innerHeight / ZOOM / 2) * 2;
  VIEW_W = Math.max(VIEW_MIN_W, Math.min(VIEW_MAX_W, w));
  VIEW_H = Math.max(VIEW_MIN_H, Math.min(VIEW_MAX_H, h));
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  ctx.imageSmoothingEnabled = false;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// El maná es la bisagra entre estudio y granja: solo se recarga estudiando.
const MANA_COST = { hoe: 1, seed: 3 };
const MANA_REGEN_SECONDS = 15 * 60; // +1 pasivo cada 15 min

const game = {
  day: 1,
  time: DAY_START,
  gold: 0,
  inventory: { wheat: 0, eggplant: 0, milk: 0, egg: 0 },
  slot: 0,
  water: 15,
  waterMax: 15,
  mana: 12,
  sleeping: 0,
  fade: 0,
  paused: false,
  regenT: 0,
  saveT: 0,
  get manaMax() {
    return 20 + (Study.level - 1) * 5;
  },
};

function grantStudyReward(gold, mana) {
  game.gold += gold;
  game.mana = Math.min(game.manaMax, game.mana + mana);
}

function spendMana(n) {
  if (game.mana < n) {
    toast("Sin maná — estudia en la 🗼 Torre del Erudito");
    return false;
  }
  game.mana -= n;
  updateHud();
  return true;
}

const player = {
  x: 0, y: 0,
  dir: DIR_DOWN,
  frame: 0,
  animT: 0,
  moving: false,
  action: null,      // { row, t, dur }
};

const keys = {};
const touch = { active: false, dx: 0, dy: 0, run: false };
const cam = { x: 0, y: 0 };
let waterPatterns = [];
let waterFrame = 0;
let waterT = 0;
const cows = [];
const chickens = [];
const toasts = [];
const floaters = [];

// ---------------------------------------------------------------- input

const KEY_DIR = {
  ArrowUp: DIR_UP, KeyW: DIR_UP,
  ArrowDown: DIR_DOWN, KeyS: DIR_DOWN,
  ArrowLeft: DIR_LEFT, KeyA: DIR_LEFT,
  ArrowRight: DIR_RIGHT, KeyD: DIR_RIGHT,
};

function anyPanelOpen() {
  return Study.isOpen || Market.isOpen || Cloud.isOpen;
}
function closeAnyPanel() {
  if (Study.isOpen) Study.close();
  if (Market.isOpen) Market.close();
  if (Cloud.isOpen) Cloud.close();
}
function syncPause() {
  game.paused = anyPanelOpen();
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (anyPanelOpen()) {
    if (e.code === "Escape") closeAnyPanel();
    return;
  }
  keys[e.code] = true;
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (e.code >= "Digit1" && e.code <= "Digit5") {
    game.slot = Number(e.code.slice(5)) - 1;
    updateHud();
  }
  if (e.code === "Space") useTool();
  if (e.code === "KeyE") interact();
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// Joystick analógico + botones de acción para pantallas táctiles. Se
// escuchan eventos de puntero (touch y mouse) para que también sea
// probable arrastrando con el ratón.
function setupTouchControls() {
  const stick = document.getElementById("joystick");
  const knob = document.getElementById("joystick-knob");
  if (!stick || !knob) return;
  const MAX = 34;
  let dragging = false;
  let originX = 0, originY = 0;

  function pos(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function start(e) {
    if (anyPanelOpen()) return;
    const r = stick.getBoundingClientRect();
    originX = r.left + r.width / 2;
    originY = r.top + r.height / 2;
    dragging = true;
    move(e);
    e.preventDefault();
  }
  function move(e) {
    if (!dragging) return;
    const p = pos(e);
    let dx = p.x - originX;
    let dy = p.y - originY;
    const len = Math.hypot(dx, dy);
    if (len > MAX) {
      dx = (dx / len) * MAX;
      dy = (dy / len) * MAX;
    }
    knob.style.transform = "translate(" + dx + "px," + dy + "px)";
    touch.dx = dx / MAX;
    touch.dy = dy / MAX;
    touch.active = len > 6;
    touch.run = len > MAX * 0.85;
    e.preventDefault();
  }
  function end() {
    dragging = false;
    touch.active = false;
    touch.dx = 0;
    touch.dy = 0;
    touch.run = false;
    knob.style.transform = "";
  }

  stick.addEventListener("touchstart", start, { passive: false });
  stick.addEventListener("touchmove", move, { passive: false });
  stick.addEventListener("touchend", end);
  stick.addEventListener("touchcancel", end);
  stick.addEventListener("mousedown", start);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  const bindTap = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      if (!anyPanelOpen()) fn();
    };
    el.addEventListener("touchstart", handler, { passive: false });
    el.addEventListener("click", handler);
  };
  bindTap("btn-use", useTool);
  bindTap("btn-interact", interact);
}

// ---------------------------------------------------------------- helpers

function toast(text) {
  toasts.push({ text, t: 2.4 });
  renderToasts();
}

function floater(text, x, y, color) {
  floaters.push({ text, x, y, t: 1.1, color: color || "#fff" });
}

function playerTile() {
  return { x: Math.floor(player.x / TILE), y: Math.floor((player.y - 2) / TILE) };
}

function targetTile() {
  const p = playerTile();
  const [dx, dy] = DIR_VEC[player.dir];
  return { x: p.x + dx, y: p.y + dy };
}

function nearWater() {
  const p = playerTile();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (World.groundAt(p.x + dx, p.y + dy) === WATER) return true;
    }
  }
  return false;
}

function startAction(kind) {
  const base = { hoe: 0, axe: 4, can: 8 }[kind];
  if (base === undefined) return;
  player.action = { row: base + player.dir, t: 0, dur: 0.42 };
}

// ---------------------------------------------------------------- farming

function useTool() {
  if (game.sleeping) return;
  const slot = SLOTS[game.slot];
  const t = targetTile();
  const id = World.idx(t.x, t.y);

  if (slot.action === "hoe") {
    if (!World.inside(t.x, t.y)) return;
    if (World.groundAt(t.x, t.y) !== GRASS || World.isSolid(t.x, t.y) || World.hasProp(t.x, t.y)) {
      toast("Aquí no se puede arar");
      return;
    }
    if (World.tilled[id]) return;
    if (!spendMana(MANA_COST.hoe)) return;
    startAction("hoe");
    World.tilled[id] = 1;
    return;
  }

  if (slot.action === "water") {
    startAction("can");
    if (nearWater() && game.water < game.waterMax) {
      game.water = game.waterMax;
      toast("Regadera llena");
      updateHud();
      return;
    }
    if (!World.inside(t.x, t.y) || !World.tilled[id]) return;
    if (game.water <= 0) {
      toast("Sin agua — recárgala en el estanque");
      return;
    }
    if (World.tilled[id] === 2) return;
    World.tilled[id] = 2;
    game.water--;
    updateHud();
    return;
  }

  if (slot.action === "seed") {
    if (!World.inside(t.x, t.y) || !World.tilled[id]) {
      toast("Necesitas tierra arada");
      return;
    }
    if (World.crops[id]) return;
    if (!spendMana(MANA_COST.seed)) return;
    World.crops[id] = { type: slot.crop, stage: 0 };
    floater("+plantado", t.x * TILE + 8, t.y * TILE, "#cfe8a0");
    return;
  }

  if (slot.action === "harvest") {
    harvestAt(t.x, t.y) || collectNearbyAnimal();
  }
}

function harvestAt(tx, ty) {
  if (!World.inside(tx, ty)) return false;
  const id = World.idx(tx, ty);
  const crop = World.crops[id];
  if (!crop || crop.stage < 3) return false;
  delete World.crops[id];
  World.tilled[id] = 1;
  game.inventory[crop.type] += 1;
  floater("+1 " + ITEM_NAME[crop.type], tx * TILE + 8, ty * TILE, "#ffe9a8");
  updateHud();
  return true;
}

function collectNearbyAnimal() {
  const all = cows.concat(chickens);
  for (const a of all) {
    const d = Math.hypot(a.x - player.x, a.y - player.y);
    if (d < 24 && !a.produced) {
      a.produced = true;
      const item = a.kind === "cow" ? "milk" : "egg";
      game.inventory[item] += 1;
      floater("+1 " + ITEM_NAME[item], a.x, a.y - 18, "#fff6d8");
      updateHud();
      return true;
    }
  }
  return false;
}

function interact() {
  if (game.sleeping) return;
  const p = playerTile();

  const tw = World.tower.door;
  if (Math.abs(p.x - tw.x) <= 1 && Math.abs(p.y - tw.y) <= 1) {
    Study.open();
    return;
  }

  const ch = World.chest;
  if (Math.abs(p.x - ch.x) <= 1 && Math.abs(p.y - ch.y) <= 1) {
    sellAll();
    return;
  }

  const mk = World.market;
  if (mk && Math.abs(p.x - mk.x) <= 1 && Math.abs(p.y - mk.y) <= 1) {
    Market.open();
    return;
  }

  const d = World.house.door;
  if (Math.abs(p.x - d.x) <= 1 && Math.abs(p.y - d.y) <= 1) {
    game.sleeping = 1;
    return;
  }

  if (collectNearbyAnimal()) return;
  if (harvestAt(targetTile().x, targetTile().y)) return;
  toast("No hay nada aquí");
}

function sellAll() {
  let total = 0;
  let count = 0;
  for (const k of Object.keys(game.inventory)) {
    total += game.inventory[k] * PRICES[k];
    count += game.inventory[k];
    game.inventory[k] = 0;
  }
  if (!count) {
    toast("El cofre está vacío");
    return;
  }
  game.gold += total;
  floater("+" + total + "g", World.chest.x * TILE + 8, World.chest.y * TILE, "#ffd76e");
  toast("Vendiste " + count + " productos por " + total + "g");
  updateHud();
}

function newDay() {
  game.day++;
  game.time = DAY_START;
  for (const key of Object.keys(World.crops)) {
    const id = Number(key);
    if (World.tilled[id] === 2 && World.crops[id].stage < 3) World.crops[id].stage++;
  }
  for (let i = 0; i < World.tilled.length; i++) {
    if (World.tilled[i] === 2) World.tilled[i] = 1;
  }
  for (const a of cows.concat(chickens)) a.produced = false;
  game.water = game.waterMax;
  Study.rollDay();
  updateHud();
  saveGame();
  toast("Día " + game.day + " — los cultivos regados crecieron");
}

// ---------------------------------------------------------------- animals

const DEFAULT_ANIMAL_COUNTS = { cow: 3, chicken: 5 };

function addAnimal(kind) {
  const p = World.pasture;
  const arr = kind === "cow" ? cows : chickens;
  arr.push({
    kind,
    x: (p.x0 + 2 + Math.random() * (p.x1 - p.x0 - 4)) * TILE,
    y: (p.y0 + 2 + Math.random() * (p.y1 - p.y0 - 4)) * TILE,
    vx: 0, vy: 0, t: Math.random() * 2, frame: 0, animT: 0,
    flip: false, produced: false,
  });
  return arr[arr.length - 1];
}

function spawnAnimals(counts) {
  const c = counts || DEFAULT_ANIMAL_COUNTS;
  for (let i = 0; i < (c.cow ?? DEFAULT_ANIMAL_COUNTS.cow); i++) addAnimal("cow");
  for (let i = 0; i < (c.chicken ?? DEFAULT_ANIMAL_COUNTS.chicken); i++) addAnimal("chicken");
}

function updateAnimals(dt) {
  const p = World.pasture;
  for (const a of cows.concat(chickens)) {
    a.t -= dt;
    if (a.t <= 0) {
      a.t = 1.4 + Math.random() * 2.6;
      if (Math.random() < 0.45) {
        a.vx = 0;
        a.vy = 0;
      } else {
        const ang = Math.random() * Math.PI * 2;
        const sp = a.kind === "cow" ? 11 : 16;
        a.vx = Math.cos(ang) * sp;
        a.vy = Math.sin(ang) * sp;
        a.flip = a.vx < 0;
      }
    }
    const nx = a.x + a.vx * dt;
    const ny = a.y + a.vy * dt;
    if (nx > (p.x0 + 1) * TILE && nx < (p.x1 - 1) * TILE) a.x = nx;
    else a.vx *= -1;
    if (ny > (p.y0 + 1) * TILE && ny < (p.y1 - 1) * TILE) a.y = ny;
    else a.vy *= -1;

    a.animT += dt;
    const step = a.vx || a.vy ? 0.18 : 0.4;
    if (a.animT > step) {
      a.animT = 0;
      a.frame = (a.frame + 1) % (a.kind === "cow" ? 3 : 4);
    }
  }
}

// ---------------------------------------------------------------- player

function collides(x, y) {
  const half = 5;
  const top = y - 6;
  const pts = [
    [x - half, top], [x + half, top],
    [x - half, y - 1], [x + half, y - 1],
  ];
  for (const [px, py] of pts) {
    if (World.isSolid(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
  }
  return false;
}

function updatePlayer(dt) {
  if (game.sleeping || game.paused) {
    player.moving = false;
    return;
  }
  let dx = 0, dy = 0;
  for (const code of Object.keys(KEY_DIR)) {
    if (!keys[code]) continue;
    const [vx, vy] = DIR_VEC[KEY_DIR[code]];
    dx += vx;
    dy += vy;
  }
  if (touch.active) {
    dx = touch.dx;
    dy = touch.dy;
  }
  // Normaliza a longitud máx. 1: el teclado siempre da vectores de largo 1
  // (o 1.41 en diagonal), el joystick táctil ya llega analógico (0..1) y
  // debe conservar la velocidad parcial cuando se inclina poco.
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  player.moving = len > 0.05;

  if (player.moving) {
    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx > 0 ? DIR_RIGHT : DIR_LEFT;
    else player.dir = dy > 0 ? DIR_DOWN : DIR_UP;

    const speed = (keys.ShiftLeft || keys.ShiftRight || touch.run ? 108 : 66) * dt;
    const nx = player.x + dx * speed;
    if (!collides(nx, player.y)) player.x = nx;
    const ny = player.y + dy * speed;
    if (!collides(player.x, ny)) player.y = ny;

    player.animT += dt;
    if (player.animT > 0.13) {
      player.animT = 0;
      player.frame = (player.frame + 1) % 4;
    }
  } else {
    player.frame = 0;
    player.animT = 0;
  }

  if (player.action) {
    player.action.t += dt;
    if (player.action.t >= player.action.dur) player.action = null;
  }
}

// ---------------------------------------------------------------- render

function drawWater() {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  ctx.fillStyle = waterPatterns[waterFrame];
  ctx.fillRect(cam.x, cam.y, VIEW_W, VIEW_H);
  ctx.restore();
}

function drawSoil() {
  const x0 = Math.floor(cam.x / TILE);
  const y0 = Math.floor(cam.y / TILE);
  for (let y = y0; y <= y0 + VIEW_H / TILE + 1; y++) {
    for (let x = x0; x <= x0 + VIEW_W / TILE + 1; x++) {
      if (!World.inside(x, y)) continue;
      const id = World.idx(x, y);
      const t = World.tilled[id];
      if (!t) continue;
      const img = t === 2 ? Assets.images.soilWatered : Assets.images.soilTilled;
      ctx.drawImage(img, x * TILE - cam.x, y * TILE - cam.y);
      const crop = World.crops[id];
      if (crop) {
        const [sx, sy] = CROP_STAGES[crop.type][crop.stage];
        ctx.drawImage(
          Assets.images.plants, sx, sy, TILE, TILE,
          x * TILE - cam.x, y * TILE - cam.y, TILE, TILE
        );
      }
    }
  }
}

function drawTargetHighlight() {
  const t = targetTile();
  if (!World.inside(t.x, t.y)) return;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(t.x * TILE - cam.x + 0.5, t.y * TILE - cam.y + 0.5, TILE - 1, TILE - 1);
}

function drawEntities() {
  const list = [];
  const cx1 = cam.x + VIEW_W;
  const cy1 = cam.y + VIEW_H;

  for (const p of World.props) {
    if (p.x > cx1 || p.x + p.sw < cam.x || p.y > cy1 || p.y + p.sh < cam.y) continue;
    list.push({
      sortY: p.sortY,
      draw() {
        ctx.drawImage(
          Assets.images[p.sheet], p.sx, p.sy, p.sw, p.sh,
          p.x - cam.x, p.y - cam.y, p.sw, p.sh
        );
      },
    });
  }

  for (const a of cows) {
    list.push({
      sortY: a.y,
      draw() {
        drawFlipped(Assets.images.cow, a.frame * 32, 0, 32, 32, a.x - 16 - cam.x, a.y - 30 - cam.y, a.flip);
        if (!a.produced) drawBubble(a.x - cam.x, a.y - 34 - cam.y);
      },
    });
  }
  for (const a of chickens) {
    list.push({
      sortY: a.y,
      draw() {
        drawFlipped(Assets.images.chicken, a.frame * 16, 16, 16, 16, a.x - 8 - cam.x, a.y - 15 - cam.y, a.flip);
        if (!a.produced) drawBubble(a.x - cam.x, a.y - 20 - cam.y);
      },
    });
  }

  list.push({
    sortY: player.y,
    draw() {
      const sx = player.action ? 0 : player.frame * 48;
      if (player.action) {
        const f = player.action.t > player.action.dur * 0.4 ? 1 : 0;
        ctx.drawImage(
          Assets.images.actions, f * 48, player.action.row * 48, 48, 48,
          Math.round(player.x - 24 - cam.x), Math.round(player.y - 32 - cam.y), 48, 48
        );
      } else {
        ctx.drawImage(
          Assets.images.character, sx, player.dir * 48, 48, 48,
          Math.round(player.x - 24 - cam.x), Math.round(player.y - 32 - cam.y), 48, 48
        );
      }
    },
  });

  list.sort((a, b) => a.sortY - b.sortY);
  for (const e of list) e.draw();
}

function drawFlipped(img, sx, sy, sw, sh, dx, dy, flip) {
  if (!flip) {
    ctx.drawImage(img, sx, sy, sw, sh, Math.round(dx), Math.round(dy), sw, sh);
    return;
  }
  ctx.save();
  ctx.translate(Math.round(dx) + sw, Math.round(dy));
  ctx.scale(-1, 1);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.restore();
}

// Small pixel sparkle marking an animal that still has something to give.
function drawBubble(x, y) {
  const px = Math.round(x) - 2;
  const py = Math.round(y) + Math.sin(performance.now() / 300) * 1.5;
  ctx.fillStyle = "rgba(60,50,30,0.5)";
  ctx.fillRect(px - 1, py - 1, 5, 5);
  ctx.fillStyle = "#fff3b0";
  ctx.fillRect(px + 1, py - 1, 1, 5);
  ctx.fillRect(px - 1, py + 1, 5, 1);
  ctx.fillStyle = "#fff";
  ctx.fillRect(px + 1, py + 1, 1, 1);
}

function drawFloaters(dt) {
  ctx.font = "7px monospace";
  ctx.textAlign = "center";
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t -= dt;
    if (f.t <= 0) {
      floaters.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, f.t * 1.6);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(f.text, f.x - cam.x, f.y - cam.y - (1.1 - f.t) * 14 + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x - cam.x, f.y - cam.y - (1.1 - f.t) * 14);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function nightAlpha() {
  const t = game.time;
  if (t < 17 * 60) return 0;
  if (t > 22 * 60) return 0.42;
  return ((t - 17 * 60) / (5 * 60)) * 0.42;
}

function render(dt) {
  cam.x = Math.round(Math.max(0, Math.min(World.w * TILE - VIEW_W, player.x - VIEW_W / 2)));
  cam.y = Math.round(Math.max(0, Math.min(World.h * TILE - VIEW_H, player.y - VIEW_H / 2)));

  drawWater();
  ctx.drawImage(World.static, cam.x, cam.y, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
  drawSoil();
  drawTargetHighlight();
  drawEntities();
  drawFloaters(dt);

  const na = nightAlpha();
  if (na > 0) {
    ctx.fillStyle = "rgba(24,26,72," + na.toFixed(3) + ")";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (game.fade > 0) {
    ctx.fillStyle = "rgba(8,8,20," + game.fade.toFixed(3) + ")";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

// ---------------------------------------------------------------- hud

function spriteCanvas(name, scale) {
  const [sheet, sx, sy, sw, sh] = SPR[name];
  const c = document.createElement("canvas");
  c.width = sw * scale;
  c.height = sh * scale;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(Assets.images[sheet], sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
  return c;
}

function buildHud() {
  const bar = document.getElementById("hotbar");
  SLOTS.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "slot";
    el.dataset.i = i;
    el.title = s.label;
    el.appendChild(spriteCanvas(s.icon, 2));
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = i + 1;
    el.appendChild(num);
    el.addEventListener("click", () => {
      game.slot = i;
      updateHud();
    });
    bar.appendChild(el);
  });

  const inv = document.getElementById("inv");
  for (const k of Object.keys(game.inventory)) {
    const el = document.createElement("div");
    el.className = "item";
    el.appendChild(spriteCanvas(ITEM_SPRITE[k], 2));
    const c = document.createElement("span");
    c.id = "count-" + k;
    c.textContent = "0";
    el.appendChild(c);
    inv.appendChild(el);
  }
}

function updateHud() {
  document.getElementById("day").textContent = "Día " + game.day;
  document.getElementById("gold").textContent = game.gold + "g";
  document.getElementById("waterlevel").textContent = game.water + "/" + game.waterMax;
  document.getElementById("mana").textContent = game.mana + "/" + game.manaMax;
  document.getElementById("level").textContent = "Nv " + Study.level;
  document.getElementById("streak").textContent = Study.progress.streak;
  document.getElementById("goal").textContent = Math.min(10, Study.progress.dailyCount) + "/10";
  document.getElementById("toolname").textContent = SLOTS[game.slot].label;
  for (const k of Object.keys(game.inventory)) {
    document.getElementById("count-" + k).textContent = game.inventory[k];
  }
  document.querySelectorAll("#hotbar .slot").forEach((el, i) => {
    el.classList.toggle("active", i === game.slot);
  });
}

function updateClock() {
  const h = Math.floor(game.time / 60) % 24;
  const m = Math.floor(game.time % 60 / 10) * 10;
  document.getElementById("time").textContent =
    String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function renderToasts() {
  const box = document.getElementById("toasts");
  box.innerHTML = "";
  for (const t of toasts) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = t.text;
    box.appendChild(el);
  }
}

// ---------------------------------------------------------------- loop

function tick(dt) {
  updatePlayer(dt);
  if (game.paused) return;
  updateAnimals(dt);

  game.regenT += dt;
  if (game.regenT >= MANA_REGEN_SECONDS) {
    game.regenT = 0;
    if (game.mana < game.manaMax) {
      game.mana++;
      updateHud();
    }
  }
  game.saveT += dt;
  if (game.saveT > 20) {
    game.saveT = 0;
    saveGame();
  }

  if (game.sleeping === 1) {
    game.fade = Math.min(1, game.fade + dt * 1.6);
    if (game.fade >= 1) {
      game.sleeping = 2;
      newDay();
    }
  } else if (game.sleeping === 2) {
    game.fade -= dt * 1.2;
    if (game.fade <= 0) {
      game.fade = 0;
      game.sleeping = 0;
    }
  } else {
    game.time += dt * MIN_PER_SEC;
    if (game.time >= DAY_END) {
      toast("Te quedaste dormido…");
      game.sleeping = 1;
    }
  }

  waterT += dt;
  if (waterT > 0.34) {
    waterT = 0;
    waterFrame = (waterFrame + 1) % waterPatterns.length;
  }

  for (let i = toasts.length - 1; i >= 0; i--) {
    toasts[i].t -= dt;
    if (toasts[i].t <= 0) {
      toasts.splice(i, 1);
      renderToasts();
    }
  }
  updateClock();
}

let last = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  tick(dt);
  render(dt);
  requestAnimationFrame(loop);
}

function buildWaterPatterns() {
  const src = Assets.images.water;
  const frames = src.width / TILE;
  for (let i = 0; i < frames; i++) {
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(src, i * TILE, 0, TILE, TILE, 0, 0, TILE, TILE);
    waterPatterns.push(ctx.createPattern(c, "repeat"));
  }
}

Assets.load()
  .then(async () => {
    buildWaterPatterns();
    World.generate();
    player.x = World.spawn.x;
    player.y = World.spawn.y;

    const saved = loadGame();
    await Study.init(saved && saved.study);
    spawnAnimals(saved && saved.farm && saved.farm.animalCounts);
    applyFarm(saved && saved.farm);
    Market.buildDom();
    Cloud.buildDom();
    await Cloud.init();

    buildHud();
    updateHud();
    updateClock();
    setupTouchControls();
    document.getElementById("loading").remove();
    document.getElementById("study-btn").addEventListener("click", () => Study.open());
    document.getElementById("market-btn").addEventListener("click", () => Market.open());
    document.getElementById("cloud-btn").addEventListener("click", () => Cloud.open());
    document.getElementById("help-btn").addEventListener("click", () => {
      document.getElementById("help-pop").classList.toggle("hidden");
    });
    window.addEventListener("beforeunload", saveGame);

    if (saved) toast("Partida cargada — día " + game.day + ", nivel " + Study.level);
    else toast("Estudia en la 🗼 Torre para ganar maná y hacer crecer la granja");
    requestAnimationFrame(loop);
  })
  .catch((err) => {
    document.getElementById("loading").textContent = "Error: " + err.message;
    console.error(err);
  });
