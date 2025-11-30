// cjs/core/state.js
// Gestion d'état centralisée  --> store centralisé

const AppState = {
  data: [],
  zonesConfig: [],
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
    darkMode: 'system',
    anonymizeEnabled: false
  },
  locks: {
    editingLockerNumber: null,
    editingLockerVersion: null,
    activeLocks: new Map()
  },
  config: {
    ui: {
      animationDuration: 500,
      searchDebounceDelay: 400,
      lockRenewInterval: 2 * 60 * 1000
    },
    api: {
      retryAttempts: 3,
      timeout: 30000
    },
    display: {
      anonymization: {
        maxNameLength: 3,
        maxFirstNameLength: 2
      }
    }
  }
};

// Getters/Setters avec validation
function getState(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], AppState);
}

function setState(path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((obj, key) => obj[key], AppState);
  target[lastKey] = value;
  
  // Trigger watchers/listeners si nécessaire
  notifyStateChange(path, value);
}

// Rendre les fonctions globales
window.getState = getState;
window.setState = setState;
window.AppState = AppState;

