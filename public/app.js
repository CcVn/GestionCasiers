// Configuration
let API_URL = 'http://localhost:5000/api';
let DATA = [];
let ZONES_CONFIG = []; // Variable globale pour stocker la config des zones
let IS_AUTHENTICATED = false;
let IS_GUEST = false;
let IS_MOBILE = false;
let ANONYMIZE_ENABLED = false;
let USER_NAME = '';
let DARK_MODE_SETTING = 'system'
let ADVANCED_RESEARCH = true;
let EDITING_LOCKER_NUMBER = null; // Mémoriser le casier en cours d'édition
let EDITING_LOCKER_VERSION = null; // Mémoriser la version du casier en cours d'édition


// ============ CONFIG DES ZONES ============

// Fonction pour charger la configuration des zones
async function loadZonesConfig() {
    try {
        const response = await fetch(`${API_URL}/config/zones`, {
            credentials: 'include' 
        });
        const data = await response.json();
        ZONES_CONFIG = data.zones;
        
        console.log('📋 Configuration des zones chargée:', ZONES_CONFIG);
        return ZONES_CONFIG;
    } catch (err) {
        console.error('Erreur chargement config zones:', err);
        // Fallback sur la config par défaut
/*        ZONES_CONFIG = [
            { name: 'NORD', count: 75, prefix: 'N' },
            { name: 'SUD', count: 75, prefix: 'S' },
            { name: 'PCA', count: 40, prefix: 'P' }
        ];
        return ZONES_CONFIG; */
    }
}

// Fonction pour générer les onglets dynamiquement
function generateTabs() {
    const tabsContainer = document.querySelector('.tabs');
    if (!tabsContainer) return;
    //const colors = (process.env.ZONE_COLORS || '#3b82f6,#10b981,#f59e0b,#ef4444').split(',');
    //const colors = '#3b82f6,#10b981,#f59e0b,#ef4444'.split(',');
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
                    <span class="zone-counter admin-only" id="counter-${zone.name}">0/${zone.count}</span>
                </h2>
                <div class="controls">
                    <button class="btn-primary admin-only" onclick="openModal('${zone.name}')">➕ Attribuer</button>
                    <select class="admin-only" onchange="filterTable('${zone.name}', this.value)" id="filter-${zone.name}">
                        <option value="all">Tous</option>
                        <option value="occupied">Occupés</option>
                        <option value="empty">Vides</option>
                        <option value="recoverable" class="admin-only">Récupérables</option>
                        <option value="duplicates" class="admin-only">Doublons ⚠️</option>
                    </select>
                    <select class="admin-only" onchange="sortTable('${zone.name}', this.value)">
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

// Autre fonction utilitaire sur format de date
function formatDate(inputDate) {
  //const [year, month, day] = inputDate.split('-');
  //return `${day}/${month}/${year}`; // Note : Les mois en JavaScript commencent à 0, donc on ne retire pas 1 ici.

  const date = new Date(inputDate);
  if (isNaN(date.getTime())) {
    return "Date invalide";
  }
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// ============ TOKEN CSRF ============
// Fonction pour charger le token CSRF
async function loadCsrfToken() {
    try {
        const response = await fetch(`${API_URL}/csrf-token`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            console.warn('⚠️ Impossible de charger le token CSRF');
            return;
        }
        
        const data = await response.json();
        CSRF_TOKEN = data.csrfToken;
        console.log('✓ Token CSRF chargé');
    } catch (err) {
        console.error('❌ Erreur chargement token CSRF:', err);
        CSRF_TOKEN = null;
    }
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
    
    // Mettre à jour l'interface du sélecteur
    updateDarkModeButtons();
    // Mettre à jour l'icône du bouton header
    updateThemeIcon();
}

function updateDarkModeButtons() {
    const buttons = document.querySelectorAll('.mode-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === DARK_MODE_SETTING) {
            btn.classList.add('active');
        }
    });
}

function setDarkMode(mode) {
    console.log('🌓 Changement mode:', mode);
    
    // Sauvegarder la préférence localement
    localStorage.setItem('darkMode', mode);
    
    // Appliquer immédiatement
    applyDarkMode(mode);
    
    // Afficher une notification
    const modeNames = {
        'inactive': 'Mode clair',
        'active': 'Mode sombre',
        'system': 'Mode automatique'
    };
    
    showStatus(`✓ ${modeNames[mode]} activé`, 'success');
}
function toggleDarkModeQuick() {
    // Cycle: inactive → active → inactive
    let newMode;
    
    if (DARK_MODE_SETTING === 'inactive') {
        newMode = 'active';
    } else {
        newMode = 'inactive';
    }
    
    // Animation du bouton
    const btn = document.getElementById('btnThemeToggle');
    if (btn) {
        btn.classList.add('animating');
        setTimeout(() => btn.classList.remove('animating'), 500);
    }
    
    // Appliquer le nouveau mode
    setDarkMode(newMode);
    
    // Mettre à jour l'icône
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('btnThemeToggle');
    if (!btn) return;
    
    const icon = btn.querySelector('.theme-icon');
    if (!icon) return;
    
    if (DARK_MODE_SETTING === 'active') {
        icon.textContent = '🌙';
        btn.title = 'Activer le mode clair';
    } else {
        icon.textContent = '☀️';
        btn.title = 'Activer le mode sombre';
    }
}

// ============ DÉTECTION MOBILE ============
function detectMobile() {
    IS_MOBILE = window.innerWidth <= 768;
    console.log('Mode mobile:', IS_MOBILE);
    return IS_MOBILE;
}

// ============ INITIALISATION ============
document.addEventListener('DOMContentLoaded', async function() {
    //console.log('Page chargée');
    
    const protocol = window.location.protocol;
    const host = window.location.host;
    API_URL = `${protocol}//${host}/api`;
    console.log('API_URL configurée:', API_URL);
    
    detectMobile();
    
    // Charger le token CSRF immédiatement
    await loadCsrfToken();

    // Vérifier si le paramètre ?guest est présent dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const autoGuest = urlParams.get('guest') !== null;
    if (autoGuest) {
        console.log('Mode guest automatique détecté via URL');
        loginAsGuestAuto();
        return;
    }

    // Vérifier si une session existe via cookie
    fetch(`${API_URL}/auth/check`, {
        credentials: 'include'  // Envoie le cookie automatiquement
    })
    .then(res => res.json())
    .then(data => {
        if (data.authenticated) {
            console.log('Session valide, rôle:', data.role);
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
            console.log('Pas de session valide');
            setupLoginPage();
        }
    })
    .catch(err => {
        console.error('Erreur vérification session:', err);
        setupLoginPage();
    });

    // Gérer le changement de sélection d'étiquettes
    const labelSelection = document.getElementById('labelSelection');
    if (labelSelection) {
        labelSelection.addEventListener('change', updateLabelPreview);
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
        .catch(err => console.warn('Impossible de charger l\'IP:', err));
 
    if (form) {
        form.addEventListener('submit', handleLogin);
    }
}

function handleLogin(e) {
    e.preventDefault();
    // Vérifier que le token CSRF est chargé
    if (!CSRF_TOKEN) {
        console.error('❌ Token CSRF non disponible');
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
            'X-CSRF-Token': CSRF_TOKEN
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
    //.then(data => {
    .then(async data => {
        // Recharger le token CSRF après connexion
        await loadCsrfToken();
        
        if (data.role === 'admin') {
            IS_AUTHENTICATED = true;
            IS_GUEST = false;
            USER_NAME = data.userName;
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
        if (err.message.includes('429')) {
            alert('⏱️ Trop de tentatives de connexion.\nVeuillez patienter 5 minutes.');
        } else {
            alert(err.message);
        }
        document.getElementById('loginPassword').value = '';
        document.getElementById('userName').value = '';
        console.error('Erreur login:', err);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        submitBtn.classList.remove('btn-loading');
    });        
}

function loginAsGuest() {
    // Vérifier que le token CSRF est chargé
    if (!CSRF_TOKEN) {
        console.error('❌ Token CSRF non disponible');
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
            'X-CSRF-Token': CSRF_TOKEN
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
        alert('Erreur de connexion');
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = originalText;
        btn.classList.remove('btn-loading');
    });     
}

// Utilisation : URL à mettre dans le QR code : http://adresseIP:5000/?guest=true
function loginAsGuestAuto() {
    console.log('Connexion automatique en mode guest...');
    // Vérifier que le token CSRF est chargé
    if (!CSRF_TOKEN) {
        console.error('❌ Token CSRF non disponible');
        alert('Erreur de sécurité. Veuillez recharger la page.');
        return;
    }

    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': CSRF_TOKEN
        },
        credentials: 'include',
        body: JSON.stringify({ password: '' })
    })
//    .then(res => res.json())
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        return res.json();
    })
    .then(async data => {
        await loadCsrfToken();

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
        console.error('Erreur login guest auto:', err);
        // En cas d'erreur, afficher la page de login normale
        setupLoginPage();
        alert('Erreur de connexion automatique');
    });
}

function logout() {

    fetch(`${API_URL}/logout`, {
        method: 'POST',
        credentials: 'include',  // IMPORTANT
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': CSRF_TOKEN  
        }
    }).catch(err => console.error('Erreur logout:', err));
    
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

    IS_AUTHENTICATED = false;
    IS_GUEST = false;
    ANONYMIZE_ENABLED = false;

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
            status.innerHTML = `🔓 Mode modification${USER_NAME ? ` (${USER_NAME})` : ''}`;
            status.style.color = '#e65100';
        } else if (IS_GUEST) {
            status.innerHTML = '👁️ Mode consultation';
            status.style.color = '#2e7d32';
        }
    }
    
    //updateImportExportButtons();
}

// pour l'info sur le dernier import patients
async function updateImportStatus() {
    try {
        const res = await fetch(`${API_URL}/clients/import-status`, {
            credentials: 'include'
        });
        
        if (!res.ok) return;
        
        const data = await res.json();
        
        const statusEl = document.getElementById('importStatus');
        if (!statusEl) return;
        
        if (!data.hasImport) {
            statusEl.innerHTML = '⚠️ Aucun import client';
            statusEl.style.color = '#f59e0b';
            statusEl.title = 'Aucun import de clients effectué - Import recommandé';
        } else {
            const importDate = new Date(data.lastImportDate);
            const daysSince = data.daysSinceImport;
            const hoursSince = data.hoursSinceImport;

            let message = '';
            let color = '#666';
            let title = '';
            
            const formattedDateTime = importDate.toLocaleString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            if (daysSince < 1) {
                message = `Dernier import patient il y a ${hoursSince}h`;
                color = '#10b981';
                title = `Dernière mise à jour de la base patients: ${formattedDateTime}`;
            } else if (daysSince <= data.warningThreshold) {
                message = `✓ Denier import patients il y a ${daysSince}j`;
                color = '#e6e600';
                title = `Dernière mise à jour de la base patients: ${formattedDateTime}`;
            } else {
                message = `⚠️ Base patients ancienne (${daysSince}j) - à rafraichir`;
                color = '#f59e0b';
                title = `Dernière mise à jour de la base patients: ${formattedDateTime} - Import recommandé`;
            }
            
            statusEl.innerHTML = message;
            statusEl.style.color = color;
            statusEl.title = title;
        }
    } catch (err) {
        console.error('Erreur chargement statut import:', err);
    }
}

// plus utilisée pour l'instant
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

// ============ CONFIGURATION API ============================

async function setupApp() {
    console.log('🚀 Setup de l\'application...');
    console.log('API_URL actuelle:', API_URL);
    
    try {
        // ÉTAPE 1 : Charger la configuration des zones
        console.log('1️⃣ Chargement configuration zones...');
        await loadZonesConfig();
        console.log('✓ Config zones chargée:', ZONES_CONFIG);
        
        // ÉTAPE 1b : Charger le token CSRF
        console.log('1️⃣b Chargement token CSRF...');
        await loadCsrfToken();

        // ÉTAPE 2 : Générer l'interface
        console.log('2️⃣ Génération interface...');
        generateTabs();
        generateContentSections();
        console.log('✓ Interface générée');
        
        // ÉTAPE 3 : Initialiser les filtres
        console.log('3️⃣ Initialisation filtres...');
        CURRENT_FILTER = {};
        ZONES_CONFIG.forEach(zone => {
            CURRENT_FILTER[zone.name] = 'all';
        });
        console.log('✓ Filtres initialisés:', CURRENT_FILTER);
        
        // ÉTAPE 4 : Event listeners
        console.log('4️⃣ Event listeners...');
        
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
        
        console.log('✓ Event listeners installés');
        
        // ÉTAPE 5 : Charger les données
        console.log('5️⃣ Chargement données...');
        loadData();
        
        // ÉTAPE 6 : Vérifier serveur
        console.log('6️⃣ Vérification serveur...');
        checkServerStatus();
        
        // ÉTAPE 7 : Appliquer mode dark sauvegardé
        console.log('7️⃣ Application préférences dark mode...');
        const savedMode = localStorage.getItem('darkMode');
        if (savedMode) {
            console.log('Mode sauvegardé trouvé:', savedMode);
            applyDarkMode(savedMode);
        } else {
            applyDarkMode(DARK_MODE_SETTING);
        }
        updateThemeIcon(); // Mettre à jour l'icône du toggle

        // ÉTAPE 7b : Charger statut import
        console.log('7️⃣b Chargement statut import...');
        updateImportStatus();

        // ÉTAPE 8 : Appliquer mode guest si nécessaire
        if (IS_GUEST) {
            console.log('7️⃣ Application mode guest...');
            applyGuestDefaults();
        }

        // ÉTAPE 9 : Rafraîchissement automatique
        console.log('8️⃣ Démarrage rafraîchissement auto...');
        setInterval(() => {
            console.log('⟳ Rafraîchissement automatique...');
            loadData();
            checkServerStatus();
            updateImportStatus();
        }, 120000);

        // ÉTAPE 10 : Vérification expiration session (si authentifié)
        if (IS_AUTHENTICATED || IS_GUEST) {
            console.log('9️⃣ Démarrage vérification expiration session...');
            setInterval(checkSessionExpiration, 5 * 60 * 1000); // Toutes les 5 minutes
        }

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

// ============ BACKUP =============================================

function createBackup() {
    if (!isEditAllowed()) return;
    
    if (!confirm('Créer un backup de la base de données maintenant ?')) return;
    
    const btn = event.target;
    const originalText = btn.innerHTML;
    
    // LOADING STATE
    btn.disabled = true;
    btn.innerHTML = '⏳ Création...';
    btn.classList.add('btn-loading');
 
    fetch(`${API_URL}/backup`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': CSRF_TOKEN
        }
    })
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        return res.json();
    })
    .then(data => {
        alert(`✓ Backup créé avec succès !\n\nFichier : ${data.filename}\nTaille : ${(data.size / 1024).toFixed(2)} KB`);
    })
    .catch(err => {
        alert('Erreur lors du backup : ' + err.message);
        console.error('Erreur backup:', err);
    })
    .finally(() => {
        // RESET STATE
        btn.disabled = false;
        btn.innerHTML = originalText;
        btn.classList.remove('btn-loading');
    });
}

// ============ SERVEUR ============

function checkServerStatus() {
    fetch(`${API_URL}/health`, {
        credentials: 'include'
    }) 
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
    fetch(`${API_URL}/lockers`, {
        credentials: 'include'
    }) 
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
    
    // Appliquer le filtre selon la valeur du select
    const filter = CURRENT_FILTER[zone] || 'all';
    if (filter === 'occupied') {
        lockers = lockers.filter(l => l.occupied);
    } else if (filter === 'empty') {
        lockers = lockers.filter(l => !l.occupied);
    } else if (filter === 'recoverable') {
        lockers = lockers.filter(l => l.occupied && (l.recoverable == 1 || l.recoverable === true));
    } else if (filter === 'duplicates') {
        const duplicateInfo = detectDuplicates();
        lockers = lockers.filter(l => duplicateInfo.duplicates.has(l.number));
    }
    // Appliquer le tri selon la valeur du select
    const sortSelect = document.querySelector(`select[onchange="sortTable('${zone}', this.value)"]`);
    const sortValue = sortSelect ? sortSelect.value : 'number';
    if (sortValue === 'name') {
        lockers.sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else {
        // Tri par numéro (par défaut)
        lockers.sort((a, b) => {
            return a.number.localeCompare(b.number);
        });
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

    // Détecter les doublons
    const duplicateInfo = detectDuplicates();
    const duplicateNumbers = duplicateInfo.duplicates;
    // Détecter les homonymes
    const homonymInfo = detectHomonyms();
    const homonymNumbers = homonymInfo.homonyms;
    
    // Fonction pour obtenir les infos de doublon
    const getDuplicateInfo = (locker) => {
        if (!duplicateNumbers.has(locker.number)) return null;
        
        const ipp = locker.code?.trim();
        const identity = `${locker.name}|${locker.firstName}|${locker.birthDate}`.toUpperCase();
        
        let reasons = [];
        if (ipp && duplicateInfo.byIPP[ipp] && duplicateInfo.byIPP[ipp].length > 1) {
            const others = duplicateInfo.byIPP[ipp].filter(n => n !== locker.number);
            reasons.push(`IPP identique (casier${others.length > 1 ? 's' : ''}: ${others.join(', ')})`);
        }
        if (duplicateInfo.byIdentity[identity] && duplicateInfo.byIdentity[identity].length > 1) {
            const others = duplicateInfo.byIdentity[identity].filter(n => n !== locker.number);
            reasons.push(`Identité identique (casier${others.length > 1 ? 's' : ''}: ${others.join(', ')})`);
        }
        
        return reasons.join(' + ');
    };
    
    // MODE GUEST - Sans commentaire, status, actions
    if (IS_GUEST) {
        tbody.innerHTML = lockers.map(locker => {
            const isDuplicate = duplicateNumbers.has(locker.number);
            const duplicateClass = isDuplicate ? 'duplicate-row' : '';
            const duplicateTitle = isDuplicate ? getDuplicateInfo(locker) : '';
            
            return `
            <tr class="${duplicateClass}" title="${duplicateTitle}">
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? `<span class="${homonymNumbers.has(locker.number) ? 'homonym-name' : ''}">${anonymizeName(locker.name)}</span>` : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? `<span class="${homonymNumbers.has(locker.number) ? 'homonym-name' : ''}">${anonymizeFirstName(locker.firstName)}</span>` : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? formatDate(locker.birthDate) : '<span class="cell-empty">—</span>'}</td>
            </tr>
        `}).join('');

    // MODE ADMIN
    } else {
        tbody.innerHTML = lockers.map(locker => {
            const isDuplicate = duplicateNumbers.has(locker.number);
            const duplicateClass = isDuplicate ? 'duplicate-row' : '';
            const duplicateTitle = isDuplicate ? getDuplicateInfo(locker) : '';
            
            return `
            <tr class="${duplicateClass}" title="${duplicateTitle}">
                <td><strong>${locker.number}</strong>${isDuplicate ? ' ⚠️' : ''}</td>
                <td>${locker.occupied ? `<span class="${homonymNumbers.has(locker.number) ? 'homonym-name' : ''}">${anonymizeName(locker.name)}</span>` : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? `<span class="${homonymNumbers.has(locker.number) ? 'homonym-name' : ''}">${anonymizeFirstName(locker.firstName)}</span>` : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? formatDate(locker.birthDate) : '<span class="cell-empty">—</span>'}</td>
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
        `}).join('');
    }
}

// filterTable() avec gestion du filtre "duplicates"
function filterTable(zone, value) {
    CURRENT_FILTER[zone] = value;
    
    // Si filtre "duplicates", on doit détecter d'abord
    if (value === 'duplicates') {
        const duplicateInfo = detectDuplicates();
        // Filtrer sera géré dans renderTable
    }
    renderTable(zone);
}

// Tri de la table
function sortTable(zone, value) {
    const tbody = document.getElementById(`tbody-${zone}`);
    const rows = Array.from(tbody.querySelectorAll('tr'));

    rows.sort((a, b) => {
        const idx = value === 'name' ? 1 : 0;
        const aText = a.cells[idx].textContent;
        const bText = b.cells[idx].textContent;

        // Remplace '—' par un caractère après 'z' (par exemple '{')
        const aVal = aText.replace(/—/g, '{');
        const bVal = bText.replace(/—/g, '{');

        // Compare les chaînes caractère par caractère
        for (let i = 0; i < Math.min(aVal.length, bVal.length); i++) {
            const aCharCode = aVal.charCodeAt(i);
            const bCharCode = bVal.charCodeAt(i);
            if (aCharCode !== bCharCode) {
                return aCharCode - bCharCode;
            }
        }
        // Si toutes les lettres sont égales, compare la longueur
        return aVal.length - bVal.length;
    });

    // Réattache les lignes triées
    rows.forEach(row => tbody.appendChild(row));

    // Rétablit l'affichage avec '—'
    rows.forEach(row => {
        const idx = value === 'name' ? 1 : 0;
        row.cells[idx].textContent = row.cells[idx].textContent.replace(/\{/g, '—');
    });
}

// Fonction de détection des doublons
function detectDuplicates() {
    const duplicates = new Set();
    const seen = {
        byIPP: {},           // { IPP: [numbers...] }
        byIdentity: {}       // { "NOM|PRENOM|DDN": [numbers...] }
    };
    
    // Parcourir tous les casiers occupés
    DATA.filter(l => l.occupied).forEach(locker => {
        const ipp = locker.code?.trim();
        const identity = `${locker.name}|${locker.firstName}|${locker.birthDate}`.toUpperCase();
        
        // Détection par IPP
        if (ipp) {
            if (!seen.byIPP[ipp]) {
                seen.byIPP[ipp] = [];
            }
            seen.byIPP[ipp].push(locker.number);
            
            if (seen.byIPP[ipp].length > 1) {
                // Marquer tous les casiers avec cet IPP comme doublons
                seen.byIPP[ipp].forEach(num => duplicates.add(num));
            }
        }
        
        // Détection par identité (nom + prénom + DDN)
        if (locker.name && locker.firstName && locker.birthDate) {
            if (!seen.byIdentity[identity]) {
                seen.byIdentity[identity] = [];
            }
            seen.byIdentity[identity].push(locker.number);
            
            if (seen.byIdentity[identity].length > 1) {
                // Marquer tous les casiers avec cette identité comme doublons
                seen.byIdentity[identity].forEach(num => duplicates.add(num));
            }
        }
    });
    
    console.log('🔍 Doublons détectés:', duplicates.size);
    console.log('  Par IPP:', Object.entries(seen.byIPP).filter(([k,v]) => v.length > 1));
    console.log('  Par identité:', Object.entries(seen.byIdentity).filter(([k,v]) => v.length > 1));
    
    return {
        duplicates: duplicates,
        byIPP: seen.byIPP,
        byIdentity: seen.byIdentity
    };
}

// Fonction de détection des homonymes
function detectHomonyms() {
    const homonyms = new Set();
    const seen = {
        byFullName: {},      // { "NOM|PRENOM": [numbers...] }
        byLastName: {}       // { "NOM": [numbers...] }
    };
    
    // Parcourir tous les casiers occupés
    DATA.filter(l => l.occupied).forEach(locker => {
        const fullName = `${locker.name}|${locker.firstName}`.toUpperCase();
        const lastName = locker.name.toUpperCase();
        
        // Détection par nom + prénom (mais avec IPP et DDN différents)
        if (locker.name && locker.firstName) {
            if (!seen.byFullName[fullName]) {
                seen.byFullName[fullName] = [];
            }
            seen.byFullName[fullName].push({
                number: locker.number,
                ipp: locker.code,
                birthDate: locker.birthDate
            });
        }
        
        // Détection par nom seul
        if (locker.name) {
            if (!seen.byLastName[lastName]) {
                seen.byLastName[lastName] = [];
            }
            seen.byLastName[lastName].push({
                number: locker.number,
                firstName: locker.firstName,
                ipp: locker.code,
                birthDate: locker.birthDate
            });
        }
    });
    
    // Identifier les homonymes par nom+prénom (avec IPP/DDN différents)
    Object.entries(seen.byFullName).forEach(([fullName, lockers]) => {
        if (lockers.length > 1) {
            // Vérifier que ce sont bien des personnes différentes
            const uniquePersons = new Set();
            lockers.forEach(l => {
                uniquePersons.add(`${l.ipp}|${l.birthDate}`);
            });
            
            // Si au moins 2 personnes différentes avec même nom+prénom
            if (uniquePersons.size > 1) {
                lockers.forEach(l => homonyms.add(l.number));
            }
        }
    });
    
    // Identifier les homonymes par nom seul (au moins 2 prénoms différents)
    Object.entries(seen.byLastName).forEach(([lastName, lockers]) => {
        if (lockers.length > 1) {
            const uniqueFirstNames = new Set();
            lockers.forEach(l => {
                if (l.firstName) uniqueFirstNames.add(l.firstName.toUpperCase());
            });
            
            // Si au moins 2 prénoms différents avec même nom
            if (uniqueFirstNames.size > 1) {
                lockers.forEach(l => homonyms.add(l.number));
            }
        }
    });
    
    console.log('👥 Homonymes détectés:', homonyms.size);
    console.log('  Par nom+prénom:', Object.entries(seen.byFullName).filter(([k,v]) => {
        if (v.length <= 1) return false;
        const uniquePersons = new Set(v.map(l => `${l.ipp}|${l.birthDate}`));
        return uniquePersons.size > 1;
    }).length);
    console.log('  Par nom seul:', Object.entries(seen.byLastName).filter(([k,v]) => {
        if (v.length <= 1) return false;
        const uniqueFirstNames = new Set(v.map(l => l.firstName?.toUpperCase()));
        return uniqueFirstNames.size > 1;
    }).length);
    
    return {
        homonyms: homonyms,
        byFullName: seen.byFullName,
        byLastName: seen.byLastName
    };
}

//========================================
function searchLockers(query) {
    if (!query || query.trim() === '') {
        renderAllTables();
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    
    // Recherche globale
    const results = DATA.filter(l => {
        const searchText = (l.name + ' ' + l.firstName + ' ' + l.code).toLowerCase();
        return searchText.includes(searchTerm);
    });
    
    const duplicateInfo = detectDuplicates();
    const homonymInfo = detectHomonyms();
    const homonymNumbers = homonymInfo.homonyms;

    console.log(`🔍 Recherche "${query}" : ${results.length} résultat(s)`);
    
    if (results.length === 0) {
        ZONES_CONFIG.forEach(zone => {
            const tbody = document.getElementById(`tbody-${zone.name}`);
            if (tbody) {
                const colspan = IS_GUEST ? '5' : '8';
                tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; padding: 30px; color: var(--text-tertiary);">Aucun résultat pour "${query}"</td></tr>`;
            }
        });
        return;
    }
    
    // Basculer sur la zone du premier résultat
    const firstZone = results[0].zone;
    switchTab(firstZone);
    
    // Vider les autres zones
    ZONES_CONFIG.forEach(zone => {
        if (zone.name !== firstZone) {
            const tbody = document.getElementById(`tbody-${zone.name}`);
            if (tbody) tbody.innerHTML = '';
        }
    });
    
    // Fonction highlight
    const highlight = (text, search) => {
        if (!text || !search) return text;
        const regex = new RegExp(`(${search})`, 'gi');
        return text.replace(regex, '<mark style="background: #fef3c7; padding: 2px 4px; border-radius: 3px; font-weight: 600;">$1</mark>');
    };
    
    const getStatus = (locker) => {
        if (!locker.occupied) return '<span class="status-empty" title="Libre"></span>';
        else if (locker.recoverable == 1 || locker.recoverable === true) return '<span class="status-recoverable" title="Récupérable"></span>';
        else return '<span class="status-occupied" title="Occupé"></span>';
    };
    
    // Afficher TOUS les résultats dans la zone du premier résultat
    const tbody = document.getElementById(`tbody-${firstZone}`);
    
    if (IS_GUEST) {
        tbody.innerHTML = results.map(locker => `
            <tr>
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? highlight(anonymizeName(locker.name), searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? highlight(anonymizeFirstName(locker.firstName), searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? highlight(locker.code, searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = results.map(locker => `
            <tr>
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? highlight(anonymizeName(locker.name), searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? highlight(anonymizeFirstName(locker.firstName), searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? highlight(locker.code, searchTerm) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? formatDate(locker.birthDate) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile" style="text-align: center;">${getStatus(locker)}</td>
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
    EDITING_LOCKER_VERSION = null; 
    
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
    EDITING_LOCKER_VERSION = locker.version || 0;
    
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
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ Enregistrement...';
    submitBtn.classList.add('btn-loading');

    try {
        const newLockerNumber = document.getElementById('lockerNumber').value;
        const zone = document.getElementById('zone').value;
        const recoverable = document.getElementById('recoverable').checked;
        const comment = document.getElementById('comment').value;
        
        // Détecter si le numéro de casier a changé
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
                    // Sauvegarder le nouveau casier SANS vérification de version
                    const oldVersion = EDITING_LOCKER_VERSION;
                    EDITING_LOCKER_VERSION = null;  // Désactiver la vérification
                    
                    await saveLocker(newLockerNumber, zone, recoverable, comment);
                    
                    // Restaurer la version pour la libération
                    EDITING_LOCKER_VERSION = oldVersion;
                    
                    // Puis libérer l'ancien casier
                    await releaseLockerSilent(oldNumber);
                    
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
                        // Sauvegarder SANS vérification de version
                        EDITING_LOCKER_VERSION = null;
                        await saveLocker(newLockerNumber, zone, recoverable, comment);
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
            // Pas de changement de numéro, comportement normal avec vérification de version
            try {
                await saveLocker(newLockerNumber, zone, recoverable, comment);
                closeModal();
                loadData();
                
                // Vérifier si l'IPP était valide
                const result = await fetch(`${API_URL}/lockers/${newLockerNumber}`, {
                    credentials: 'include'
                });
                const data = await result.json();
                
                if (data.ippValid === false) {
                    showStatus('⚠️ Casier enregistré mais N°IPP non trouvé dans la base clients (marqué récupérable)', 'error');
                } else {
                    showStatus('✓ Casier enregistré', 'success');
                }
            } catch (err) {
                // GÉRER SPÉCIFIQUEMENT LES CONFLITS
                if (err.message.includes('conflit') || err.message.includes('version')) {
                    const reload = confirm(
                        '⚠️ CONFLIT DÉTECTÉ\n\n' +
                        'Ce casier a été modifié par un autre utilisateur pendant que vous le modifiiez.\n\n' +
                        'Voulez-vous recharger les données actuelles et réessayer ?'
                    );
                    
                    if (reload) {
                        closeModal();
                        await loadData();
                        // Rouvrir le modal avec les nouvelles données
                        setTimeout(() => openModalEdit(newLockerNumber), 500);
                    }
                } else {
                    showStatus('Erreur: ' + err.message, 'error');
                }
            }
        }
    } catch (err) {
        showStatus('Erreur: ' + err.message, 'error');
    } finally {
        // RESET STATE (même en cas d'erreur)
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        submitBtn.classList.remove('btn-loading');
    }
}

function releaseLocker(lockerNumber) {
    if (!isEditAllowed()) return;
    
    if (!confirm('Libérer ce casier ?')) return;
    
    const res = fetch(`${API_URL}/lockers/${lockerNumber}`, { 
        method: 'DELETE',
        credentials: 'include',
        headers: {
            'X-CSRF-Token': CSRF_TOKEN
        }
    })
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        loadData();
        showStatus('Casier libéré', 'success');
    })
    .catch(err => {
        showStatus('Erreur: ' + err.message, 'error');
    });
}

// Enregistrer un casier (extraction du code existant)
async function saveLocker(lockerNumber, zone, recoverable, comment) {

    const bodyData = {
        number: lockerNumber,
        zone: zone,
        name: document.getElementById('lastName').value,
        firstName: document.getElementById('firstName').value,
        code: document.getElementById('code').value,
        birthDate: document.getElementById('birthDate').value,
        comment: comment,
        recoverable: recoverable
    };

    // Ajouter expectedVersion seulement si défini (pas null)
    if (EDITING_LOCKER_VERSION !== null) {
        bodyData.expectedVersion = EDITING_LOCKER_VERSION;
    }

    const response = await fetch(`${API_URL}/lockers`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': CSRF_TOKEN
        },
        credentials: 'include',
        body: JSON.stringify(bodyData)
    });    

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur ' + response.status);
    }
    return response.json();
}

// Libérer un casier sans message
async function releaseLockerSilent(lockerNumber) {
    const response = await fetch(`${API_URL}/lockers/${lockerNumber}`, { 
        method: 'DELETE',
        credentials: 'include',
        headers: {
            'X-CSRF-Token': CSRF_TOKEN
        }
    });
    
    if (!response.ok) {
        handleCsrfError(response);
        throw new Error('Erreur libération casier ' + lockerNumber + ":\n" + response.status);
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
                application: 'HADO - Casiers zone départ',
                version: '1.0'
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
        await fetch(`${API_URL}/exports/log`, {
            method: 'POST',
            credentials: 'include',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
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
        
        // Trouver le bouton d'import casiers
        const importBtn = Array.from(document.querySelectorAll('.admin-tools-content button'))
            .find(btn => btn.textContent.includes('Import casiers'));
        const originalText = importBtn ? importBtn.innerHTML : '';
        
        // LOADING STATE
        if (importBtn) {
            importBtn.disabled = true;
            importBtn.innerHTML = '⏳ Import...';
            importBtn.classList.add('btn-loading');
        }
      
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
            
            const res = await fetch(`${API_URL}/import`, {
                method: 'POST',
                credentials: 'include',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': CSRF_TOKEN
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
        } finally {
            // RESET STATE
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.innerHTML = originalText;
                importBtn.classList.remove('btn-loading');
            }
        }
    };
    
    input.click();
}

function importJSON() {
    if (!isEditAllowed()) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Trouver le bouton d'import JSON
        const importBtn = Array.from(document.querySelectorAll('.admin-tools-content button'))
            .find(btn => btn.textContent.includes('Import JSON'));
        const originalText = importBtn ? importBtn.innerHTML : '';
        
        // LOADING STATE
        if (importBtn) {
            importBtn.disabled = true;
            importBtn.innerHTML = '⏳ Import...';
            importBtn.classList.add('btn-loading');
        }
      
        try {
            console.log('📂 Lecture du fichier JSON...');
            const text = await file.text();
            const jsonData = JSON.parse(text);
            
            // Vérifier la structure
            if (!jsonData.lockers && !Array.isArray(jsonData)) {
                alert('❌ Format JSON invalide.\n\nLe fichier doit contenir un champ "lockers" (export moderne) ou être un tableau (export ancien).');
                return;
            }
            
            // Supporter les deux formats
            const data = jsonData.lockers || jsonData;
            const metadata = jsonData.metadata;
            
            console.log(`📦 ${data.length} casiers trouvés dans le fichier`);
            
            if (metadata) {
                const exportDate = new Date(metadata.exportDate).toLocaleString('fr-FR');
                const confirmMsg = `📥 IMPORT JSON\n\n` +
                    `Fichier : ${file.name}\n` +
                    `Casiers : ${data.length}\n` +
                    `Exporté le : ${exportDate}\n` +
                    `Par : ${metadata.exportBy || 'Inconnu'}\n\n` +
                    `⚠️ ATTENTION :\n` +
                    `- Les casiers déjà occupés seront IGNORÉS\n` +
                    `- Les casiers vides seront remplis\n\n` +
                    `Voulez-vous continuer ?`;
                
                if (!confirm(confirmMsg)) return;
            } else {
                if (!confirm(`Importer ${data.length} casiers ?\n\n⚠️ Les casiers déjà occupés seront ignorés.`)) {
                    return;
                }
            }
            
            const res = await fetch(`${API_URL}/import-json`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': CSRF_TOKEN
                },
                credentials: 'include',
                body: JSON.stringify({ 
                    data: data,
                    metadata: metadata
                })
            });
            
            if (res.ok) {
                const result = await res.json();
                
                let message = `✅ Import JSON terminé !\n\n`;
                message += `✓ Importés : ${result.imported}\n`;
                if (result.skipped > 0) {
                    message += `⏭️ Ignorés (déjà occupés) : ${result.skipped}\n`;
                }
                if (result.invalidIPP > 0) {
                    message += `⚠️ IPP invalides : ${result.invalidIPP} (marqués récupérables)\n`;
                }
                if (result.errors > 0) {
                    message += `✗ Erreurs : ${result.errors}\n`;
                }
                if (result.validationErrors > 0) {
                    message += `⚠️ Validation échouée : ${result.validationErrors}\n`;
                }
                message += `\nTotal traité : ${result.total}`;
                
                alert(message);
                loadData();
                
            } else if (res.status === 401) {
                alert('Session expirée. Veuillez vous reconnecter.');
                logout();
            } else {
                const error = await res.json();
                throw new Error(error.error || 'Erreur serveur');
            }
            
        } catch (err) {
            if (err instanceof SyntaxError) {
                alert('❌ Erreur : Le fichier n\'est pas un JSON valide.\n\n' + err.message);
            } else {
                alert('❌ Erreur lors de l\'import : ' + err.message);
            }
            console.error('Erreur import JSON:', err);
        } finally {
            // RESET STATE
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.innerHTML = originalText;
                importBtn.classList.remove('btn-loading');
            }
        }
    };
    
    input.click();
}

// ============ IMPORT CLIENTS ============

// Variables globales pour l'import
let selectedImportFormat = null;
let selectedImportMode = 'replace';

async function importClients() {
    if (!isEditAllowed()) return;
    
    try {
        // Charger les formats disponibles
        const configResponse = await fetch(`${API_URL}/config/import-format`, {
            credentials: 'include'
        });
        const config = await configResponse.json();
        
        // Remplir le select des formats
        const formatSelect = document.getElementById('importFormat');
        formatSelect.innerHTML = '';
        
        // Format par défaut en premier
        const defaultFormat = config.clientImportFormat || 'LEGACY';
        const formats = config.availableFormats || ['LEGACY'];
        
        // Ajouter le format par défaut en premier
        const defaultOption = document.createElement('option');
        defaultOption.value = defaultFormat;
        defaultOption.textContent = `${defaultFormat} (par défaut)`;
        defaultOption.selected = true;
        formatSelect.appendChild(defaultOption);
        
        // Ajouter les autres formats
        formats.filter(f => f !== defaultFormat).forEach(format => {
            const option = document.createElement('option');
            option.value = format;
            option.textContent = format;
            formatSelect.appendChild(option);
        });
        
        // Réinitialiser les sélections
        selectedImportFormat = defaultFormat;
        selectedImportMode = 'replace';
        document.getElementById('importMode').value = 'replace';
        
        // Gérer l'affichage du warning
        const modeSelect = document.getElementById('importMode');
        const warning = document.getElementById('importWarning');
        
        modeSelect.onchange = function() {
            selectedImportMode = this.value;
            if (this.value === 'replace') {
                warning.style.display = 'block';
            } else {
                warning.style.display = 'none';
            }
        };
        
        formatSelect.onchange = function() {
            selectedImportFormat = this.value;
        };
        
        // Afficher le warning initial
        warning.style.display = 'block';
        
        // Ouvrir le modal
        document.getElementById('importOptionsModal').classList.add('active');
        
    } catch (err) {
        console.error('Erreur chargement formats:', err);
        alert('Erreur lors du chargement des formats d\'import');
    }
}

function closeImportOptions() {
    document.getElementById('importOptionsModal').classList.remove('active');
}

function selectFileForImport() {
    // Fermer le modal d'options
    closeImportOptions();
    
    // Ouvrir le sélecteur de fichier
    const fileInput = document.getElementById('clientFileInput');
    fileInput.value = ''; // Reset
    fileInput.onchange = handleClientFileSelected;
    fileInput.click();
}

async function handleClientFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Trouver le bouton d'import
    const importBtn = document.querySelector('button[onclick="importClients()"]');
    const originalText = importBtn ? importBtn.innerHTML : '';
    
    // LOADING STATE
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = '⏳ Import...';
        importBtn.classList.add('btn-loading');
    }
    
    try {
        console.log('📂 Lecture du fichier patients...');
        console.log('Format sélectionné:', selectedImportFormat);
        console.log('Mode sélectionné:', selectedImportMode);
        
        const text = await file.text();
        
        const res = await fetch(`${API_URL}/clients/import`, {
            method: 'POST',
            credentials: 'include',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            body: JSON.stringify({ 
                rawContent: text,
                format: selectedImportFormat,
                mode: selectedImportMode  // NOUVEAU
            })
        });
        
        if (res.ok) {
            const result = await res.json();
            let message = `Import patients terminé !\n\n`;
            message += `✓ Importés : ${result.imported}\n`;
            if (result.skipped > 0) {
                message += `⏭️ Ignorés (doublons) : ${result.skipped}\n`;
            }
            if (result.filtered > 0) {
                message += `🔍 Filtrés : ${result.filtered}\n`;
            }
            if (result.errors > 0) {
                message += `✗ Erreurs : ${result.errors}\n`;
            }
            if (result.validationErrors > 0) {
                message += `⚠️ Validation échouée : ${result.validationErrors}\n`;
            }
            message += `Total : ${result.total}`;
            
            if (selectedImportMode === 'merge') {
                message += `\n\nMode fusionnement : ${result.totalInDb} patients en base`;
            }
            
            alert(message);
            
            // Rafraîchir le statut d'import
            updateImportStatus();
        } else if (res.status === 401) {
            alert('Session expirée. Veuillez vous reconnecter.');
            logout();
        } else {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Erreur serveur');
        }
    } catch (err) {
        alert('Erreur lors de l\'import patients : ' + err.message);
        console.error('Erreur import patients:', err);
    } finally {
        // RESET STATE
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = originalText;
            importBtn.classList.remove('btn-loading');
        }
    }
}

// ============ RECHERCHE CLIENT ============
async function searchClient() {
    const ipp = document.getElementById('code').value.trim();
    
    if (!ipp) {
        alert('Veuillez saisir un N°IPP');
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/clients/${ipp}`, {
            credentials: 'include'
        });
        
        if (res.ok) {
            const client = await res.json();
            
            document.getElementById('lastName').value = client.name || client.NOM || '';
            document.getElementById('firstName').value = client.firstName || client.PRENOM || '';
            document.getElementById('birthDate').value = client.birthDate || client.DATE_DE_NAISSANCE || '';
            
            showStatus('✓ Client trouvé et champs remplis', 'success');
        } else if (res.status === 404) {
            showStatus('⚠️ N°IPP non trouvé dans la base patients', 'error');
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
// Créer la version debounced de searchLockers
const debouncedSearch = debounce((query) => {
    if (query.trim()) {
        searchLockers(query);
    } else {
        renderAllTables();
    }
}, 400); // Attendre 400ms après la dernière frappe (range 250-500ms conseillé)


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

function showDuplicatesPanel() {
    const duplicateInfo = detectDuplicates();
    
    if (duplicateInfo.duplicates.size === 0) {
        alert('✓ Aucun doublon détecté');
        return;
    }
    
    let message = `⚠️ ${duplicateInfo.duplicates.size} doublons détectés\n\n`;
    
    // Doublons par IPP
    const ippDupes = Object.entries(duplicateInfo.byIPP).filter(([k,v]) => v.length > 1);
    if (ippDupes.length > 0) {
        message += `Par IPP identique (${ippDupes.length}):\n`;
        ippDupes.forEach(([ipp, numbers]) => {
            message += `  • IPP ${ipp}: casiers ${numbers.join(', ')}\n`;
        });
    }
    
    // Doublons par identité
    const identityDupes = Object.entries(duplicateInfo.byIdentity).filter(([k,v]) => v.length > 1);
    if (identityDupes.length > 0) {
        message += `\nPar identité (${identityDupes.length}):\n`;
        identityDupes.forEach(([identity, numbers]) => {
            const [name, firstName, birthDate] = identity.split('|');
            message += `  • ${name} ${firstName} (${birthDate}): casiers ${numbers.join(', ')}\n`;
        });
    }
    
    alert(message);
}

function showHomonymsPanel() {
    const homonymInfo = detectHomonyms();
    
    if (homonymInfo.homonyms.size === 0) {
        alert('✓ Aucun homonyme détecté');
        return;
    }
    
    let message = `👥 ${homonymInfo.homonyms.size} homonymes détectés\n\n`;
    
    // Homonymes par nom+prénom
    const fullNameHomonyms = Object.entries(homonymInfo.byFullName).filter(([k,v]) => {
        if (v.length <= 1) return false;
        const uniquePersons = new Set(v.map(l => `${l.ipp}|${l.birthDate}`));
        return uniquePersons.size > 1;
    });
    
    if (fullNameHomonyms.length > 0) {
        message += `Même nom + prénom (${fullNameHomonyms.length}):\n`;
        fullNameHomonyms.forEach(([fullName, lockers]) => {
            const [name, firstName] = fullName.split('|');
            message += `  • ${name} ${firstName}:\n`;
            lockers.forEach(l => {
                message += `    - Casier ${l.number} (IPP: ${l.ipp}, DDN: ${l.birthDate || 'N/A'})\n`;
            });
        });
    }
    
    // Homonymes par nom seul
    const lastNameHomonyms = Object.entries(homonymInfo.byLastName).filter(([k,v]) => {
        if (v.length <= 1) return false;
        const uniqueFirstNames = new Set(v.map(l => l.firstName?.toUpperCase()));
        return uniqueFirstNames.size > 1;
    });
    
    if (lastNameHomonyms.length > 0) {
        message += `\nMême nom (${lastNameHomonyms.length}):\n`;
        lastNameHomonyms.slice(0, 5).forEach(([lastName, lockers]) => {
            message += `  • ${lastName}: ${lockers.length} casiers\n`;
            lockers.forEach(l => {
                message += `    - ${l.firstName || 'N/A'} (${l.number})\n`;
            });
        });
        if (lastNameHomonyms.length > 5) {
            message += `  ... et ${lastNameHomonyms.length - 5} autres noms\n`;
        }
    }
    
    alert(message);
}

// ============ STATS PATIENTS ============

async function showClientsStats() {
    const panel = document.getElementById('clientsStatsPanel');
    const content = document.getElementById('clientsStatsContent');
    
    // Afficher le panel avec un loader
    panel.classList.add('active');
    content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Chargement des statistiques...</p>';
    
    try {
        const res = await fetch(`${API_URL}/clients/stats`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            throw new Error('Erreur ' + res.status);
        }
        
        const data = await res.json();
        renderClientsStats(data);
        
    } catch (err) {
        console.error('Erreur chargement stats patients:', err);
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 60px;">
                <div class="spinner"></div>
                <p style="margin-top: 20px; font-weight: 600; color: var(--text-primary);">Chargement des statistiques...</p>
            </div>
        `;
    }
}

function renderClientsStats(data) {
    const content = document.getElementById('clientsStatsContent');
    
    // Formater la date du dernier import
    let lastImportInfo = 'Aucun import';
    if (data.lastImport) {
        const importDate = new Date(data.lastImport.importDate);
        const daysSince = Math.floor((Date.now() - importDate) / (1000 * 60 * 60 * 24));
        lastImportInfo = `${importDate.toLocaleDateString('fr-FR')} (il y a ${daysSince} jour${daysSince > 1 ? 's' : ''})`;
    }
    
    // Construire le HTML
    let html = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${data.total}</div>
                <div class="stat-label">Patients total</div>
            </div>
    `;
    
    // Stats par zone
    if (data.byZone && data.byZone.length > 0) {
        data.byZone.slice(0, 3).forEach(zone => {
            html += `
                <div class="stat-card">
                    <div class="stat-value">${zone.count}</div>
                    <div class="stat-label">${zone.zone || 'Non défini'}</div>
                </div>
            `;
        });
    }
    
    // Stats par sexe
    if (data.bySex && data.bySex.length > 0) {
        data.bySex.forEach(sex => {
            const sexLabel = sex.sex === 'M' ? 'Hommes' : sex.sex === 'F' ? 'Femmes' : 'Non défini';
            html += `
                <div class="stat-card">
                    <div class="stat-value">${sex.count}</div>
                    <div class="stat-label">${sexLabel}</div>
                </div>
            `;
        });
    }
    
    html += `</div>`;
    
    // Info dernier import
    html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 4px 0;">Dernier import</p>
                    <p style="font-size: 15px; font-weight: 600; margin: 0;">${lastImportInfo}</p>
                    ${data.lastImport ? `<p style="font-size: 12px; color: var(--text-tertiary); margin: 4px 0 0 0;">Par ${data.lastImport.userName}</p>` : ''}
                </div>
                ${data.lastImport ? `<div style="font-size: 24px; color: var(--primary-color);">📥</div>` : ''}
            </div>
        </div>
    `;
    
    // Répartition par zone (graphique textuel)
    if (data.byZone && data.byZone.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Répartition par zone</h3>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
        `;
        
        const maxCount = Math.max(...data.byZone.map(z => z.count));
        data.byZone.forEach(zone => {
            const percentage = (zone.count / data.total * 100).toFixed(1);
            const barWidth = (zone.count / maxCount * 100).toFixed(1);
            html += `
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
                        <span style="font-weight: 600;">${zone.zone || 'Non défini'}</span>
                        <span style="color: var(--text-secondary);">${zone.count} (${percentage}%)</span>
                    </div>
                    <div style="background: var(--border-light); border-radius: 4px; height: 8px; overflow: hidden;">
                        <div style="background: var(--primary-color); height: 100%; width: ${barWidth}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Aperçu des 10 premiers patients
    if (data.preview && data.preview.length > 0) {
        html += `
            <div class="clients-preview-section">
                <h3>Aperçu des données (10 premiers patients)</h3>
                <div style="overflow-x: auto;">
                    <table class="clients-preview-table">
                        <thead>
                            <tr>
                                <th>IPP</th>
                                <th>Nom</th>
                                <th>Prénom</th>
                                <th>DDN</th>
                                <th>Sexe</th>
                                <th>Zone</th>
                                <th>Entrée</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        data.preview.forEach(client => {
            html += `
                <tr>
                    <td><strong>${client.ipp}</strong></td>
                    <td>${client.name || '—'}</td>
                    <td>${client.firstName || '—'}</td>
                    <td>${client.birthDate ? formatDate(client.birthDate) : '—'}</td>
                    <td>${client.sex || '—'}</td>
                    <td>${client.zone || '—'}</td>
                    <td>${client.entryDate ? formatDate(client.entryDate) : '—'}</td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        html += `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <p style="font-size: 18px; margin-bottom: 10px;">📭</p>
                <p>Aucun client dans la base de données</p>
                <button class="btn-primary" onclick="closeClientsStats(); importClients();" style="margin-top: 20px;">
                    Importer des patients
                </button>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

function closeClientsStats() {
    document.getElementById('clientsStatsPanel').classList.remove('active');
}

// ============ RESTORE BACKUP ============

let selectedBackupFile = null;
let uploadedBackupData = null;

async function showRestorePanel() {
    if (!isEditAllowed()) return;
    
    const panel = document.getElementById('restorePanel');
    const content = document.getElementById('restoreContent');
    
    // Afficher le panel
    panel.classList.add('active');
    content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Chargement des backups...</p>';
    
    try {
        const res = await fetch(`${API_URL}/backups`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            throw new Error('Erreur ' + res.status);
        }
        
        const data = await res.json();
        renderRestorePanel(data.backups);
        
    } catch (err) {
        console.error('Erreur chargement backups:', err);
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 60px;">
                <div class="spinner"></div>
                <p style="margin-top: 20px; font-weight: 600; color: var(--text-primary);">Chargement des backups...</p>
            </div>
        `;
    }
}

function renderRestorePanel(backups) {
    const content = document.getElementById('restoreContent');
    
    let html = '';
    
    // Zone d'upload
    html += `
        <div class="upload-zone" id="uploadZone" onclick="document.getElementById('fileInput').click()">
            <div class="icon">📁</div>
            <p><strong>Importer un fichier backup (.db)</strong></p>
            <p style="font-size: 12px;">Cliquez ou glissez-déposez un fichier ici</p>
        </div>
        <input type="file" id="fileInput" accept=".db" style="display: none;" onchange="handleFileSelect(event)">
    `;
    
    // Liste des backups disponibles
    if (backups && backups.length > 0) {
        html += `
            <div class="backup-list">
                <h3>Backups disponibles sur le serveur (${backups.length})</h3>
        `;
        
        backups.forEach((backup, index) => {
            const date = new Date(backup.date);
            const formattedDate = date.toLocaleString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const size = (backup.size / 1024).toFixed(2);
            
            html += `
                <div class="backup-item" onclick="selectBackup('${backup.filename}', this)">
                    <div class="info">
                        <div class="name">📦 ${backup.filename}</div>
                        <div class="meta">📅 ${formattedDate}</div>
                    </div>
                    <div class="size">${size} KB</div>
                </div>
            `;
        });
        
        html += `</div>`;
    } else {
        html += `
            <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                <p style="font-size: 18px; margin-bottom: 10px;">📭</p>
                <p>Aucun backup disponible sur le serveur</p>
                <p style="font-size: 12px; margin-top: 8px;">Importez un fichier backup ou créez-en un nouveau</p>
            </div>
        `;
    }
    
    // Boutons d'action
    html += `
        <div class="restore-actions">
            <button class="btn-secondary" onclick="closeRestorePanel()">Annuler</button>
            <button class="btn-primary" id="btnRestore" onclick="confirmRestore()" disabled>
                🔄 Restaurer
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    
    // Configurer drag & drop
    setupDragAndDrop();
}

function setupDragAndDrop() {
    const zone = document.getElementById('uploadZone');
    if (!zone) return;
    
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    if (!file.name.endsWith('.db')) {
        alert('❌ Format invalide : seuls les fichiers .db sont acceptés');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Vérifier le header SQLite
        const header = String.fromCharCode.apply(null, uint8Array.slice(0, 16));
        if (!header.startsWith('SQLite format 3')) {
            alert('❌ Fichier invalide : ce n\'est pas une base SQLite');
            return;
        }
        
        // Convertir en base64
        const base64 = btoa(String.fromCharCode.apply(null, uint8Array));
        
        uploadedBackupData = base64;
        selectedBackupFile = null;
        
        // Désélectionner tous les backups de la liste
        document.querySelectorAll('.backup-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Mettre à jour l'interface
        const zone = document.getElementById('uploadZone');
        zone.innerHTML = `
            <div class="icon">✅</div>
            <p><strong>${file.name}</strong></p>
            <p style="font-size: 12px;">Taille : ${(file.size / 1024).toFixed(2)} KB</p>
            <p style="font-size: 11px; margin-top: 8px; color: var(--text-tertiary);">Cliquez pour changer de fichier</p>
        `;
        zone.style.borderColor = 'var(--primary-color)';
        zone.style.background = '#e3f2fd';
        
        // Activer le bouton restore
        document.getElementById('btnRestore').disabled = false;
    };
    
    reader.readAsArrayBuffer(file);
}

function selectBackup(filename, element) {
    selectedBackupFile = filename;
    uploadedBackupData = null;
    
    // Désélectionner tous
    document.querySelectorAll('.backup-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Sélectionner celui-ci
    element.classList.add('selected');
    
    // Réinitialiser la zone d'upload
    const zone = document.getElementById('uploadZone');
    zone.innerHTML = `
        <div class="icon">📁</div>
        <p><strong>Importer un fichier backup (.db)</strong></p>
        <p style="font-size: 12px;">Cliquez ou glissez-déposez un fichier ici</p>
    `;
    zone.style.borderColor = '';
    zone.style.background = '';
    
    // Activer le bouton restore
    document.getElementById('btnRestore').disabled = false;
}

async function confirmRestore() {
    if (!selectedBackupFile && !uploadedBackupData) {
        alert('Veuillez sélectionner un backup');
        return;
    }
    
    const source = selectedBackupFile || 'fichier importé';
    
    const confirmed = confirm(
        `⚠️ CONFIRMATION REQUISE\n\n` +
        `Vous allez restaurer la base depuis :\n"${source}"\n\n` +
        `Cette action va :\n` +
        `• Créer un backup de sécurité de la base actuelle\n` +
        `• Remplacer TOUTES les données par celles du backup\n` +
        `• Redémarrer le serveur automatiquement\n\n` +
        `Cette opération est IRRÉVERSIBLE.\n\n` +
        `Voulez-vous continuer ?`
    );
    
    if (!confirmed) return;
    
    // Double confirmation
    const doubleConfirm = confirm(
        `⚠️ DERNIÈRE CONFIRMATION\n\n` +
        `Êtes-vous absolument certain de vouloir restaurer la base ?\n\n` +
        `Tapez OK pour confirmer.`
    );
    
    if (!doubleConfirm) return;
    
    // Afficher un loader
    const content = document.getElementById('restoreContent');
    content.innerHTML = `
        <div style="text-align: center; padding: 60px;">
            <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
            <p style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Restauration en cours...</p>
            <p style="color: var(--text-secondary); font-size: 14px;">Ne fermez pas cette fenêtre</p>
        </div>
    `;
    
    try {
        const res = await fetch(`${API_URL}/restore`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            body: JSON.stringify({
                filename: selectedBackupFile,
                fileData: uploadedBackupData
            })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Erreur lors de la restauration');
        }
        
        // Succès
        content.innerHTML = `
            <div style="text-align: center; padding: 60px;">
                <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
                <p style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #10b981;">Restauration réussie !</p>
                <p style="color: var(--text-secondary); margin-bottom: 8px;">Backup de sécurité créé : ${data.safetyBackup}</p>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">Le serveur va redémarrer dans quelques secondes...</p>
                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px; margin-top: 20px;">
                    <p style="font-size: 14px; color: var(--text-primary); margin: 0;">
                        ⏳ Rechargement automatique de la page...
                    </p>
                </div>
            </div>
        `;
        
        // Recharger la page après 3 secondes
        setTimeout(() => {
            window.location.reload();
        }, 3000);
        
    } catch (err) {
        console.error('Erreur restauration:', err);
        content.innerHTML = `
            <div style="text-align: center; padding: 60px;">
                <div style="font-size: 64px; margin-bottom: 20px;">❌</div>
                <p style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #ef4444;">Erreur lors de la restauration</p>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">${err.message}</p>
                <button class="btn-primary" onclick="showRestorePanel()">Réessayer</button>
            </div>
        `;
    }
}

function closeRestorePanel() {
    document.getElementById('restorePanel').classList.remove('active');
    selectedBackupFile = null;
    uploadedBackupData = null;
}

// ============ STATS CONNEXIONS ============

async function showConnectionStats() {
    const panel = document.getElementById('connectionStatsPanel');
    const content = document.getElementById('connectionStatsContent');
    
    // Afficher le panel
    panel.classList.add('active');
    content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Chargement des statistiques...</p>';
    
    try {
        const res = await fetch(`${API_URL}/stats/connections/summary`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            throw new Error('Erreur ' + res.status);
        }
        
        const data = await res.json();
        renderConnectionStats(data);
        
    } catch (err) {
        console.error('Erreur chargement stats connexions:', err);
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 60px;">
                <div class="spinner"></div>
                <p style="margin-top: 20px; font-weight: 600; color: var(--text-primary);">Chargement des statistiques...</p>
            </div>
        `;
    }
}

function renderConnectionStats(data) {
    const content = document.getElementById('connectionStatsContent');
    
    let html = '';
    
    // Cartes récapitulatives
    html += `
        <div class="stats-summary">
            <div class="summary-card total">
                <div class="value">${data.total.total}</div>
                <div class="label">Total</div>
            </div>
            <div class="summary-card admin">
                <div class="value">${data.total.admin}</div>
                <div class="label">Admin</div>
            </div>
            <div class="summary-card guest">
                <div class="value">${data.total.guest}</div>
                <div class="label">Guest</div>
            </div>
        </div>
    `;
    
    // Tableau des statistiques par période
    html += `
        <div class="stats-table-container">
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Période</th>
                        <th style="text-align: center;">Admin</th>
                        <th style="text-align: center;">Guest</th>
                        <th style="text-align: center;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="period-col">📅 Aujourd'hui</td>
                        <td class="admin-col" style="text-align: center;">${data.today.admin}</td>
                        <td class="guest-col" style="text-align: center;">${data.today.guest}</td>
                        <td class="total-col" style="text-align: center;">${data.today.total}</td>
                    </tr>
                    <tr>
                        <td class="period-col">📆 Semaine en cours</td>
                        <td class="admin-col" style="text-align: center;">${data.week.admin}</td>
                        <td class="guest-col" style="text-align: center;">${data.week.guest}</td>
                        <td class="total-col" style="text-align: center;">${data.week.total}</td>
                    </tr>
                    <tr>
                        <td class="period-col">📊 Mois en cours</td>
                        <td class="admin-col" style="text-align: center;">${data.month.admin}</td>
                        <td class="guest-col" style="text-align: center;">${data.month.guest}</td>
                        <td class="total-col" style="text-align: center;">${data.month.total}</td>
                    </tr>
                    <tr>
                        <td class="period-col">📈 Année en cours</td>
                        <td class="admin-col" style="text-align: center;">${data.year.admin}</td>
                        <td class="guest-col" style="text-align: center;">${data.year.guest}</td>
                        <td class="total-col" style="text-align: center;">${data.year.total}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    
    // Graphique des 7 derniers jours
    if (data.last7Days && data.last7Days.length > 0) {
        // Grouper par date
        const dailyData = {};
        data.last7Days.forEach(stat => {
            if (!dailyData[stat.date]) {
                dailyData[stat.date] = { admin: 0, guest: 0 };
            }
            dailyData[stat.date][stat.role] = stat.count;
        });
        
        // Générer les 7 derniers jours même si pas de données
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        
        // Trouver le max pour la largeur des barres
        let maxCount = 0;
        dates.forEach(date => {
            const admin = dailyData[date]?.admin || 0;
            const guest = dailyData[date]?.guest || 0;
            const total = admin + guest;
            if (total > maxCount) maxCount = total;
        });
        
        html += `
            <div class="chart-container">
                <h3>Connexions des 7 derniers jours</h3>
        `;
        
        dates.forEach(date => {
            const admin = dailyData[date]?.admin || 0;
            const guest = dailyData[date]?.guest || 0;
            const total = admin + guest;
            
            const dateObj = new Date(date + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString('fr-FR', { 
                weekday: 'short', 
                day: '2-digit', 
                month: '2-digit' 
            });
            
            const adminWidth = maxCount > 0 ? (admin / maxCount * 100) : 0;
            const guestWidth = maxCount > 0 ? (guest / maxCount * 100) : 0;
            
            html += `
                <div class="chart-bar">
                    <div class="date">${formattedDate}</div>
                    <div class="bars">
                        ${admin > 0 ? `<div class="bar admin" style="width: ${adminWidth}%;" title="Admin: ${admin}">${admin}</div>` : ''}
                        ${guest > 0 ? `<div class="bar guest" style="width: ${guestWidth}%;" title="Guest: ${guest}">${guest}</div>` : ''}
                        ${total === 0 ? '<div style="color: var(--text-tertiary); font-size: 12px;">Aucune connexion</div>' : ''}
                    </div>
                    <div style="width: 40px; text-align: right; font-weight: 600; color: var(--text-secondary);">${total}</div>
                </div>
            `;
        });
        
        html += `
                <div class="chart-legend">
                    <div class="chart-legend-item admin">
                        <div class="color"></div>
                        <span>Admin</span>
                    </div>
                    <div class="chart-legend-item guest">
                        <div class="color"></div>
                        <span>Guest</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        html += `
            <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                <p style="font-size: 18px; margin-bottom: 10px;">📭</p>
                <p>Aucune donnée de connexion disponible</p>
            </div>
        `;
    }
    
// AJOUTER : 15 dernières connexions
    if (data.recentConnections && data.recentConnections.length > 0) {
        html += `
            <div style="margin-top: 32px;">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">15 dernières connexions</h3>
                <div style="overflow-x: auto;">
                    <table class="clients-preview-table">
                        <thead>
                            <tr>
                                <th>Date & Heure</th>
                                <th>Rôle</th>
                                <th>Utilisateur</th>
                                <th>Adresse IP</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        data.recentConnections.forEach(conn => {
            // Si c'est une connexion agrégée (sans timestamp exact)
            if (conn.date && !conn.timestamp) {
                const dateObj = new Date(conn.date + 'T00:00:00');
                const formattedDate = dateObj.toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                
                const roleClass = conn.role === 'admin' ? 'admin-col' : 'guest-col';
                const roleIcon = conn.role === 'admin' ? '🔒' : '👁️';
                
                html += `
                    <tr>
                        <td style="white-space: nowrap;">${formattedDate}</td>
                        <td class="${roleClass}" style="text-align: center;">${roleIcon} ${conn.role}</td>
                        <td colspan="2" style="text-align: center; color: var(--text-tertiary); font-size: 12px;">${conn.count} connexion(s) ce jour</td>
                    </tr>
                `;
            } else {
                // Si c'est une connexion individuelle (avec timestamp)
                const timestamp = new Date(conn.timestamp);
                const formattedDateTime = timestamp.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                const roleClass = conn.role === 'admin' ? 'admin-col' : 'guest-col';
                const roleIcon = conn.role === 'admin' ? '🔒' : '👁️';
                
                html += `
                    <tr>
                        <td style="white-space: nowrap;">${formattedDateTime}</td>
                        <td class="${roleClass}" style="text-align: center;">${roleIcon} ${conn.role}</td>
                        <td>${conn.userName || '—'}</td>
                        <td style="font-family: monospace; font-size: 12px;">${conn.ipAddress || '—'}</td>
                    </tr>
                `;
            }
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

function closeConnectionStats() {
    document.getElementById('connectionStatsPanel').classList.remove('active');
}

// Gestionnaire global d'erreurs CSRF
/* Exemple d'utilisation dans les fetch :
fetch(url, options)
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        return res.json();
    }) */
function handleCsrfError(response) {
    if (response.status === 403) {
        response.json().then(data => {
            if (data.error && data.error.includes('CSRF')) {
                alert('⚠️ Erreur de sécurité : token CSRF invalide.\n\nLa page va se recharger.');
                window.location.reload();
            }
        }).catch(() => {});
    }
}

// Fonction pour vérifier le temps restant dans la session
async function checkSessionExpiration() {
  try {
    const res = await fetch(`${API_URL}/session/time-remaining`, {
      credentials: 'include'
    });
    
    if (res.ok) {
      const data = await res.json();
      
      // Avertir si moins de 10 minutes restantes
      if (data.expiresInMinutes < 10 && data.expiresInMinutes > 0) {
        console.warn(`⏰ Session expire dans ${data.expiresInMinutes} minutes`);
        
        // Afficher une notification (optionnel)
        if (data.expiresInMinutes === 5) {
          if (confirm('⏰ Votre session expire dans 5 minutes.\n\nVoulez-vous prolonger votre session ?')) {
            // Faire une requête pour renouveler
            loadData(); // N'importe quelle requête authentifiée
          }
        }
      }
    }
  } catch (err) {
    console.error('Erreur vérification expiration:', err);
  }
}

// ============ STATS MODIFICATIONS ============

async function showModificationStats() {
    const panel = document.getElementById('modificationStatsPanel');
    const content = document.getElementById('modificationStatsContent');
    
    // Afficher le panel
    panel.classList.add('active');
    content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Chargement des statistiques...</p>';
    
    try {
        const res = await fetch(`${API_URL}/stats/modifications`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            throw new Error('Erreur ' + res.status);
        }
        
        const data = await res.json();
        renderModificationStats(data);
        
    } catch (err) {
        console.error('Erreur chargement stats modifications:', err);
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 60px;">
                <div class="spinner"></div>
                <p style="margin-top: 20px; font-weight: 600; color: var(--text-primary);">Erreur de chargement...</p>
            </div>
        `;
    }
}

function renderModificationStats(data) {
    const content = document.getElementById('modificationStatsContent');
    
    let html = '';
    
    // Cartes récapitulatives
    html += `
        <div class="stats-summary">
            <div class="summary-card today">
                <div class="value">${data.today}</div>
                <div class="label">Aujourd'hui</div>
            </div>
            <div class="summary-card week">
                <div class="value">${data.week}</div>
                <div class="label">Cette semaine</div>
            </div>
            <div class="summary-card month">
                <div class="value">${data.month}</div>
                <div class="label">Ce mois</div>
            </div>
            <div class="summary-card total">
                <div class="value">${data.total}</div>
                <div class="label">Total</div>
            </div>
        </div>
    `;
    
    // Répartition par type d'action
    if (data.byAction && data.byAction.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Répartition par type</h3>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
        `;
        
        const maxCount = Math.max(...data.byAction.map(a => a.count));
        const actionColors = {
            'ATTRIBUTION': '#10b981',
            'MODIFICATION': '#3b82f6',
            'LIBÉRATION': '#ef4444'
        };
        
        data.byAction.forEach(action => {
            const percentage = (action.count / data.total * 100).toFixed(1);
            const barWidth = (action.count / maxCount * 100).toFixed(1);
            const color = actionColors[action.action] || '#667eea';
            
            html += `
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
                        <span style="font-weight: 600;">${action.action}</span>
                        <span style="color: var(--text-secondary);">${action.count} (${percentage}%)</span>
                    </div>
                    <div style="background: var(--border-light); border-radius: 4px; height: 8px; overflow: hidden;">
                        <div style="background: ${color}; height: 100%; width: ${barWidth}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Utilisateurs les plus actifs
    if (data.topUsers && data.topUsers.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Utilisateurs les plus actifs</h3>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
        `;
        
        data.topUsers.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; ${index < data.topUsers.length - 1 ? 'border-bottom: 1px solid var(--border-light);' : ''}">
                    <span style="font-size: 14px;">${medal} <strong>${user.userName}</strong></span>
                    <span style="background: var(--primary-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${user.count}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Graphique des 7 derniers jours
    if (data.dailyActivity && data.dailyActivity.length > 0) {
        html += `
            <div class="chart-container" style="margin-bottom: 24px;">
                <h3>Activité des 7 derniers jours</h3>
        `;
        
        // Générer les 7 derniers jours même si pas de données
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        
        const activityMap = {};
        data.dailyActivity.forEach(item => {
            activityMap[item.date] = item.count;
        });
        
        const maxCount = Math.max(...dates.map(date => activityMap[date] || 0), 1);
        
        dates.forEach(date => {
            const count = activityMap[date] || 0;
            const dateObj = new Date(date + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString('fr-FR', { 
                weekday: 'short', 
                day: '2-digit', 
                month: '2-digit' 
            });
            
            const barWidth = maxCount > 0 ? (count / maxCount * 100) : 0;
            
            html += `
                <div class="chart-bar">
                    <div class="date">${formattedDate}</div>
                    <div class="bars">
                        ${count > 0 ? `<div class="bar" style="width: ${barWidth}%; background: var(--primary-color);" title="${count} modifications">${count}</div>` : '<div style="color: var(--text-tertiary); font-size: 12px;">Aucune modification</div>'}
                    </div>
                    <div style="width: 40px; text-align: right; font-weight: 600; color: var(--text-secondary);">${count}</div>
                </div>
            `;
        });
        
        html += `
            </div>
        `;
    }
    
    // 10 dernières modifications
    if (data.recentModifications && data.recentModifications.length > 0) {
        html += `
            <div>
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">10 dernières modifications</h3>
                <div style="overflow-x: auto;">
                    <table class="clients-preview-table">
                        <thead>
                            <tr>
                                <th>Casier</th>
                                <th>Action</th>
                                <th>Patient</th>
                                <th>N°IPP</th>
                                <th>Zone</th>
                                <th>Par</th>
                                <th>Quand</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        data.recentModifications.forEach(mod => {
            const timestamp = new Date(mod.timestamp);
            const formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const actionColor = mod.action === 'ATTRIBUTION' ? '#10b981' : 
                               mod.action === 'MODIFICATION' ? '#3b82f6' : '#ef4444';
            
            const patientInfo = mod.name ? `${anonymizeName(mod.name)} ${anonymizeFirstName(mod.firstName)}` : '—';
            
            html += `
                <tr>
                    <td><strong>${mod.lockerNumber}</strong></td>
                    <td><span style="color: ${actionColor}; font-weight: 600;">${mod.action}</span></td>
                    <td>${patientInfo}</td>
                    <td>${mod.code || '—'}</td>
                    <td>${mod.zone || '—'}</td>
                    <td><span style="font-size: 12px;">${mod.userName || 'Inconnu'}</span></td>
                    <td style="font-size: 12px; white-space: nowrap;">${formattedDate}</td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        html += `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <p style="font-size: 18px; margin-bottom: 10px;">📭</p>
                <p>Aucune modification enregistrée</p>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

function closeModificationStats() {
    document.getElementById('modificationStatsPanel').classList.remove('active');
}

// ============ CONFIG ANONYMISATION ============

async function showAnonymizationConfig() {
    const modal = document.getElementById('anonymizationConfigModal');
    
    // Charger la configuration actuelle
    try {
        const res = await fetch(`${API_URL}/config/anonymization`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            throw new Error('Erreur ' + res.status);
        }
        
        const data = await res.json();
        
        // Remplir le formulaire
        document.getElementById('anonymizeGuest').checked = data.anonymizeGuest;
        document.getElementById('anonymizeAdmin').checked = data.anonymizeAdmin;
        
        // Afficher les valeurs par défaut
        document.getElementById('guestDefault').textContent = data.anonymizeGuestDefault ? 'Activée' : 'Désactivée';
        document.getElementById('adminDefault').textContent = data.anonymizeAdminDefault ? 'Activée' : 'Désactivée';
        
        // Effacer le message de status
        document.getElementById('anonymizationStatus').innerHTML = '';
        
        modal.classList.add('active');
        
    } catch (err) {
        console.error('Erreur chargement config anonymisation:', err);
        alert('Erreur lors du chargement de la configuration');
    }
}

function closeAnonymizationConfig() {
    document.getElementById('anonymizationConfigModal').classList.remove('active');
}

// Gérer la soumission du formulaire
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('anonymizationForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            const statusEl = document.getElementById('anonymizationStatus');
            
            // LOADING STATE
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Application...';
            submitBtn.classList.add('btn-loading');
            
            try {
                const anonymizeGuest = document.getElementById('anonymizeGuest').checked;
                const anonymizeAdmin = document.getElementById('anonymizeAdmin').checked;
                
                const res = await fetch(`${API_URL}/config/anonymization`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': CSRF_TOKEN
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        anonymizeGuest: anonymizeGuest,
                        anonymizeAdmin: anonymizeAdmin
                    })
                });
                
                if (!res.ok) {
                    throw new Error('Erreur ' + res.status);
                }
                
                const data = await res.json();
                
                // Mettre à jour l'état local
                ANONYMIZE_ENABLED = IS_GUEST ? anonymizeGuest : anonymizeAdmin;
                
                // Afficher le message de succès
                statusEl.className = 'status-message status-success';
                statusEl.textContent = '✓ Configuration appliquée ! Rechargez la page pour voir les changements.';
                
                // Proposer de recharger
                setTimeout(() => {
                    if (confirm('Configuration appliquée.\n\nVoulez-vous recharger la page pour appliquer les changements ?')) {
                        window.location.reload();
                    }
                }, 1000);
                
            } catch (err) {
                console.error('Erreur sauvegarde config:', err);
                statusEl.className = 'status-message status-error';
                statusEl.textContent = '✗ Erreur : ' + err.message;
            } finally {
                // RESET STATE
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
                submitBtn.classList.remove('btn-loading');
            }
        });
    }
});

// ============ IMPRESSION ÉTIQUETTES ============

function showLabelPrintDialog() {
    const modal = document.getElementById('labelPrintModal');
    
    // Remplir le sélecteur de zones
    const zoneSelect = document.getElementById('labelZone');
    zoneSelect.innerHTML = ZONES_CONFIG.map(zone => 
        `<option value="${zone.name}">${zone.name}</option>`
    ).join('');
    
    // Réinitialiser
    document.getElementById('labelFormat').value = '5x15';
    document.getElementById('labelSelection').value = 'all';
    document.getElementById('zoneSelector').style.display = 'none';
    document.getElementById('rangeSelector').style.display = 'none';
    document.getElementById('labelAnonymize').checked = false;
    
    updateLabelPreview();
    modal.classList.add('active');
}

function closeLabelPrintDialog() {
    document.getElementById('labelPrintModal').classList.remove('active');
}

function updateLabelPreview() {
    const selection = document.getElementById('labelSelection').value;
    
    // Afficher/masquer les options
    document.getElementById('zoneSelector').style.display = selection === 'zone' ? 'block' : 'none';
    document.getElementById('rangeSelector').style.display = selection === 'range' ? 'block' : 'none';
    
    // Calculer le nombre d'étiquettes
    const lockers = getSelectedLockersForLabels();
    document.getElementById('labelCount').textContent = lockers.length;
}

function getSelectedLockersForLabels() {
    const selection = document.getElementById('labelSelection').value;
    let lockers = DATA.filter(l => l.occupied);
    
    if (selection === 'zone') {
        const zone = document.getElementById('labelZone').value;
        lockers = lockers.filter(l => l.zone === zone);
    } else if (selection === 'range') {
        const start = document.getElementById('labelRangeStart').value.trim().toUpperCase();
        const end = document.getElementById('labelRangeEnd').value.trim().toUpperCase();
        
        if (start && end) {
            lockers = lockers.filter(l => {
                const num = l.number;
                return num >= start && num <= end;
            });
        }
    }
    
    // Trier par numéro
    lockers.sort((a, b) => a.number.localeCompare(b.number));
    
    return lockers;
}

function openLabelPrintWindow() {
    const format = document.getElementById('labelFormat').value;
    const anonymize = document.getElementById('labelAnonymize').checked;
    const lockers = getSelectedLockersForLabels();
    
    if (lockers.length === 0) {
        alert('Aucun casier sélectionné');
        return;
    }
    
    // Créer une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Générer le HTML
    const html = generateLabelHTML(lockers, format, anonymize);
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Attendre le chargement puis imprimer
    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

function generateLabelHTML(lockers, format, anonymize) {
    const [cols, rows] = format === '5x15' ? [5, 15] : [3, 9];
    const perPage = cols * rows;
    
    // Dimensions calculées (A4 = 210mm × 297mm)
    const pageWidth = 210; // mm
    const pageHeight = 297; // mm
    const marginTop = 10; // mm
    const marginBottom = 10; // mm
    const marginLeft = 6; // mm
    const marginRight = 6; // mm
    
    const usableWidth = pageWidth - marginLeft - marginRight;
    const usableHeight = pageHeight - marginTop - marginBottom;
    
    const labelWidth = usableWidth / cols;
    const labelHeight = usableHeight / rows;
    
    let html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Étiquettes casiers</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        @page {
            size: A4;
            margin: 0;
        }
        
        body {
            font-family: Arial, sans-serif;
            background: white;
        }
        
        .page {
            width: ${pageWidth}mm;
            height: ${pageHeight}mm;
            padding: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
            page-break-after: always;
            position: relative;
        }
        
        .page:last-child {
            page-break-after: auto;
        }
        
        .label-grid {
            display: grid;
            grid-template-columns: repeat(${cols}, ${labelWidth}mm);
            grid-template-rows: repeat(${rows}, ${labelHeight}mm);
            width: 100%;
            height: 100%;
        }
        
        .label {
            border: 1px solid #ddd;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 2mm;
            overflow: hidden;
            text-align: center;
        }
        
        .label-locker {
            font-size: ${format === '5x15' ? '10' : '12'}pt;
            font-weight: bold;
            margin-bottom: 1mm;
        }
        
        .label-name {
            font-size: ${format === '5x15' ? '9' : '11'}pt;
            font-weight: bold;
            margin-bottom: 0.5mm;
        }
        
        .label-info {
            font-size: ${format === '5x15' ? '7' : '9'}pt;
            color: #333;
            line-height: 1.3;
        }
        
        .label-zone {
            font-size: ${format === '5x15' ? '6' : '8'}pt;
            color: #666;
            margin-top: 1mm;
        }
        
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .label {
                border: 1px solid #000;
            }
        }
    </style>
</head>
<body>
`;
    
    // Générer les pages
    for (let i = 0; i < lockers.length; i += perPage) {
        const pageLockers = lockers.slice(i, i + perPage);
        
        html += `<div class="page"><div class="label-grid">`;
        
        // Remplir la page
        for (let j = 0; j < perPage; j++) {
            if (j < pageLockers.length) {
                const locker = pageLockers[j];
                const name = anonymize ? anonymizeName(locker.name) : locker.name;
                const firstName = anonymize ? anonymizeFirstName(locker.firstName) : locker.firstName;
                
                html += `
                    <div class="label">
                        <div class="label-locker">${locker.number}</div>
                        <div class="label-name">${name} ${firstName}</div>
                        <div class="label-info">
                            IPP: ${locker.code}<br>
                            ${locker.birthDate ? formatDate(locker.birthDate) : ''}
                        </div>
                        <div class="label-zone">Zone ${locker.zone}</div>
                    </div>
                `;
            } else {
                // Étiquette vide pour compléter la grille
                html += `<div class="label"></div>`;
            }
        }
        
        html += `</div></div>`;
    }
    
    html += `
</body>
</html>
`;
    
    return html;
}