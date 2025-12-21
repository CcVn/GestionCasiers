// ============ SYSTÈME DE LOGGING AVANCÉ ============

/**
 * Logger centralisé avec niveaux, persistance et formatage
 * 
 * Niveaux :
 * 0 = OFF    : Aucun log
 * 1 = INFO   : Logs importants uniquement
 * 2 = DEBUG  : Tous les logs (détails)
 * 3 = TRACE  : Logs ultra-détaillés (performance, state changes)
 * 
 * Usage :
 *   Logger.info('Message important');
 *   Logger.debug('Détails techniques');
 *   Logger.error('Erreur critique');
 */

const Logger = {
  // ========== CONFIGURATION ==========
  
  _level: 0,
  _initialized: false,
  _colors: {
    debug: '#667eea',   // Violet
    info: '#10b981',    // Vert
    warn: '#f59e0b',    // Orange
    error: '#ef4444',   // Rouge
    trace: '#6b7280'    // Gris
  },
  
  // ========== INITIALISATION ==========
  
  init() {
    if (this._initialized) return;
    
    // Charger le niveau depuis localStorage
    const savedLevel = localStorage.getItem('debug_level');
    if (savedLevel !== null) {
      this._level = parseInt(savedLevel);
    }
    
    this._initialized = true;
    
    // Log d'initialisation
    if (this._level > 0) {
      console.log(
        '%c🔧 Logger initialisé',
        'color: #10b981; font-weight: bold;',
        `(niveau: ${this._level})`
      );
    }
  },
  
  // ========== GETTERS / SETTERS ==========
  
  get level() {
    return this._level;
  },
  
  setLevel(level) {
    const oldLevel = this._level;
    this._level = parseInt(level);
    
    // Persister dans localStorage
    try {
      localStorage.setItem('debug_level', this._level);
    } catch (e) {
      console.warn('Impossible de sauvegarder le niveau de debug:', e);
    }
    
    // Rétrocompatibilité
    //window.VERBCONSOLE = this._level;
    
    console.log(
      `%c🔧 Debug level: ${oldLevel} → ${this._level}`,
      'color: #667eea; font-weight: bold;'
    );
  },
  
  // ========== MÉTHODES DE LOGGING ==========
  
  /**
   * Log de niveau TRACE (niveau 3)
   * Pour logs ultra-détaillés : performance, mutations state, etc.
   */
  trace(...args) {
    if (this._level >= 3) {
      console.log(
        `%c[TRACE]`,
        `color: ${this._colors.trace}`,
        ...args
      );
    }
  },
  
  /**
   * Log de niveau DEBUG (niveau 2)
   * Pour détails techniques : appels API, données, calculs
   */
  debug(...args) {
    if (this._level >= 2) {
      console.log(
        `%c[DEBUG]`,
        `color: ${this._colors.debug}; font-weight: bold;`,
        ...args
      );
    }
  },
  
  /**
   * Log de niveau INFO (niveau 1)
   * Pour événements importants : init, connexion, modifications
   */
  info(...args) {
    if (this._level >= 1) {
      console.log(
        `%c[INFO]`,
        `color: ${this._colors.info}; font-weight: bold;`,
        ...args
      );
    }
  },
  
  /**
   * Log WARN (toujours affiché)
   * Pour avertissements non-bloquants
   */
  warn(...args) {
    console.warn(
      `%c[WARN]`,
      `color: ${this._colors.warn}; font-weight: bold;`,
      ...args
    );
  },
  
  /**
   * Log ERROR (toujours affiché)
   * Pour erreurs critiques
   */
  error(...args) {
    console.error(
      `%c[ERROR]`,
      `color: ${this._colors.error}; font-weight: bold;`,
      ...args
    );
  },
  
  // ========== FONCTIONS AVANCÉES ==========
  
  /**
   * Créer un groupe de logs repliable
   */
  group(label, collapsed = false) {
    if (this._level >= 1) {
      if (collapsed) {
        console.groupCollapsed(`📁 ${label}`);
      } else {
        console.group(`📁 ${label}`);
      }
    }
  },
  
  /**
   * Fermer le groupe de logs
   */
  groupEnd() {
    if (this._level >= 1) {
      console.groupEnd();
    }
  },
  
  /**
   * Mesurer le temps d'exécution
   */
  time(label) {
    if (this._level >= 2) {
      console.time(`⏱️ ${label}`);
    }
  },
  
  timeEnd(label) {
    if (this._level >= 2) {
      console.timeEnd(`⏱️ ${label}`);
    }
  },
  
  /**
   * Afficher un tableau
   */
  table(data, columns) {
    if (this._level >= 2) {
      console.table(data, columns);
    }
  },
  
  /**
   * Log avec emoji contextuel
   */
  emoji(emoji, ...args) {
    if (this._level >= 1) {
      console.log(`${emoji}`, ...args);
    }
  },
  
  // ========== HELPERS MÉTIER ==========
  
  /**
   * Log d'API (requêtes réseau)
   */
  api(method, url, status, duration) {
    if (this._level >= 2) {
      const statusColor = status < 400 ? this._colors.info : this._colors.error;
      console.log(
        `%c[API] ${method} ${url}`,
        `color: ${statusColor}`,
        `→ ${status}`,
        duration ? `(${duration}ms)` : ''
      );
    }
  },
  
  /**
   * Log de changement d'état
   */
  state(path, oldValue, newValue) {
    if (this._level >= 3) {
      console.log(
        `%c[STATE] ${path}`,
        `color: ${this._colors.trace}`,
        oldValue,
        '→',
        newValue
      );
    }
  },
  
  /**
   * Log de cache (hit/miss)
   */
  cache(operation, key, hit = true) {
    if (this._level >= 2) {
      const emoji = hit ? '🎯' : '🔄';
      console.log(
        `%c[CACHE] ${emoji} ${operation}`,
        `color: ${this._colors.debug}`,
        key
      );
    }
  },
  
  /**
   * Log de performance
   */
  perf(operation, duration, threshold = 100) {
    if (this._level >= 2) {
      const color = duration > threshold ? this._colors.warn : this._colors.info;
      console.log(
        `%c[PERF] ${operation}`,
        `color: ${color}`,
        `${duration.toFixed(2)}ms`
      );
    }
  },
  
  // ========== UTILITAIRES ==========
  
  /**
   * Afficher l'aide
   */
  help() {
    console.log(`
%c📚 Logger - Guide d'utilisation

%c🎚️ Niveaux de debug :
  Logger.setLevel(0)  → OFF   (aucun log)
  Logger.setLevel(1)  → INFO  (logs importants)
  Logger.setLevel(2)  → DEBUG (tous les logs)
  Logger.setLevel(3)  → TRACE (ultra-détaillé)

%c📝 Méthodes de base :
  Logger.info('Message important')
  Logger.debug('Détails techniques')
  Logger.warn('Avertissement')
  Logger.error('Erreur critique')

%c🔧 Méthodes avancées :
  Logger.group('Titre du groupe')
  Logger.time('operation')
  Logger.timeEnd('operation')
  Logger.table(data)

%c🎯 Helpers métier :
  Logger.api('GET', '/api/lockers', 200, 45)
  Logger.state('data.lockers', oldValue, newValue)
  Logger.cache('read', 'duplicates', true)
  Logger.perf('detectDuplicates', 23.45)

%c💡 Exemples :
  Logger.setLevel(2)              // Active debug mode
  Logger.info('🚀 App initialisée')
  Logger.debug('Config:', config)
  Logger.group('Chargement données')
  Logger.time('loadData')
  // ... opérations ...
  Logger.timeEnd('loadData')
  Logger.groupEnd()
`,
      'color: #667eea; font-size: 16px; font-weight: bold;',
      'color: #10b981; font-weight: bold;',
      'color: #667eea; font-weight: bold;',
      'color: #f59e0b; font-weight: bold;',
      'color: #ef4444; font-weight: bold;',
      'color: #6b7280; font-weight: bold;'
    );
  }
};

// Auto-initialisation
Logger.init();

window.Logger = Logger; // Rendre global
window.VERBCONSOLE = Logger.level; // Rétrocompatibilité VERBCONSOLE

// Export pour modules (si migration ES6 future)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logger;
}

