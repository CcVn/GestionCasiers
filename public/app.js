// Configuration
let API_URL = 'http://localhost:5000/api';
let DATA = [];
let ZONES_CONFIG = []; // Variable globale pour stocker la config des zones
let CURRENT_FILTER = { NORD: 'all', SUD: 'all', PCA: 'all' };
let CURRENT_ZONE = 'NORD';
let IS_AUTHENTICATED = false;
let IS_GUEST = false;
let IS_MOBILE = false;
let AUTH_TOKEN = null;
let ANONYMIZE_ENABLED = false;
let USER_NAME = '';
let DARK_MODE_SETTING = 'inactive'; //'system'
let ADVANCED_RESEARCH = true;
let EDITING_LOCKER_NUMBER = null; // Mémoriser le casier en cours d'édition

// ============ TOKENS ============

// Fonction pour récupérer le token
function getAuthToken() {
    if (!AUTH_TOKEN) {
        AUTH_TOKEN = sessionStorage.getItem('auth_token');
    }
    return AUTH_TOKEN;
}

// Fonction pour sauvegarder le token
function setAuthToken(token) {
    AUTH_TOKEN = token;
    sessionStorage.setItem('auth_token', token);
}

// Fonction pour supprimer le token
function clearAuthToken() {
    AUTH_TOKEN = null;
    sessionStorage.removeItem('auth_token');
}

// ============ CONFIG DES ZONES ============

// Fonction pour charger la configuration des zones
async function loadZonesConfig() {
    try {
        const response = await fetch(`${API_URL}/config/zones`);
        const data = await response.json();
        ZONES_CONFIG = data.zones;
        
        console.log('📋 Configuration des zones chargée:', ZONES_CONFIG);
        return ZONES_CONFIG;
    } catch (err) {
        console.error('Erreur chargement config zones:', err);
        // Fallback sur la config par défaut
        ZONES_CONFIG = [
            { name: 'NORD', count: 75, prefix: 'N' },
            { name: 'SUD', count: 75, prefix: 'S' },
            { name: 'PCA', count: 40, prefix: 'P' }
        ];
        return ZONES_CONFIG;
    }
}

// Fonction pour générer les onglets dynamiquement
function generateTabs() {
    const tabsContainer = document.querySelector('.tabs');
    if (!tabsContainer) return;
    //const colors = (process.env.ZONE_COLORS || '#3b82f6,#10b981,#f59e0b,#ef4444').split(',');
    //ajouter ça dans le button: style="--zone-color: ${colors[index] || '#667eea'}

    tabsContainer.innerHTML = ZONES_CONFIG.map((zone, index) => `
        <button class="tab-button ${index === 0 ? 'active' : ''}" data-zone="${zone.name}">
            Zone ${zone.name}
        </button>
    `).join('');
    
    // Ajouter les event listeners
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.zone);
            loadData();
        });
    });
}

// Fonction pour générer les sections de contenu
function generateContentSections() {
    const container = document.getElementById('appContainer');
    if (!container) return;
    
    // Trouver l'emplacement après les onglets
    const tabsElement = container.querySelector('.tabs');
    const footerElement = container.querySelector('.app-footer');
    
    // Supprimer les anciennes sections
    const oldSections = container.querySelectorAll('.content-section');
    oldSections.forEach(section => section.remove());
    
    // Générer les nouvelles sections
    ZONES_CONFIG.forEach((zone, index) => {
        const section = document.createElement('div');
        section.id = `content-${zone.name}`;
        section.className = `content-section ${index === 0 ? 'active' : ''}`;
        
        const firstNumber = `${zone.prefix}01`;
        const lastNumber = `${zone.prefix}${String(zone.count).padStart(2, '0')}`;
        
        section.innerHTML = `
            <div class="section-header">
                <h2 style="font-size: 18px; font-weight: 600;">
                    Zone ${zone.name} (${firstNumber} à ${lastNumber})
                    <span id="counter-${zone.name}" class="zone-counter">0/${zone.count}</span>
                </h2>
                <div class="controls">
                    <button class="btn-primary admin-only" onclick="openModal('${zone.name}')">➕ Attribuer</button>
                    <select class="admin-only" onchange="filterTable('${zone.name}', this.value)" id="filter-${zone.name}">
                        <option value="all">Tous</option>
                        <option value="occupied">Occupés</option>
                        <option value="empty">Vides</option>
                        <option value="recoverable" class="admin-only">Récupérables</option>
                    </select>
                    <select onchange="sortTable('${zone.name}', this.value)">
                        <option value="number">Trier par numéro</option>
                        <option value="name">Trier par nom</option>
                    </select>
                    <button class="btn-secondary admin-only" onclick="printTable()">🖨️ Imprimer</button>
                </div>
            </div>
            <div class="table-container">
                <table id="table-${zone.name}">
                    <thead id="thead-${zone.name}">
                        <tr>
                            <th>N° Casier</th>
                            <th>Nom</th>
                            <th>Prénom</th>
                            <th>N°IPP</th>
                            <th class="hide-mobile">DDN</th>
                            <th class="hide-mobile admin-only">Statut</th>
                            <th class="hide-mobile admin-only">Commentaire</th>
                            <th class="hide-mobile admin-only">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="tbody-${zone.name}"></tbody>
                </table>
            </div>
        `;
        
        // Insérer avant le footer
        container.insertBefore(section, footerElement);
    });
    
    // Initialiser les filtres par défaut
    CURRENT_FILTER = {};
    ZONES_CONFIG.forEach(zone => {
        CURRENT_FILTER[zone.name] = 'all';
    });
}

// ============ UTILITAIRES D'ANONYMISATION ============

function anonymizeName(name) {
    if (!ANONYMIZE_ENABLED || !name) return name;
    return name.substring(0, 3).toUpperCase();
}

function anonymizeFirstName(firstName) {
    if (!ANONYMIZE_ENABLED || !firstName) return firstName;
    return firstName.substring(0, 2).toUpperCase();
}

// ============ MODE SOMBRE ============

function applyDarkMode(setting) {
    DARK_MODE_SETTING = setting || 'system';
    console.log('Application du mode sombre:', DARK_MODE_SETTING);
    
    if (DARK_MODE_SETTING === 'active') {
        document.body.classList.add('dark-mode');
    } else if (DARK_MODE_SETTING === 'inactive') {
        document.body.classList.remove('dark-mode');
    } else if (DARK_MODE_SETTING === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (DARK_MODE_SETTING === 'system') {
                if (e.matches) {
                    document.body.classList.add('dark-mode');
                } else {
                    document.body.classList.remove('dark-mode');
                }
            }
        });
    }
}

// ============ DÉTECTION MOBILE ============
function detectMobile() {
    IS_MOBILE = window.innerWidth <= 768;
    console.log('Mode mobile:', IS_MOBILE);
    return IS_MOBILE;
}

// ============ INITIALISATION ============
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page chargée');
    
    const protocol = window.location.protocol;
    const host = window.location.host;
    API_URL = `${protocol}//${host}/api`;
    console.log('API_URL configurée:', API_URL);
    
    detectMobile();
    
    const existingToken = getAuthToken();
    if (existingToken) {
        console.log('Token existant trouvé');
        fetch(`${API_URL}/auth/check`, {
            headers: { 'Authorization': `Bearer ${existingToken}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                console.log('Token valide, rôle:', data.role);
                IS_AUTHENTICATED = data.role === 'admin';
                IS_GUEST = data.role === 'guest';
                ANONYMIZE_ENABLED = data.anonymize || false;
                USER_NAME = data.userName || '';
                applyDarkMode(data.darkMode || 'system');
                console.log('Anonymisation activée:', ANONYMIZE_ENABLED);
                console.log('Utilisateur:', USER_NAME);
                showLoginPage(false);
                updateAuthStatus();
                setupApp();
            } else {
                console.log('Token invalide');
                clearAuthToken();
                setupLoginPage();
            }
        })
        .catch(err => {
            console.error('Erreur vérification token:', err);
            clearAuthToken();
            setupLoginPage();
        });
    } else {
        console.log('Pas de token, affichage login');
        setupLoginPage();
    }
    
    CURRENT_ZONE = 'NORD';
    
    window.addEventListener('resize', () => {
        detectMobile();
        if (DATA.length > 0) {
            renderAllTables();
        }
    });
});

// ============ AUTHENTIFICATION ============
function setupLoginPage() {
    const form = document.getElementById('loginForm');
    const passwordInput = document.getElementById('loginPassword');
    const userNameGroup = document.getElementById('userNameGroup');
    
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            if (this.value.length > 0) {
                userNameGroup.style.display = 'block';
            } else {
                userNameGroup.style.display = 'none';
            }
        });
    }
    
    if (form) {
        form.addEventListener('submit', handleLogin);
    }
}

function handleLogin(e) {
    e.preventDefault();
    document.body.classList.remove('guest-mode');
    const password = document.getElementById('loginPassword').value;
    const userName = document.getElementById('userName').value;
    
    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password, userName: userName })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(data => {
                throw new Error(data.error || 'Authentification échouée');
            });
        }
        return res.json();
    })
    .then(data => {
        setAuthToken(data.token);
        
        if (data.role === 'admin') {
            IS_AUTHENTICATED = true;
            IS_GUEST = false;
            USER_NAME = data.userName || '';
            showAdminElements();
        } else {
            IS_AUTHENTICATED = false;
            IS_GUEST = true;
            USER_NAME = '';
            hideAdminElements();
        }
        
        ANONYMIZE_ENABLED = data.anonymize || false;
        applyDarkMode(data.darkMode || 'system');
        console.log('Anonymisation activée:', ANONYMIZE_ENABLED);
        console.log('Utilisateur:', USER_NAME);
        
        showLoginPage(false);
        updateAuthStatus();
        setupApp();
    })
    .catch(err => {
        alert(err.message);
        document.getElementById('loginPassword').value = '';
        document.getElementById('userName').value = '';
        console.error('Erreur login:', err);
    });
}

function loginAsGuest() {
    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: '' })
    })
    .then(res => res.json())
    .then(data => {
        setAuthToken(data.token);
        IS_AUTHENTICATED = false;
        IS_GUEST = true;
        ANONYMIZE_ENABLED = data.anonymize || false;
        applyDarkMode(data.darkMode || 'system');
        console.log('Anonymisation activée:', ANONYMIZE_ENABLED);

        hideAdminElements();
        showLoginPage(false);
        updateAuthStatus();
        setupApp();
    })
    .catch(err => {
        console.error('Erreur login guest:', err);
    });
}

function logout() {
    const token = getAuthToken();
    if (token) {
        fetch(`${API_URL}/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => console.error('Erreur logout:', err));
    }
    
    // Réinitialisation des filtres avec zones dynamiques
    if (ZONES_CONFIG && ZONES_CONFIG.length > 0) {
        CURRENT_FILTER = {};
        ZONES_CONFIG.forEach(zone => {
            CURRENT_FILTER[zone.name] = 'all';
        });
        
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
    
    // Réafficher tous les éléments admin
    showAdminElements();

    clearAuthToken();
    IS_AUTHENTICATED = false;
    IS_GUEST = false;
    ANONYMIZE_ENABLED = false;

    showLoginPage(true);
    document.getElementById('loginPassword').value = '';
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
            if (IS_GUEST) {
                appContainer.classList.add('guest-mode');
            } else {
                appContainer.classList.remove('guest-mode');
            }
        }
    }
}

function updateAuthStatus() {
    const status = document.getElementById('authStatus');
    if (status) {
        if (IS_AUTHENTICATED) {
            status.innerHTML = `🔓 Connecté - Mode modification${USER_NAME ? ` (${USER_NAME})` : ''}`;
            status.style.color = '#2e7d32';
        } else if (IS_GUEST) {
            status.innerHTML = '👁️ Mode consultation (lecture seule)';
            status.style.color = '#e65100';
        }
    }
    
    //updateImportExportButtons();
}

function updateImportExportButtons() {
    const importExportButtons = document.querySelectorAll('.search-bar button');
    console.log('Mise à jour des boutons header, IS_GUEST:', IS_GUEST);
    
    importExportButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        console.log('Bouton:', text);
        
        if (text.includes('import') || text.includes('backup')|| 
            text.includes('json') || text.includes('csv') ) {
            if (IS_GUEST) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none';
                console.log('Bouton désactivé:', text);
                //btn.style.display = 'none';
            } else {
                //btn.style.display = '';
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                console.log('Bouton activé:', text);
            }
        }
    });
    
    const newLockerButtons = document.querySelectorAll('.controls .btn-primary');
    console.log('Mise à jour des boutons "Attribuer" et "Imprimés", trouvés:', newLockerButtons.length);
    
    newLockerButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('attribuer') || text.includes('imprimer') ) {
            if (IS_GUEST) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none';
                console.log('Boutons "Attribuer & Imprimer" désactivé');
                //btn.style.display = 'none';
            } else {
                //btn.style.display = '';
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                console.log('Boutons "Attribuer & Imprimer" activé');
            }
        }
    });
}

function isEditAllowed() {
    if (!IS_AUTHENTICATED) {
        alert('Vous devez vous connecter pour modifier les données.');
        return false;
    }
    return true;
}

// ============================================
// Masquer tous les éléments admin
// ============================================

function hideAdminElements() {
    console.log('🙈 Masquage des éléments admin en mode guest');
    
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
    console.log(`   Éléments .admin-only trouvés: ${adminOnlyElements.length}`);
    adminOnlyElements.forEach(el => {
        el.style.display = 'none';
    });
    
    // 4. Masquer les options "Récupérables" dans les filtres
    const filterSelects = document.querySelectorAll('[id^="filter-"]');
    filterSelects.forEach(select => {
        const recoverableOption = Array.from(select.options).find(
            opt => opt.value === 'recoverable'
        );
        if (recoverableOption) {
            recoverableOption.style.display = 'none';
        }
    });
    
    console.log('✓ Éléments admin masqués');
}

// ============================================
// Réafficher les éléments admin
// ============================================

function showAdminElements() {
    console.log('👁️ Affichage des éléments admin');
    
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
    
    // 4. Réafficher les options "Récupérables" dans les filtres
    const filterSelects = document.querySelectorAll('[id^="filter-"]');
    filterSelects.forEach(select => {
        const recoverableOption = Array.from(select.options).find(
            opt => opt.value === 'recoverable'
        );
        if (recoverableOption) {
            recoverableOption.style.display = '';
        }
    });
    
    console.log('✓ Éléments admin réaffichés');
}

// ============ CONFIGURATION API ============

async function setupApp() {
    console.log('🚀 Setup de l\'application...');
    console.log('API_URL actuelle:', API_URL);
    console.log('Token présent:', !!getAuthToken());
    
    try {
        // 🔹 ÉTAPE 1 : Charger la configuration des zones
        console.log('1️⃣ Chargement configuration zones...');
        await loadZonesConfig();
        console.log('✓ Config zones chargée:', ZONES_CONFIG);
        
        // 🔹 ÉTAPE 2 : Générer l'interface
        console.log('2️⃣ Génération interface...');
        generateTabs();
        generateContentSections();
        console.log('✓ Interface générée');
        
        // 🔹 ÉTAPE 3 : Initialiser les filtres
        console.log('3️⃣ Initialisation filtres...');
        CURRENT_FILTER = {};
        ZONES_CONFIG.forEach(zone => {
            CURRENT_FILTER[zone.name] = 'all';
        });
        console.log('✓ Filtres initialisés:', CURRENT_FILTER);
        
        // 🔹 ÉTAPE 4 : Event listeners
        console.log('4️⃣ Event listeners...');
        
        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                if (e.target.value.trim()) {
                    searchLockers(e.target.value);
                } else {
                    renderAllTables();
                }
            });
        }
        
        const form = document.getElementById('lockerForm');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }
        
        console.log('✓ Event listeners installés');
        
        // 🔹 ÉTAPE 5 : Charger les données
        console.log('5️⃣ Chargement données...');
        loadData();
        
        // 🔹 ÉTAPE 6 : Vérifier serveur
        console.log('6️⃣ Vérification serveur...');
        checkServerStatus();
        
        // 🔹 ÉTAPE 7 : Appliquer mode guest si nécessaire
        if (IS_GUEST) {
            console.log('7️⃣ Application mode guest...');
            applyGuestDefaults();
        }
        
        // 🔹 ÉTAPE 8 : Rafraîchissement automatique
        console.log('8️⃣ Démarrage rafraîchissement auto...');
        setInterval(() => {
            console.log('⟳ Rafraîchissement automatique...');
            loadData();
            checkServerStatus();
        }, 60000);
        
        console.log('✅ Application initialisée avec succès');
        
    } catch (err) {
        console.error('❌ Erreur lors du setup:', err);
        alert('Erreur lors de l\'initialisation de l\'application: ' + err.message);
    }
}

function applyGuestDefaults() {
    console.log('👁️ Application mode guest...');
    
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        console.warn('⚠️ ZONES_CONFIG non chargée');
        return;
    }
    
    // Désactiver les filtres et mettre sur "occupied"
    CURRENT_FILTER = {};
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
    
    // Tri par nom
    document.querySelectorAll('select[onchange^="sortTable"]').forEach(select => {
        select.value = 'name';
    });
    
    // Masquer les éléments admin
    hideAdminElements();
    
    console.log('✓ Mode guest appliqué');
}

function applyAdminDefaults() {
    console.log('👁️ Application mode guest...');
    
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        console.warn('⚠️ ZONES_CONFIG non chargée');
        return;
    }
    
    // Désactiver les filtres et mettre sur "occupied"
    CURRENT_FILTER = {};
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
    
    // Tri par nom
    document.querySelectorAll('select[onchange^="sortTable"]').forEach(select => {
        select.value = 'name';
    });
    
    // Démasquer les éléments d'administration
    showAdminElements();
    
    console.log('✓ Mode guest appliqué');
}

// ============ BACKUP ============

function createBackup() {
    if (!isEditAllowed()) return;
    
    if (!confirm('Créer un backup de la base de données maintenant ?')) return;
    
    const token = getAuthToken();
    
    fetch(`${API_URL}/backup`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
        if (!res.ok) throw new Error('Erreur ' + res.status);
        return res.json();
    })
    .then(data => {
        alert(`✓ Backup créé avec succès !\n\nFichier : ${data.filename}\nTaille : ${(data.size / 1024).toFixed(2)} KB`);
    })
    .catch(err => {
        alert('Erreur lors du backup : ' + err.message);
        console.error('Erreur backup:', err);
    });
}

// ============ SERVEUR ============

function checkServerStatus() {
    fetch(`${API_URL}/health`)
        .then(res => {
            if (res.ok) {
                document.getElementById('serverStatus').className = 'server-status online';
                document.getElementById('serverStatus').textContent = '🟢 Connecté';
            } else {
                throw new Error('Not OK');
            }
        })
        .catch(err => {
            document.getElementById('serverStatus').className = 'server-status offline';
            document.getElementById('serverStatus').textContent = '🔴 Déconnecté';
            console.error('Serveur indisponible:', err);
        });
}

function loadData() {
    fetch(`${API_URL}/lockers`)
        .then(res => {
            if (!res.ok) throw new Error('Erreur ' + res.status);
            return res.json();
        })
        .then(data => {
            DATA = data;
            console.log('📦 Données chargées:', DATA.length);
            console.log('📋 ZONES_CONFIG:', ZONES_CONFIG);
            
            renderAllTables();
            updateCounters();
        })
        .catch(err => {
            console.error('Erreur chargement:', err);
            alert('Erreur: Impossible de charger les données.\n\nAssurez-vous que:\n1. Le serveur Node.js est lancé (npm run dev)\n2. L\'URL est: ' + API_URL);
        });
}

// ============ COMPTEURS ============

function updateCounters() {
    if (!DATA || DATA.length === 0) {
        console.log('⚠️ Pas de données pour les compteurs');
        return;
    }
    
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        console.log('⚠️ ZONES_CONFIG non chargée');
        return;
    }
    
    const zones = {};
    
    // Initialiser pour chaque zone configurée
    ZONES_CONFIG.forEach(zoneConfig => {
        zones[zoneConfig.name] = {
            total: zoneConfig.count,
            occupied: 0
        };
    });
    
    // Compter les occupés
    DATA.forEach(locker => {
        if (locker.occupied && zones[locker.zone]) {
            zones[locker.zone].occupied++;
        }
    });
    
    // Mettre à jour l'affichage
    Object.keys(zones).forEach(zoneName => {
        const counter = document.getElementById(`counter-${zoneName}`);
        if (counter) {
            const { occupied, total } = zones[zoneName];
            counter.textContent = `${occupied}/${total}`;
            
            counter.classList.remove('full', 'warning');
            if (occupied === total) {
                counter.classList.add('full');
            } else if (occupied / total >= 0.8) {
                counter.classList.add('warning');
            }
        }
    });
}

// ============ NAVIGATION ============

function switchTab(zone) {
    CURRENT_ZONE = zone;
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    
    document.querySelector(`[data-zone="${zone}"]`).classList.add('active');
    document.getElementById(`content-${zone}`).classList.add('active');
}

// ============ AFFICHAGE TABLEAU ============

function renderAllTables() {
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        console.log('⚠️ ZONES_CONFIG non chargée');
        return;
    }
    
    ZONES_CONFIG.forEach(zone => {
        renderTable(zone.name);
    });
}

// Modifier le modal pour supporter les zones dynamiques
function populateZoneSelect() {
    const zoneSelect = document.getElementById('zone');
    if (!zoneSelect) return;
    
    zoneSelect.innerHTML = ZONES_CONFIG.map(zone => 
        `<option value="${zone.name}">${zone.name}</option>`
    ).join('');
}

function renderTable(zone) {
    const tbody = document.getElementById(`tbody-${zone}`);
    let lockers = DATA.filter(l => l.zone === zone);
    
    const filter = CURRENT_FILTER[zone] || 'all';
    if (filter === 'occupied') {
        lockers = lockers.filter(l => l.occupied);
    } else if (filter === 'empty') {
        lockers = lockers.filter(l => !l.occupied);
    } else if (filter === 'recoverable') {
        lockers = lockers.filter(l => l.occupied && (l.recoverable == 1 || l.recoverable === true));
    }
    
    if (IS_GUEST) {
        lockers.sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }
    
    const getStatus = (locker) => {
        if (!locker.occupied) {
            return '<span class="status-empty" title="Libre"></span>';
        } else if (locker.recoverable == 1 || locker.recoverable === true) {
            return '<span class="status-recoverable" title="Récupérable"></span>';
        } else {
            return '<span class="status-occupied" title="Occupé"></span>';
        }
    };
    
    // MODE GUEST - Sans commentaire
    if (IS_GUEST) {
        tbody.innerHTML = lockers.map(locker => `
            <tr>
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? anonymizeName(locker.name) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? anonymizeFirstName(locker.firstName) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
            </tr>
        `).join('');
    } else {
        // MODE ADMIN - Avec commentaire
        tbody.innerHTML = lockers.map(locker => `
            <tr>
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? anonymizeName(locker.name) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? anonymizeFirstName(locker.firstName) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile" style="text-align: center;">${getStatus(locker)}</td>
                <td class="hide-mobile">${locker.comment || '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">
                    <div class="menu-dot">
                        <button class="btn-secondary" onclick="toggleDropdown(event)">⋮</button>
                        <div class="dropdown-menu">
                            <button onclick="openModalEdit('${locker.number}')">Modifier</button>
                            <button class="btn-delete" onclick="releaseLocker('${locker.number}')">Libérer</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

function filterTable(zone, value) {
    CURRENT_FILTER[zone] = value;
    renderTable(zone);
}

function sortTable(zone, value) {
    const tbody = document.getElementById(`tbody-${zone}`);
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    rows.sort((a, b) => {
        const idx = value === 'name' ? 1 : 0;
        return a.cells[idx].textContent.localeCompare(b.cells[idx].textContent);
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

function searchLockers(query) {
    if (!query || query.trim() === '') {
        renderAllTables();
        return;
    }
    
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        console.log('⚠️ ZONES_CONFIG non chargée');
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    
    // Recherche dans nom, prénom, code IPP
    const results = DATA.filter(l => {
        const searchText = (l.name + ' ' + l.firstName + ' ' + l.code).toLowerCase();
        return searchText.includes(searchTerm);
    });
    
    console.log(`🔍 Recherche "${query}" : ${results.length} résultat(s)`);
    
    if (results.length === 0) {
        // Afficher "Aucun résultat" dans toutes les zones
        ZONES_CONFIG.forEach(zone => {
            const tbody = document.getElementById(`tbody-${zone.name}`);
            if (tbody) {
                const colspan = IS_GUEST ? '5' : '8';
                tbody.innerHTML = `
                    <tr>
                        <td colspan="${colspan}" style="text-align: center; padding: 30px; color: var(--text-tertiary);">
                            Aucun résultat pour "${query}"
                        </td>
                    </tr>
                `;
            }
        });
        return;
    }
    
    // Grouper les résultats par zone
    const byZone = {};
    ZONES_CONFIG.forEach(zone => {
        byZone[zone.name] = results.filter(l => l.zone === zone.name);
    });
    
    // Afficher les résultats dans chaque zone
    ZONES_CONFIG.forEach(zone => {
        const tbody = document.getElementById(`tbody-${zone.name}`);
        if (!tbody) {
            console.warn(`tbody-${zone.name} non trouvé`);
            return;
        }
        
        const zoneResults = byZone[zone.name];
        const colspan = IS_GUEST ? '5' : '8';
        
        if (zoneResults.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${colspan}" style="text-align: center; padding: 20px; color: var(--text-tertiary); font-style: italic;">
                        Aucun résultat dans cette zone
                    </td>
                </tr>
            `;
            return;
        }
        
        const getStatus = (locker) => {
            if (!locker.occupied) {
                return '<span class="status-empty" title="Libre"></span>';
            } else if (locker.recoverable == 1 || locker.recoverable === true) {
                return '<span class="status-recoverable" title="Récupérable"></span>';
            } else {
                return '<span class="status-occupied" title="Occupé"></span>';
            }
        };
        
        // MODE GUEST
        if (IS_GUEST) {
            tbody.innerHTML = zoneResults.map(locker => `
                <tr>
                    <td><strong>${locker.number}</strong></td>
                    <td>${locker.occupied ? anonymizeName(locker.name) : '<span class="cell-empty">—</span>'}</td>
                    <td>${locker.occupied ? anonymizeFirstName(locker.firstName) : '<span class="cell-empty">—</span>'}</td>
                    <td>${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                    <td class="hide-mobile">${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
                </tr>
            `).join('');
        } else {
            // MODE ADMIN
            tbody.innerHTML = zoneResults.map(locker => `
                <tr>
                    <td><strong>${locker.number}</strong></td>
                    <td>${locker.occupied ? anonymizeName(locker.name) : '<span class="cell-empty">—</span>'}</td>
                    <td>${locker.occupied ? anonymizeFirstName(locker.firstName) : '<span class="cell-empty">—</span>'}</td>
                    <td>${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                    <td class="hide-mobile">${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
                    <td style="text-align: center;">${getStatus(locker)}</td>
                    <td class="hide-mobile">${locker.comment || '<span class="cell-empty">—</span>'}</td>
                    <td class="hide-mobile">
                        <div class="menu-dot">
                            <button class="btn-secondary" onclick="toggleDropdown(event)">⋮</button>
                            <div class="dropdown-menu">
                                <button onclick="openModalEdit('${locker.number}')">Modifier</button>
                                <button class="btn-delete" onclick="releaseLocker('${locker.number}')">Libérer</button>
                            </div>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    });
}

// ============================================
//   Recherche améliorée avec highlighting
// ============================================

function searchLockersAdvanced(query) {
    if (!query || query.trim() === '') {
        renderAllTables();
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    
    // Recherche dans nom, prénom, code IPP
    const results = DATA.filter(l => {
        const searchText = (l.name + ' ' + l.firstName + ' ' + l.code).toLowerCase();
        return searchText.includes(searchTerm);
    });
    
    console.log(`🔍 Recherche "${query}" : ${results.length} résultat(s)`);
    
    if (results.length === 0) {
        // Afficher "Aucun résultat" dans toutes les zones
        ZONES_CONFIG.forEach(zone => {
            const tbody = document.getElementById(`tbody-${zone}`);
            const colspan = IS_GUEST ? '5' : '8';
            tbody.innerHTML = `
                <tr>
                    <td colspan="${colspan}" style="text-align: center; padding: 30px; color: var(--text-tertiary);">
                        Aucun résultat pour "${query}"<br><br>                                     
                             ¯\\_(ツ)_/¯
                    </td>
                </tr>
            `;
        });
        return;
    }
    
    // Basculer sur la zone du PREMIER résultat (comme avant)
    const firstZone = results[0].zone;
    switchTab(firstZone);
    
    // Vider les autres zones
    ZONES_CONFIG.forEach(zone => {
        if (zone !== firstZone) {
            const tbody = document.getElementById(`tbody-${zone}`);
            tbody.innerHTML = '';
        }
    });
    
    // Afficher TOUS les résultats dans la première zone (table unifiée)
    const tbody = document.getElementById(`tbody-${firstZone}`);
    
    // Fonction pour surligner le terme recherché
    const highlight = (text, search) => {
        if (!text || !search) return text;
        const regex = new RegExp(`(${search})`, 'gi');
        return text.replace(regex, '<mark style="background: #fef3c7; padding: 2px 4px; border-radius: 3px; font-weight: 600;">$1</mark>');
    };
    
    const getStatus = (locker) => {
        if (!locker.occupied) {
            return '<span class="status-empty" title="Libre"></span>';
        } else if (locker.recoverable == 1 || locker.recoverable === true) {
            return '<span class="status-recoverable" title="Récupérable"></span>';
        } else {
            return '<span class="status-occupied" title="Occupé"></span>';
        }
    };
    
    // MODE GUEST
    if (IS_GUEST) {
        tbody.innerHTML = results.map(locker => `
            <tr>
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? highlight(anonymizeName(locker.name), searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? highlight(anonymizeFirstName(locker.firstName), searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? highlight(locker.code, searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
            </tr>
        `).join('');
    } else {
        // MODE ADMIN
        tbody.innerHTML = results.map(locker => `
            <tr>
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? highlight(anonymizeName(locker.name), searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? highlight(anonymizeFirstName(locker.firstName), searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? highlight(locker.code, searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
                <td style="text-align: center;">${getStatus(locker)}</td>
                <td class="hide-mobile">${locker.comment ? highlight(locker.comment, searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">
                    <div class="menu-dot">
                        <button class="btn-secondary" onclick="toggleDropdown(event)">⋮</button>
                        <div class="dropdown-menu">
                            <button onclick="openModalEdit('${locker.number}')">Modifier</button>
                            <button class="btn-delete" onclick="releaseLocker('${locker.number}')">Libérer</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

// ============ MODAL ============
function openModal(zone) {
    if (!isEditAllowed()) return;

    // Réinitialiser (pas d'édition)
    EDITING_LOCKER_NUMBER = null;
    
    populateZoneSelect();

    document.getElementById('zone').value = zone;
    document.getElementById('modalTitle').textContent = 'Attribuer un casier';
    document.getElementById('lastName').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('code').value = '';
    document.getElementById('birthDate').value = '';
    document.getElementById('comment').value = '';
    document.getElementById('recoverable').checked = false;
    document.getElementById('statusMessage').innerHTML = '';
    
    populateLockerSelect(zone);
    
    const zoneSelect = document.getElementById('zone');
    zoneSelect.onchange = function() {
        populateLockerSelect(this.value);
    };
    
    document.getElementById('modal').classList.add('active');
}

function openModalEdit(lockerNumber) {
    if (!isEditAllowed()) return;
    
    const locker = DATA.find(l => l.number === lockerNumber);
    if (!locker) return;
    
    //Mémoriser le numéro original
    EDITING_LOCKER_NUMBER = lockerNumber;
    
    document.getElementById('zone').value = locker.zone;
    document.getElementById('modalTitle').textContent = `Modifier ${locker.number}`;
    document.getElementById('lockerNumber').value = lockerNumber;
    document.getElementById('lastName').value = locker.name;
    document.getElementById('firstName').value = locker.firstName;
    document.getElementById('code').value = locker.code;
    document.getElementById('birthDate').value = locker.birthDate;
    document.getElementById('comment').value = locker.comment || '';
    document.getElementById('recoverable').checked = locker.recoverable || false;
    document.getElementById('statusMessage').innerHTML = '';
    
    populateLockerSelect(locker.zone, lockerNumber);
    
    const zoneSelect = document.getElementById('zone');
    zoneSelect.onchange = function() {
        populateLockerSelect(this.value, lockerNumber);
    };
    
    document.getElementById('modal').classList.add('active');
}

function populateLockerSelect(zone, selected = null) {
    const select = document.getElementById('lockerNumber');
    const lockers = DATA.filter(l => l.zone === zone);
    
    select.innerHTML = lockers.map(locker => {
        const isAvailable = !locker.occupied || locker.number === selected;
        return `<option value="${locker.number}" ${!isAvailable ? 'disabled' : ''}>${locker.number}${isAvailable ? '' : ' (occupé)'}</option>`;
    }).join('');
    
    if (selected) {
        select.value = selected;
    }
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// ============ FORMULAIRE ============

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const newLockerNumber = document.getElementById('lockerNumber').value;
    const zone = document.getElementById('zone').value;
    const recoverable = document.getElementById('recoverable').checked;
    const comment = document.getElementById('comment').value;
    const token = getAuthToken();
    
    // 🔹 NOUVEAU : Détecter si le numéro de casier a changé
    const isLockerChanged = EDITING_LOCKER_NUMBER && EDITING_LOCKER_NUMBER !== newLockerNumber;
    
    if (isLockerChanged) {
        // Afficher une popup de confirmation
        const oldNumber = EDITING_LOCKER_NUMBER;
        const patientName = document.getElementById('lastName').value + ' ' + document.getElementById('firstName').value;
        
        const confirmMessage = `⚠️ CHANGEMENT DE CASIER\n\n` +
            `Patient : ${patientName}\n` +
            `Ancien casier : ${oldNumber}\n` +
            `Nouveau casier : ${newLockerNumber}\n\n` +
            `Voulez-vous libérer automatiquement l'ancien casier ${oldNumber} ?`;
        
        const shouldReleaseOld = confirm(confirmMessage);
        
        if (shouldReleaseOld) {
            // Enregistrer le nouveau casier d'abord
            try {
                await saveLocker(newLockerNumber, zone, recoverable, comment, token);
                
                // Puis libérer l'ancien casier
                await releaseLockerSilent(oldNumber, token);
                
                closeModal();
                loadData();
                showStatus(`✓ ${patientName} déplacé de ${oldNumber} vers ${newLockerNumber}`, 'success');
            } catch (err) {
                showStatus('Erreur lors du déplacement: ' + err.message, 'error');
            }
        } else {
            // L'utilisateur ne veut pas libérer l'ancien, juste créer le nouveau
            const confirmKeepOld = confirm(
                `L'ancien casier ${oldNumber} restera occupé.\n` +
                `Voulez-vous continuer ?`
            );
            
            if (confirmKeepOld) {
                try {
                    await saveLocker(newLockerNumber, zone, recoverable, comment, token);
                    closeModal();
                    loadData();
                    showStatus(`✓ Nouveau casier ${newLockerNumber} créé (${oldNumber} toujours occupé)`, 'success');
                } catch (err) {
                    showStatus('Erreur: ' + err.message, 'error');
                }
            }
            // Sinon, on ne fait rien (l'utilisateur annule tout)
        }
    } else {
        // Pas de changement de numéro, comportement normal
        try {
            await saveLocker(newLockerNumber, zone, recoverable, comment, token);
            closeModal();
            loadData();
            
            // Vérifier si l'IPP était valide
            const result = await fetch(`${API_URL}/lockers/${newLockerNumber}`);
            const data = await result.json();
            
            if (data.ippValid === false) {
                showStatus('⚠️ Casier enregistré mais N°IPP non trouvé dans la base clients (marqué récupérable)', 'error');
            } else {
                showStatus('✓ Casier enregistré', 'success');
            }
        } catch (err) {
            showStatus('Erreur: ' + err.message, 'error');
        }
    }
}

function releaseLocker(lockerNumber) {
    if (!isEditAllowed()) return;
    
    if (!confirm('Libérer ce casier ?')) return;
    
    const token = getAuthToken();
    
    fetch(`${API_URL}/lockers/${lockerNumber}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
        if (!res.ok) throw new Error('Erreur ' + res.status);
        loadData();
        showStatus('Casier libéré', 'success');
    })
    .catch(err => {
        showStatus('Erreur: ' + err.message, 'error');
    });
}

// FONCTION HELPER : Enregistrer un casier (extraction du code existant)
async function saveLocker(lockerNumber, zone, recoverable, comment, token) {
    const response = await fetch(`${API_URL}/lockers`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            number: lockerNumber,
            zone: zone,
            name: document.getElementById('lastName').value,
            firstName: document.getElementById('firstName').value,
            code: document.getElementById('code').value,
            birthDate: document.getElementById('birthDate').value,
            comment: comment,
            recoverable: recoverable
        })
    });
    
    if (!response.ok) {
        throw new Error('Erreur ' + response.status);
    }
    
    return response.json();
}

// FONCTION HELPER : Libérer un casier sans message
async function releaseLockerSilent(lockerNumber, token) {
    const response = await fetch(`${API_URL}/lockers/${lockerNumber}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
        throw new Error('Erreur libération casier ' + lockerNumber);
    }
    
    return response.json();
}

function showStatus(msg, type) {
    const el = document.getElementById('statusMessage');
    el.className = 'status-message status-' + type;
    el.textContent = msg;
    setTimeout(() => {
        el.innerHTML = '';
    }, 3000);
}

// ============ EXPORT ============
function exportData(format) {
    const occupied = DATA.filter(l => l.occupied);
    
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const readableDate = now.toLocaleString('fr-FR', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(/[/:]/g, '-').replace(', ', '_');
    
    const userName = USER_NAME || 'utilisateur';
    const role = IS_AUTHENTICATED ? 'admin' : 'guest';
    
    if (format === 'json') {
        const exportData = {
            metadata: {
                exportDate: now.toISOString(),
                exportBy: userName,
                userRole: role,
                totalLockers: occupied.length,
                application: 'HADO - Casiers zone départ'
            },
            lockers: occupied
        };
        const json = JSON.stringify(exportData, null, 2);
        downloadFile(json, `casiers_${readableDate}_${userName}.json`, 'application/json');
    } else if (format === 'csv') {
        const csv = convertToCSV(occupied);
        downloadFile(csv, `casiers_${readableDate}_${userName}.csv`, 'text/csv');
    }
    
    logExport(format, occupied.length, userName, role);
}

async function logExport(format, count, userName, role) {
    try {
        const token = getAuthToken();
        await fetch(`${API_URL}/exports/log`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                format: format,
                recordCount: count,
                userName: userName,
                userRole: role
            })
        });
    } catch (err) {
        console.error('Erreur enregistrement export:', err);
    }
}

function convertToCSV(data) {
    const headers = ['N° Casier', 'Zone', 'Nom', 'Prénom', 'N°IPP', 'DDN', 'Récupérable'];
    const rows = data.map(locker => [
        locker.number, 
        locker.zone, 
        locker.name, 
        locker.firstName, 
        locker.code, 
        locker.birthDate,
        locker.recoverable ? '1' : '0'
    ]);
    
    return [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// ============ IMPORT ============
function importCSV() {
    if (!isEditAllowed()) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());
            
            const dataLines = lines.slice(1);
            
            const data = dataLines.map(line => {
                const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
                if (!values || values.length < 6) return null;
                
                return {
                    number: values[0].replace(/"/g, '').trim(),
                    zone: values[1].replace(/"/g, '').trim(),
                    name: values[2].replace(/"/g, '').trim(),
                    firstName: values[3].replace(/"/g, '').trim(),
                    code: values[4].replace(/"/g, '').trim(),
                    birthDate: values[5].replace(/"/g, '').trim(),
                    recoverable: values[6] ? (values[6].replace(/"/g, '').trim() === '1') : false
                };
            }).filter(item => item !== null);
            
            if (data.length === 0) {
                alert('Aucune donnée valide trouvée dans le fichier CSV');
                return;
            }
            
            if (!confirm(`Importer ${data.length} casiers ?\n\nCeci va remplacer les données existantes pour ces casiers.`)) {
                return;
            }
            
            const token = getAuthToken();
            const res = await fetch(`${API_URL}/import`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ data: data })
            });
            
            if (res.ok) {
                const result = await res.json();
                let message = `Import terminé !\n\n✓ Importés : ${result.imported}\n✗ Erreurs : ${result.errors}`;
                if (result.invalidIPP > 0) {
                    message += `\n⚠️ IPP invalides : ${result.invalidIPP} (marqués récupérables)`;
                }
                message += `\nTotal : ${result.total}`;
                alert(message);
                loadData();
            } else if (res.status === 401) {
                alert('Session expirée. Veuillez vous reconnecter.');
                logout();
            } else {
                throw new Error('Erreur serveur');
            }
        } catch (err) {
            alert('Erreur lors de l\'import : ' + err.message);
            console.error('Erreur import:', err);
        }
    };
    
    input.click();
}

// ============ IMPORT CLIENTS ============
function importClients() {
    if (!isEditAllowed()) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            console.log('📂 Lecture du fichier clients...');
            const text = await file.text();
            
            // Récupérer le format
            const configResponse = await fetch(`${API_URL}/config/import-format`);
            const config = await configResponse.json();
            const formatName = config.clientImportFormat || 'LEGACY';
            
            console.log(`📋 Format: ${formatName}`);
            
            //  ENVOYER LE CONTENU BRUT au serveur
            const token = getAuthToken();
            const res = await fetch(`${API_URL}/clients/import`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    rawContent: text,  // Contenu brut
                    format: formatName
                })
            });
            
            if (res.ok) {
                const result = await res.json();
                let message = `Import clients terminé !\n\n`;
                message += `✓ Importés : ${result.imported}\n`;
                if (result.filtered > 0) {
                    message += `🔍 Filtrés : ${result.filtered}\n`;
                }
                if (result.errors > 0) {
                    message += `✗ Erreurs : ${result.errors}\n`;
                }
                message += `Total : ${result.total}`;
                alert(message);
            } else if (res.status === 401) {
                alert('Session expirée. Veuillez vous reconnecter.');
                logout();
            } else {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Erreur serveur');
            }
        } catch (err) {
            alert('Erreur lors de l\'import clients : ' + err.message);
            console.error('Erreur import clients:', err);
        }
    };
    
    input.click();
}

// ============ RECHERCHE CLIENT ============
async function searchClient() {
    const ipp = document.getElementById('code').value.trim();
    
    if (!ipp) {
        alert('Veuillez saisir un N°IPP');
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/clients/${ipp}`);
        
        if (res.ok) {
            const client = await res.json();
            
            document.getElementById('lastName').value = client.name || '';
            document.getElementById('firstName').value = client.firstName || '';
            document.getElementById('birthDate').value = client.birthDate || '';
            
            showStatus('✓ Client trouvé et champs remplis', 'success');
        } else if (res.status === 404) {
            showStatus('⚠️ N°IPP non trouvé dans la base clients', 'error');
        } else {
            showStatus('⚠️ Erreur lors de la recherche', 'error');
        }
    } catch (err) {
        showStatus('Erreur lors de la recherche: ' + err.message, 'error');
        console.error('Erreur recherche client:', err);
    }
}

// ============ UTILITAIRES ============
// Fonction debounce pour éviter trop d'appels
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function printTable() {
    window.print();
}

function toggleDropdown(e) {
    e.stopPropagation();
    const menu = e.target.nextElementSibling;
    document.querySelectorAll('.dropdown-menu.active').forEach(m => {
        if (m !== menu) m.classList.remove('active');
    });
    menu.classList.toggle('active');
}

document.addEventListener('click', function() {
    document.querySelectorAll('.dropdown-menu.active').forEach(m => m.classList.remove('active'));
});


function debugAppState() {
    console.log('🔍 État de l\'application:');
    console.log('  ZONES_CONFIG:', ZONES_CONFIG);
    console.log('  DATA:', DATA ? DATA.length + ' casiers' : 'non chargé');
    console.log('  CURRENT_FILTER:', CURRENT_FILTER);
    console.log('  IS_GUEST:', IS_GUEST);
    console.log('  IS_AUTHENTICATED:', IS_AUTHENTICATED);
    
    console.log('\n📊 Compteurs:');
    ZONES_CONFIG.forEach(zone => {
        const counter = document.getElementById(`counter-${zone.name}`);
        console.log(`  ${zone.name}:`, counter ? counter.textContent : 'NON TROUVÉ');
    });
    
    console.log('\n📋 Tableaux:');
    ZONES_CONFIG.forEach(zone => {
        const tbody = document.getElementById(`tbody-${zone.name}`);
        console.log(`  tbody-${zone.name}:`, tbody ? tbody.children.length + ' lignes' : 'NON TROUVÉ');
    });
    
    console.log('\n🔘 Onglets:');
    const tabs = document.querySelectorAll('.tab-button');
    console.log(`  ${tabs.length} onglets générés`);
    tabs.forEach(tab => {
        console.log(`    - ${tab.textContent.trim()} (${tab.classList.contains('active') ? 'actif' : 'inactif'})`);
    });
}
