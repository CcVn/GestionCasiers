// Configuration
let API_URL = 'http://localhost:5000/api';
let DATA = []; // données casiers
let ZONES_CONFIG = []; // Variable globale pour stocker la config des zones
let IS_AUTHENTICATED = false;
let IS_GUEST = false;
let IS_MOBILE = false;
let USER_NAME = '';

let DARK_MODE_SETTING = 'system'
let EDITING_LOCKER_NUMBER = null; // Mémoriser le casier en cours d'édition
let EDITING_LOCKER_VERSION = null; // Mémoriser la version du casier en cours d'édition
let CURRENT_LOCKER_FOR_HOSP = null;
let SEARCH_RESULTS = []; 
let SEARCH_RESULTS_MARKED = false;
let VERBCONSOLE = 1   // Console verbeuse si >0

let ANONYMIZE_ENABLED = false;
let NB_MAX_ANON_PRENOM = 2;   // nombre de caractères gardés pour le nom à l'écran lors de l'anonymisation
let NB_MAX_ANON_NOM = 3;   // nombre de caractères gardés pour le prénom à l'écran lors de l'anonymisation
let NB_MAX_CAR_NOM = 20;   // nombre de caractères max affichés pour le nom à l'écran
let NB_MAX_CAR_PRENOM = 15;    // nombre de caractères max affichés pour le nom à l'écran

let consultationData = [];
let consultationSortColumn = 'name';
let consultationSortDirection = 'asc';

// Fonction générique pour Focus trap dans les modals
function trapFocus(modal) {
    const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    modal.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                firstElement.focus();
                e.preventDefault();
            }
        }
    });
    
    // Focus auto sur premier élément
    setTimeout(() => firstElement?.focus(), 100);
}

// =============== CONFIG DES ZONES ======================

function sanitizeName(name) {
  // Nettoie d'abord le nom
  let cleanName = name.replace(/[^A-Z0-9_]/gi, '');

  // Mots-clé interdits dans le nom
  const sqlKeywords = ['DROP', 'TABLE', 'DELETE', 'INSERT', 'UPDATE', 'SELECT', 'ALTER', 'TRUNCATE', 'UNION', 'WHERE', 'FROM'];
  const hasKeyword = sqlKeywords.some(keyword => cleanName.includes(keyword));

  // Si un mot-clé est présent, ajoute un préfixe pour le rendre sûr
  if (hasKeyword) {
    cleanName = `Z_${cleanName}`;
  }
  return cleanName;
}

// Fonction pour charger la configuration des zones
async function loadZonesConfig() {
    try {
        const data = await fetchJSON(`${API_URL}/config/zones`, {
            credentials: 'include'
        });
        ZONES_CONFIG = data.zones;

        if (VERBCONSOLE>0) {
            const zonesList = ZONES_CONFIG
                .map(z => z.name)
                .map(name => sanitizeName(name))
                .map(z => `'${z}'`)
                .join(', ');
            console.log(zonesList);
        }

        if (VERBCONSOLE>0) { console.log('📋 Configuration des zones chargée:', ZONES_CONFIG); }
        return ZONES_CONFIG;
    } catch (err) {
        console.error('Erreur chargement config zones:', err);
        // Fallback sur la config par défaut
        ZONES_CONFIG = [
            { name: 'ZoneA', count: 50, prefix: 'A', color: '#3b82f6' },
            { name: 'ZoneB', count: 40, prefix: 'B', color: '#10b981' },
            { name: 'ZoneC', count: 20, prefix: 'C', color: '#f59e0b' },
            { name: 'ZoneD', count: 20, prefix: 'D', color: '#ef4444' }
        ];
        return ZONES_CONFIG; 
    }
}

// Charger les données casiers (appel route [public_url]/api/lockers)
// ---> SELECT * FROM lockers ORDER BY number ASC
async function loadData() {
    try {
        const data = await fetchJSON(`${API_URL}/lockers`, {
            credentials: 'include'
        }, {
            retries: 3,
            retryDelay: 1000,
            logRequests: VERBCONSOLE > 0
        });
        
        DATA = data;
        if (VERBCONSOLE > 0) {
            console.log('📦 Données chargées:', DATA.length);
        }
        
        renderAllTables();
        updateCounters();
        
    } catch (err) {
        console.error('Erreur chargement:', err);
        
        // Messages d'erreur adaptés selon le type
        if (err.isTimeout) {
            alert('⏱️ La requête a pris trop de temps.\n\nLe serveur est peut-être surchargé. Réessayez dans quelques instants.');
        } else if (err.isNetworkError) {
            alert('🔌 Impossible de contacter le serveur.\n\nAssurez-vous que:\n1. Le serveur Node.js est lancé (npm run dev)\n2. L\'URL est correcte: ' + API_URL);
        } else if (err.status === 401) {
            alert('🔒 Session expirée. Veuillez vous reconnecter.');
            logout();
        } else {
            alert('❌ Erreur lors du chargement des données.\n\n' + err.message);
        }
    }
}

// Fonction utilitaire sur format de date
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

// ============ INITIALISATION DE LA PAGE ==================

document.addEventListener('DOMContentLoaded', async function() {
    if (VERBCONSOLE>0) { console.log('Page chargée'); }
    
    const protocol = window.location.protocol;
    const host = window.location.host;
    API_URL = `${protocol}//${host}/api`;
    if (VERBCONSOLE>0) { console.log('API_URL configurée:', API_URL); }
    
    detectMobile();
    
    // Charger le token CSRF immédiatement
    await loadCsrfToken();

    // Vérifier si le paramètre ?guest est présent dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const autoGuest = urlParams.get('guest') !== null;
    if (autoGuest) {
        if (VERBCONSOLE>0) { console.log('Mode guest automatique détecté via URL'); }
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
            if (VERBCONSOLE>0) { console.log('Session valide, rôle:', data.role); }
            IS_AUTHENTICATED = data.role === 'admin';
            IS_GUEST = data.role === 'guest';
            ANONYMIZE_ENABLED = data.anonymize || false;
            USER_NAME = data.userName || '';
            applyDarkMode(data.darkMode || 'system');
            if (VERBCONSOLE>0) { console.log('Anonymisation activée:', ANONYMIZE_ENABLED); }
            if (VERBCONSOLE>0) { console.log('Utilisateur:', USER_NAME); }
            showLoginPage(false);
            updateAuthStatus();
            setupApp();
        } else {
            if (VERBCONSOLE>0) { console.log('Pas de session valide'); }
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

    // Fermeture des modals avec ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Fermer tous les modals actifs
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
            
            // Réinitialiser les variables globales
            EDITING_LOCKER_NUMBER = null;
            EDITING_LOCKER_VERSION = null;
            CURRENT_LOCKER_FOR_HOSP = null;
            CURRENT_LOCKER_FOR_PRINT = null;
        }
    });
});

// ============ SUIVI OCCUPATION CASIERS ============

function updateCounters() {
    if (!DATA || DATA.length === 0) {
        if (VERBCONSOLE>0) { console.log('⚠️ Pas de données pour les compteurs'); }
        return;
    }
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        if (VERBCONSOLE>0) { console.log('⚠️ ZONES_CONFIG non chargée'); }
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

// Message affiché en haut de modal pour réussite ou échec
function showStatus(msg, type) {
    const el = document.getElementById('statusMessage');
    el.className = 'status-message status-' + type;
    el.textContent = msg;
    setTimeout(() => {
        el.innerHTML = '';
    }, 3000);
}


// --- Gestion du menu dropdown Actions, avec support raccourcis clavier
document.addEventListener('click', function(e) {
    // Fermer tous les dropdowns sauf celui cliqué
    if (!e.target.closest('.menu-dot')) {
        document.querySelectorAll('.dropdown-menu.active').forEach(m => m.classList.remove('active'));
    }
});

document.addEventListener('keydown', function(e) {
    const activeDropdown = document.querySelector('.dropdown-menu.active');
    
    if (activeDropdown) {
        const items = Array.from(activeDropdown.querySelectorAll('button:not([disabled])'));
        const currentIndex = items.findIndex(item => item === document.activeElement);
        
        switch(e.key) {
            case 'Escape':
                activeDropdown.classList.remove('active');
                e.preventDefault();
                break;
                
            case 'ArrowDown':
                if (currentIndex < items.length - 1) {
                    items[currentIndex + 1].focus();
                }
                e.preventDefault();
                break;
                
            case 'ArrowUp':
                if (currentIndex > 0) {
                    items[currentIndex - 1].focus();
                }
                e.preventDefault();
                break;
        }
    }
});

// Toggle dropdown avec Enter/Space
function toggleDropdown(e) {
    e.stopPropagation();
    const menu = e.target.nextElementSibling;
    const wasActive = menu.classList.contains('active');
    
    document.querySelectorAll('.dropdown-menu.active').forEach(m => {
        if (m !== menu) m.classList.remove('active');
    });
    
    menu.classList.toggle('active');
    
    // Focus premier élément si ouvert
    if (!wasActive && menu.classList.contains('active')) {
        const firstItem = menu.querySelector('button:not([disabled])');
        if (firstItem) firstItem.focus();
    }
}

// ============ MARQUES CASIER ON/OFF ============

// Fonction générique pour activer un marqueur (IDEL, Stup, Marque etc.)
async function toggleMarker(lockerNumber, marker, currentValue) {
    const locker = DATA.find(l => l.number === lockerNumber);
    if (!locker) {
        alert('Casier non trouvé');
        return;
    }
    if (!locker.occupied) {
        alert('Ce casier n\'est pas attribué, impossible de modifier cet indicateur!');
        return;
    }

    // Configuration des labels par type de marqueur
    const markerConfig = {
        'hosp': {
            icon: '🚑',
            label: 'hospi',
            actionAdd: 'Hospitalisation',
            actionRemove: 'Retour d\'hospi'
        },
        'idel': { 
            icon: 'ℹ️', 
            label: 'idel',
            actionAdd: 'Associer IDEL',
            actionRemove: 'Dissocier IDEL'
        },
        'stup': { 
            icon: '💊', 
            label: 'stup',
            actionAdd: 'Avec stupéfiants',
            actionRemove: 'Sans stupéfiants'
        },
        'frigo': { 
            icon: '❄', 
            label: 'frigo',
            actionAdd: 'Avec frigo',
            actionRemove: 'Sans frigo'
        },
        'pca': { 
            icon: '💉', 
            label: 'pca',
            actionAdd: 'Avec PCA',
            actionRemove: 'Sans PCA'
        },
        'meopa': { 
            icon: '⛽️', 
            label: 'meopa',
            actionAdd: 'Avec MEOPA',
            actionRemove: 'Sans MEOPA'
        },
        'marque': { 
            icon: '🔖', 
            label: 'marque',
            actionAdd: 'Marquer',
            actionRemove: 'Retirer marque'
        }
    };

    const config = markerConfig[marker];
    if (!config) {
        console.error('Marqueur invalide:', marker);
        return;
    }

    const action = currentValue ? config.actionRemove : config.actionAdd;
    const confirmMsg = `${action.charAt(0).toUpperCase() + action.slice(1)} le casier ${lockerNumber} ?\n\n` +
        (locker.occupied ? `Patient: ${locker.name} ${locker.firstName}` : 'Casier vide');

    if (!confirm(confirmMsg)) return;

    try {
        const updatedLocker = await fetchJSON(`${API_URL}/lockers/${lockerNumber}/toggle/${marker}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            }
        });
        
        // Mettre à jour DATA
        const index = DATA.findIndex(l => l.number === lockerNumber);
        if (index !== -1) {
            DATA[index] = updatedLocker;
        }

        // Rafraîchir l'affichage
        renderAllTables();

        const icon = updatedLocker[marker] ? config.icon : '✓';
        const message = updatedLocker[marker] 
            ? `${icon} Casier ${lockerNumber} marqué ${config.label}`
            : `${icon} Marquage ${config.label} retiré du casier ${lockerNumber}`;
        
        showStatus(message, 'success');

    } catch (err) {
        console.error(`Erreur toggle ${config.label}:`, err);
        showStatus('Erreur: ' + err.message, 'error');
    }
}

// Dépendances: AppState, Utils, CONSTANTS, LockersModule, TablesModule

const ConsultationModule = {
    
    loadConsultationData() {
        // En mode consultation (guest), créer une vue simplifiée
        const lockers = LockersModule.getOccupiedLockers();
        
        AppState.consultationData = lockers.map(locker => ({
            number: locker.number,
            name: AppState.config.anonymizeEnabled 
                ? Utils.anonymizeName(locker.client_name || '')
                : locker.client_name || '',
            surname: AppState.config.anonymizeEnabled
                ? Utils.anonymizeName(locker.client_surname || '')
                : locker.client_surname || '',
            dateEntry: locker.date_entry ? Utils.formatDate(locker.date_entry) : '-',
            markers: this._getMarkers(locker),
            hospitalized: locker.hospitalisation ? '🚑' : '',
            idel: locker.idel ? 'ℹ️' : '',
            stupefiants: locker.stupefiants ? '💊' : ''
        }));
        
        return AppState.consultationData;
    },
    
    _getMarkers(locker) {
        const markers = [];
        if (locker.hospitalization) markers.push('Hospi');
        if (locker.idel) markers.push('IDEL');
        if (locker.stupefiants) markers.push('Stup');
        if (locker.recuperable) markers.push('Récup');
        return markers.join(', ');
    },
    
    sortData(column, direction) {
        AppState.config.consultation.sortColumn = column;
        AppState.config.consultation.sortDirection = direction;
        
        const sorted = Utils.sortBy(
            AppState.consultationData,
            column,
            direction
        );
        
        AppState.consultationData = sorted;
        return sorted;
    },
    
    toggleSort(column) {
        const current = AppState.config.consultation.sortColumn;
        let direction = 'asc';
        
        if (current === column) {
            direction = AppState.config.consultation.sortDirection === 'asc' ? 'desc' : 'asc';
        }
        
        return this.sortData(column, direction);
    },
    
    renderConsultationTable(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const data = AppState.consultationData;
        
        const table = Utils.createElement('table', 'consultation-table');
        
        // Header
        const thead = Utils.createElement('thead');
        const headerRow = Utils.createElement('tr');
        
        const headers = [
            { label: 'N°', column: 'number' },
            { label: 'Nom', column: 'name' },
            { label: 'Prénom', column: 'surname' },
            { label: 'Entrée', column: 'dateEntry' },
            { label: 'Marqueurs', column: 'markers' }
        ];
        
        headers.forEach(header => {
            const th = Utils.createElement('th');
            const btn = Utils.createElement('button');
            btn.textContent = header.label;
            btn.className = 'sort-button';
            
            if (AppState.config.consultation.sortColumn === header.column) {
                btn.classList.add('active');
                const arrow = AppState.config.consultation.sortDirection === 'asc' ? '↑' : '↓';
                btn.textContent += ' ' + arrow;
            }
            
            btn.addEventListener('click', () => {
                this.toggleSort(header.column);
                this.renderConsultationTable(containerId);
            });
            
            th.appendChild(btn);
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Body
        const tbody = Utils.createElement('tbody');
        data.forEach(row => {
            const tr = Utils.createElement('tr');
            tr.innerHTML = `
                <td>${row.number}</td>
                <td>${row.name}</td>
                <td>${row.surname}</td>
                <td>${row.dateEntry}</td>
                <td>${row.hospitalized}${row.idel}${row.stupefiants}</td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        
        container.innerHTML = '';
        container.appendChild(table);
    }
};

window.ConsultationModule = ConsultationModule;