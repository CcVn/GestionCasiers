// ============ WRAPPER FETCH AVEC RETRY ET LOGS ============
/**
 * Wrapper fetch avec retry automatique et logs cohérents
 * @param {string} url - URL de l'API
 * @param {Object} options - Options fetch (method, headers, body, etc.)
 * @param {Object} retryConfig - Configuration du retry
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, retryConfig = {}) {
    const {
        retries = 3,           // Nombre de tentatives
        retryDelay = 1000,     // Délai initial (ms)
        retryOn = [500, 502, 503, 504, 408, 429],  // Codes HTTP à retry
        timeout = 30000,       // Timeout par requête (30s)
        logRequests = getState('config.verbose') > 0,  // Logger les requêtes
        logErrors = true       // Logger les erreurs
    } = retryConfig;
    
    const startTime = Date.now();
    const method = options.method || 'GET';
    
    // Log début requête
    if (logRequests) {
        Logger.info(`🌐 ${method} ${url.replace(API_URL, '')}`);
    }
    
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            // Créer un AbortController pour le timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            // Ajouter le signal d'abort aux options
            const fetchOptions = {
                ...options,
                signal: controller.signal
            };
            
            // Faire la requête
            const res = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);
            
            // Gestion spécifique des erreurs d'authentification
            if (res.status === 401) {
              // Session expirée
              await handleSessionExpired();
              throw new Error('Session expirée');
            }
            
            if (res.status === 403) {
              const data = await res.json();
              if (data.error?.includes('CSRF')) {
                await handleCsrfError(data);
                throw new Error('Token CSRF invalide');
              }
            }

            // Vérifier le statut
            if (!res.ok) {
                // Vérifier si on doit retry ce code
                if (retryOn.includes(res.status) && attempt < retries - 1) {
                    const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
                    
                    if (logErrors) {
                        Logger.warn(`⚠️ ${method} ${url.replace(API_URL, '')} - HTTP ${res.status} (tentative ${attempt + 1}/${retries})`);
                        Logger.warn(`   ⏳ Nouvelle tentative dans ${delay}ms...`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Retry
                }
                
                // Erreur finale (pas de retry)
                const errorData = await res.json().catch(() => ({}));
                const error = new Error(errorData.error || `HTTP ${res.status}`);
                error.status = res.status;
                error.data = errorData;
                throw error;
            }
            
            // Succès
            const duration = Date.now() - startTime;
            if (logRequests && attempt > 0) {
                Logger.info(`✓ ${method} ${url.replace(API_URL, '')} - ${res.status} (${duration}ms, ${attempt + 1} tentative${attempt > 0 ? 's' : ''})`);
            } else if (logRequests) {
                Logger.info(`✓ ${method} ${url.replace(API_URL, '')} - ${res.status} (${duration}ms)`);
            }
            
            return res;
            
        } catch (err) {
            const isLastAttempt = attempt === retries - 1;
            const duration = Date.now() - startTime;
            
            // Gérer les différents types d'erreurs
            if (err.name === 'AbortError') {
                if (logErrors) {
                    Logger.error(`⏱️ ${method} ${url.replace(API_URL, '')} - Timeout après ${timeout}ms (tentative ${attempt + 1}/${retries})`);
                }
                
                if (!isLastAttempt) {
                    const delay = retryDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Retry
                }
                
                const timeoutError = new Error(`Timeout après ${timeout}ms`);
                timeoutError.isTimeout = true;
                throw timeoutError;
                
            } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                // Erreur réseau
                if (logErrors) {
                    Logger.error(`🔌 ${method} ${url.replace(API_URL, '')} - Erreur réseau (tentative ${attempt + 1}/${retries})`);
                }
                
                if (!isLastAttempt) {
                    const delay = retryDelay * Math.pow(2, attempt);
                    if (logErrors) {
                        Logger.warn(`   ⏳ Nouvelle tentative dans ${delay}ms...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Retry
                }
                
                const networkError = new Error('Erreur réseau : serveur inaccessible');
                networkError.isNetworkError = true;
                throw networkError;
                
            } else {
                // Autre erreur (ne pas retry)
                if (logErrors) {
                    Logger.error(`❌ ${method} ${url.replace(API_URL, '')} - ${err.message} (${duration}ms)`);
                }
                throw err;
            }
        }
    }
    
    // Ne devrait jamais arriver ici
    throw new Error('Nombre maximum de tentatives atteint');
}

class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
    this.isRetryable = [500, 502, 503, 504, 408, 429].includes(status);
  }
}

// --- Helper pour les requêtes JSON (parse automatique)
async function fetchJSON(url, options = {}, retryConfig = {}) {
  const startTime = performance.now();

  try {
    const res = await fetchWithRetry(url, options);
    const duration = performance.now() - startTime;
    Logger.api(options.method || 'GET', url, res.status, duration);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      
      // Erreurs auth → redirection auto
      if (res.status === 401) {
        await handleSessionExpired();
        throw new APIError('Session expirée', 401, errorData);
      }
      
      if (res.status === 403) {
        await handleCsrfError(res);
        throw new APIError('Token CSRF invalide', 403, errorData);
      }
      
      throw new APIError(
        errorData.error || `Erreur HTTP ${res.status}`,
        res.status,
        errorData
      );
    }
    return res.json();
    
  } catch (err) {
    // Logger avec contexte
    Logger.error(`[API] ${options.method || 'GET'} ${url}`, {
      error: err.message,
      status: err.status,
      retryable: err.isRetryable
    });
    
    throw err;
  }
}

// Gestionnaire global d'erreurs CSRF
function handleCsrfError(response) {
/* Exemple d'utilisation dans les fetch :
fetch(url, options)
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        return res.json();
    }) */
    if (response.status === 403) {
        response.json().then(data => {
            if (data.error && data.error.includes('CSRF')) {
                alert('⚠️ Erreur de sécurité : token CSRF invalide.\n\nLa page va se recharger.');
                window.location.reload();
            }
        }).catch(() => {});
    }
}

async function handleSessionExpired() {
  await cleanupAllLocks(); // Libérer les locks
  showStatus('⏱️ Session expirée. Redirection...', 'error');
  setTimeout(() => logout(), 2000);
}

/*function getCSRFToken() {
  return getState('auth.csrfToken');
}*/

// Rendre les fonctions globales
window.fetchWithRetry = fetchWithRetry;
window.fetchJSON = fetchJSON;
window.handleCsrfError = handleCsrfError;
window.handleSessionExpired = handleSessionExpired;
//window.getCSRFToken = getCSRFToken;
