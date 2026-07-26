// World generation, autotiling and the pre-rendered static ground layer.

const TILE = 16;
const MAP_W = 90;
const MAP_H = 64;

const WATER = 0;
const GRASS = 1;
const PATH = 2;

// Nine-slice + strip layout shared by the Grass and Tilled_Dirt tilesets,
// in tile units. Picked by the four cardinal neighbours.
const NINE = {
  tl: [0, 0], t: [1, 0], tr: [2, 0],
  l: [0, 1], c: [1, 1], r: [2, 1],
  bl: [0, 2], b: [1, 2], br: [2, 2],
  vt: [3, 0], vm: [3, 1], vb: [3, 2],
  hl: [0, 3], hm: [1, 3], hr: [2, 3],
  dot: [3, 3],
};

function nineSlice(n, s, e, w) {
  if (n && s && e && w) return NINE.c;
  if (!n && s && e && w) return NINE.t;
  if (n && !s && e && w) return NINE.b;
  if (n && s && e && !w) return NINE.l;
  if (n && s && !e && w) return NINE.r;
  if (!n && s && e && !w) return NINE.tl;
  if (!n && s && !e && w) return NINE.tr;
  if (n && !s && e && !w) return NINE.bl;
  if (n && !s && !e && w) return NINE.br;
  if (!n && !s && e && w) return NINE.hm;
  if (!n && !s && e && !w) return NINE.hl;
  if (!n && !s && !e && w) return NINE.hr;
  if (n && s && !e && !w) return NINE.vm;
  if (!n && s && !e && !w) return NINE.vt;
  if (n && !s && !e && !w) return NINE.vb;
  return NINE.dot;
}

// Deterministic pseudo-random so the map looks the same every run.
let seed = 1337;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function rndInt(a, b) {
  return a + Math.floor(rnd() * (b - a + 1));
}

const World = {
  w: MAP_W,
  h: MAP_H,
  ground: null,
  solid: null,
  tilled: null,
  crops: null,
  props: [],
  static: null,
  spawn: { x: 0, y: 0 },
  house: null,
  chest: null,
  pasture: null,

  idx(x, y) {
    return y * MAP_W + x;
  },
  inside(x, y) {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  },
  groundAt(x, y) {
    return this.inside(x, y) ? this.ground[this.idx(x, y)] : WATER;
  },
  isSolid(x, y) {
    return !this.inside(x, y) || this.solid[this.idx(x, y)] === 1;
  },
  hasProp(x, y) {
    return this.propTiles.has(this.idx(x, y));
  },
  setSolid(x, y, v) {
    if (this.inside(x, y)) this.solid[this.idx(x, y)] = v ? 1 : 0;
  },

  generate() {
    const n = MAP_W * MAP_H;
    this.ground = new Uint8Array(n).fill(GRASS);
    this.solid = new Uint8Array(n);
    this.tilled = new Uint8Array(n);
    this.crops = {};
    this.props = [];
    this.propTiles = new Set();

    this.carveLakes();
    this.carvePaths();
    this.buildFarm();
    this.buildPasture();
    this.buildForest();
    this.scatterDecor();
    this.bakeStatic();
  },

  carveLakes() {
    const lakes = [
      { cx: 11, cy: 11, rx: 9, ry: 7 },
      { cx: 76, cy: 52, rx: 10, ry: 7 },
      { cx: 34, cy: 49, rx: 6, ry: 4 }, // pond by the farm, for the watering can
    ];
    for (const l of lakes) {
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          const dx = (x - l.cx) / l.rx;
          const dy = (y - l.cy) / l.ry;
          // wobble the rim so lakes do not read as perfect ellipses
          const wob = 0.12 * Math.sin(x * 0.7) + 0.12 * Math.cos(y * 0.9);
          if (dx * dx + dy * dy + wob < 1) {
            this.ground[this.idx(x, y)] = WATER;
            this.solid[this.idx(x, y)] = 1;
          }
        }
      }
    }
  },

  rect(x0, y0, x1, y1, value) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.inside(x, y) && this.ground[this.idx(x, y)] !== WATER) {
          this.ground[this.idx(x, y)] = value;
        }
      }
    }
  },

  carvePaths() {
    this.rect(27, 18, 29, 46, PATH);   // from the house down
    this.rect(14, 38, 62, 40, PATH);   // main east-west road
    this.rect(44, 35, 46, 39, PATH);   // spur up to the pasture gate
  },

  fenceRect(x0, y0, x1, y1, gates) {
    const gate = (x, y) => gates.some((g) => g.x === x && g.y === y);
    const add = (x, y, sx, sy) => {
      if (gate(x, y)) return;
      this.props.push({
        sheet: "fences", sx: sx * 16, sy: sy * 16, sw: 16, sh: 16,
        x: x * 16, y: y * 16, sortY: y * 16 + 14,
      });
      this.setSolid(x, y, true);
    };
    for (let x = x0 + 1; x < x1; x++) {
      add(x, y0, 2, 3);
      add(x, y1, 2, 3);
    }
    for (let y = y0 + 1; y < y1; y++) {
      add(x0, y, 0, 1);
      add(x1, y, 0, 1);
    }
    add(x0, y0, 1, 0);
    add(x1, y0, 3, 0);
    add(x0, y1, 1, 2);
    add(x1, y1, 3, 2);
  },

  addProp(name, x, y, opts) {
    const [sheet, sx, sy, sw, sh] = SPR[name];
    const o = opts || {};
    this.props.push({
      sheet, sx, sy, sw, sh,
      x, y,
      sortY: y + sh - (o.sortLift || 0),
    });
    for (let ty = Math.floor(y / 16); ty <= Math.floor((y + sh - 1) / 16); ty++) {
      for (let tx = Math.floor(x / 16); tx <= Math.floor((x + sw - 1) / 16); tx++) {
        if (this.inside(tx, ty)) this.propTiles.add(this.idx(tx, ty));
      }
    }
    if (o.solid) {
      for (const [tx, ty] of o.solid) this.setSolid(tx, ty, true);
    }
  },

  buildFarm() {
    // House: 52x93 sprite centred over three tiles.
    const hx = 27, hy = 12;
    const px = hx * 16 - 2, py = hy * 16;
    this.addProp("house", px, py, { sortLift: 4 });
    for (let x = hx; x <= hx + 2; x++) {
      for (let y = hy; y <= hy + 5; y++) this.setSolid(x, y, true);
    }
    this.house = { x: hx, y: hy, door: { x: hx + 1, y: hy + 6 } };

    // La Torre del Erudito: 36x141, tres tiles de ancho de huella.
    const tx = 33, ty = 7;
    this.addProp("tower", tx * 16 - 2, ty * 16, { sortLift: 4 });
    for (let x = tx; x <= tx + 1; x++) {
      for (let y = ty; y <= ty + 8; y++) this.setSolid(x, y, true);
    }
    this.tower = { x: tx, y: ty, door: { x: tx, y: ty + 9 } };

    // Shipping chest beside the house.
    this.chest = { x: hx + 4, y: hy + 5 };
    this.addProp("chest", this.chest.x * 16, this.chest.y * 16);
    this.setSolid(this.chest.x, this.chest.y, true);

    // Fenced field with a few plots already tilled.
    this.fenceRect(16, 20, 26, 32, [{ x: 26, y: 27 }, { x: 26, y: 26 }]);
    for (let y = 22; y <= 30; y += 2) {
      for (let x = 18; x <= 24; x++) {
        if (this.ground[this.idx(x, y)] === GRASS) this.tilled[this.idx(x, y)] = 1;
      }
    }

    this.spawn = { x: (hx + 1) * 16 + 8, y: (hy + 8) * 16 };
  },

  buildPasture() {
    this.fenceRect(40, 22, 58, 34, [{ x: 45, y: 34 }, { x: 44, y: 34 }]);
    this.pasture = { x0: 41, y0: 23, x1: 57, y1: 33 };
    this.addProp("coop", 43 * 16, 24 * 16);
    for (let x = 43; x <= 45; x++) this.setSolid(x, 26, true);
    this.addProp("bushLong", 54 * 16, 31 * 16);
    this.addProp("log", 48 * 16, 32 * 16);
    // El gallinero también hace de mercado: aquí se compran animales nuevos.
    this.market = { x: 44, y: 27 };
  },

  treeAt(x, y, kind) {
    const name = kind || (rnd() < 0.25 ? "treeApple" : "treeBig");
    const [, , , sw, sh] = SPR[name];
    this.addProp(name, x * 16, y * 16, { sortLift: 2 });
    const bx = x + (sw > 16 ? 1 : 0);
    const by = y + sh / 16 - 1;
    this.setSolid(bx, by, true);
    if (sw > 16) this.setSolid(bx - 1, by, true);
  },

  buildForest() {
    // Tree wall along the map border keeps the player inside.
    for (let x = 0; x < MAP_W; x++) {
      for (let y = 0; y < MAP_H; y++) {
        const border = x < 3 || x > MAP_W - 4 || y < 3 || y > MAP_H - 4;
        if (border) this.setSolid(x, y, true);
      }
    }
    for (let x = 1; x < MAP_W - 2; x += 2) {
      if (this.groundAt(x, 2) !== WATER) this.treeAt(x, 0);
      if (this.groundAt(x, MAP_H - 4) !== WATER) this.treeAt(x, MAP_H - 5);
    }
    for (let y = 1; y < MAP_H - 3; y += 2) {
      if (this.groundAt(2, y) !== WATER) this.treeAt(0, y - 1);
      if (this.groundAt(MAP_W - 4, y) !== WATER) this.treeAt(MAP_W - 5, y - 1);
    }

    // Two woods to break up the open ground.
    const groves = [
      { x0: 62, y0: 6, x1: 84, y1: 26, d: 0.16 },
      { x0: 8, y0: 44, x1: 24, y1: 58, d: 0.14 },
      { x0: 62, y0: 42, x1: 70, y1: 56, d: 0.12 },
    ];
    for (const g of groves) {
      for (let y = g.y0; y < g.y1; y++) {
        for (let x = g.x0; x < g.x1; x++) {
          if (rnd() < g.d && this.canPlace(x, y, 2, 2)) this.treeAt(x, y);
        }
      }
    }
  },

  canPlace(x, y, w, h) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!this.inside(x + i, y + j)) return false;
        const id = this.idx(x + i, y + j);
        if (this.ground[id] !== GRASS || this.solid[id] || this.tilled[id]) return false;
        if (this.propTiles.has(id)) return false;
      }
    }
    return true;
  },

  scatterDecor() {
    const small = [
      "bush", "bushBerry", "rockBig", "rockSmall", "mushroomRed", "mushroomPurple",
      "flowerPink", "flowerBlue", "flowerYellow", "log", "stump", "grassTuft",
    ];
    for (let i = 0; i < 420; i++) {
      const x = rndInt(4, MAP_W - 6);
      const y = rndInt(4, MAP_H - 6);
      if (!this.canPlace(x, y, 1, 1)) continue;
      const name = small[rndInt(0, small.length - 1)];
      this.addProp(name, x * 16, y * 16);
      if (name === "rockBig" || name === "bush" || name === "bushBerry") {
        this.setSolid(x, y, true);
      }
    }
    for (let i = 0; i < 26; i++) {
      const x = rndInt(4, MAP_W - 6);
      const y = rndInt(4, MAP_H - 6);
      if (this.canPlace(x, y, 1, 2)) this.addProp("sunflower", x * 16, y * 16);
    }
    // Lily pads floating on the lakes.
    for (let i = 0; i < 40; i++) {
      const x = rndInt(4, MAP_W - 6);
      const y = rndInt(4, MAP_H - 6);
      if (this.groundAt(x, y) === WATER && this.groundAt(x + 1, y) === WATER) {
        this.addProp("lily", x * 16, y * 16);
      }
    }
  },

  // Grass and paths never change, so they are drawn once into an offscreen
  // canvas and blitted per frame. Water animates underneath the alpha gaps.
  bakeStatic() {
    const c = document.createElement("canvas");
    c.width = MAP_W * TILE;
    c.height = MAP_H * TILE;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;

    const grass = Assets.images.grass;
    const dirt = Assets.images.dirt;

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.groundAt(x, y) === WATER) continue;
        const isG = (a, b) => this.groundAt(a, b) !== WATER;
        const t = nineSlice(isG(x, y - 1), isG(x, y + 1), isG(x + 1, y), isG(x - 1, y));
        let sx = t[0] * TILE;
        let sy = t[1] * TILE;
        if (t === NINE.c) {
          // interior grass: pick a decorated variant for texture
          const v = (x * 31 + y * 17) % 14;
          if (v < 12) {
            sx = (v % 6) * TILE;
            sy = (5 + Math.floor(v / 6)) * TILE;
          }
        }
        g.drawImage(grass, sx, sy, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.groundAt(x, y) !== PATH) continue;
        const isP = (a, b) => this.groundAt(a, b) === PATH;
        const t = nineSlice(isP(x, y - 1), isP(x, y + 1), isP(x + 1, y), isP(x - 1, y));
        g.drawImage(dirt, t[0] * TILE, t[1] * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }

    this.static = c;
  },
};
