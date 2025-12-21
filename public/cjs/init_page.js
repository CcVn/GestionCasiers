// ============ CONFIGURATION API ==========================

// Stocker les IDs d'interval
const intervals = {
  autoRefresh: null,
  sessionCheck: null
};

async function setupApp() {
    Logger.group('🚀 Setup de l\'application...');
    Logger.info('API_URL actuelle:', API_URL);
    
    try {
        // -- ÉTAPE 1 : Charger la configuration des zones
        Logger.info('1️⃣ Chargement configuration zones...');
        await loadZonesConfig();
        Logger.debug('✓ Config zones chargée:', getState('data.zonesConfig'));
        
        // -- ÉTAPE 1b : Charger le token CSRF
        Logger.info('1️⃣b Chargement token CSRF...');
        await loadCsrfToken();

        // -- ÉTAPE 2 : Générer l'interface
        Logger.info('2️⃣ Génération interface...');
        generateTabs();
        generateContentSections();
        Logger.info('✓ Interface générée');

        // -- ÉTAPE 2b : Initialiser le support swipe tactile
        //Logger.info('2️⃣b Initialisation swipe tactile...');
        initSwipeSupport();
        Logger.info('✓ Swipe tactile activé');

        // -- ÉTAPE 3 : Initialiser les filtres
        Logger.info('3️⃣ Initialisation filtres...');
        let CURRENT_FILTER = {};
        getState('data.zonesConfig').forEach(zone => {
            CURRENT_FILTER[zone.name] = 'all';
        });
        Logger.info('✓ Filtres initialisés:', CURRENT_FILTER);
        setState('ui.currentFilter', CURRENT_FILTER);
        
        // ÉTAPE 4 : Event listeners
        Logger.info('4️⃣ Event listeners...');
        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                debouncedSearch(e.target.value);
            });
        }
        const form = document.getElementById('lockerForm');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }
        Logger.info('✓ Event listeners installés');
        
        // ÉTAPE 5 : Charger les données
        Logger.info('5️⃣ Chargement données...');
        loadData();
        
        // ÉTAPE 6 : Vérifier serveur
        Logger.info('6️⃣ Vérification serveur...');
        checkServerStatus();
        
        // ÉTAPE 7 : Appliquer mode dark sauvegardé
        Logger.info('7️⃣ Application préférences dark mode...');
        const savedMode = localStorage.getItem('darkMode');
        if (savedMode) {
            Logger.info('Mode sauvegardé trouvé:', savedMode);
            applyDarkMode(savedMode);
        } else {
            applyDarkMode(getState('ui.darkMode'));
        }
        updateThemeIcon(); // Mettre à jour l'icône du toggle

        // ÉTAPE 7b : Charger statut import et anonymisation
        Logger.info('7️⃣b Chargement statut import...');
        updateImportStatus();
        updateAnonymizationStatus();

        // ÉTAPE 7c : Appliquer mode guest si nécessaire
        if (getState('auth.isGuest')) {
            Logger.info('7️⃣ Application mode guest...');
            applyGuestDefaults();
        }

        // ÉTAPE 8 : Rafraîchissement automatique
        Logger.info('8️⃣ Démarrage rafraîchissement auto...');
        // Nettoyer les anciens intervals avant d'en créer de nouveaux
        Object.values(intervals).forEach(id => id && clearInterval(id));
 
        // Créer les nouveaux intervals
        intervals.autoRefresh = setInterval(() => {
            Logger.info('⟳ Rafraîchissement automatique...');
            loadData();
            checkServerStatus();
            updateImportStatus();
        }, 120000);
  
        // ÉTAPE 9 : Vérification expiration session (si authentifié)
        if (getState('auth.isAuthenticated') || getState('auth.isGuest')) {
            Logger.info('9️⃣ Démarrage vérification expiration session...');
            intervals.sessionCheck = setInterval(checkSessionExpiration, 5 * 60 * 1000);  // Toutes les 5 minutes
        }

        // Étape 10 : Masquer le bouton de marquage
        hideMarkButton();
        
        Logger.info('✅ Application initialisée avec succès');
        Logger.groupEnd();
        
    } catch (err) {
        Logger.error('❌ Erreur lors du setup:', err);
        alert('Erreur lors de l\'initialisation de l\'application: ' + err.message);
    }
}

function applyGuestDefaults() {
    Logger.info('👁️ Application mode guest...');
    let ZONES_CONFIG = getState('data.zonesConfig');

    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        Logger.warn('⚠️ ZONES_CONFIG non chargée');
        return;
    }
    
    // Désactiver les filtres et mettre sur "occupied"
    let CURRENT_FILTER = {};
    ZONES_CONFIG.forEach(zone => {
        CURRENT_FILTER[zone.name] = 'occupied';
        
        const filterSelect = document.getElementById(`filter-${zone.name}`);
        if (filterSelect) {
            filterSelect.value = 'occupied';
            filterSelect.disabled = true;
            filterSelect.style.opacity = '0.6';
            filterSelect.style.cursor = 'not-allowed';
        }
    });
    setState('data.zonesConfig', ZONES_CONFIG);
    setState('ui.currentFilter', CURRENT_FILTER);

   
    // Tri par nom
    document.querySelectorAll('select[onchange^="sortTable"]').forEach(select => {
        select.value = 'name';
    });
    
    hideMarkButton();
    updateAnonymizationStatus();

    // Masquer les éléments admin
    //hideAdminElements();

    Logger.info('✓ Mode guest appliqué');
}

function applyAdminDefaults() {
    Logger.info('👁️ Application mode superuser...');
    let ZONES_CONFIG = getState('data.zonesConfig');
    
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        Logger.warn('⚠️ ZONES_CONFIG non chargée');
        return;
    }
    
    // Désactiver les filtres et mettre sur "occupied"
    let CURRENT_FILTER = {};
    ZONES_CONFIG.forEach(zone => {
        CURRENT_FILTER[zone.name] = 'all';
        
        const filterSelect = document.getElementById(`filter-${zone.name}`);
        if (filterSelect) {
            filterSelect.value = 'occupied';
            filterSelect.disabled = false;
            filterSelect.style.opacity = '1.0';
            filterSelect.style.cursor = 'pointer';
        }
    });
    setState('data.zonesConfig', ZONES_CONFIG);
    setState('ui.currentFilter', CURRENT_FILTER);

    // Tri par nom
    document.querySelectorAll('select[onchange^="sortTable"]').forEach(select => {
        select.value = 'name';
    });
    
    hideMarkButton();
    updateAnonymizationStatus();

    // Démasquer les éléments d'administration   @DEPRECATED
    showAdminElements();

    Logger.info('✓ Mode guest appliqué');
}

function isEditAllowed() {
    if (!getState('auth.isAuthenticated')) {
        alert('Vous devez vous connecter pour modifier les données.');
        return false;
    }
    return true;
}

// Masquer tous les éléments admin
function hideAdminElements() {
    Logger.info('🙈 Masquage des éléments admin en mode guest');
    
    // 1. Masquer tous les boutons d'import/export/backup
    const headerButtons = document.querySelectorAll('.search-bar button');
    headerButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if ( text.includes('import') || text.includes('backup') || 
            text.includes('json') || text.includes('csv') ) {
            btn.style.display = 'none';
        }
    });
    
    // 2. Masquer tous les boutons "Attribuer"
    const assignButtons = document.querySelectorAll('.controls .btn-primary');
    assignButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('attribuer') || text.includes('imprimer')) {
            btn.style.display = 'none';
        }
    });
    
    // 3. Masquer tous les éléments avec la classe .admin-only
    const adminOnlyElements = document.querySelectorAll('.admin-only');
    Logger.info(`   Éléments .admin-only trouvés: ${adminOnlyElements.length}`);
    adminOnlyElements.forEach(el => {
        el.style.display = 'none';
    });
    
    // 4. Masquer les options "Récupérables", "Marqués", etc. dans les filtres
    const filterSelects = document.querySelectorAll('[id^="filter-"]');
    filterSelects.forEach(select => {
        const recoverableOption = Array.from(select.options).find(
            opt => opt.value === 'recoverable'
        );
        if (recoverableOption) {
            recoverableOption.style.display = 'none';
        }
        // Masquer l'option "Marqués"
        const markedOption = Array.from(select.options).find(
            opt => opt.value === 'marked'
        );
        if (markedOption) {
            markedOption.style.display = 'none';
        }
    });

    Logger.info('✓ Éléments admin masqués');
}

// Réafficher les éléments admin
function showAdminElements() {
    Logger.info('👁️ Affichage des éléments admin');
    
    // 1. Réafficher tous les boutons d'import/export/backup
    const headerButtons = document.querySelectorAll('.search-bar button');
    headerButtons.forEach(btn => {
        btn.style.display = '';
    });
    
    // 2. Réafficher tous les boutons "Attribuer"
    const assignButtons = document.querySelectorAll('.controls .btn-primary');
    assignButtons.forEach(btn => {
        btn.style.display = '';
    });
    
    // 3. Réafficher tous les éléments avec la classe .admin-only
    const adminOnlyElements = document.querySelectorAll('.admin-only');
    adminOnlyElements.forEach(el => {
        el.style.display = '';
    });
    
    // 4. Réafficher certaines options dans les filtres
    const filterSelects = document.querySelectorAll('[id^="filter-"]');
    filterSelects.forEach(select => {
        // Réafficher l'option "Récupérables" 
        const recoverableOption = Array.from(select.options).find(
            opt => opt.value === 'recoverable'
        );
        if (recoverableOption) {
            recoverableOption.style.display = '';
        }

        // Réafficher l'option "Marqués"
        const markedOption = Array.from(select.options).find(
            opt => opt.value === 'marked'
        );
        if (markedOption) {
            markedOption.style.display = '';
        }
    });

    Logger.info('✓ Éléments admin réaffichés');
}

// Fonction pour toggle le container des outils admin
function toggleAdminTools() {
    const container = document.getElementById('adminTools');
    const btn = document.getElementById('btnSettings');
    
    if (container && btn) {
        container.classList.toggle('active');
        btn.classList.toggle('active');
    }
}
        
// ============ STATUT SERVEUR ============
async function checkServerStatus() {
//Peut rester en fetch() - Vérifie juste la connectivité, pas besoin de retry
    const statusEl = document.getElementById('serverStatus');
    if (!statusEl) return;
    
    try {
        const res = await fetch(`${API_URL}/health`, { credentials: 'include' });
        
        if (res.ok) {
            statusEl.className = 'server-status online';
            statusEl.innerHTML = '<span class="status-dot"></span> Connecté';
        } else {
            throw new Error('Not OK');
        }
    } catch (err) {
        statusEl.className = 'server-status offline';
        statusEl.innerHTML = '<span class="status-dot"></span> Déconnecté';
        Logger.error('Serveur indisponible:', err);
    }
}

// Rendre les fonctions globales
window.setupApp = setupApp;
window.applyGuestDefaults = applyGuestDefaults;
window.applyAdminDefaults = applyAdminDefaults;
window.isEditAllowed = isEditAllowed;
window.hideAdminElements = hideAdminElements;
window.showAdminElements = showAdminElements;
window.toggleAdminTools = toggleAdminTools;
window.checkServerStatus = checkServerStatus;
