// ==========================================
// FIREBASE CONFIG & INIT (COMPAT VERSION)
// ==========================================
// Firebase Konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyAYo74AlM-21r-wSIlyo2g_xQRodczE000",
  authDomain: "whsbuscontroller.firebaseapp.com",
  databaseURL: "https://whsbuscontroller-default-rtdb.firebaseio.com",
  projectId: "whsbuscontroller",
  storageBucket: "whsbuscontroller.firebasestorage.app",
  messagingSenderId: "824973683961",
  appId: "1:824973683961:web:225bed8f5743d6c7524628",
  measurementId: "G-DNXF26M2SJ"
};

// Initialisierung über das globale firebase-Objekt (Compat-Modus)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Globale Variablen für auth und db definieren, damit login.html darauf zugreifen kann
window.auth = firebase.auth();
window.db = firebase.database();

// ==========================================
// GLOBALE KARTEN-FUNKTIONEN
// ==========================================
let map, hazardLayer, routeLayer;

function initMap(mapId) {
    map = L.map(mapId).setView([-42.716, 170.966], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    hazardLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
}

// Lädt ALLES (für alle Rollen sichtbar)
function loadPublicData() {
    // 1. Hazards laden
    db.ref('hazards').on('value', snapshot => {
        hazardLayer.clearLayers();
        const data = snapshot.val();
        if (data) {
            Object.values(data).forEach(h => {
                L.circleMarker([h.lat, h.lng], { radius: 8, fillColor: '#F56C6C', color: '#fff', weight: 2, fillOpacity: 1 })
                 .addTo(hazardLayer)
                 .bindPopup(`<b>⚠️ ${h.title}</b><br>${h.desc}`);
            });
        }
    });

    // 2. Schulrouten laden
    db.ref('schools').on('value', snapshot => {
        routeLayer.clearLayers();
        const data = snapshot.val();
        if (data) {
            Object.values(data).forEach(school => {
                if (school.routes) {
                    Object.values(school.routes).forEach(route => {
                        if (route.coords) L.polyline(route.coords, { color: route.color, weight: 4 }).addTo(routeLayer);
                    });
                }
            });
        }
    });
}

function logout() {
    auth.signOut().then(() => window.location.href = "index.html");
}
