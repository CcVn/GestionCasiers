// ============  AUTHENTIFICATION / LOGIN  =================

async function setupLoginPage() {
    const form = document.getElementById('loginForm');
    const passwordInput = document.getElementById('loginPassword');
    const userNameGroup = document.getElementById('userNameGroup');
    const userNameInput = document.getElementById('userName');

    // Charger le token CSRF immédiatement
    await loadCsrfToken();

    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            if (this.value.length > 0) {
                userNameGroup.style.display = 'block';
            } else {
                userNameGroup.style.display = 'none';
            }
        });
    }
    // Charger l'IP du client
    fetch(`${API_URL}/client-ip`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data.ip && userNameInput) {
                //userNameInput.placeholder = `Identifiant (par défaut: ${data.ip})`;
                // Ou pré-remplir le champ :
                userNameInput.value = data.ip;
            }
        })
        .catch(err => Logger.warn('Impossible de charger l\'IP:', err));
 
    if (form) {
        form.addEventListener('submit', handleLogin);
    }
}

// Login admin / superuser
// Ne pas implémenter fetchJSON : utilise la gestion d'erreur personnalisée pour le CSRF
function handleLogin(e) {
    e.preventDefault();
    // Vérifier que le token CSRF est chargé
    if (!getState('auth.csrfToken')) {
        Logger.error('❌ Token CSRF non disponible');
        alert('Erreur de sécurité. Veuillez recharger la page.');
        return;
    }
    document.body.classList.remove('guest-mode');
    
    const password = document.getElementById('loginPassword').value;
    const userName = document.getElementById('userName').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Connexion...';
    submitBtn.style.opacity = '0.6';
    
    fetch(`${API_URL}/login`, {
        method: 'POST',
        credentials: 'include',  // IMPORTANT : envoie et reçoit les cookies
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': getState('auth.csrfToken')
        },
        body: JSON.stringify({ password: password, userName: userName })
    })
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            return res.json().then(data => {
                throw new Error(data.error || 'Authentification échouée');
            });
        }
        return res.json();
    })
    .then(async data => {
        // Recharger le token CSRF après connexion
        await loadCsrfToken();
        
        if (data.role === 'admin') {
            setState('auth.isAuthenticated', true);
            setState('auth.isGuest', false);
            setState('auth.userName', data.userName);
            //showAdminElements();
        } else {
            setState('auth.isAuthenticated', false);
            setState('auth.isGuest', true);
            setState('auth.userName', '');
            //hideAdminElements();
        }
        
        // Forcer un vrai rechargement à la reconnexion : recharge sans cache
        //if (data.authenticated) { window.location.reload(true); }

        setState('ui.anonymizeEnabled', data.anonymize || false);
        applyDarkMode(data.darkMode || 'system');
        Logger.info('Anonymisation activée:', getState('ui.anonymizeEnabled') );
        Logger.info('Utilisateur:', getState('auth.userName') );
        
        showLoginPage(false);
        updateAuthStatus();
        updateAnonymizationStatus();
        setupApp();
    })
    .catch(err => {
        if (err.message.includes('429')) {
            alert('⏱️ Trop de tentatives de connexion.\nVeuillez patienter 5 minutes.');
        } else {
            alert(err.message);
        }
        document.getElementById('loginPassword').value = '';
        document.getElementById('userName').value = '';
        Logger.error('Erreur login:', err);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        submitBtn.classList.remove('btn-loading');
    });        
}

// Ne pas implémenter fetchJSON : Gestion spécifique des erreurs de connexion
function loginAsGuest() {
    // Vérifier que le token CSRF est chargé
    if (!getState('auth.csrfToken')) {
        Logger.error('❌ Token CSRF non disponible');
        alert('Erreur de sécurité. Veuillez recharger la page.');
        return;
    }
    const btn = event.target;
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.innerHTML = '⏳ Chargement...';
    btn.classList.add('btn-loading');

    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': getState('auth.csrfToken')
        },
        credentials: 'include',  // IMPORTANT
        body: JSON.stringify({ password: '' })
    })
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        return res.json();
    })
    .then(async data => {
        await loadCsrfToken();

        setState('auth.isAuthenticated', false);
        setState('auth.isGuest', true);
        setState('ui.anonymizeEnabled', data.anonymize || false);
        applyDarkMode(data.darkMode || 'system');
        Logger.info('Anonymisation activée:', getState('ui.anonymizeEnabled') );

        //hideAdminElements();
        showLoginPage(false);
        updateAuthStatus();
        updateAnonymizationStatus();
        setupApp();
    })
    .catch(err => {
        Logger.error('Erreur login guest:', err);
        alert('Erreur de connexion');
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = originalText;
        btn.classList.remove('btn-loading');
    });     
}

// Utilisation : URL à mettre dans le QR code : http://adresseIP:5000/?guest=true
// Ne pas implémenter fetchJSON : Gestion spécifique des erreurs de connexion
function loginAsGuestAuto() {
    Logger.info('Connexion automatique en mode guest...');
    // Vérifier que le token CSRF est chargé
    if (!getState('auth.csrfToken')) {
        Logger.error('❌ Token CSRF non disponible');
        alert('Erreur de sécurité. Veuillez recharger la page.');
        return;
    }

    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': getState('auth.csrfToken')
        },
        credentials: 'include',
        body: JSON.stringify({ password: '' })
    })
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        return res.json();
    })
    .then(async data => {
        await loadCsrfToken();

        setState('auth.isAuthenticated', false);
        setState('auth.isGuest', true);
        setState('ui.anonymizeEnabled', data.anonymize || false);
        applyDarkMode(data.darkMode || 'system');
        Logger.info('Anonymisation activée:', getState('ui.anonymizeEnabled') );

        //hideAdminElements();
        showLoginPage(false);
        updateAuthStatus();
        updateAnonymizationStatus();
        setupApp();
    })
    .catch(err => {
        Logger.error('Erreur login guest auto:', err);
        // En cas d'erreur, afficher la page de login normale
        setupLoginPage();
        alert('Erreur de connexion automatique');
    });
}

// Fonction de cleanup à appeler lors du logout
function cleanupIntervals() {
  Object.values(intervals).forEach(id => clearInterval(id));
  intervals.autoRefresh = null;
  intervals.sessionCheck = null;
}

// Quitter l'interface principale et réinitialiser les filtres
async function logout() {

    // Libérer tous les locks avant de se déconnecter
    await cleanupAllLocks();
    
    // Route de déconnexion
    fetch(`${API_URL}/logout`, {
        method: 'POST',
        credentials: 'include',  // IMPORTANT
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getState('auth.csrfToken')  
        }
    }).catch(err => Logger.error('Erreur logout:', err));
    
    // Réinitialisation des filtres avec zones dynamiques
    let ZONES_CONFIG = getState('data.zonesConfig');
    
    if (ZONES_CONFIG && ZONES_CONFIG.length > 0) {
        let CURRENT_FILTER = {};
        ZONES_CONFIG.forEach(zone => {
            CURRENT_FILTER[zone.name] = 'all';
        });
        setState('ui.currentFilter', CURRENT_FILTER);
        
        // Réactivation des éléments SELECT du filtre
        ZONES_CONFIG.forEach(zone => {
            const filterSelect = document.getElementById(`filter-${zone.name}`);
            if (filterSelect) {
                filterSelect.disabled = false;
                filterSelect.value = 'all';
                filterSelect.style.opacity = '1';
                filterSelect.style.cursor = 'pointer';
            }
        });
    }
    
    showAdminElements(); // Réafficher tous les éléments admin

    setState('auth.isAuthenticated', false);
    setState('auth.isGuest', true); //IS_GUEST = false;
    setState('ui.anonymizeEnabled', false);
    cleanupIntervals();

    document.body.classList.remove('dark-mode');
    showLoginPage(true);
    document.getElementById('loginPassword').value = '';
    document.getElementById('globalSearch').value = '';
}

function showLoginPage(show) {
    const loginPage = document.getElementById('loginPage');
    const appContainer = document.getElementById('appContainer');
    
    if (loginPage) {
        loginPage.classList.toggle('active', show);
    }
    if (appContainer) {
        appContainer.style.display = show ? 'none' : 'block';
        
        if (!show) {
            if (getState('auth.isGuest')) {
                appContainer.classList.add('guest-mode');
            } else {
                appContainer.classList.remove('guest-mode');
            }
        }
    }
}

// Mise à jour de l'indicateur de mode
function updateAuthStatus() {
    const status = document.getElementById('authStatus');
    if (status) {
        if (getState('auth.isAuthenticated')) {
            status.innerHTML = `🔓 Mode modification${getState('auth.userName') ? ` (${getState('auth.userName')})` : ''}`;
            status.style.color = '#e65100';
        } else if (getState('auth.isGuest')) {
            status.innerHTML = '👁️ Mode consultation';
            status.style.color = '#2e7d32';
        }
    }
    //updateImportExportButtons(); // désormais hidden plutôt que désactivés
}

// =============== TOKEN CSRF =============================

// Fonction pour charger le token CSRF
async function loadCsrfToken() {
    try {
        const data = await fetchJSON(`${API_URL}/csrf-token`, {
            credentials: 'include'
        });
        
        setState('auth.csrfToken', data.csrfToken);
        Logger.info('✓ Token CSRF chargé');
    } catch (err) {
        Logger.error('❌ Erreur chargement token CSRF:', err);
        setState('auth.csrfToken', null);
    }
}

// Fonction pour vérifier le temps restant dans la session
async function checkSessionExpiration() {
    try {
    const data = await fetchJSON(`${API_URL}/session/time-remaining`, {
      credentials: 'include'
    });

    // Avertir si moins de 10 minutes restantes
    if (data.expiresInMinutes < 10 && data.expiresInMinutes > 0) {
        Logger.warn(`⏰ Session expire dans ${data.expiresInMinutes} minutes`);

        // Afficher une notification (optionnel)
        if (data.expiresInMinutes === 5) {
            if (confirm('⏰ Votre session expire dans 5 minutes.\n\nVoulez-vous prolonger votre session ?')) {
                // Faire une requête pour renouveler
                loadData(); // N'importe quelle requête authentifiée
            }
        }
    }
    } catch (err) {
    Logger.error('Erreur vérification expiration:', err);
    }
}

// Rendre les fonctions globales
window.setupLoginPage = setupLoginPage;
window.handleLogin = handleLogin;
window.loginAsGuest = loginAsGuest;
window.loginAsGuestAuto = loginAsGuestAuto;
window.logout = logout;
window.showLoginPage = showLoginPage;
window.updateAuthStatus = updateAuthStatus;
window.loadCsrfToken = loadCsrfToken;
window.checkSessionExpiration = checkSessionExpiration;

