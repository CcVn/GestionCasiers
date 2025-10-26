// Configuration
let API_URL = 'http://localhost:5000/api';
let DATA = [];
let CURRENT_FILTER = { NORD: 'all', SUD: 'all', PCA: 'all' };
let CURRENT_ZONE = 'NORD';
let IS_AUTHENTICATED = false;
let IS_GUEST = false;
let IS_MOBILE = false;
let AUTH_TOKEN = null;
let ANONYMIZE_ENABLED = false;
let USER_NAME = '';
let DARK_MODE_SETTING = 'system';

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
        } else {
            IS_AUTHENTICATED = false;
            IS_GUEST = true;
            USER_NAME = '';
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
    
    updateImportExportButtons();
}

function updateImportExportButtons() {
    const importExportButtons = document.querySelectorAll('.search-bar button');
    console.log('Mise à jour des boutons header, IS_GUEST:', IS_GUEST);
    
    importExportButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        console.log('Bouton:', text);
        
        if (text.includes('importer') || text.includes('backup')) {
            if (IS_GUEST) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none';
                console.log('Bouton désactivé:', text);
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                console.log('Bouton activé:', text);
            }
        }
    });
    
    const newLockerButtons = document.querySelectorAll('.controls .btn-primary');
    console.log('Mise à jour des boutons "Attribuer", trouvés:', newLockerButtons.length);
    
    newLockerButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('attribuer')) {
            if (IS_GUEST) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none';
                console.log('Bouton "Attribuer" désactivé');
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                console.log('Bouton "Attribuer" activé');
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

// ============ CONFIGURATION API ============
function setupApp() {
    console.log('Setup de l\'application...');
    console.log('API_URL actuelle:', API_URL);
    console.log('Token présent:', !!getAuthToken());
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.zone);
            loadData();
        });
    });

    document.getElementById('globalSearch').addEventListener('input', function(e) {
        if (e.target.value.trim()) {
            searchLockers(e.target.value);
        } else {
            renderAllTables();
        }
    });

    document.getElementById('lockerForm').addEventListener('submit', handleFormSubmit);

    loadData();
    checkServerStatus();
    
    if (IS_GUEST) {
        applyGuestDefaults();
    } else {
        applyAdminDefaults();
    };
    
    setInterval(() => {
        console.log('Rafraîchissement automatique...');
        loadData();
        checkServerStatus();
    }, 60000);
}

function applyGuestDefaults() {
    CURRENT_FILTER = { NORD: 'occupied', SUD: 'occupied', PCA: 'occupied' };
    
    ['NORD', 'SUD', 'PCA'].forEach(zone => {
        const filterSelect = document.getElementById(`filter-${zone}`);
        if (filterSelect) {
            filterSelect.value = 'occupied';
            filterSelect.disabled = true;
            filterSelect.style.opacity = '0.6';
            filterSelect.style.cursor = 'not-allowed';
        }
    });
    
    document.querySelectorAll('select[onchange^="sortTable"]').forEach(select => {
        select.value = 'name';
    });
}

function applyAdminDefaults() {
    CURRENT_FILTER = { NORD: 'all', SUD: 'all', PCA: 'all' };
    
    ['NORD', 'SUD', 'PCA'].forEach(zone => {
        const filterSelect = document.getElementById(`filter-${zone}`);
        if (filterSelect) {
            filterSelect.value = 'occupied';
            filterSelect.disabled = false;
            filterSelect.style.opacity = '1.0';
            filterSelect.style.cursor = 'pointer';
        }
    });
    
    document.querySelectorAll('select[onchange^="sortTable"]').forEach(select => {
        select.value = 'name';
    });
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
            console.log('Données chargées:', DATA.length);
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
    const zones = {
        'NORD': { total: 75, occupied: 0 },
        'SUD': { total: 75, occupied: 0 },
        'PCA': { total: 40, occupied: 0 }
    };
    
    DATA.forEach(locker => {
        if (locker.occupied && zones[locker.zone]) {
            zones[locker.zone].occupied++;
        }
    });
    
    Object.keys(zones).forEach(zone => {
        const counter = document.getElementById(`counter-${zone}`);
        if (counter) {
            const { occupied, total } = zones[zone];
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
    renderTable('NORD');
    renderTable('SUD');
    renderTable('PCA');
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
    
    if (IS_GUEST) {
        tbody.innerHTML = lockers.map(locker => `
            <tr>
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? anonymizeName(locker.name) : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? anonymizeFirstName(locker.firstName) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = lockers.map(locker => `
            <tr>
                <td><strong>${locker.number}</strong></td>
                <td>${locker.occupied ? anonymizeName(locker.name) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? anonymizeFirstName(locker.firstName) : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
                <td style="text-align: center;">${getStatus(locker)}</td>
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
    const results = DATA.filter(l => 
        (l.name + ' ' + l.firstName).toLowerCase().includes(query.toLowerCase())
    );
    
    if (results.length > 0) {
        const zone = results[0].zone;
        switchTab(zone);
        
        const tbody = document.getElementById(`tbody-${zone}`);
        
        const getStatus = (locker) => {
            if (!locker.occupied) {
                return '<span class="status-empty" title="Libre"></span>';
            } else if (locker.recoverable == 1 || locker.recoverable === true) {
                return '<span class="status-recoverable" title="Récupérable"></span>';
            } else {
                return '<span class="status-occupied" title="Occupé"></span>';
            }
        };
        
        if (IS_GUEST) {
            tbody.innerHTML = results.map(locker => `
                <tr>
                    <td><strong>${locker.number}</strong></td>
                    <td>${locker.occupied ? anonymizeName(locker.name) : '<span class="cell-empty">—</span>'}</td>
                    <td>${locker.occupied ? anonymizeFirstName(locker.firstName) : '<span class="cell-empty">—</span>'}</td>
                    <td class="hide-mobile">${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                    <td class="hide-mobile">${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = results.map(locker => `
                <tr>
                    <td><strong>${locker.number}</strong></td>
                    <td>${locker.occupied ? anonymizeName(locker.name) : '<span class="cell-empty">—</span>'}</td>
                    <td class="hide-mobile">${locker.occupied ? anonymizeFirstName(locker.firstName) : '<span class="cell-empty">—</span>'}</td>
                    <td class="hide-mobile">${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                    <td>${locker.occupied ? locker.birthDate : '<span class="cell-empty">—</span>'}</td>
                    <td style="text-align: center;">${getStatus(locker)}</td>
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
}

// ============ MODAL ============
function openModal(zone) {
    if (!isEditAllowed()) return;
    
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
function handleFormSubmit(e) {
    e.preventDefault();
    
    const lockerNumber = document.getElementById('lockerNumber').value;
    const zone = document.getElementById('zone').value;
    const recoverable = document.getElementById('recoverable').checked;
    const comment = document.getElementById('comment').value;
    const token = getAuthToken();
    
    fetch(`${API_URL}/lockers`, {
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
    })
    .then(res => {
        if (!res.ok) throw new Error('Erreur ' + res.status);
        return res.json();
    })
    .then(data => {
        closeModal();
        loadData();
        
        if (data.ippValid === false) {
            showStatus('⚠️ Casier enregistré mais N°IPP non trouvé dans la base clients (marqué récupérable)', 'error');
        } else {
            showStatus('✓ Casier enregistré', 'success');
        }
    })
    .catch(err => {
        showStatus('Erreur: ' + err.message, 'error');
    });
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
            console.log('Lecture du fichier clients...');
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());
            
            console.log('Nombre de lignes:', lines.length);
            
            const dataLines = lines.slice(1);
            
            const data = dataLines.map(line => {
                const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
                if (!values || values.length < 8) return null;
                
                return {
                    ipp: values[0].replace(/"/g, '').trim(),
                    name: values[1].replace(/"/g, '').trim(),
                    firstName: values[2].replace(/"/g, '').trim(),
                    birthName: values[3].replace(/"/g, '').trim(),
                    birthDate: values[4].replace(/"/g, '').trim(),
                    sex: values[5].replace(/"/g, '').trim(),
                    zone: values[6].replace(/"/g, '').trim(),
                    entryDate: values[7].replace(/"/g, '').trim()
                };
            }).filter(item => item !== null && item.ipp);
            
            console.log('Clients à importer:', data.length);
            console.log('Exemple premier client:', data[0]);
            
            if (data.length === 0) {
                alert('Aucune donnée valide trouvée dans le fichier CSV');
                return;
            }
            
            if (!confirm(`Importer ${data.length} clients ?\n\n⚠️ ATTENTION : Ceci va REMPLACER COMPLÈTEMENT la base de données clients.`)) {
                return;
            }
            
            const token = getAuthToken();
            const importUrl = `${API_URL}/clients/import`;
            console.log('Envoi au serveur avec token:', !!token);
            console.log('URL complète:', importUrl);
            
            const res = await fetch(importUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ data: data })
            });
            
            console.log('Réponse serveur:', res.status);
            
            if (res.ok) {
                const result = await res.json();
                console.log('Résultat import:', result);
                alert(`Import clients terminé !\n\n✓ Importés : ${result.imported}\n✗ Erreurs : ${result.errors}\nTotal : ${result.total}`);
            } else if (res.status === 401) {
                alert('Session expirée. Veuillez vous reconnecter.');
                logout();
            } else {
                const errorText = await res.text();
                console.error('Erreur serveur:', errorText);
                throw new Error('Erreur serveur: ' + res.status);
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