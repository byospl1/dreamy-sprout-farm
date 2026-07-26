// Sprite sheets and the atlas of named regions inside them.
// Coordinates were mapped by inspecting each sheet from the Sprout Lands pack.

// Todos los <script src="...js?v=N"> de index.html comparten el mismo N.
// Lo leemos de nuestra propia URL para reusarlo al pedir los sprites, así
// una sola versión invalida el caché de todo (código e imágenes) a la vez.
// Sin esto, navegadores agresivos con el caché (sobre todo Safari en modo
// "agregar a inicio") pueden quedarse sirviendo JS/PNG viejos indefinidamente.
const APP_VERSION = (() => {
  const src = document.currentScript && document.currentScript.src;
  const m = src && src.match(/[?&]v=([^&]+)/);
  return m ? m[1] : "dev";
})();

function withVersion(url) {
  return url + (url.includes("?") ? "&" : "?") + "v=" + APP_VERSION;
}

const SHEETS = {
  grass: "assets/sprites/grass.png",
  water: "assets/sprites/water.png",
  dirt: "assets/sprites/dirt.png",
  fences: "assets/sprites/fences.png",
  biom: "assets/sprites/biom.png",
  plants: "assets/sprites/plants.png",
  house: "assets/sprites/house.png",
  tower: "assets/sprites/tower.png",
  coop: "assets/sprites/coop.png",
  chest: "assets/sprites/chest.png",
  soilTilled: "assets/sprites/soil_tilled.png",
  soilWatered: "assets/sprites/soil_watered.png",
  character: "assets/sprites/character.png",
  actions: "assets/sprites/actions.png",
  cow: "assets/sprites/cow.png",
  chicken: "assets/sprites/chicken.png",
  egg: "assets/sprites/egg.png",
  milk: "assets/sprites/milk.png",
  tools: "assets/sprites/tools.png",
};

// [sheet, sx, sy, sw, sh]
const SPR = {
  treeBig: ["biom", 16, 0, 32, 32],
  treeApple: ["biom", 48, 0, 32, 32],
  treeSmall: ["biom", 0, 0, 16, 32],
  bushBerry: ["biom", 0, 48, 16, 16],
  bush: ["biom", 16, 48, 16, 16],
  bushLong: ["biom", 32, 64, 48, 16],
  rockBig: ["biom", 128, 16, 16, 16],
  rockSmall: ["biom", 112, 16, 16, 16],
  mushroomRed: ["biom", 80, 0, 16, 16],
  mushroomPurple: ["biom", 112, 0, 16, 16],
  flowerPink: ["biom", 112, 48, 16, 16],
  flowerBlue: ["biom", 80, 48, 16, 16],
  flowerYellow: ["biom", 96, 32, 16, 16],
  sunflower: ["biom", 128, 32, 16, 32],
  log: ["biom", 80, 32, 16, 16],
  stump: ["biom", 48, 32, 16, 16],
  lily: ["biom", 112, 64, 16, 16],
  grassTuft: ["biom", 80, 16, 16, 16],

  house: ["house", 0, 0, 52, 93],
  tower: ["tower", 0, 0, 36, 141],
  coop: ["coop", 0, 0, 48, 48],
  chest: ["chest", 16, 16, 16, 16],

  seedWheat: ["plants", 0, 0, 16, 16],
  seedEgg: ["plants", 0, 16, 16, 16],
  itemWheat: ["plants", 80, 0, 16, 16],
  itemEgg: ["plants", 80, 16, 16, 16],
  itemMilk: ["milk", 16, 0, 16, 16],
  itemEggFarm: ["egg", 0, 0, 16, 16],

  toolHoe: ["tools", 32, 64, 16, 16],
  toolCan: ["tools", 32, 0, 16, 16],
  basket: ["chest", 16, 16, 16, 16],

  iconChicken: ["chicken", 0, 0, 16, 16],
  iconCow: ["cow", 0, 0, 32, 32],
};

// Crop growth stages, 4 each.
const CROP_STAGES = {
  wheat: [[16, 0], [32, 0], [48, 0], [64, 0]],
  eggplant: [[16, 16], [32, 16], [48, 16], [64, 16]],
};

const Assets = {
  images: {},
  load() {
    const keys = Object.keys(SHEETS);
    return Promise.all(
      keys.map(
        (key) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              Assets.images[key] = img;
              resolve();
            };
            img.onerror = () => reject(new Error("no se pudo cargar " + SHEETS[key]));
            img.src = withVersion(SHEETS[key]);
          })
      )
    );
  },
  // Draws a named region from SPR at world position x,y.
  draw(ctx, name, x, y) {
    const [sheet, sx, sy, sw, sh] = SPR[name];
    ctx.drawImage(Assets.images[sheet], sx, sy, sw, sh, x, y, sw, sh);
  },
};
