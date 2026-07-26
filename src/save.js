// Persistencia local. El mundo se genera con semilla fija, así que solo hay que
// guardar lo que el jugador cambia: la tierra, los cultivos y el estado.

const SAVE_KEY = "dreamy-sprout-farm-v1";

const Save = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch (e) {
      return null;
    }
  },
  write(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn("no se pudo guardar", e);
      return false;
    }
  },
  clear() {
    localStorage.removeItem(SAVE_KEY);
  },
};

function snapshotFarm() {
  const tilled = [];
  for (let i = 0; i < World.tilled.length; i++) {
    if (World.tilled[i]) tilled.push([i, World.tilled[i]]);
  }
  return {
    day: game.day,
    time: game.time,
    gold: game.gold,
    mana: game.mana,
    inventory: game.inventory,
    water: game.water,
    slot: game.slot,
    px: Math.round(player.x),
    py: Math.round(player.y),
    tilled,
    crops: World.crops,
    animalCounts: { cow: cows.length, chicken: chickens.length },
    animals: cows.concat(chickens).map((a) => (a.produced ? 1 : 0)),
  };
}

// Los animales comprados deben existir ANTES de aplicar los flags de
// "produced" — por eso spawnAnimals(f.animalCounts) se llama aparte, en
// game.js, justo antes de applyFarm().
function applyFarm(f) {
  if (!f) return;
  game.day = f.day ?? game.day;
  game.time = f.time ?? game.time;
  game.gold = f.gold ?? 0;
  game.mana = f.mana ?? game.mana;
  game.water = f.water ?? game.water;
  game.slot = f.slot ?? 0;
  if (f.inventory) Object.assign(game.inventory, f.inventory);
  if (f.px != null) {
    player.x = f.px;
    player.y = f.py;
  }
  World.tilled.fill(0);
  for (const [i, v] of f.tilled || []) World.tilled[i] = v;
  World.crops = f.crops || {};
  const all = cows.concat(chickens);
  (f.animals || []).forEach((v, i) => {
    if (all[i]) all[i].produced = !!v;
  });
}

function saveGame() {
  Save.write({ v: 1, savedAt: Date.now(), farm: snapshotFarm(), study: Study.progress });
}

function loadGame() {
  return Save.read();
}
