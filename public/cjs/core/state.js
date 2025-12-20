// ============ GESTION D'ÉTAT CENTRALISÉE ============

// cjs/core/state.js : Gestion d'état centralisée  --> store centralisé

const AppState = {
  data: {
    lockers: [],
    zonesConfig: [],
    version: 0
  },
  auth: {
    isAuthenticated: false,
    isGuest: false,
    userName: '',
    csrfToken: null
  },
  ui: {
    currentZone: null,
    currentFilter: {},
    searchResults: [],
    searchResultsMarked: false,
    anonymizeEnabled: false,
    darkMode: 'system',
    isMobile: false,
    currentLockerForHosp: null,
    currentLockerForPrint: null,
    consultationData: [],
    consultationSortColumn: 'name',
    consultationSortDirection: 'asc'
  },
  locks: {
    editingLockerNumber: null,
    editingLockerVersion: null,
    activeLocks: new Map()
  },
  display: {
    anonymization: {
      maxAnonNameLength: 3,
      maxAnonFirstNameLength: 2
    },
    maxLengths: {
      maxNameLength: 20,
      maxFirstNameLength: 15
    }
  },
  config: {
    verbose: 1,
    ui: {
      animationDuration: 500,
      searchDebounceDelay: 400,
      lockRenewInterval: 2 * 60 * 1000
    },
    api: {
      baseURL: window.location.hostname === 'localhost' 
      ? 'http://localhost:5000/api' 
      : '/api',
      retryAttempts: 3,
      timeout: 30000
    }
  }
};

/*const AppConfig = {
  get API_URL() {
    return window.location.hostname === 'localhost' 
      ? 'http://localhost:5000/api' 
      : '/api';
  },
  get VERBCONSOLE() {
    return 0;
  }
};*/

// ============ SYSTÈME DE WATCHERS (OBSERVATEURS) ============

const stateWatchers = new Map();

/**
 * Enregistrer un watcher sur un chemin d'état
 * @param {string} path - Chemin à observer (ex: 'data.lockers', 'auth.isAuthenticated')
 * @param {Function} callback - Fonction appelée lors du changement (reçoit oldValue, newValue)
 * @returns {Function} Fonction pour désinscrire le watcher
 */
function watch(path, callback) {
  if (!stateWatchers.has(path)) {
    stateWatchers.set(path, new Set());
  }
  
  stateWatchers.get(path).add(callback);
  
  // Retourner une fonction pour se désinscrire
  return () => {
    const watchers = stateWatchers.get(path);
    if (watchers) {
      watchers.delete(callback);
      if (watchers.size === 0) {
        stateWatchers.delete(path);
      }
    }
  };
}

/**
 * Notifier les watchers d'un changement d'état
 * @param {string} path - Chemin modifié
 * @param {*} newValue - Nouvelle valeur
 * @param {*} oldValue - Ancienne valeur (optionnel)
 */
function notifyStateChange(path, newValue, oldValue) {
  // Notifier les watchers exacts
  const exactWatchers = stateWatchers.get(path);
  if (exactWatchers) {
    exactWatchers.forEach(callback => {
      try {
        callback(newValue, oldValue, path);
      } catch (err) {
        console.error(`Erreur dans watcher pour "${path}":`, err);
      }
    });
  }
  
  // Notifier les watchers parents (ex: 'data' pour 'data.lockers')
  const parts = path.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const parentPath = parts.slice(0, i).join('.');
    const parentWatchers = stateWatchers.get(parentPath);
    
    if (parentWatchers) {
      const parentValue = getState(parentPath);
      parentWatchers.forEach(callback => {
        try {
          callback(parentValue, undefined, parentPath);
        } catch (err) {
          console.error(`Erreur dans watcher parent pour "${parentPath}":`, err);
        }
      });
    }
  }
  
  // Notifier le watcher global '*'
  const globalWatchers = stateWatchers.get('*');
  if (globalWatchers) {
    globalWatchers.forEach(callback => {
      try {
        callback(newValue, oldValue, path);
      } catch (err) {
        console.error('Erreur dans watcher global:', err);
      }
    });
  }
}

// ============ GETTERS / SETTERS ============

/**
 * Récupérer une valeur du state
 * @param {string} path - Chemin (ex: 'auth.isAuthenticated', 'data.lockers')
 * @returns {*} La valeur
 */
function getState(path) {
  if (!path) return AppState;
  
  return path.split('.').reduce((obj, key) => {
    return obj?.[key];
  }, AppState);
}

/**
 * Définir une valeur dans le state
 * @param {string} path - Chemin (ex: 'auth.isAuthenticated')
 * @param {*} value - Nouvelle valeur
 */
function setState(path, value) {
  if (!path) {
    console.error('setState: path requis');
    return;
  }
  
  const keys = path.split('.');
  const lastKey = keys.pop();
  
  // Naviguer jusqu'au parent
  const parent = keys.reduce((obj, key) => {
    if (!obj[key]) obj[key] = {};
    return obj[key];
  }, AppState);
  
  // Sauvegarder l'ancienne valeur
  const oldValue = parent[lastKey];
  
  // Définir la nouvelle valeur
  parent[lastKey] = value;
  
  // Notifier les watchers
  notifyStateChange(path, value, oldValue);
}

/**
 * Réinitialiser une partie du state
 * @param {string} path - Chemin à réinitialiser
 */
function resetState(path) {
  const initialValues = {
    'data.lockers': [],
    'data.zonesConfig': [],
    'auth': {
      isAuthenticated: false,
      isGuest: false,
      userName: '',
      csrfToken: null
    },
    'ui': {
      currentZone: null,
      currentFilter: {},
      searchResults: [],
      searchResultsMarked: false,
      anonymizeEnabled: false,
      darkMode: 'system',
      isMobile: false,
      currentLockerForHosp: null,
      currentLockerForPrint: null,
      consultationData: [],
      consultationSortColumn: 'name',
      consultationSortDirection: 'asc'
    },
    'locks': {
      editingLockerNumber: null,
      editingLockerVersion: null,
      activeLocks: new Map()
    }
  };
  
  const initialValue = initialValues[path];
  if (initialValue !== undefined) {
    setState(path, JSON.parse(JSON.stringify(initialValue)));
  }
}

// ============ DEBUG UTILITIES ============

/**
 * Afficher l'état complet dans la console
 */
function debugState() {
  console.log('📦 État de l\'application:', AppState);
  console.log('👁️ Watchers actifs:', Array.from(stateWatchers.keys()));
}

/**
 * Afficher les watchers pour un chemin
 */
function debugWatchers(path) {
  const watchers = stateWatchers.get(path);
  if (watchers) {
    console.log(`👁️ ${watchers.size} watcher(s) pour "${path}"`);
  } else {
    console.log(`👁️ Aucun watcher pour "${path}"`);
  }
}

// ============ EXPORTS ============

/*export {
  AppState,
  getState,
  setState,
  resetState,
  watch,
  notifyStateChange,
  debugState,
  debugWatchers
};*/

// Rendre les fonctions globales
window.AppState = AppState;
//window.AppConfig = AppConfig;
window.getState = getState;
window.setState = setState;
window.resetState = resetState;

window.watch = watch;
window.notifyStateChange = notifyStateChange;
window.debugState = debugState;
window.debugWatchers = debugWatchers;


