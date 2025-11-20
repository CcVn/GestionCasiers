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
        logRequests = VERBCONSOLE > 0,  // Logger les requêtes
        logErrors = true       // Logger les erreurs
    } = retryConfig;
    
    const startTime = Date.now();
    const method = options.method || 'GET';
    
    // Log début requête
    if (logRequests) {
        console.log(`🌐 ${method} ${url.replace(API_URL, '')}`);
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
            
            // Vérifier le statut
            if (!res.ok) {
                // Vérifier si on doit retry ce code
                if (retryOn.includes(res.status) && attempt < retries - 1) {
                    const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
                    
                    if (logErrors) {
                        console.warn(`⚠️ ${method} ${url.replace(API_URL, '')} - HTTP ${res.status} (tentative ${attempt + 1}/${retries})`);
                        console.warn(`   ⏳ Nouvelle tentative dans ${delay}ms...`);
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
                console.log(`✓ ${method} ${url.replace(API_URL, '')} - ${res.status} (${duration}ms, ${attempt + 1} tentative${attempt > 0 ? 's' : ''})`);
            } else if (logRequests) {
                console.log(`✓ ${method} ${url.replace(API_URL, '')} - ${res.status} (${duration}ms)`);
            }
            
            return res;
            
        } catch (err) {
            const isLastAttempt = attempt === retries - 1;
            const duration = Date.now() - startTime;
            
            // Gérer les différents types d'erreurs
            if (err.name === 'AbortError') {
                if (logErrors) {
                    console.error(`⏱️ ${method} ${url.replace(API_URL, '')} - Timeout après ${timeout}ms (tentative ${attempt + 1}/${retries})`);
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
                    console.error(`🔌 ${method} ${url.replace(API_URL, '')} - Erreur réseau (tentative ${attempt + 1}/${retries})`);
                }
                
                if (!isLastAttempt) {
                    const delay = retryDelay * Math.pow(2, attempt);
                    if (logErrors) {
                        console.warn(`   ⏳ Nouvelle tentative dans ${delay}ms...`);
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
                    console.error(`❌ ${method} ${url.replace(API_URL, '')} - ${err.message} (${duration}ms)`);
                }
                throw err;
            }
        }
    }
    
    // Ne devrait jamais arriver ici
    throw new Error('Nombre maximum de tentatives atteint');
}

// --- Helper pour les requêtes JSON (parse automatique)
async function fetchJSON(url, options = {}, retryConfig = {}) {
    const res = await fetchWithRetry(url, options, retryConfig);
    
    // Gérer les erreurs CSRF
    if (res.status === 403) {
        handleCsrfError(res);
        throw new Error('Erreur CSRF');
    }
    
    // Vérifier le statut avant de parser
    if (!res.ok) {
        handleCsrfError(res);
        let errorData = {};
        try {
            errorData = await res.json();
        } catch {
            // Si le JSON est invalide, utiliser le status
        }
        throw new Error(errorData.error || `Erreur HTTP ${res.status}`);
    }
    
    return res.json();
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

// Rendre les fonctions globales
window.fetchWithRetry = fetchWithRetry;
window.fetchJSON = fetchJSON;
window.handleCsrfError = handleCsrfError;
