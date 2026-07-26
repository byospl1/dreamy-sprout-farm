// Mercado de animales — se abre interactuando junto al gallinero.
// Comprar cuesta oro; cada animal nuevo se une al corral y produce
// leche/huevos como los demás, una vez al día.

const ANIMAL_INFO = {
  chicken: { label: "Gallina", price: 180, icon: "iconChicken", produces: "Huevo", sell: PRICES.egg },
  cow: { label: "Vaca", price: 450, icon: "iconCow", produces: "Leche", sell: PRICES.milk },
};

const MARKET_LIMIT = { chicken: 10, cow: 6 };

const Market = {
  el: null,

  buildDom() {
    const el = document.createElement("div");
    el.id = "market";
    el.className = "study hidden";
    el.innerHTML = `
      <div class="study-panel market-panel">
        <header class="market-head">
          <h2>🐔 Mercado de animales</h2>
          <button class="close" data-act="close">✕</button>
        </header>
        <div class="study-body" id="market-body"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "close") return this.close();
      if (b.dataset.act === "buy") return this.buy(b.dataset.kind);
    });
  },

  open() {
    this.el.classList.remove("hidden");
    syncPause();
    this.render();
  },
  close() {
    this.el.classList.add("hidden");
    syncPause();
    saveGame();
  },
  get isOpen() {
    return this.el && !this.el.classList.contains("hidden");
  },

  count(kind) {
    return kind === "cow" ? cows.length : chickens.length;
  },

  buy(kind) {
    const info = ANIMAL_INFO[kind];
    if (this.count(kind) >= MARKET_LIMIT[kind]) {
      toast("El corral ya está lleno de " + info.label.toLowerCase() + "s");
      return;
    }
    if (game.gold < info.price) {
      toast("Te faltan " + (info.price - game.gold) + "🪙 para la " + info.label.toLowerCase());
      return;
    }
    game.gold -= info.price;
    addAnimal(kind);
    toast("¡Compraste una " + info.label + "! Dará " + info.produces.toLowerCase() + " cada día");
    updateHud();
    saveGame();
    this.render();
  },

  render() {
    const body = document.getElementById("market-body");
    const row = (kind) => {
      const info = ANIMAL_INFO[kind];
      const n = this.count(kind);
      const full = n >= MARKET_LIMIT[kind];
      const afford = game.gold >= info.price;
      return `<div class="mgood">
        <canvas class="micon" data-icon="${info.icon}"></canvas>
        <div class="mgood-info">
          <b>${info.label}</b>
          <span>Da 1 ${info.produces.toLowerCase()}/día · se vende a ${info.sell}🪙</span>
          <span class="mcount">${n}/${MARKET_LIMIT[kind]} en el corral</span>
        </div>
        <button class="primary" data-act="buy" data-kind="${kind}" ${full || !afford ? "disabled" : ""}>
          ${full ? "Corral lleno" : info.price + "🪙"}
        </button>
      </div>`;
    };
    body.innerHTML = `
      <p class="resumen">Interactúa junto al gallinero para comprar animales. Cada uno produce
      un artículo por día — recuérdalo con la canasta 🧺 cuando veas el destello ✨.</p>
      ${row("chicken")}${row("cow")}
      <p class="hint">Oro disponible: <b>${game.gold}🪙</b></p>`;

    body.querySelectorAll("canvas[data-icon]").forEach((c) => {
      const [sheet, sx, sy, sw, sh] = SPR[c.dataset.icon];
      c.width = sw * 2;
      c.height = sh * 2;
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.drawImage(Assets.images[sheet], sx, sy, sw, sh, 0, 0, sw * 2, sh * 2);
    });
  },
};
