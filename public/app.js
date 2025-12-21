// ============ APP.JS - GESTION GLOBALE DE L'APPLICATION ============

// Import du système de state centralisé
//import { getState, setState, watch } from './cjs/core/state.js';

// ============ VARIABLES GLOBALES RÉELLES (non migrées vers state) ============
// Ces variables restent globales car elles sont des constantes ou peu critiques
const API_URL = getState('config.api.baseURL');
window.API_URL = API_URL;

// ============ COMPATIBILITÉ : VARIABLES GLOBALES → STATE ============
// Ces getters/setters permettent au code existant de continuer à fonctionner
// en utilisant les variables globales, mais en lisant/écrivant dans le state

// --- AUTHENTIFICATION ---
/*Object.defineProperty(window, 'CSRF_TOKEN', {
  get: () => getState('auth.csrfToken'),
  set: (value) => setState('auth.csrfToken', value),
  configurable: true
});*/

// ============ INITIALISATION AU CHARGEMENT DE LA PAGE ============

document.addEventListener('DOMContentLoaded', async function() {
  Logger.info('🚀 Initialisation de l\'application...');
  
  // Charger le token CSRF en premier
  try {
        await loadCsrfToken();
  } catch (err) {
        Logger.error('❌ Impossible de charger le token CSRF:', err);
        alert('Erreur de sécurité. Veuillez recharger la page.');
        return; // Arrêter l'init si pas de token
  }

  // Détecter si mode mobile
  detectMobile();
  
  // Ajouter listener pour resize
  window.addEventListener('resize', detectMobile);
  
  // Vérifier si login automatique en guest (via URL ?guest=true)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('guest') === 'true') {
    Logger.info('🔓 Connexion automatique en mode guest (URL)');
    loginAsGuestAuto();
  } else {
    showLoginPage(true); // Afficher la page de login
    setupLoginPage();
  }
  
  Logger.info('✅ Application initialisée');
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

// --- Chargement de la configuration des zones
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

    setState('data.zonesConfig', data.zones);
    Logger.info('📋 Configuration zones chargée:', data.zones.length, 'zone(s)');
    Logger.debug(zonesList);

  } catch (err) {
    Logger.error('✖ Erreur chargement zones:', err);
    throw err;
  }
}

// --- Chargement des données casiers
async function loadData() {
  try {
    const data = await fetchJSON(`${API_URL}/lockers`, {
      credentials: 'include'
    });
    
    setState('data.lockers', data);
    renderAllTables();
    updateCounters();
    Logger.debug('✓ Données chargées:', data.length, 'casier(s)');
    
  } catch (err) {
    Logger.error('✖ Erreur chargement données:', err);
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

// ============ WATCHERS AUTOMATIQUES ============

// Re-render quand les données changent
watch('data.lockers', () => {
  renderAllTables();
  updateCounters();
});

// Mettre à jour l'UI quand l'auth change
/*watch('auth', (auth) => {
  updateAuthStatus();
  if (auth.isGuest) {
    applyGuestDefaults();
  } else if (auth.isAuthenticated) {
    applyAdminDefaults();
  }
});*/

// Appliquer le dark mode automatiquement
//watch('ui.darkMode', (mode) => {
//  applyDarkMode(mode);
//});

// Logger les changements en mode debug
if (getState('config.verbose') > 1) {
  watch('*', (value, oldValue, path) => {
    Logger.debug(`🔄 [${path}]`, oldValue, '→', value);
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

Logger.debug('📦 State management activé - utilisez getState() et setState() pour le debug');
