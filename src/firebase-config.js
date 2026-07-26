// Config del proyecto Firebase (Web). Estos valores NO son secretos — Firebase
// los expone así en cualquier app cliente; la seguridad real la dan las
// reglas de Firestore (ver firestore.rules), no ocultar esta config.
//
// Rellénalos después de crear tu proyecto en https://console.firebase.google.com
// (ver GUIA-DESPLIEGUE.md, sección "Firebase"). Mientras apiKey empiece con
// "TU_", el juego funciona normal pero solo guarda en este navegador
// (localStorage) — el botón ☁ te avisará que falta configurar.

const FIREBASE_CONFIG = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};
