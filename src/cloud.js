// Sincronización manual con Firebase. Sin login: cada partida se identifica
// por un "código" corto (como el código de una sala) guardado en
// localStorage. Compartir el mismo código en otro dispositivo permite
// cargar el mismo progreso ahí — pensado para un solo jugador en varios
// dispositivos, no para cuentas multiusuario.

const CLOUD_CODE_KEY = "dreamy-sprout-farm-code";
const FIRESTORE_COLLECTION = "granjas";
const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.14.1";

const Cloud = {
  el: null,
  ready: false,
  busy: false,
  status: "",
  code: "",
  lastSync: null,
  db: null,

  buildDom() {
    const el = document.createElement("div");
    el.id = "cloud";
    el.className = "study hidden";
    el.innerHTML = `
      <div class="study-panel cloud-panel">
        <header class="cloud-head">
          <h2>☁ Sincronización</h2>
          <button class="close" data-act="close">✕</button>
        </header>
        <div class="study-body" id="cloud-body"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "close") return this.close();
      if (b.dataset.act === "push") return this.push();
      if (b.dataset.act === "pull") return this.pull();
      if (b.dataset.act === "newcode") return this.newCode();
    });
    el.addEventListener("change", (e) => {
      if (e.target.id === "cloud-code-input") {
        this.code = e.target.value.trim().toLowerCase();
        localStorage.setItem(CLOUD_CODE_KEY, this.code);
        this.render();
      }
    });
  },

  isConfigured() {
    return FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("TU_");
  },

  async init() {
    this.code = localStorage.getItem(CLOUD_CODE_KEY) || "";
    if (!this.isConfigured()) {
      this.status = "Firebase no configurado todavía (ver GUIA-DESPLIEGUE.md)";
      return;
    }
    try {
      const [{ initializeApp }, firestore] = await Promise.all([
        import(FIREBASE_SDK + "/firebase-app.js"),
        import(FIREBASE_SDK + "/firebase-firestore.js"),
      ]);
      const app = initializeApp(FIREBASE_CONFIG);
      this.db = firestore.getFirestore(app);
      this._doc = firestore.doc;
      this._getDoc = firestore.getDoc;
      this._setDoc = firestore.setDoc;
      this.ready = true;
      this.status = this.code ? "Listo" : "Listo — crea un código para empezar";
    } catch (err) {
      this.status = "No se pudo cargar Firebase: " + err.message;
      console.warn(err);
    }
  },

  newCode() {
    this.code = Math.random().toString(36).slice(2, 8);
    localStorage.setItem(CLOUD_CODE_KEY, this.code);
    toast("Código creado: " + this.code + " — anótalo para usarlo en otro dispositivo");
    this.render();
  },

  async push() {
    if (!this.ready) return toast("Configura Firebase primero (ver GUIA-DESPLIEGUE.md)");
    if (!this.code) this.newCode();
    this.busy = true;
    this.render();
    try {
      const data = { v: 1, savedAt: Date.now(), farm: snapshotFarm(), study: Study.progress };
      await this._setDoc(this._doc(this.db, FIRESTORE_COLLECTION, this.code), data);
      this.lastSync = new Date();
      this.status = "Guardado en la nube";
      toast("☁ Progreso guardado en la nube");
    } catch (err) {
      this.status = "Error al guardar: " + err.message;
      toast("☁ No se pudo guardar: " + err.message);
    }
    this.busy = false;
    this.render();
  },

  async pull() {
    if (!this.ready) return toast("Configura Firebase primero (ver GUIA-DESPLIEGUE.md)");
    if (!this.code) return toast("Escribe un código de sincronización primero");
    this.busy = true;
    this.render();
    try {
      const snap = await this._getDoc(this._doc(this.db, FIRESTORE_COLLECTION, this.code));
      if (!snap.exists()) {
        toast("No hay ningún respaldo guardado con ese código");
      } else {
        const data = snap.data();
        applyFarm(data.farm);
        if (data.study) Object.assign(Study.progress, data.study);
        Study.rollDay();
        updateHud();
        saveGame();
        this.lastSync = new Date();
        this.status = "Cargado desde la nube";
        toast("☁ Progreso cargado de la nube");
      }
    } catch (err) {
      this.status = "Error al cargar: " + err.message;
      toast("☁ No se pudo cargar: " + err.message);
    }
    this.busy = false;
    this.render();
  },

  open() {
    this.el.classList.remove("hidden");
    syncPause();
    this.render();
  },
  close() {
    this.el.classList.add("hidden");
    syncPause();
  },
  get isOpen() {
    return this.el && !this.el.classList.contains("hidden");
  },

  render() {
    const body = document.getElementById("cloud-body");
    if (!this.isConfigured()) {
      body.innerHTML = `<div class="empty">
        <h3>☁ Firebase no configurado</h3>
        <p>El progreso se sigue guardando en este navegador (localStorage).
        Para sincronizarlo entre dispositivos, sigue <code>GUIA-DESPLIEGUE.md</code>
        y rellena <code>src/firebase-config.js</code> con tu proyecto de Firebase.</p>
      </div>`;
      return;
    }
    body.innerHTML = `
      <p class="resumen">Tu progreso viaja con un código corto, no con una cuenta.
      Usa el mismo código en otro dispositivo para continuar ahí tu granja.</p>
      <label class="codebox">
        Código de sincronización
        <div class="coderow">
          <input id="cloud-code-input" type="text" maxlength="12"
                 placeholder="ej. h8x2qz" value="${this.code}" ${this.busy ? "disabled" : ""} />
          <button data-act="newcode" ${this.busy ? "disabled" : ""}>🎲 Nuevo</button>
        </div>
      </label>
      <div class="actions">
        <button class="primary" data-act="push" ${this.busy ? "disabled" : ""}>☁⬆ Guardar en la nube</button>
        <button data-act="pull" ${this.busy ? "disabled" : ""}>☁⬇ Cargar de la nube</button>
      </div>
      <p class="hint">${this.busy ? "Sincronizando…" : this.status}
        ${this.lastSync ? " · " + this.lastSync.toLocaleTimeString() : ""}</p>`;
  },
};
