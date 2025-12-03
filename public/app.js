// ============ APP.JS - GESTION GLOBALE DE L'APPLICATION ============

// Import du système de state centralisé
//import { getState, setState } from './cjs/core/state.js';

// ============ CONFIGURATION ============
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000/api' 
  : '/api';

const VERBCONSOLE = 1; // 0=rien, 1=logs importants, 2=tous les logs

// Constantes d'anonymisation (peuvent être déplacées dans state.config)
const NB_MAX_ANON_NOM = 3;
const NB_MAX_ANON_PRENOM = 2;
const NB_MAX_CAR_NOM = 20;
const NB_MAX_CAR_PRENOM = 15;

// ============ COMPATIBILITÉ : VARIABLES GLOBALES → STATE ============
// Ces getters/setters permettent au code existant de continuer à fonctionner
// en utilisant les variables globales, mais en lisant/écrivant dans le state

// --- DATA ET CONFIGURATION ---
Object.defineProperty(window, 'DATA', {
  get: () => getState('data.lockers'),
  set: (value) => setState('data.lockers', value),
  configurable: true
});

Object.defineProperty(window, 'ZONES_CONFIG', {
  get: () => getState('data.zonesConfig'),
  set: (value) => setState('data.zonesConfig', value),
  configurable: true
});

// --- AUTHENTIFICATION ---
Object.defineProperty(window, 'IS_AUTHENTICATED', {
  get: () => getState('auth.isAuthenticated'),
  set: (value) => setState('auth.isAuthenticated', value),
  configurable: true
});

Object.defineProperty(window, 'IS_GUEST', {
  get: () => getState('auth.isGuest'),
  set: (value) => setState('auth.isGuest', value),
  configurable: true
});

Object.defineProperty(window, 'USER_NAME', {
  get: () => getState('auth.userName'),
  set: (value) => setState('auth.userName', value),
  configurable: true
});

Object.defineProperty(window, 'CSRF_TOKEN', {
  get: () => getState('auth.csrfToken'),
  set: (value) => setState('auth.csrfToken', value),
  configurable: true
});

// --- UI STATE ---
Object.defineProperty(window, 'CURRENT_ZONE', {
  get: () => getState('ui.currentZone'),
  set: (value) => setState('ui.currentZone', value),
  configurable: true
});

Object.defineProperty(window, 'CURRENT_FILTER', {
  get: () => getState('ui.currentFilter'),
  set: (value) => setState('ui.currentFilter', value),
  configurable: true
});

Object.defineProperty(window, 'SEARCH_RESULTS', {
  get: () => getState('ui.searchResults'),
  set: (value) => setState('ui.searchResults', value),
  configurable: true
});

Object.defineProperty(window, 'SEARCH_RESULTS_MARKED', {
  get: () => getState('ui.searchResultsMarked'),
  set: (value) => setState('ui.searchResultsMarked', value),
  configurable: true
});

Object.defineProperty(window, 'ANONYMIZE_ENABLED', {
  get: () => getState('ui.anonymizeEnabled'),
  set: (value) => setState('ui.anonymizeEnabled', value),
  configurable: true
});

Object.defineProperty(window, 'DARK_MODE_SETTING', {
  get: () => getState('ui.darkMode'),
  set: (value) => setState('ui.darkMode', value),
  configurable: true
});

Object.defineProperty(window, 'IS_MOBILE', {
  get: () => getState('ui.isMobile'),
  set: (value) => setState('ui.isMobile', value),
  configurable: true
});

// --- LOCKS (ÉDITION DE CASIERS) ---
Object.defineProperty(window, 'EDITING_LOCKER_NUMBER', {
  get: () => getState('locks.editingLockerNumber'),
  set: (value) => setState('locks.editingLockerNumber', value),
  configurable: true
});

Object.defineProperty(window, 'EDITING_LOCKER_VERSION', {
  get: () => getState('locks.editingLockerVersion'),
  set: (value) => setState('locks.editingLockerVersion', value),
  configurable: true
});

// --- MODALES TEMPORAIRES ---
Object.defineProperty(window, 'CURRENT_LOCKER_FOR_HOSP', {
  get: () => getState('ui.currentLockerForHosp'),
  set: (value) => setState('ui.currentLockerForHosp', value),
  configurable: true
});

Object.defineProperty(window, 'CURRENT_LOCKER_FOR_PRINT', {
  get: () => getState('ui.currentLockerForPrint'),
  set: (value) => setState('ui.currentLockerForPrint', value),
  configurable: true
});

// --- CONSULTATION (MODAL MULTI-ZONES) ---
Object.defineProperty(window, 'consultationData', {
  get: () => getState('ui.consultationData'),
  set: (value) => setState('ui.consultationData', value),
  configurable: true
});

Object.defineProperty(window, 'consultationSortColumn', {
  get: () => getState('ui.consultationSortColumn'),
  set: (value) => setState('ui.consultationSortColumn', value),
  configurable: true
});

Object.defineProperty(window, 'consultationSortDirection', {
  get: () => getState('ui.consultationSortDirection'),
  set: (value) => setState('ui.consultationSortDirection', value),
  configurable: true
});

// ============ VARIABLES GLOBALES RÉELLES (non migrées vers state) ============
// Ces variables restent globales car elles sont des constantes ou peu critiques

window.API_URL = API_URL;
window.VERBCONSOLE = VERBCONSOLE;
window.NB_MAX_ANON_NOM = NB_MAX_ANON_NOM;
window.NB_MAX_ANON_PRENOM = NB_MAX_ANON_PRENOM;
window.NB_MAX_CAR_NOM = NB_MAX_CAR_NOM;
window.NB_MAX_CAR_PRENOM = NB_MAX_CAR_PRENOM;

// ============ INITIALISATION AU CHARGEMENT DE LA PAGE ============

document.addEventListener('DOMContentLoaded', async function() {
  if (VERBCONSOLE > 0) {
    console.log('🚀 Initialisation de l\'application...');
  }
  
  // Détecter si mode mobile
  detectMobile();
  
  // Ajouter listener pour resize
  window.addEventListener('resize', detectMobile);
  
  // Vérifier si login automatique en guest (via URL ?guest=true)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('guest') === 'true') {
    if (VERBCONSOLE > 0) {
      console.log('🔓 Connexion automatique en mode guest (URL)');
    }
    loginAsGuestAuto();
  } else {
    // Afficher la page de login
    showLoginPage(true);
    setupLoginPage();
  }
  
  if (VERBCONSOLE > 0) {
    console.log('✅ Application initialisée');
  }
});

// ============ GESTION DES DONNÉES ============

// --- Nettoyer les noms de zones (utilisé par loadZonesConfig)
function sanitizeName(name) {
  // Nettoie d'abord le nom
  let cleanName = name.replace(/[^A-Z0-9_]/gi, '');

  // Mots-clé interdits dans le nom
  const sqlKeywords = ['DROP', 'TABLE', 'DELETE', 'INSERT', 'UPDATE', 'SELECT', 'ALTER', 'TRUNCATE', 'UNION', 'WHERE', 'FROM'];
  const hasKeyword = sqlKeywords.some(keyword => cleanName.includes(keyword));

  // Si un mot-clé est présent, ajoute un préfixe pour le rendre sûr
  if (hasKeyword) {
    cleanName = `Z_${cleanName}`;
  }
  return cleanName;
}

async function loadZonesConfig() {
  try {
    const data = await fetchJSON(`${API_URL}/config/zones`, {
      credentials: 'include'
    });

    const zonesList = data.zones
        .map(z => z.name)
        .map(name => sanitizeName(name))
        .map(z => `'${z}'`)
        .join(', ');
    if (VERBCONSOLE>0) {
        console.log(zonesList);
    }

    setState('data.zonesConfig', data.zones);
    
    if (VERBCONSOLE > 0) {
      console.log('📋 Configuration zones chargée:', data.zones.length, 'zone(s)');
    }
  } catch (err) {
    console.error('✖ Erreur chargement zones:', err);
    throw err;
  }
}

async function loadData() {
  try {
    const data = await fetchJSON(`${API_URL}/lockers`, {
      credentials: 'include'
    });
    
    setState('data.lockers', data);
    
    renderAllTables();
    updateCounters();
    
    if (VERBCONSOLE > 1) {
      console.log('✓ Données chargées:', data.length, 'casier(s)');
    }
  } catch (err) {
    console.error('✖ Erreur chargement données:', err);
    showStatus('Erreur de chargement des données', 'error');
  }
}

// ============ UTILITAIRES UI ============

function formatDate(dateStr) {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (err) {
    return dateStr;
  }
}

function updateCounters() {
  const zonesConfig = getState('data.zonesConfig');
  const lockers = getState('data.lockers');
  
  if (!zonesConfig || !lockers) return;
  
  zonesConfig.forEach(zone => {
    const counter = document.getElementById(`counter-${zone.name}`);
    if (!counter) return;
    
    const occupied = lockers.filter(l => l.zone === zone.name && l.occupied).length;
    const total = zone.count;
    const percentage = Math.round((occupied / total) * 100);
    
    counter.textContent = `${occupied}/${total}`;
    
    // Couleur selon occupation
    if (occupied >= total) {
      counter.style.background = '#ef4444'; // Rouge : plein
    } else if (percentage >= 80) {
      counter.style.background = '#f59e0b'; // Orange : ≥80%
    } else {
      counter.style.background = '#10b981'; // Vert : <80%
    }
  });
}

//import { getState, setState, watch } from './cjs/core/state.js';

// ============ WATCHERS AUTOMATIQUES ============

// Re-render quand les données changent
watch('data.lockers', () => {
  renderAllTables();
  updateCounters();
});

// Mettre à jour l'UI quand l'auth change
watch('auth', (auth) => {
  updateAuthStatus();
  if (auth.isGuest) {
    applyGuestDefaults();
  } else if (auth.isAuthenticated) {
    applyAdminDefaults();
  }
});

// Appliquer le dark mode automatiquement
watch('ui.darkMode', (mode) => {
  applyDarkMode(mode);
});

// Logger les changements en mode debug
if (VERBCONSOLE > 1) {
  watch('*', (value, oldValue, path) => {
    console.log(`🔄 [${path}]`, oldValue, '→', value);
  });
}

// ============ RENDRE LES FONCTIONS GLOBALES ============

window.loadZonesConfig = loadZonesConfig;
window.loadData = loadData;
window.formatDate = formatDate;
window.updateCounters = updateCounters;

// Exposer getState et setState pour le debug
window.getState = getState;
window.setState = setState;

if (VERBCONSOLE > 0) {
  console.log('📦 State management activé - utilisez getState() et setState() pour le debug');
}