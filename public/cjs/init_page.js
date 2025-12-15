// ============ CONFIGURATION API ==========================

// Stocker les IDs d'interval
const intervals = {
  autoRefresh: null,
  sessionCheck: null
};

async function setupApp() {
    if (VERBCONSOLE>0) { console.log('🚀 Setup de l\'application...'); }
    if (VERBCONSOLE>0) { console.log('API_URL actuelle:', API_URL); }
    
    try {
        // ÉTAPE 1 : Charger la configuration des zones
        if (VERBCONSOLE>0) { console.log('1️⃣ Chargement configuration zones...'); }
        await loadZonesConfig();
        if (VERBCONSOLE>0) { console.log('✓ Config zones chargée:', getState('data.zonesConfig')); }
        
        // ÉTAPE 1b : Charger le token CSRF
        if (VERBCONSOLE>0) { console.log('1️⃣b Chargement token CSRF...'); }
        await loadCsrfToken();

        // ÉTAPE 2 : Générer l'interface
        if (VERBCONSOLE>0) { console.log('2️⃣ Génération interface...'); }
        generateTabs();
        generateContentSections();
        if (VERBCONSOLE>0) { console.log('✓ Interface générée'); }

        // ÉTAPE 2b : Initialiser le support swipe tactile
        //if (VERBCONSOLE>0) { console.log('2️⃣b Initialisation swipe tactile...'); }
        initSwipeSupport();
        if (VERBCONSOLE>0) { console.log('✓ Swipe tactile activé'); }

        // ÉTAPE 3 : Initialiser les filtres
        if (VERBCONSOLE>0) { console.log('3️⃣ Initialisation filtres...'); }
        let CURRENT_FILTER = {};
        getState('data.zonesConfig').forEach(zone => {
            CURRENT_FILTER[zone.name] = 'all';
        });
        if (VERBCONSOLE>0) { console.log('✓ Filtres initialisés:', CURRENT_FILTER); }
        setState('ui.currentFilter', CURRENT_FILTER);
        
        // ÉTAPE 4 : Event listeners
        if (VERBCONSOLE>0) { console.log('4️⃣ Event listeners...'); }
        
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
        if (VERBCONSOLE>0) { console.log('✓ Event listeners installés'); }
        
        // ÉTAPE 5 : Charger les données
        if (VERBCONSOLE>0) { console.log('5️⃣ Chargement données...'); }
        loadData();
        
        // ÉTAPE 6 : Vérifier serveur
        if (VERBCONSOLE>0) { console.log('6️⃣ Vérification serveur...'); }
        checkServerStatus();
        
        // ÉTAPE 7 : Appliquer mode dark sauvegardé
        if (VERBCONSOLE>0) { console.log('7️⃣ Application préférences dark mode...'); }
        const savedMode = localStorage.getItem('darkMode');
        if (savedMode) {
            if (VERBCONSOLE>0) { console.log('Mode sauvegardé trouvé:', savedMode); }
            applyDarkMode(savedMode);
        } else {
            applyDarkMode(getState('ui.darkMode'));
        }
        updateThemeIcon(); // Mettre à jour l'icône du toggle

        // ÉTAPE 7b : Charger statut import et anonymisation
        if (VERBCONSOLE>0) { console.log('7️⃣b Chargement statut import...'); }
        updateImportStatus();
        updateAnonymizationStatus();

        // ÉTAPE 8 : Appliquer mode guest si nécessaire
        if (getState('auth.isGuest')) {
            if (VERBCONSOLE>0) { console.log('7️⃣ Application mode guest...'); }
            applyGuestDefaults();
        }

        // ÉTAPE 9 : Rafraîchissement automatique
        if (VERBCONSOLE>0) { console.log('8️⃣ Démarrage rafraîchissement auto...'); }
        // Nettoyer les anciens intervals avant d'en créer de nouveaux
        Object.values(intervals).forEach(id => id && clearInterval(id));
 
        // Créer les nouveaux intervals
        intervals.autoRefresh = setInterval(() => {
                if (VERBCONSOLE>0) { console.log('⟳ Rafraîchissement automatique...'); }
            loadData();
            checkServerStatus();
            updateImportStatus();
        }, 120000);
  
        // ÉTAPE 10 : Vérification expiration session (si authentifié)
        if (getState('auth.isAuthenticated') || getState('auth.isGuest')) {
            if (VERBCONSOLE>0) { console.log('9️⃣ Démarrage vérification expiration session...'); }
            intervals.sessionCheck = setInterval(checkSessionExpiration, 5 * 60 * 1000);  // Toutes les 5 minutes
        }

        // Étape 11 : Masquer le bouton de marquage
        hideMarkButton();
        
        if (VERBCONSOLE>0) { console.log('✅ Application initialisée avec succès'); }
        
    } catch (err) {
        console.error('❌ Erreur lors du setup:', err);
        alert('Erreur lors de l\'initialisation de l\'application: ' + err.message);
    }
}

function applyGuestDefaults() {
    if (VERBCONSOLE>0) { console.log('👁️ Application mode guest...'); }
    let ZONES_CONFIG = getState('data.zonesConfig');

    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        console.warn('⚠️ ZONES_CONFIG non chargée');
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
    hideAdminElements();
    
    if (VERBCONSOLE>0) { console.log('✓ Mode guest appliqué'); }
}

function applyAdminDefaults() {
    if (VERBCONSOLE>0) { console.log('👁️ Application mode guest...'); }
    let ZONES_CONFIG = getState('data.zonesConfig');
    
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        console.warn('⚠️ ZONES_CONFIG non chargée');
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

    if (VERBCONSOLE>0) { console.log('✓ Mode guest appliqué'); }
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
    if (VERBCONSOLE>0) { console.log('🙈 Masquage des éléments admin en mode guest'); }
    
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
    if (VERBCONSOLE>0) { console.log(`   Éléments .admin-only trouvés: ${adminOnlyElements.length}`); }
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

    if (VERBCONSOLE>0) { console.log('✓ Éléments admin masqués'); }
}

// Réafficher les éléments admin
function showAdminElements() {
    if (VERBCONSOLE>0) { console.log('👁️ Affichage des éléments admin'); }
    
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

    if (VERBCONSOLE>0) { console.log('✓ Éléments admin réaffichés'); }
}

// ============ SERVEUR ============
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
        console.error('Serveur indisponible:', err);
    }
}

// Rendre les fonctions globales
window.setupApp = setupApp;
window.applyGuestDefaults = applyGuestDefaults;
window.applyAdminDefaults = applyAdminDefaults;
window.isEditAllowed = isEditAllowed;
window.hideAdminElements = hideAdminElements;
window.showAdminElements = showAdminElements;
window.checkServerStatus = checkServerStatus;
