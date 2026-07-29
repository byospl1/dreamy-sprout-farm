// La Torre del Erudito — el estudio es el motor de la granja.
// Lee world.json (el archivo que regenera el pipeline de Obsidian) y convierte
// cada libro en una mazmorra. Estudiar da XP, oro y maná; sin maná la granja
// no avanza.

const LEITNER = [0, 1, 2, 4, 7, 15];

const MONSTER_EMOJI = {
  ghost: "👻", cultist: "🧙", golem: "🗿", eye: "👁️", snake: "🐍",
  imp: "👺", bat: "🦇", slime: "🟢", lich: "💀", wolf: "🐺", dragon: "🐉",
};

const TITLES = [
  [1, "Aprendiz"], [3, "Escriba"], [5, "Adepto"], [8, "Erudito"],
  [12, "Maestro"], [18, "Archimago"], [25, "Leyenda Arcana"],
];

// Recompensas por acción de estudio.
const REWARD = {
  question: { xp: 8, gold: 15, mana: 1 },
  room: { xp: 40, gold: 60, mana: 8 },
  boss: { xp: 150, gold: 300, mana: 25 },
  dragon: { xp: 220, gold: 450, mana: 30 },
  card: { xp: 5, gold: 5, mana: 2 },
  dailyGoal: { xp: 50, gold: 120, mana: 5 },
  match: { xp: 15, gold: 20, mana: 3 },
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function dayNumber() {
  return Math.floor(Date.now() / 86400000);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const Study = {
  world: null,
  loadError: null,
  el: null,
  tab: "dungeons",
  combat: null,
  session: null,

  progress: {
    version: "",
    xp: 0,
    dungeons: {},       // id -> { rooms: {roomId:true}, boss: true }
    dragon: {},         // semana -> true
    cards: {},          // cardId -> { box, due, fails }
    streak: 0,
    lastStudyDay: "",
    shield: 0,
    dailyDay: "",
    dailyCount: 0,
    dailyClaimed: false,
    reviewDay: "",
    reviewSeen: [],
  },

  // ------------------------------------------------------------- carga

  async init(savedProgress) {
    if (savedProgress) Object.assign(this.progress, savedProgress);
    this.buildDom();
    try {
      const res = await fetch("world.json?t=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      this.world = await res.json();
    } catch (err) {
      this.loadError =
        "No se pudo leer world.json (" + err.message + "). " +
        "Abre el juego por http:// (python3 -m http.server), no con doble clic.";
      return;
    }
    await this.mergeCustomContent();
    this.syncContent();
    this.rollDay();
  },

  // world.json lo regenera el pipeline de Obsidian desde cero en cada corrida
  // — cualquier cosa agregada a mano ahí se perdería. world-custom.json es
  // tuyo, el pipeline nunca lo toca, y esto lo fusiona en cada carga. Si el
  // archivo no existe todavía o falla, el juego sigue normal sin él.
  async mergeCustomContent() {
    let custom;
    try {
      const res = await fetch("world-custom.json?t=" + Date.now());
      if (!res.ok) return;
      custom = await res.json();
    } catch (err) {
      return;
    }
    const knownIds = new Set(this.world.mazmorras.map((m) => m.id));
    for (const m of custom.mazmorras || []) {
      if (knownIds.has(m.id)) {
        console.warn("world-custom.json: id de mazmorra duplicado, se ignora:", m.id);
        continue;
      }
      this.world.mazmorras.push(m);
      knownIds.add(m.id);
    }
    const knownCardIds = new Set((this.world.cartas || []).map((c) => c.id));
    for (const c of custom.cartas || []) {
      if (knownCardIds.has(c.id)) continue;
      this.world.cartas.push(c);
      knownCardIds.add(c.id);
    }
  },

  // El pipeline regenera world.json: conservamos el progreso por id y avisamos
  // cuando llega contenido nuevo.
  syncContent() {
    const p = this.progress;
    const known = p.version;
    if (known && known !== this.world.version) {
      const nuevas = this.world.mazmorras.filter((m) => !p.dungeons[m.id]).length;
      const nuevasCartas = this.world.cartas.filter((c) => !p.cards[c.id]).length;
      const partes = [];
      if (nuevas) partes.push(nuevas + " portal(es)");
      if (nuevasCartas) partes.push(nuevasCartas + " carta(s)");
      setTimeout(() => {
        toast(partes.length ? "¡Contenido nuevo: " + partes.join(" y ") + "!" : "Grimorio actualizado");
      }, 1200);
    }
    p.version = this.world.version;
    for (const m of this.world.mazmorras) {
      if (!p.dungeons[m.id]) p.dungeons[m.id] = { rooms: {}, boss: false };
      if (!p.dungeons[m.id].rooms) p.dungeons[m.id].rooms = {};
    }
    for (const c of this.world.cartas) {
      if (!p.cards[c.id]) p.cards[c.id] = { box: 0, due: dayNumber(), fails: 0 };
    }
  },

  rollDay() {
    const p = this.progress;
    const t = todayKey();
    if (p.dailyDay !== t) {
      p.dailyDay = t;
      p.dailyCount = 0;
      p.dailyClaimed = false;
      p.reviewSeen = [];
    }
  },

  // ------------------------------------------------------------- progreso

  get level() {
    return Math.floor(Math.sqrt(this.progress.xp / 50)) + 1;
  },
  get title() {
    let t = TITLES[0][1];
    for (const [lvl, name] of TITLES) if (this.level >= lvl) t = name;
    return t;
  },
  xpForLevel(n) {
    return Math.pow(n - 1, 2) * 50;
  },

  countStudyAction() {
    const p = this.progress;
    this.rollDay();
    p.dailyCount++;

    const t = todayKey();
    if (p.lastStudyDay !== t) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (p.lastStudyDay === yesterday) {
        p.streak++;
        if (p.streak % 5 === 0) p.shield++;
      } else if (p.lastStudyDay) {
        if (p.shield > 0) {
          p.shield--;
          p.streak++;
          toast("🛡 Tu escudo salvó la racha");
        } else {
          p.streak = 1;
        }
      } else {
        p.streak = 1;
      }
      p.lastStudyDay = t;
    }

    if (p.dailyCount >= 10 && !p.dailyClaimed) {
      p.dailyClaimed = true;
      this.grant(REWARD.dailyGoal, "🎯 Meta diaria completa");
    }
  },

  grant(r, label) {
    const before = this.level;
    this.progress.xp += r.xp || 0;
    grantStudyReward(r.gold || 0, r.mana || 0);
    if (this.level > before) {
      grantStudyReward(this.level * 40, 0);
      toast("¡Nivel " + this.level + " — " + this.title + "! +" + this.level * 40 + "🪙");
    }
    if (label) toast(label + "  +" + (r.xp || 0) + "XP +" + (r.gold || 0) + "🪙 +" + (r.mana || 0) + "✨");
    updateHud();
    saveGame();
  },

  dungeonState(m) {
    const d = this.progress.dungeons[m.id] || { rooms: {}, boss: false };
    const done = m.salas.filter((s) => d.rooms[s.id]).length;
    const cards = this.world.cartas.filter((c) => m.libro.startsWith(c.libro) || c.libro === m.libro);
    const mastered = cards.filter((c) => (this.progress.cards[c.id] || {}).box >= 4).length;
    const pct =
      (done / m.salas.length) * 50 +
      (d.boss ? 30 : 0) +
      (cards.length ? (mastered / cards.length) * 20 : 20);
    let estado = "Sin abrir";
    if (pct >= 100) estado = "Dominado";
    else if (pct >= 70) estado = "Avanzado";
    else if (pct >= 30) estado = "En estudio";
    else if (done > 0) estado = "Iniciado";
    return { done, total: m.salas.length, boss: d.boss, pct: Math.round(pct), estado, archived: done === m.salas.length && d.boss };
  },

  // ------------------------------------------------------------- ui shell

  buildDom() {
    const el = document.createElement("div");
    el.id = "study";
    el.className = "study hidden";
    el.innerHTML = `
      <div class="study-panel">
        <header>
          <h2>🗼 La Torre del Erudito</h2>
          <button class="close" data-act="close">✕</button>
        </header>
        <nav class="tabs">
          <button data-tab="dungeons">🗡 Mazmorras</button>
          <button data-tab="grimoire">📖 Grimorio</button>
          <button data-tab="review">🔁 Repaso</button>
          <button data-tab="stats">📊 Progreso</button>
        </nav>
        <div class="study-body"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "close") return this.close();
      if (b.dataset.tab) {
        this.tab = b.dataset.tab;
        this.combat = null;
        this.session = null;
        return this.render();
      }
      if (b.dataset.act) this.action(b.dataset.act, b.dataset);
    });
  },

  open() {
    this.rollDay();
    this.el.classList.remove("hidden");
    syncPause();
    this.render();
  },
  close() {
    this.el.classList.add("hidden");
    this.combat = null;
    this.session = null;
    syncPause();
    saveGame();
  },
  get isOpen() {
    return this.el && !this.el.classList.contains("hidden");
  },

  render() {
    const body = this.el.querySelector(".study-body");
    this.el.querySelectorAll(".tabs button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === this.tab);
    });
    if (this.loadError) {
      body.innerHTML = `<div class="empty">⚠️ ${this.loadError}</div>`;
      return;
    }
    if (!this.world) {
      body.innerHTML = `<div class="empty">Cargando world.json…</div>`;
      return;
    }
    if (this.combat) return this.renderCombat(body);
    if (this.session) return this.renderCards(body);
    if (this.tab === "dungeons") return this.renderDungeons(body);
    if (this.tab === "grimoire") return this.renderGrimoire(body);
    if (this.tab === "review") return this.renderReview(body);
    return this.renderStats(body);
  },

  // ------------------------------------------------------------- mazmorras

  renderDungeons(body) {
    const active = [];
    const archived = [];
    for (const m of this.world.mazmorras) {
      (this.dungeonState(m).archived ? archived : active).push(m);
    }

    const card = (m) => {
      const st = this.dungeonState(m);
      let rooms = "";
      let unlocked = true;
      for (const s of m.salas) {
        const done = this.progress.dungeons[m.id].rooms[s.id];
        const cls = done ? "done" : unlocked ? "open" : "locked";
        rooms += `<button class="room ${cls}" data-act="room" data-d="${m.id}" data-s="${s.id}"
          ${cls === "locked" ? "disabled" : ""}>
          <span class="mon">${MONSTER_EMOJI[s.sprite] || "👾"}</span>
          <span class="rname">${s.nombre}</span>
          <span class="rmon">${done ? "✔ limpiada" : s.monstruo}</span>
        </button>`;
        if (!done) unlocked = false;
      }
      const bossOpen = m.salas.every((s) => this.progress.dungeons[m.id].rooms[s.id]);
      const bossDone = this.progress.dungeons[m.id].boss;
      rooms += `<button class="room boss ${bossDone ? "done" : bossOpen ? "open" : "locked"}"
        data-act="boss" data-d="${m.id}" ${bossOpen && !bossDone ? "" : bossDone ? "" : "disabled"}>
        <span class="mon">${MONSTER_EMOJI[m.jefe.sprite] || "💀"}</span>
        <span class="rname">JEFE · ${m.jefe.nombre}</span>
        <span class="rmon">${bossDone ? "✔ derrotado" : bossOpen ? "¡disponible!" : "limpia todas las salas"}</span>
      </button>`;

      return `<section class="dungeon">
        <div class="dhead">
          <div>
            <h3>${m.nombre}</h3>
            <p class="book">${m.libro} — ${m.autor}</p>
          </div>
          <div class="dpct"><b>${st.pct}%</b><span>${st.estado}</span></div>
        </div>
        <div class="bar"><i style="width:${st.pct}%"></i></div>
        <p class="resumen">${m.resumen}</p>
        <div class="rooms">${rooms}</div>
      </section>`;
    };

    const dragonReady = this.world.mazmorras.filter((m) => this.progress.dungeons[m.id].boss).length >= 2;
    const dragonDone = this.progress.dragon[this.world.dragon.semana];
    const dragon = `<section class="dungeon dragon">
      <div class="dhead"><div>
        <h3>🐉 ${this.world.dragon.nombre}</h3>
        <p class="book">Jefe semanal · ${this.world.dragon.semana}</p>
      </div></div>
      <p class="resumen">${this.world.dragon.intro}</p>
      <div class="rooms"><button class="room boss ${dragonDone ? "done" : dragonReady ? "open" : "locked"}"
        data-act="dragon" ${dragonReady && !dragonDone ? "" : "disabled"}>
        <span class="mon">🐉</span>
        <span class="rname">Enfrentar al dragón</span>
        <span class="rmon">${dragonDone ? "✔ vencido esta semana" : dragonReady ? "¡despierto!" : "vence 2 jefes para despertarlo"}</span>
      </button></div>
    </section>`;

    body.innerHTML =
      active.map(card).join("") +
      dragon +
      (archived.length
        ? `<h4 class="arch">📚 Archivo — dominadas</h4>` + archived.map(card).join("")
        : "");
  },

  // ------------------------------------------------------------- combate

  startCombat(kind, dungeonId, roomId) {
    const m = this.world.mazmorras.find((d) => d.id === dungeonId);
    let questions, name, sprite;
    if (kind === "dragon") {
      questions = this.world.dragon.preguntas;
      name = this.world.dragon.nombre;
      sprite = "dragon";
    } else if (kind === "boss") {
      questions = m.jefe.preguntas;
      name = m.jefe.nombre;
      sprite = m.jefe.sprite;
    } else {
      const s = m.salas.find((r) => r.id === roomId);
      questions = s.preguntas;
      name = s.monstruo;
      sprite = s.sprite;
    }
    const cards = m ? this.world.cartas.filter((c) => c.libro && m.libro.startsWith(c.libro)) : [];
    this.combat = {
      kind, dungeonId, roomId, name, sprite,
      questions: shuffle(questions),
      index: 0,
      hearts: 3,
      hp: questions.length,
      answered: null,
      match: null,
      matchUsed: cards.length < 3,
      cards,
      over: null,
    };
    this.render();
  },

  answer(i) {
    const c = this.combat;
    if (c.answered !== null) return;
    const q = c.questions[c.index];
    c.answered = i;
    if (i === q.c) {
      // max(0, …): si el minijuego de enlaces ya había bajado hp a 0 antes
      // de esta pregunta, bajarlo más lo dejaba negativo y "🟥".repeat(hp)
      // tronaba a mitad del render — la respuesta se guardaba pero la
      // pantalla se quedaba congelada sin mostrar bien/mal ni "Siguiente".
      c.hp = Math.max(0, c.hp - 1);
      this.progress.xp += REWARD.question.xp;
      grantStudyReward(REWARD.question.gold, REWARD.question.mana);
      this.countStudyAction();
    } else {
      c.hearts--;
    }
    updateHud();
    this.render();
  },

  next() {
    const c = this.combat;
    c.answered = null;
    if (c.hearts <= 0) {
      c.over = "lose";
      return this.render();
    }
    c.index++;
    if (c.index >= c.questions.length) {
      c.over = "win";
      this.finishCombat();
      return this.render();
    }
    // Minijuego de enlaces: una vez por combate, a partir de la 2ª pregunta.
    if (!c.matchUsed && c.index >= 1 && Math.random() < 0.5) {
      c.matchUsed = true;
      const picked = shuffle(c.cards).slice(0, 3);
      c.match = {
        left: shuffle(picked),
        right: shuffle(picked),
        pick: null,
        solved: {},
        wrong: null,
      };
    }
    this.render();
  },

  matchPick(side, id) {
    const mt = this.combat.match;
    if (mt.solved[id]) return;
    if (side === "l") {
      mt.pick = id;
      mt.wrong = null;
    } else if (mt.pick) {
      if (mt.pick === id) {
        mt.solved[id] = true;
        mt.wrong = null;
      } else {
        mt.wrong = id;
      }
      mt.pick = null;
    }
    if (Object.keys(mt.solved).length === 3) {
      this.combat.hp = Math.max(0, this.combat.hp - 1);
      this.grant(REWARD.match, "🔗 Golpe limpio");
    }
    this.render();
  },

  finishCombat() {
    const c = this.combat;
    const p = this.progress;
    if (c.kind === "room") {
      p.dungeons[c.dungeonId].rooms[c.roomId] = true;
      this.grant(REWARD.room, "Sala limpiada");
    } else if (c.kind === "boss") {
      p.dungeons[c.dungeonId].boss = true;
      this.grant(REWARD.boss, "¡Jefe derrotado!");
      const m = this.world.mazmorras.find((d) => d.id === c.dungeonId);
      if (this.dungeonState(m).archived) toast("📚 " + m.nombre + " archivada — Dominio completo");
    } else if (c.kind === "dragon") {
      p.dragon[this.world.dragon.semana] = true;
      this.grant(REWARD.dragon, "🐉 ¡Dragón vencido!");
    }
  },

  renderCombat(body) {
    const c = this.combat;
    const hearts = "❤️".repeat(Math.max(0, c.hearts)) + "🖤".repeat(Math.max(0, 3 - c.hearts));

    if (c.over === "win") {
      body.innerHTML = `<div class="result win">
        <div class="big">${MONSTER_EMOJI[c.sprite] || "👾"}💥</div>
        <h3>¡${c.name} derrotado!</h3>
        <p>El maná fluye hacia tu granja.</p>
        <button class="primary" data-act="back">Volver</button>
      </div>`;
      return;
    }
    if (c.over === "lose") {
      body.innerHTML = `<div class="result lose">
        <div class="big">💀</div>
        <h3>Te venció ${c.name}</h3>
        <p>Repasa y vuelve a intentarlo — el progreso de la sala no se pierde.</p>
        <button class="primary" data-act="retry">Reintentar</button>
        <button data-act="back">Volver</button>
      </div>`;
      return;
    }

    if (c.match) {
      const mt = c.match;
      const li = (side, card, text) => {
        const solved = mt.solved[card.id];
        const cls = solved ? "solved" : mt.pick === card.id && side === "l" ? "picked" : mt.wrong === card.id ? "wrong" : "";
        return `<button class="mcell ${cls}" data-act="match" data-side="${side}" data-id="${card.id}"
          ${solved ? "disabled" : ""}>${text}</button>`;
      };
      body.innerHTML = `<div class="combat">
        <div class="chead"><span class="mon big">🔗</span>
          <div><h3>Desafío de enlaces</h3><p>Une cada concepto con su definición</p></div>
        </div>
        <div class="match">
          <div>${mt.left.map((x) => li("l", x, x.frente)).join("")}</div>
          <div>${mt.right.map((x) => li("r", x, x.dorso)).join("")}</div>
        </div>
        <button class="primary" data-act="matchdone">${Object.keys(mt.solved).length === 3 ? "Continuar" : "Saltar"}</button>
      </div>`;
      return;
    }

    const q = c.questions[c.index];
    const opts = q.o
      .map((o, i) => {
        let cls = "";
        if (c.answered !== null) {
          if (i === q.c) cls = "ok";
          else if (i === c.answered) cls = "bad";
        }
        return `<button class="opt ${cls}" data-act="answer" data-i="${i}"
          ${c.answered !== null ? "disabled" : ""}>${o}</button>`;
      })
      .join("");

    body.innerHTML = `<div class="combat">
      <div class="chead">
        <span class="mon big">${MONSTER_EMOJI[c.sprite] || "👾"}</span>
        <div>
          <h3>${c.name}</h3>
          <p>Pregunta ${c.index + 1}/${c.questions.length} · vida ${"🟥".repeat(Math.max(0, c.hp))}</p>
        </div>
        <div class="hearts">${hearts}</div>
      </div>
      <p class="q">${q.q}</p>
      <div class="opts">${opts}</div>
      ${c.answered !== null
        ? `<div class="expl ${c.answered === q.c ? "ok" : "bad"}">
             <b>${c.answered === q.c ? "Correcto" : "Incorrecto"}</b> — ${q.x || ""}
           </div>
           <button class="primary" data-act="next">Siguiente</button>`
        : ""}
    </div>`;
  },

  // ------------------------------------------------------------- grimorio

  dueCards() {
    const today = dayNumber();
    return this.world.cartas
      .filter((c) => (this.progress.cards[c.id] || { due: 0 }).due <= today)
      .sort((a, b) => (this.progress.cards[b.id].fails || 0) - (this.progress.cards[a.id].fails || 0));
  },

  weakCards() {
    return this.world.cartas
      .slice()
      .sort((a, b) => (this.progress.cards[b.id].fails || 0) - (this.progress.cards[a.id].fails || 0))
      .filter((c) => (this.progress.cards[c.id].fails || 0) > 0)
      .slice(0, 8);
  },

  renderGrimoire(body) {
    const due = this.dueCards();
    const weak = this.weakCards();
    const boxes = [0, 0, 0, 0, 0, 0];
    for (const c of this.world.cartas) boxes[this.progress.cards[c.id].box]++;

    body.innerHTML = `
      <div class="panelrow">
        <div class="stat"><b>${this.world.cartas.length}</b><span>cartas</span></div>
        <div class="stat"><b>${due.length}</b><span>por repasar</span></div>
        <div class="stat"><b>${boxes[4] + boxes[5]}</b><span>dominadas</span></div>
      </div>
      <div class="boxes">
        ${boxes.map((n, i) => `<div><i style="height:${Math.min(100, n * 12)}px"></i><span>caja ${i}</span><b>${n}</b></div>`).join("")}
      </div>
      <div class="actions">
        <button class="primary" data-act="cards" data-mode="due" ${due.length ? "" : "disabled"}>
          Repasar ${due.length} carta(s)
        </button>
        <button data-act="cards" data-mode="weak" ${weak.length ? "" : "disabled"}>
          🎯 Misión de refuerzo (${weak.length} puntos débiles)
        </button>
      </div>
      <p class="hint">Leitner: acertar sube la carta de caja (intervalos ${LEITNER.join(", ")} días); fallar la devuelve a la caja 0.</p>`;
  },

  startCards(mode) {
    const list = mode === "weak" ? this.weakCards() : this.dueCards();
    if (!list.length) return;
    this.session = { list: shuffle(list), i: 0, revealed: false, right: 0, mode };
    this.render();
  },

  rateCard(known) {
    const s = this.session;
    const card = s.list[s.i];
    const st = this.progress.cards[card.id];
    if (known) {
      st.box = Math.min(LEITNER.length - 1, st.box + 1);
      st.due = dayNumber() + LEITNER[st.box];
      s.right++;
      this.progress.xp += REWARD.card.xp;
      grantStudyReward(REWARD.card.gold, REWARD.card.mana);
      this.countStudyAction();
      updateHud();
    } else {
      st.box = 0;
      st.due = dayNumber();
      st.fails = (st.fails || 0) + 1;
    }
    s.i++;
    s.revealed = false;
    if (s.i >= s.list.length) {
      toast("Grimorio: " + s.right + "/" + s.list.length + " dominadas");
      this.session = null;
      saveGame();
    }
    this.render();
  },

  renderCards(body) {
    const s = this.session;
    const card = s.list[s.i];
    const st = this.progress.cards[card.id];
    body.innerHTML = `<div class="flash">
      <p class="progresstxt">Carta ${s.i + 1}/${s.list.length} · caja ${st.box} · ${card.libro}</p>
      <div class="card ${s.revealed ? "flip" : ""}">
        <h3>${card.frente}</h3>
        ${s.revealed ? `<p>${card.dorso}</p>` : `<p class="muted">¿Recuerdas la definición?</p>`}
      </div>
      ${s.revealed
        ? `<div class="actions">
             <button class="primary" data-act="rate" data-k="1">✅ La sabía</button>
             <button data-act="rate" data-k="0">❌ No la sabía</button>
           </div>`
        : `<button class="primary" data-act="reveal">Revelar</button>`}
    </div>`;
  },

  // ------------------------------------------------------------- repaso

  allQuestions() {
    const out = [];
    for (const m of this.world.mazmorras) {
      for (const s of m.salas) for (const q of s.preguntas) out.push({ q, libro: m.libro, sprite: s.sprite });
      for (const q of m.jefe.preguntas) out.push({ q, libro: m.libro, sprite: m.jefe.sprite });
    }
    return out;
  },

  renderReview(body) {
    const p = this.progress;
    const doneToday = p.reviewDay === todayKey();
    const pool = this.allQuestions();
    body.innerHTML = `
      <div class="panelrow">
        <div class="stat"><b>${p.dailyCount}/10</b><span>meta diaria</span></div>
        <div class="stat"><b>🔥 ${p.streak}</b><span>racha</span></div>
        <div class="stat"><b>🛡 ${p.shield}</b><span>escudos</span></div>
      </div>
      <div class="empty">
        <h3>🔁 Repaso general</h3>
        <p>10 preguntas al azar de tus ${this.world.mazmorras.length} libros (${pool.length} disponibles),
           sin repetir en el mismo día. Cada acierto da XP, oro y maná.</p>
        ${doneToday ? `<p class="muted">Ya hiciste el repaso de hoy, pero puedes repetirlo.</p>` : ""}
        <button class="primary" data-act="review">Empezar repaso</button>
      </div>`;
  },

  startReview() {
    const p = this.progress;
    this.rollDay();
    let pool = this.allQuestions().filter((x) => !p.reviewSeen.includes(x.q.q));
    if (pool.length < 10) {
      p.reviewSeen = [];
      pool = this.allQuestions();
    }
    const picked = shuffle(pool).slice(0, 10);
    for (const x of picked) p.reviewSeen.push(x.q.q);
    p.reviewDay = todayKey();
    this.combat = {
      kind: "daily",
      name: "Repaso general",
      sprite: "eye",
      questions: picked.map((x) => x.q),
      index: 0,
      hearts: 99,
      hp: 10,
      answered: null,
      matchUsed: true,
      cards: [],
      over: null,
    };
    this.render();
  },

  // ------------------------------------------------------------- stats

  renderStats(body) {
    const p = this.progress;
    const lvl = this.level;
    const cur = p.xp - this.xpForLevel(lvl);
    const need = this.xpForLevel(lvl + 1) - this.xpForLevel(lvl);
    const rows = this.world.mazmorras
      .map((m) => {
        const st = this.dungeonState(m);
        return `<tr><td>${m.libro}</td><td>${st.done}/${st.total}</td>
          <td>${st.boss ? "✔" : "—"}</td><td><div class="bar sm"><i style="width:${st.pct}%"></i></div></td>
          <td>${st.estado}</td></tr>`;
      })
      .join("");
    body.innerHTML = `
      <div class="levelbox">
        <div class="lvl">${lvl}</div>
        <div>
          <h3>${this.title}</h3>
          <div class="bar"><i style="width:${Math.round((cur / need) * 100)}%"></i></div>
          <p class="muted">${cur} / ${need} XP hacia el nivel ${lvl + 1} · ${p.xp} XP totales</p>
        </div>
      </div>
      <div class="panelrow">
        <div class="stat"><b>🔥 ${p.streak}</b><span>racha</span></div>
        <div class="stat"><b>${p.dailyCount}/10</b><span>hoy</span></div>
        <div class="stat"><b>✨ ${game.mana}/${game.manaMax}</b><span>maná</span></div>
      </div>
      <table class="dom"><thead><tr><th>Libro</th><th>Salas</th><th>Jefe</th><th>Dominio</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>
      <p class="hint">Contenido: <b>${this.world.version}</b> · generado ${this.world.generado}.
        Regenera <code>world.json</code> con tu pipeline de Obsidian y el progreso se conserva por id.</p>`;
  },

  // ------------------------------------------------------------- acciones

  action(act, data) {
    if (act === "room") return this.startCombat("room", data.d, data.s);
    if (act === "boss") return this.startCombat("boss", data.d);
    if (act === "dragon") return this.startCombat("dragon");
    if (act === "answer") return this.answer(Number(data.i));
    if (act === "next") return this.next();
    if (act === "retry") return this.startCombat(this.combat.kind, this.combat.dungeonId, this.combat.roomId);
    if (act === "back") {
      this.combat = null;
      return this.render();
    }
    if (act === "match") return this.matchPick(data.side, data.id);
    if (act === "matchdone") {
      this.combat.match = null;
      return this.render();
    }
    if (act === "cards") return this.startCards(data.mode);
    if (act === "reveal") {
      this.session.revealed = true;
      return this.render();
    }
    if (act === "rate") return this.rateCard(data.k === "1");
    if (act === "review") return this.startReview();
  },
};
