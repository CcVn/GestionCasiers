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

let selectedExportFormat = 'csv';
let selectedExportSeparator = ';';
let selectedExportIncludeEmpty = false;
let consultationData = [];
let consultationSortColumn = 'name';
let consultationSortDirection = 'asc';

// Wrapper générique avec retry  (A IMPLEMENTER)
async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
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
        const response = await fetch(`${API_URL}/config/zones`, {
            credentials: 'include' 
        });
        const data = await response.json();
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

// =============== TOKEN CSRF =============================
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
        if (VERBCONSOLE>0) { console.log('✓ Token CSRF chargé'); }
    } catch (err) {
        console.error('❌ Erreur chargement token CSRF:', err);
        CSRF_TOKEN = null;
    }
}

// ===============  ONGLETS & CONTENU  ===================

// Charger les données casiers (appel route [public_url]/api/lockers)
// ---> SELECT * FROM lockers ORDER BY number ASC
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
            if (VERBCONSOLE>0) { console.log('📦 Données chargées:', DATA.length); }
            if (VERBCONSOLE>0) { console.log('📋 ZONES_CONFIG:', ZONES_CONFIG); }
            
            renderAllTables();
            updateCounters();
        })
        .catch(err => {
            console.error('Erreur chargement:', err);
            alert('Erreur: Impossible de charger les données.\n\nAssurez-vous que:\n1. Le serveur Node.js est lancé (npm run dev)\n2. L\'URL est: ' + API_URL);
        });
}

// Fonction pour générer les onglets dynamiquement
function generateTabs() {
    const tabsContainer = document.querySelector('.tabs');
    if (!tabsContainer) return;

    // Générer les onglets de zones
    let tabsHTML = ZONES_CONFIG.map((zone, index) => `
        <button class="tab-button ${index === 0 ? 'active' : ''}" data-zone="${zone.name}">
            Zone <br class="mobile-only">${zone.name}
        </button>
    `).join('');
    
    // Onglet de recherche à la fin
    tabsHTML += `
        <button class="tab-button tab-search" data-zone="SEARCH" style="margin-left: auto;" title="Résultats de recherche">
            🔍
        </button>
    `;

    // Onglet Aide
    tabsHTML += `
        <button class="tab-button tab-help" data-zone="HELP" title="Aide">
            ❓
        </button>
    `;

    tabsContainer.innerHTML = tabsHTML;
    
    // Ajouter les event listeners
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', function() {
            const clickedZone = this.dataset.zone;
            switchTab(clickedZone);
            
            // NE PAS recharger 1) si c'est l'onglet SEARCH ou 2) s'il y a une recherche active (les tables sont déjà filtrées)
            const searchInput = document.getElementById('globalSearch');
            const hasActiveSearch = searchInput && searchInput.value.trim() !== '';
            
            if (clickedZone !== 'SEARCH' && !hasActiveSearch) {
                loadData();
            }
        });
    });
}

// Fonction pour générer les sections de contenu
function generateContentSections() {
    const container = document.getElementById('appContainer');
    if (!container) return;
    
    const tabsElement = container.querySelector('.tabs');
    const footerElement = container.querySelector('.app-footer');
    
    // Supprimer les anciennes sections
    const oldSections = container.querySelectorAll('.content-section');
    oldSections.forEach(section => section.remove());
    
    //---- Sections/onglets pour chaque zone ------------------

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
                    <!-- Indicateur de recherche active -->
                    <button id="search-indicator-${zone.name}" onclick="clearSearch()" class= "btn-activesearch">
                        ✕ Quitter la recherche
                    </button>
                    <button class="btn-secondary btn-big admin-only pulse" onclick="openModal('${zone.name}')">➕ Attribuer</button>
                    <div class="admin-only">
                        <label for="Filtre" style="margin: 0px; font-size: 11px;">Filtrer</label>
                        <select id="Filtre" onchange="filterTable('${zone.name}', this.value)" id="filter-${zone.name}">
                            <option value="all" class="admin-only">Tous</option>
                            <option value="occupied" class="status-occupied">✕ Occupés</option>
                            <option value="recoverable" class="status-recoverable admin-only">⟳ Récupérables</option>
                            <option value="empty" class="admin-only" class="status-empty">✓ Vides</option>
                            <option value="duplicates" class="admin-only">⚠️ Doublons</option>
                            <option value="idel">ℹ️ IDEL+AS</option>
                            <option value="hosp">🚑 Hospitalisation</option>
                            <option value="stup" class="admin-only">💊 Stupéfiants</option>
                            <option value="marked" class="admin-only">🔖 Marqués</option>
                        </select>
                    </div>
                    <div class="admin-only">
                        <label for="Tri" style="margin: 0px; font-size: 11px;">Trier</label>
                        <select id="Tri" onchange="sortTable('${zone.name}', this.value)">
                            <option value="number">par numéro</option>
                            <option value="name">par nom</option>
                        </select>
                    </div>
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
 
        container.insertBefore(section, footerElement);
    });
    
    //--------------  Section/onglet recherche ---------------------------

    const searchSection = document.createElement('div');
    searchSection.id = 'content-SEARCH';
    searchSection.className = 'content-section';
    
    searchSection.innerHTML = `
        <div class="section-header">
            <h2 style="font-size: 18px; font-weight: 600;">
                🔍 Résultats de recherche
                <span id="counter-SEARCH" class="zone-counter" style="color: white; background-color: #667eea;">0 résultat(s)</span>
            </h2>
            <div class="controls">
                <button class="btn-secondary" onclick="clearSearch()" style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 6px 12px; border-radius: 6px; font-size: 12px; color: #92400e; font-weight: 600;">✕ Effacer la recherche</button>
            </div>
        </div>
        <div class="table-container">
            <table id="table-SEARCH">
                <thead>
                    <tr>
                        <th>N° Casier</th>
                        <th>Zone</th>
                        <th>Nom</th>
                        <th>Prénom</th>
                        <th>N°IPP</th>
                        <th class="hide-mobile">DDN</th>
                        <th class="hide-mobile admin-only">Statut</th>
                        <th class="hide-mobile admin-only">Commentaire</th>
                        <th class="hide-mobile admin-only">Actions</th>
                    </tr>
                </thead>
                <tbody id="tbody-SEARCH"></tbody>
            </table>
        </div>
    `;
    
    container.insertBefore(searchSection, footerElement);
    
    //---- Section/onglet d'aide
    const helpSection = document.createElement('div');
    helpSection.id = 'content-HELP';
    helpSection.className = 'content-section';
    
    helpSection.innerHTML = `
        <div class="section-header">
            <h2 style="font-size: 18px; font-weight: 600;">
                ❓ Guide d'utilisation
            </h2>
        </div>
        <div style="padding: 24px; max-width: 800px; margin: 0 auto;">
            
            <!-- PARTIE 1 : CONSULTATION (visible par tous) -->
            <div class="help-section">
                <h3>🔍 Rechercher un casier</h3>
                
                <div class="help-item">
                    <div class="help-title">Par navigation dans les zones</div>
                    <div class="help-content">
                        <ol>
                            <li>Cliquez sur un onglet de zone : <strong>Zone NORD</strong>, <strong>Zone SUD</strong>, etc.</li>
                            <li>Parcourez la liste des casiers occupés de cette zone (triés par ordre alphabétique sur le nom du patient) dans le tableau qui s'affiche sous l'onglet. Les casiers non attribués sont automatiquement masqués.</li>
                        </ol>
                        <div class="post-it">
                            <strong>💡 Avec un écran tactile :</strong> un balayage latéral permet de passer à l'onglet situé à gauche ou à droite.
                        </div>
                    </div>
                </div>

                <div class="help-item">
                    <div class="help-title">Par recherche globale</div>
                    <div class="help-content">
                        <ol>
                            <li>Utilisez la barre de recherche en haut de la page</li>
                            <li>Tapez un <strong>nom</strong>, <strong>prénom</strong> ou <strong>N°IPP</strong></li>
                            <li>L'onglet <strong>🔍 Recherche</strong> s'affiche automatiquement avec tous les résultats</li>
                            <li>Cliquez sur un onglet de zone (NORD, SUD, etc.) pour voir uniquement les résultats de cette zone</li>
                            <li>Effacez le champ de recherche à l'aide du bouton "Effacer la recherche" ou de la croix rouge pour revenir à l'affichage normal</li>
                        </ol>
                    </div>
                </div>

                <div class="help-item">
                    <div class="help-title">Explications sur les lignes colorées</div>
                    <div class="help-content">
                        <span>Il peut arriver que certaines lignes aient <strong>un texte ou un fonds coloré</strong>.</span>
                        <ol>
                            <li>Une ligne avec un fonds <strong>orangé</strong> et avec une icone ⚠️ signale qu'un double de casier été détecté, sur la base de numéros IPP identiques ou bien sur une combinaison nom+prénom+date de naissance identiques. Cela peut être parce qu'il y a vraiment deux casiers (un classique + un PCA par exemple) ou bien cela peut être lié à une erreur de la PUI (ancien casier non libéré).</li>
                            <li>Une ligne avec un fonds <strong>gris dégradé</strong> et avec une icone 🏥 signale que le casier a été attribué à un patient qui a été hospitalisé temporairement dans un autre établissement (hospitalisation programmée de courte durée, ou passage aux urgences par exemple). Ce type de casier est libéré en cas de pénurie de casiers, ou s'il est avéré que le patient ne retournera pas en HAD.</li>
                            <li>Un nom et un prénom qui apparaissent en <strong>violet</strong> signalent que des <strong>homonymes</strong> ont été détectés. NB: la détection d'homonymes est activée sur la base du nom de famille seul.</li>
                        </ol>
                        <div class="post-it">
                            <strong>💡 Informations contextuelles sur les doublons :</strong> Laisser la souris sur le numéro de casier ou l'icone ⚠️ pour avoir des informations sur le ou les autres casiers détectés comme doublons. Cette information n'est pour le moment  pas accesible sur mobile.
                        </div>
                    </div>
                </div>

            </div>
            
            <!-- PARTIE 2 : MODIFICATION (visible seulement en admin) -->
            <div class="help-section admin-only">
                <h3>✏️ Gérer les casiers (mode admin)</h3>

                <div class="help-item">
                    <div class="help-title">Compteurs de zone</div>
                    <div class="help-content">
                        Chaque onglet affiche le nombre de casiers occupés : <span class="zone-counter" style="display: inline-block;">15/75</span>
                        <ul style="margin-top: 8px;">
                            <li><strong>Vert</strong> : moins de 80% d'occupation</li>
                            <li><strong>Orange</strong> : 80% ou plus</li>
                            <li><strong>Rouge</strong> : zone complète</li>
                        </ul>
                    </div>
                </div>
                <div class="help-item">
                    <div class="help-title">Filtrer les casiers</div>
                    <div class="help-content">
                        Utilisez le menu déroulant Filtrer pour afficher :
                        <ul>
                            <li><strong>Tous</strong> : tous les casiers de la zone</li>
                            <li><strong>Occupés</strong> : seulement les casiers attribués</li>
                            <li><strong>Vides</strong> : seulement les casiers disponibles</li>
                            <li><strong>Récupérables</strong> : casiers qui peuvent être libérés en cas de besoin</li>
                            <li><strong>ℹ️ IDEL-AS</strong> : casiers livrés aux IDEL par les soignants</li>
                            <li><strong>🏥 Hospitalisations</strong> : casiers avec patients temporairement hospitalisés</li>
                            <li><strong>⚠️ Doublons</strong> : casiers avec IPP ou identité en double</li>
                            <li><strong>💊 Stupéfiants</strong> : casiers avec stupéfiants</li>
                            <li><strong>🔖 Marqués</strong> : casiers qui ont été marqués</li>
                        </ul>
                    </div>
                </div> 
                <div class="help-item">
                    <div class="help-title">Légende des statuts</div>
                    <div class="help-content">
                        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="status-empty" title="Libre"></span>
                                <span>Casier libre</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="status-occupied" title="Occupé"></span>
                                <span>Casier occupé</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="status-recoverable" title="Récupérable"></span>
                                <span>Casier occupé potentiellement récupérable</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="help-item admin-only">
                    <div class="help-title">Icônes de statut des casiers</div>
                    <div class="help-content">
                        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">🚑</span>
                                <span>Patient hospitalisé</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">ℹ️</span>
                                <span>Commandes DM avec livraison AS</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">💊</span>
                                <span>Contient des stupéfiants</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">❄</span>
                                <span>Médicaments au réfrigérateur</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">💉</span>
                                <span>Casier PCA associé</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">⛽️</span>
                                <span>Patient avec MEOPA</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">🔖</span>
                                <span>Casier marqué (pour suivi particulier)</span>
                            </div>
                        </div>
                        <div style="margin-top: 12px; padding: 8px; background: var(--bg-secondary); border-radius: 4px; font-size: 12px; color: var(--text-secondary);">
                            Ces icônes apparaissent à côté du numéro de casier dans la liste
                        </div>
                    </div>
                </div>
                <div class="help-item">
                    <div class="help-title">Trier les casiers</div>
                    <div class="help-content">
                        Utilisez le menu déroulant Trier pour modifier le mode de tri (avec le filtre appliqué):
                        <ul>
                            <li><strong>Par numéro de casier</strong> : N01, N02, N03... (par défaut)</li>
                            <li><strong>Par nom de patient</strong> : ordre alphabétique ascendant des noms de patients (comme dans l'interface de consultation)</li>
                        </ul>
                    </div>
                </div>
                <div class="help-item">
                    <div class="help-title">Attribuer un casier</div>
                    <div class="help-content">
                        <ol>
                            <li>Cliquez sur le bouton <button class="btn-primary" style="pointer-events: none; padding: 4px 12px; font-size: 12px;">➕ Attribuer</button> dans la zone souhaitée. Il est aussi possible d'attribuer un casier à l'aide de Modifier dans le menu Actions attaché à chaque casier (voir ci-dessous).</li>
                            <li>Sélectionnez le <strong>numéro de casier</strong></li>
                            <li>Remplissez les informations du patient :
                                <ul>
                                    <li><strong>Nom</strong> et <strong>Prénom</strong></li>
                                    <li><strong>N°IPP</strong> (cliquez sur 🔍 pour rechercher dans la base patients)</li>
                                    <li><strong>Date de naissance</strong></li>
                                </ul>
                            </li>
                            <li>Ajoutez un <strong>commentaire</strong> si nécessaire</li>
                            <li>Cochez <strong>Récupérable</strong> si le casier peut être libéré en cas de pénurie</li>
                            <li>Cliquez sur <button class="btn-primary" style="pointer-events: none; padding: 4px 12px; font-size: 12px;">Enregistrer</button></li>
                        </ol>
                        <div class="post-it">
                            <strong>💡 Remplissage automatique :</strong> Si la base patients est à jour, commencez par renseigner l'IPP et cliquez sur 🔍 pour récupérer automatiquement les autres informations dans la base patients. Si la base ne contient pas de patient avec ce n° d'IPP, le casier sera automatiquement marqué comme récupérable. NB: Cette opération peut aussi être réalisée ultérieurement pour compléter/mettre à jour les informations d'un casier.
                        </div>
                    </div>
                </div>
                
                <div class="help-item">
                    <div class="help-title">Modifier un casier</div>
                    <div class="help-content">
                        <ol>
                            <li>Cliquez sur le menu <strong>⋮</strong> à droite de la ligne du casier</li>
                            <li>Sélectionnez <strong>Modifier</strong></li>
                            <li>Modifiez les informations souhaitées</li>
                            <li>Cliquez sur <button class="btn-primary" style="pointer-events: none; padding: 4px 12px; font-size: 12px;">Enregistrer</button></li>
                        </ol>
                        <div class="post-it">
                            <strong>⚠️ Changement de casier :</strong> Si vous changez le numéro du casier, l'application vous proposera de libérer automatiquement l'ancien casier.
                        </div>
                    </div>
                </div>
                
                <div class="help-item">
                    <div class="help-title">Libérer un casier</div>
                    <div class="help-content">
                        <ol>
                            <li>Cliquez sur le menu <strong>⋮</strong> à droite de la ligne du casier</li>
                            <li>Sélectionnez <strong>Libérer</strong></li>
                            <li>Confirmez la libération</li>
                        </ol>
                        <p style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">
                            Le casier devient immédiatement disponible pour une nouvelle attribution.
                        </p>
                    </div>
                </div>

                <div class="help-item admin-only">
                    <div class="help-title">Gestion des indicateurs 🚑 Hospitalisation, ℹ️ IDEL et 💊 Stupéfiants</div>
                    <div class="help-content">
                        <p style="margin-bottom: 12px;">Les indicateurs Hospitalisation, IDEL et stupéfiants permettent d'identifier visuellement les casiers dont les patients sont hospitalisés avec probable retour en HAD, les casiers associés à des IDEL et des casiers contena.</p>
                        
                        <h4 style="font-size: 13px; font-weight: 600; margin: 12px 0 8px 0;">Marquer un casier :</h4>
                        <ol style="margin-left: 20px;">
                            <li>Lors de l'attribution/modification : Cocher "ℹ️ Commandes IDEL et livraison AS" ou "💊 Contient des stupéfiants"</li>
                            <li>Via le menu Actions (⋮) : Cliquer sur "🚑 Hospitalisation", "ℹ️ Associer IDEL" ou "💊 Avec stupéfiants"</li>
                            <li>Pour retirer l'indicateur via le menu Actions (⋮) : Cliquer sur "❌ Retour d'hospi", "❌ Dissocier IDEL" ou "❌ Sans stupéfiants"</li>
                        </ol>
                        
                        <h4 style="font-size: 13px; font-weight: 600; margin: 12px 0 8px 0;">Filtrer les casiers stupéfiants :</h4>
                        <ul style="margin-left: 20px;">
                            <li>Dans chaque onglet : Utiliser le filtre "🚑 Hospitalisation", "ℹ️ IDEL/AS" ou "💊 Stup."</li>
                            <li>Pour les étiquettes : Sélectionner "ℹ️ IDEL/AS uniquement" ou "💊 Stupéfiants uniquement"</li>
                        </ul>
                        
                        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin-top: 12px; border-radius: 4px;">
                            🔒 <strong>Sécurité :</strong> L'icône 💊 n'est pas visible en mode consultation (invité).
                        </div>
                    </div>
                </div>

                <h3>🛠️ Outils d'administration</h3>

                <div class="help-item admin-only">
                    <div class="help-title">Import de données patients</div>
                    <div class="help-content">
                        <p style="margin-bottom: 12px;">Cette interface permet de régler les options pour importer des données patients.</p>
                        
                        <h4 style="font-size: 13px; font-weight: 600; margin: 12px 0 8px 0;">A COMPLETER</h4>
                        <p style="font-size: 13px;">
                            Pxxxxxxx
                        </p>
                        
                        <div class="post-it" style="margin-top: 12px;">
                            <strong>💡 xxx :</strong> xxxx
                        </div>
                    </div>
                </div>

                <div class="help-item admin-only">
                    <div class="help-title">🏷️ Impression d'étiquettes</div>
                    <div class="help-content">
                        <p style="margin-bottom: 12px;">L'interface d'impression permet de générer des planches d'étiquettes personnalisées.</p>
                        
                        <h4 style="font-size: 13px; font-weight: 600; margin: 12px 0 8px 0;">Options de sélection :</h4>
                        <ul style="margin-left: 20px;">
                            <li><strong>Tous les casiers occupés</strong> : Imprime tous les casiers actuellement attribués</li>
                            <li><strong>Tous les casiers occupés de la zone ...</strong> : Sélectionne une zone spécifique (NORD, SUD, etc.)</li>
                            <li><strong>Tous les casiers occupés dans la plage de numéros...</strong> : Sélectionne une plage (ex: N01 à N25, S04 à R22, etc.)</li>
                            <li>ℹ️ <strong>Casiers IDEL/AS uniquement</strong> : N'imprime que les casiers associés à des commandes DM IDEL</li>
                            <li>💊 <strong>Casiers avec stupéfiants uniquement</strong> : N'imprime que les casiers associés à des stupéfiants</li>
                            <li>🔖 <strong>Casiers marqués uniquement</strong> : N'imprime que les casiers marqués (pour suivi particulier)</li>
                        </ul>
                        
                        <h4 style="font-size: 13px; font-weight: 600; margin: 12px 0 8px 0;">Nombre de copies :</h4>
                        <p style="font-size: 13px;">
                            Permet d'imprimer plusieurs exemplaires de chaque étiquette (entre 1 et 10 copies).<br>
                            <strong>Exemple :</strong> 15 casiers × 2 copies = 30 étiquettes au total
                        </p>
                        
                        <div class="post-it" style="margin-top: 12px;">
                            <strong>💡 Astuce :</strong> Marquez les casiers importants (menu ⋮ → Marquer) puis utilisez le filtre "Casiers marqués" pour imprimer uniquement ces étiquettes.
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;
    
    container.insertBefore(helpSection, footerElement);

    // Initialiser les filtres par défaut
    CURRENT_FILTER = {};
    ZONES_CONFIG.forEach(zone => {
        CURRENT_FILTER[zone.name] = 'all';
    });
}

// ============ UTILITAIRES D'ANONYMISATION ===============

// non utilisée pour le moment
function anonMaxName(name) {
    const hash = crypto.createHash('md5').update(name).digest('hex');
    return `${name.charAt(0)}***${hash.substring(0, ANONYMIZE_ENABLED ? 3 : 20)}`; // "D***a4f"
}

function anonymizeName(name) {
    if (!name) return name;
    const maxLength = ANONYMIZE_ENABLED ? (NB_MAX_ANON_NOM || 3) : (NB_MAX_CAR_NOM || 20);
    return name.substring(0, maxLength).toUpperCase();
}

function anonymizeFirstName(firstName) {
    if (!firstName) return firstName;
    const maxLength = ANONYMIZE_ENABLED ? (NB_MAX_ANON_PRENOM || 2) : (NB_MAX_CAR_PRENOM || 15);
    return firstName.substring(0, maxLength);
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

// ============ MODE SOMBRE ===============================

function applyDarkMode(setting) {
    DARK_MODE_SETTING = setting || 'system';
    if (VERBCONSOLE>1) { console.log('Application du mode sombre:', DARK_MODE_SETTING); }
    
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
    if (VERBCONSOLE>0) { console.log('🌓 Changement mode:', mode); }
    
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
    
    setDarkMode(newMode); // Appliquer le mode
    updateThemeIcon(); // Mettre à jour l'icône
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

// ============ UTILISATION SUR MOBILE =====================
function detectMobile() {
    IS_MOBILE = window.innerWidth <= 768;
    if (VERBCONSOLE>0) { console.log('Mode mobile:', IS_MOBILE); }
    return IS_MOBILE;
}

//----- SUPPORT SWIPE TACTILE
function initSwipeSupport() {
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;
    
    const minSwipeDistance = 50; // pixels minimum pour déclencher le swipe
    const maxVerticalDistance = 100; // tolérance verticale
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });
    
    function handleSwipe() {
        const horizontalDistance = touchEndX - touchStartX;
        const verticalDistance = Math.abs(touchEndY - touchStartY);
        
        // Ignorer si trop de mouvement vertical (scroll)
        if (verticalDistance > maxVerticalDistance) return;
        
        // Ignorer si distance horizontale insuffisante
        if (Math.abs(horizontalDistance) < minSwipeDistance) return;
        
        // Récupérer l'onglet actuel
        const currentTab = document.querySelector('.tab-button.active');
        if (!currentTab) return;
        
        const currentZone = currentTab.dataset.zone;
        
        // Créer la liste ordonnée des onglets
        const allTabs = [...ZONES_CONFIG.map(z => z.name), 'SEARCH', 'HELP'];
        const currentIndex = allTabs.indexOf(currentZone);
        
        if (currentIndex === -1) return;
        
        let newIndex;
        
        // Swipe vers la gauche (onglet suivant)
        if (horizontalDistance < 0) {
            newIndex = currentIndex + 1;
            if (newIndex >= allTabs.length) newIndex = 0; // Boucle au début
        }
        // Swipe vers la droite (onglet précédent)
        else {
            newIndex = currentIndex - 1;
            if (newIndex < 0) newIndex = allTabs.length - 1; // Boucle à la fin
        }
        
        const newZone = allTabs[newIndex];
        
        // Changer d'onglet
        switchTab(newZone);
        
        // Ne recharger que si nécessaire
        const searchInput = document.getElementById('globalSearch');
        const hasActiveSearch = searchInput && searchInput.value.trim() !== '';
        
        if (newZone !== 'SEARCH' && newZone !== 'HELP' && !hasActiveSearch) {
            loadData();
        }
    }
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
});

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
        
        // Forcer un vrai rechargement à la reconnexion : recharge sans cache
        //if (data.authenticated) { window.location.reload(true); }

        ANONYMIZE_ENABLED = data.anonymize || false;
        applyDarkMode(data.darkMode || 'system');
        if (VERBCONSOLE>0) { console.log('Anonymisation activée:', ANONYMIZE_ENABLED);}
        if (VERBCONSOLE>0) { console.log('Utilisateur:', USER_NAME); }
        
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
        if (VERBCONSOLE>0) { console.log('Anonymisation activée:', ANONYMIZE_ENABLED); }

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
    if (VERBCONSOLE>0) { console.log('Connexion automatique en mode guest...'); }
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
        if (VERBCONSOLE>0) { console.log('Anonymisation activée:', ANONYMIZE_ENABLED); }

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

// Info sur le dernier import patients
async function updateImportStatus() {
    try {
        const res = await fetch(`${API_URL}/clients/import-status`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            console.error('Erreur récupération statut import:', res.status);
            return;
        }
        
        const data = await res.json();
        
        const statusEl = document.getElementById('importStatus');
        if (!statusEl) return;
        
        // CAS 1 : Base vide ou effacée
        if (data.isEmpty) {
            if (data.wasCleared) {
                statusEl.innerHTML = `🗑️ Base patients vidée`;
                statusEl.style.color = '#ef4444';
                statusEl.title = `${data.message} par ${data.clearedBy || 'inconnu'}`;
            } else {
                statusEl.innerHTML = '⚠️ Aucun patient en base';
                statusEl.style.color = '#f59e0b';
                statusEl.title = 'Aucun import de patients effectué - Import recommandé';
            }
            return;
        }
        
        // CAS 2 : Base avec données
        if (!data.hasImport) {
            statusEl.innerHTML = '⚠️ Aucun import patient';
            statusEl.style.color = '#f59e0b';
            statusEl.title = 'Aucun import de clients effectué - Import recommandé';
            return;
        }
        
        // CAS 3 : Import récent existant
        const importDate = new Date(data.lastImportDate);
        const daysSince = data.daysSinceImport;
        const hoursSince = data.hoursSinceImport;
        const clientCount = data.clientCount || 0;

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
            // Moins de 24h
            message = `<span class="status-dot">✓</span> Import patients il y a ${hoursSince}h (${clientCount})`;
            color = '#10b981';
            title = `Dernière mise à jour : ${formattedDateTime}`;
        } else if (daysSince <= data.warningThreshold) {
            // Entre 1 jour et seuil
            message = `<span class="status-dot">✓</span> Import patients il y a ${daysSince}j (${clientCount})`;
            color = '#e6e600';
            title = `Dernière mise à jour : ${formattedDateTime}`;
        } else {
            // Au-delà du seuil
            message = `⚠️ Base patients ancienne (${daysSince}j) - ${clientCount} patients`;
            color = '#f59e0b';
            title = `Dernière mise à jour : ${formattedDateTime} - Import recommandé`;
        }
        
        statusEl.innerHTML = message;
        statusEl.style.color = color;
        statusEl.title = title;
        
    } catch (err) {
        console.error('Erreur chargement statut import:', err);
        const statusEl = document.getElementById('importStatus');
        if (statusEl) {
            statusEl.innerHTML = '⚠️ Erreur statut';
            statusEl.style.color = '#ef4444';
            statusEl.title = 'Impossible de charger le statut d\'import';
        }
    }
}

// @TODO plus utilisée pour l'instant?
function updateImportExportButtons() {
    const importExportButtons = document.querySelectorAll('.search-bar button');
    if (VERBCONSOLE>0) { console.log('Mise à jour des boutons header, IS_GUEST:', IS_GUEST); }
    
    importExportButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (VERBCONSOLE>0) { console.log('Bouton:', text); }
        
        if (text.includes('import') || text.includes('backup')|| 
            text.includes('json') || text.includes('csv') ) {
            if (IS_GUEST) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none';
                if (VERBCONSOLE>0) { console.log('Bouton désactivé:', text); }
                //btn.style.display = 'none';
            } else {
                //btn.style.display = '';
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                if (VERBCONSOLE>0) { console.log('Bouton activé:', text); }
            }
        }
    });
    
    const newLockerButtons = document.querySelectorAll('.controls .btn-primary');
    if (VERBCONSOLE>0) { console.log('Mise à jour des boutons "Attribuer" et "Imprimés", trouvés:', newLockerButtons.length); }
    
    newLockerButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('attribuer') || text.includes('imprimer') ) {
            if (IS_GUEST) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none';
                if (VERBCONSOLE>0) { console.log('Boutons "Attribuer & Imprimer" désactivé'); }
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

// ================== MODE ADMIN ===========================
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

// ============ CONFIGURATION API ==========================

async function setupApp() {
    if (VERBCONSOLE>0) { console.log('🚀 Setup de l\'application...'); }
    if (VERBCONSOLE>0) { console.log('API_URL actuelle:', API_URL); }
    
    try {
        // ÉTAPE 1 : Charger la configuration des zones
        if (VERBCONSOLE>0) { console.log('1️⃣ Chargement configuration zones...'); }
        await loadZonesConfig();
        if (VERBCONSOLE>0) { console.log('✓ Config zones chargée:', ZONES_CONFIG); }
        
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
        CURRENT_FILTER = {};
        ZONES_CONFIG.forEach(zone => {
            CURRENT_FILTER[zone.name] = 'all';
        });
        if (VERBCONSOLE>0) { console.log('✓ Filtres initialisés:', CURRENT_FILTER); }
        
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
            applyDarkMode(DARK_MODE_SETTING);
        }
        updateThemeIcon(); // Mettre à jour l'icône du toggle

        // ÉTAPE 7b : Charger statut import
        if (VERBCONSOLE>0) { console.log('7️⃣b Chargement statut import...'); }
        updateImportStatus();

        // ÉTAPE 8 : Appliquer mode guest si nécessaire
        if (IS_GUEST) {
            if (VERBCONSOLE>0) { console.log('7️⃣ Application mode guest...'); }
            applyGuestDefaults();
        }

        // ÉTAPE 9 : Rafraîchissement automatique
        if (VERBCONSOLE>0) { console.log('8️⃣ Démarrage rafraîchissement auto...'); }
        setInterval(() => {
            if (VERBCONSOLE>0) { console.log('⟳ Rafraîchissement automatique...'); }
            loadData();
            checkServerStatus();
            updateImportStatus();
        }, 120000);

        // ÉTAPE 10 : Vérification expiration session (si authentifié)
        if (IS_AUTHENTICATED || IS_GUEST) {
            if (VERBCONSOLE>0) { console.log('9️⃣ Démarrage vérification expiration session...'); }
            setInterval(checkSessionExpiration, 5 * 60 * 1000); // Toutes les 5 minutes
        }

        // Étape 11 : Masquer le bouton de marquage
        hideMarkButtons();
        
        if (VERBCONSOLE>0) { console.log('✅ Application initialisée avec succès'); }
        
    } catch (err) {
        console.error('❌ Erreur lors du setup:', err);
        alert('Erreur lors de l\'initialisation de l\'application: ' + err.message);
    }
}

function applyGuestDefaults() {
    if (VERBCONSOLE>0) { console.log('👁️ Application mode guest...'); }
    
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
    
    if (VERBCONSOLE>0) { console.log('✓ Mode guest appliqué'); }
}

function applyAdminDefaults() {
    if (VERBCONSOLE>0) { console.log('👁️ Application mode guest...'); }
    
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
    
    hideMarkButtons();

    // Démasquer les éléments d'administration   @DEPRECATED
    showAdminElements();

    if (VERBCONSOLE>0) { console.log('✓ Mode guest appliqué'); }
}

// ===== MARQUAGE GROUPÉ DES RÉSULTATS DE RECHERCHE ==========

function showMarkButtons() {
    const btnMark = document.getElementById('btnMarkSearchResults');
    const btnUnmark = document.getElementById('btnUnmarkSearchResults');
    if (btnMark) btnMark.style.display = 'inline-block';
    if (btnUnmark) btnUnmark.style.display = 'inline-block';
}

function hideMarkButtons() {
    const btnMark = document.getElementById('btnMarkSearchResults');
    const btnUnmark = document.getElementById('btnUnmarkSearchResults');
    if (btnMark) btnMark.style.display = 'none';
    if (btnUnmark) btnUnmark.style.display = 'none';
}

// ============ BACKUP =======================================

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
async function checkServerStatus() {
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

// ============ NAVIGATION ============

function switchTab(zone) {
    CURRENT_ZONE = zone;
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    
    const tabButton = document.querySelector(`[data-zone="${zone}"]`);
    const contentSection = document.getElementById(`content-${zone}`);
    
    if (tabButton) tabButton.classList.add('active');
    if (contentSection) contentSection.classList.add('active');
}

//======== FONCTIONS UTILITAIRES DOUBLONS & HOMONYMES ===============

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
    
    if (VERBCONSOLE>1) { 
        console.log('🔍 Doublons détectés:', duplicates.size);
        console.log('  Par IPP:', Object.entries(seen.byIPP).filter(([k,v]) => v.length > 1));
        console.log('  Par identité:', Object.entries(seen.byIdentity).filter(([k,v]) => v.length > 1));
    }
    
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
    
    if (VERBCONSOLE>1) { 
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
    }
    
    return {
        homonyms: homonyms,
        byFullName: seen.byFullName,
        byLastName: seen.byLastName
    };
}

// --- Affichage basique duplicates
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

// --- Affichage basique Homonymes
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

// ============ AFFICHAGE TABLEAUX ============

// Génération de toutes les tables, mode normal ou recherche
function renderAllTables() {
    // Vérifier s'il y a une recherche active
    const searchInput = document.getElementById('globalSearch');
    const searchQuery = searchInput ? searchInput.value.trim() : '';
    
    if (searchQuery) {
        // Si recherche active, lancer la recherche
        searchLockers(searchQuery);
    } else {
        // Sinon, affichage normal
        ZONES_CONFIG.forEach(zone => {
            renderTable(zone.name);
        });
    }
}

// --- Génération d'une ligne de tableau (normal ou recherche) ------

function generateTableRow(locker, showZone = false) {
    // Détection des doublons et homonymes
    const duplicateInfo = detectDuplicates();
    const homonymInfo = detectHomonyms();
    const duplicateNumbers = duplicateInfo.duplicates;

    const homonymNumbers = homonymInfo.homonyms;
    const getHomonymTooltip = (locker) => {
        if (!homonymNumbers.has(locker.number)) return '';
        
        const lastName = locker.name.toUpperCase();
        const fullName = `${locker.name}|${locker.firstName}`.toUpperCase();
        
        let otherLockers = [];
        
        // Chercher par nom seul
        if (homonymInfo.byLastName[lastName]) {
            otherLockers = homonymInfo.byLastName[lastName]
                .filter(l => l.number !== locker.number)
                .map(l => `${l.number} (${l.firstName})`);
        }
        
        // Ou par nom+prénom avec IPP différent
        if (otherLockers.length === 0 && homonymInfo.byFullName[fullName]) {
            otherLockers = homonymInfo.byFullName[fullName]
                .filter(l => l.number !== locker.number)
                .map(l => `${l.number} (IPP: ${l.ipp})`);
        }
        
        return otherLockers.length > 0 
            ? `Homonyme(s): ${otherLockers.join(', ')}`
            : '';
    }   ;
    const homonymTooltip = getHomonymTooltip(locker);
    
    const isDuplicate = duplicateNumbers.has(locker.number);
    const duplicateClass = isDuplicate ? 'duplicate-row' : '';
    const hospiClass = locker.hosp ? 'hosp-row' : '';
    
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
    const duplicateTitle = isDuplicate ? getDuplicateInfo(locker) : '';
    
    const hasHospiDate = false
    const hospiTitle = hasHospiDate ? ('Date d\'hospi: xxxxx') : 'Date d\'hospi non renseignée';

    const getStatus = (locker) => {
        if (!locker.occupied) {
            return '<span class="status-empty" title="Libre"></span>';
        } else if (locker.recoverable == 1 || locker.recoverable === true) {
            return '<span class="status-recoverable" title="Récupérable"></span>';
        } else {
            return '<span class="status-occupied" title="Occupé"></span>';
        }
    };
    
    //-- MODE GUEST
    if (IS_GUEST) {
        // Icônes limitées en mode guest (pas de marque ni stup)
        const hospIcon = locker.hosp ? '🚑' : '';
        const idelIcon = locker.idel ? 'ℹ️' : '';
        const frigoIcon = locker.frigo ? '❄' : '';
        const pcaIcon = locker.pca ? '💉' : '';
        const statusIcons = [hospIcon, idelIcon, frigoIcon, pcaIcon].filter(i => i).join(' ');

        return `
            <tr class="${[duplicateClass, hospiClass].filter(c => c).join(' ')}" title="${duplicateTitle}">
                <td><strong>${locker.number}</strong> ${statusIcons}</td>
                ${showZone ? `<td><span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">${locker.zone}</span></td>` : ''}
                <td>${locker.occupied ? `<span class="${homonymNumbers.has(locker.number) ? 'homonym-name' : ''}" title="${homonymTooltip}">${anonymizeName(locker.name)}</span>` : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? `<span class="${homonymNumbers.has(locker.number) ? 'homonym-name' : ''}" title="${homonymTooltip}">${anonymizeFirstName(locker.firstName)}</span>` : '<span class="cell-empty">—</span>'}</td>
                <td>${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
                <td class="hide-mobile">${locker.occupied ? formatDate(locker.birthDate) : '<span class="cell-empty">—</span>'}</td>
            </tr>
        `;
    }
    
    //-- MODE ADMIN
    const marqueIcon = locker.marque ? '🔖' : '';
    //const hospIcon = locker.hosp ? '🚑' : '';
    const hospTitle = locker.hosp 
        ? (locker.hospDate 
            ? `Hospitalisé(e) le ${formatDate(locker.hospDate)}` 
            : 'Hospitalisé(e), date non renseignée')
        : '';
    const hospIconWithTitle = locker.hosp 
        ? `<span title="${hospTitle}" style="cursor: help;">🚑</span>` 
        : '';

    const stupIcon = locker.stup ? '💊' : '';
    const idelIcon = locker.idel ? 'ℹ️' : '';
    const frigoIcon = locker.frigo ? '❄' : '';
    const pcaIcon = locker.pca ? '💉' : '';
    const meopaIcon = locker.meopa ? '⛽️' : '';

    const statusIcons = [hospIconWithTitle, idelIcon, stupIcon, frigoIcon, pcaIcon, meopaIcon, marqueIcon ].filter(i => i).join(' ');
    
    return `
        <tr class="${[duplicateClass, hospiClass].filter(c => c).join(' ')}" title="${duplicateTitle}">
            <td><strong>${locker.number}</strong>${isDuplicate ? ' ⚠️' : ''} ${statusIcons}</td>
            ${showZone ? `<td><span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">${locker.zone}</span></td>` : ''}
            <td>${locker.occupied ? `<span class="${homonymNumbers.has(locker.number) ? 'homonym-name' : ''}" title="${homonymTooltip}">${anonymizeName(locker.name)}</span>` : '<span class="cell-empty">—</span>'}</td>
            <td>${locker.occupied ? `<span class="${homonymNumbers.has(locker.number) ? 'homonym-name' : ''}" title="${homonymTooltip}">${anonymizeFirstName(locker.firstName)}</span>` : '<span class="cell-empty">—</span>'}</td>
            <td>${locker.occupied ? locker.code : '<span class="cell-empty">—</span>'}</td>
            <td class="hide-mobile">${locker.occupied ? formatDate(locker.birthDate) : '<span class="cell-empty">—</span>'}</td>
            <td class="hide-mobile" style="text-align: center;">${getStatus(locker)}</td>
            <td class="hide-mobile">${locker.comment || '<span class="cell-empty">—</span>'}</td>
            <td class="hide-mobile">
                <div class="menu-dot">
                    <button class="btn-secondary" onclick="toggleDropdown(event)">⋮</button>
                    <div class="dropdown-menu">
                        <button onclick="openModalEdit('${locker.number}')">
                            ✏️ Modifier
                        </button>
                        <button class="btn-delete" onclick="releaseLocker('${locker.number}')">
                            🧹 Libérer
                        </button>
                        <button onclick="printSingleLockerLabels('${locker.number}')">
                            🏷️ Etiquettes
                        </button>
                        <!-- SOUS-MENU MARQUEURS -->
                        <div class="dropdown-submenu">
                            <button class="has-submenu">
                                🔖 Marqueurs ›
                            </button>
                            <div class="dropdown-submenu-content">
                                <button onclick="openHospitalisationModal('${locker.number}')">
                                    ${locker.stup ? '❌ Retirer hospi' : '🚑 Hospitalisation'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'idel', ${locker.idel ? 'true' : 'false'})">
                                    ${locker.idel ? '❌ Retirer IDEL' : 'ℹ️ Avec IDEL'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'stup', ${locker.stup ? 'true' : 'false'})">
                                    ${locker.stup ? '❌ Retirer stup.' : '💊 Avec stupéfiants'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'frigo', ${locker.marque ? 'true' : 'false'})">
                                    ${locker.marque ? '❌ Retirer frigo' : '❄️ Avec frigo'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'pca', ${locker.marque ? 'true' : 'false'})">
                                    ${locker.marque ? '❌ Retirer PCA' : '💉 Avec PCA'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'meopa', ${locker.marque ? 'true' : 'false'})">
                                    ${locker.marque ? '❌ Retirer MEOPA' : '⛽️ Avec MEOPA'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'marque', ${locker.marque ? 'true' : 'false'})">
                                    ${locker.marque ? '❌ Retirer marque' : '🔖 Marquer'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

// --------  Créer la table pour chaque zone ------------
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
    } else if (filter === 'hosp') { 
        lockers = lockers.filter(l => l.occupied && (l.hosp == 1 || l.hosp === true) );
    } else if (filter === 'idel') { 
        lockers = lockers.filter(l => l.occupied && (l.idel == 1 || l.idel === true) );
    } else if (filter === 'stup') { 
        lockers = lockers.filter(l => l.occupied && (l.stup == 1 || l.stup === true) );
    } else if (filter === 'frigo') {
        lockers = lockers.filter(l => l.occupied && (l.frigo == 1 || l.frigo === true) );
    } else if (filter === 'pca') {
        lockers = lockers.filter(l => l.occupied && (l.pca == 1 || l.pca === true) );
    } else if (filter === 'meopa') {
        lockers = lockers.filter(l => l.occupied && (l.meopa == 1 || l.meopa === true) );
    } else if (filter === 'marked') {
        lockers = lockers.filter(l => l.occupied && (l.marque == 1 || l.marque === true) );
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
    
   // Utiliser la fonction de génération de ligne (commune avec la table de recherche renderSearchResults)
    tbody.innerHTML = lockers.map(locker => generateTableRow(locker, false)).join('');
}

// --------  Créer la table de recherche ------------
function renderSearchResults(zone, results, searchTerm) {
    const tbody = document.getElementById(`tbody-${zone}`);
    if (!tbody) return;
    
    if (results.length === 0) {
        const colspan = IS_GUEST ? (zone === 'SEARCH' ? '6' : '5') : (zone === 'SEARCH' ? '9' : '8');
        tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; padding: 30px; color: var(--text-tertiary);">
        Aucun résultat</td></tr>`;
        return;
    }
    
    // Fonction highlight
    const highlight = (text, search) => {
        if (!text || !search) return text;
        const regex = new RegExp(`(${search})`, 'gi');
        return text.replace(regex, '<mark style="background: #fef3c7; padding: 2px 4px; border-radius: 3px; font-weight: 600;">$1</mark>');
    };
    
    // Utiliser la fonction de génération de ligne (commune avec renderTable) avec surlignage et icones
    tbody.innerHTML = results.map(locker => {
        let row = generateTableRow(locker, zone === 'SEARCH');
        
        // Appliquer le surlignage sur la ligne générée
        if (locker.name) {
            const highlightedName = highlight(anonymizeName(locker.name), searchTerm);
            row = row.replace(anonymizeName(locker.name), highlightedName);
        }
        if (locker.firstName) {
            const highlightedFirstName = highlight(anonymizeFirstName(locker.firstName), searchTerm);
            row = row.replace(anonymizeFirstName(locker.firstName), highlightedFirstName);
        }
        if (locker.code) {
            const highlightedCode = highlight(locker.code, searchTerm);
            row = row.replace(locker.code, highlightedCode);
        }
        if (locker.comment) {
            const highlightedComment = highlight(locker.comment, searchTerm);
            row = row.replace(locker.comment, highlightedComment);
        }
        
        return row;
    }).join('');
}

// ---- FILTRE de la table : avec gestion du filtre "duplicates" ----
function filterTable(zone, value) {
    CURRENT_FILTER[zone] = value;
    
    // Si filtre "duplicates", on doit détecter d'abord
    if (value === 'duplicates') {
        const duplicateInfo = detectDuplicates();
        // Filtrer sera géré dans renderTable
    }
    renderTable(zone);
}

// ---- TRI de la table  -------------------------------------------
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

//=============== FONCTIONS DE RECHERCHE =========================

// Gestion de la recherche
function searchLockers(query) {
    if (!query || query.trim() === '') {
        SEARCH_RESULTS = [];
        hideMarkButtons();
        renderAllTables(); // Recherche vide : afficher toutes les tables normalement
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    
    // Recherche globale pour tous les résultats
    const allResults = DATA.filter(l => {
        const searchText = (l.name + ' ' + l.firstName + ' ' + l.code + ' ' + l.comment).toLowerCase();
        return searchText.includes(searchTerm);
    });
    
    SEARCH_RESULTS = allResults;  // stocker les résultats

    if (VERBCONSOLE>0) { console.log(`🔍 Recherche "${query}" : ${allResults.length} résultat(s)`); }
    
    // Afficher les boutons de marquage si résultats et mode admin
    if (IS_AUTHENTICATED && allResults.length > 0) {
        showMarkButtons();
    } else {
        hideMarkButtons();
    }

    // Mettre à jour le compteur de l'onglet SEARCH
    const counterSearch = document.getElementById('counter-SEARCH');
    if (counterSearch) {
        counterSearch.textContent = `${allResults.length} résultat(s)`;
    }
    
    // Basculer sur l'onglet SEARCH
    switchTab('SEARCH');
    
    // Afficher tous les résultats dans l'onglet SEARCH
    renderSearchResults('SEARCH', allResults, searchTerm);
    
    // Mettre à jour aussi les tables de chaque zone avec résultats filtrés
    ZONES_CONFIG.forEach(zone => {
        const zoneResults = allResults.filter(l => l.zone === zone.name);
        renderSearchResults(zone.name, zoneResults, searchTerm);
        
        // Mettre à jour le compteur de la zone
        const counter = document.getElementById(`counter-${zone.name}`);
        if (counter) {
            const zoneConfig = ZONES_CONFIG.find(z => z.name === zone.name);
            counter.textContent = `${zoneResults.length}/${zoneConfig.count}`;
            counter.style.background = '#f59e0b'; // Orange pour indiquer recherche active
        }
    });

    // Afficher les indicateurs de recherche active
    ZONES_CONFIG.forEach(zone => {
        const indicator = document.getElementById(`search-indicator-${zone.name}`);
        if (indicator) {
            indicator.style.display = 'block';
        }
    });
}

/* Effacer le champ de recherche */
function clearSearch() {
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.value = '';
    }
    
    SEARCH_RESULTS = [];
    SEARCH_RESULTS_MARKED = false;
    hideMarkButtons();
    
    // Restaurer les compteurs normaux
    ZONES_CONFIG.forEach(zone => {
        const counter = document.getElementById(`counter-${zone.name}`);
        if (counter) {
            counter.style.background = '';
        }
    });

    // Masquer les indicateurs de recherche
    ZONES_CONFIG.forEach(zone => {
        const indicator = document.getElementById(`search-indicator-${zone.name}`);
        if (indicator) {
            indicator.style.display = 'none';
        }
    });
    
    renderAllTables();
    switchTab(ZONES_CONFIG[0].name);
}

// ===================== MODAL CASIER ========================

// Générer dynamiquement la liste des zones (sur la base de config.env)
function populateZoneSelect() {
    const zoneSelect = document.getElementById('zone');
    if (!zoneSelect) return;
    
    zoneSelect.innerHTML = ZONES_CONFIG.map(zone => 
        `<option value="${zone.name}">${zone.name}</option>`
    ).join('');
}

// Générer la liste déroulante des casiers (avec état libre/occupé) dans le modal
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

// --- Attribuer nouveau casier
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
    document.getElementById('stup').checked = false;
    document.getElementById('idel').checked = false;
    document.getElementById('statusMessage').innerHTML = '';
    
    populateLockerSelect(zone);
    
    const zoneSelect = document.getElementById('zone');
    zoneSelect.onchange = function() {
        populateLockerSelect(this.value);
    };
    
    document.getElementById('modal').classList.add('active');
}

// --- Editer casier existant
function openModalEdit(lockerNumber) {
    if (!isEditAllowed()) return;
    
    const locker = DATA.find(l => l.number === lockerNumber);
    if (!locker) return;
    
    //Mémoriser le numéro original
    EDITING_LOCKER_NUMBER = lockerNumber;
    EDITING_LOCKER_VERSION = locker.version || 0;

    populateZoneSelect();

    document.getElementById('zone').value = locker.zone;
    document.getElementById('modalTitle').textContent = `Modifier ${locker.number}`;
    document.getElementById('lockerNumber').value = lockerNumber;
    document.getElementById('lastName').value = locker.name;
    document.getElementById('firstName').value = locker.firstName;
    document.getElementById('code').value = locker.code;
    document.getElementById('birthDate').value = locker.birthDate;
    document.getElementById('comment').value = locker.comment || '';
    document.getElementById('recoverable').checked = locker.recoverable || false;
    document.getElementById('stup').checked = locker.stup || false;
    document.getElementById('idel').checked = locker.stup || false;
    document.getElementById('statusMessage').innerHTML = '';
    
    populateLockerSelect(locker.zone, lockerNumber);
    
    const zoneSelect = document.getElementById('zone');
    zoneSelect.onchange = function() {
        populateLockerSelect(this.value, lockerNumber);
    };
    
    document.getElementById('modal').classList.add('active');
}

// --- Fermeture du modal (utilisé par handleFormSubmit)
function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// --- Soumission du formulaire
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
        const stup = document.getElementById('stup').checked;
        const idel = document.getElementById('idel').checked;

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
                    
                    await saveLocker(newLockerNumber, zone, recoverable, comment, stup, idel);
                    
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
                        await saveLocker(newLockerNumber, zone, recoverable, comment, stup, idel);
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
                await saveLocker(newLockerNumber, zone, recoverable, comment, stup, idel);
                closeModal();
                loadData();
                
                // Vérifier si l'IPP était valide
                const result = await fetch(`${API_URL}/lockers/${newLockerNumber}`, {
                    credentials: 'include'
                });
                const data = await result.json();
                
                if (data.ippValid === false) {
                    showStatus('⚠️ Casier enregistré mais N°IPP non trouvé dans la base patients (marqué récupérable)', 'error');
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

// --- Libérer un casier (bouton action)
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

// --- Enregistrer un casier
async function saveLocker(lockerNumber, zone, recoverable, comment, stup, idel) {

    const bodyData = {
        number: lockerNumber,
        zone: zone,
        name: document.getElementById('lastName').value,
        firstName: document.getElementById('firstName').value,
        code: document.getElementById('code').value,
        birthDate: document.getElementById('birthDate').value,
        comment: comment,
        recoverable: recoverable,
        stup: stup,
        idel: idel
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

// --- Libérer un casier sans message (utilisé lors d'un transfert)
async function releaseLockerSilent(lockerNumber, reason = 'TRANSFERT') {
    const response = await fetch(`${API_URL}/lockers/${lockerNumber}?reason=${reason}`, {  
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

// Message affiché en haut de modal pour réussite ou échec
function showStatus(msg, type) {
    const el = document.getElementById('statusMessage');
    el.className = 'status-message status-' + type;
    el.textContent = msg;
    setTimeout(() => {
        el.innerHTML = '';
    }, 3000);
}

// ======================== EXPORT ==================================

// ============ MODAL EXPORT UNIFIÉ ============

// Fonction utilitaire
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

// Modal Export Casiers
function showLockersExportOptions() {
    if (!isEditAllowed()) return;
    
    // Réinitialiser les valeurs
    selectedExportFormat = 'csv';
    selectedExportSeparator = ';';
    selectedExportIncludeEmpty = false;
    
    document.getElementById('exportFormat').value = 'csv';
    document.getElementById('exportSeparator').value = ';';
    document.getElementById('exportIncludeEmpty').checked = false;
    
    // Afficher/masquer le sélecteur de séparateur selon le format
    updateExportSeparatorVisibility();
    
    // Gestionnaires d'événements
    const formatSelect = document.getElementById('exportFormat');
    formatSelect.onchange = function() {
        selectedExportFormat = this.value;
        updateExportSeparatorVisibility();
    };
    
    const separatorSelect = document.getElementById('exportSeparator');
    separatorSelect.onchange = function() {
        selectedExportSeparator = this.value;
    };
    
    const includeEmptyCheckbox = document.getElementById('exportIncludeEmpty');
    includeEmptyCheckbox.onchange = function() {
        selectedExportIncludeEmpty = this.checked;
    };
    
    // Ouvrir le modal
    document.getElementById('exportOptionsModal').classList.add('active');
}

// Close modal Export Casiers
function closeExportOptions() {
    document.getElementById('exportOptionsModal').classList.remove('active');
}

// Afficher (CSV) ou masquer (JSON) le champ séparateur
function updateExportSeparatorVisibility() {
    const separatorGroup = document.getElementById('exportSeparatorGroup');
    if (separatorGroup) {
        separatorGroup.style.display = selectedExportFormat === 'csv' ? 'block' : 'none';
    }
}

// Gestionnaire de soumission du formulaire d'export unifié
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('exportOptionsForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            
            // LOADING STATE
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Export...';
            submitBtn.classList.add('btn-loading');
            
            try {
                const res = await fetch(`${API_URL}/export`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': CSRF_TOKEN
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        format: selectedExportFormat,
                        separator: selectedExportSeparator,
                        includeEmpty: selectedExportIncludeEmpty
                    })
                });
                
                if (!res.ok) {
                    handleCsrfError(res);
                    const error = await res.json();
                    throw new Error(error.error || 'Erreur serveur');
                }
                
                const data = await res.json();
                
                // Télécharger le fichier
                downloadFile(data.content, data.filename, data.mimeType);
                
                // Fermer le modal
                closeExportOptions();
                
                // Message de succès
                showStatus(`✓ ${data.recordCount} casier${data.recordCount > 1 ? 's' : ''} exporté${data.recordCount > 1 ? 's' : ''}`, 'success');
                
            } catch (err) {
                console.error('Erreur export:', err);
                alert('❌ Erreur lors de l\'export : ' + err.message);
            } finally {
                // RESET STATE
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
                submitBtn.classList.remove('btn-loading');
            }
        });
    }
});

// ============ MODAL IMPORT CASIERS UNIFIÉ ============

let selectedLockersImportFormat = 'csv';
let selectedLockersImportMode = 'update';
let selectedLockersImportSeparator = 'auto';

// Modal de sélection de fichiers casiers à importer
async function showLockersImportOptions() {
    if (!isEditAllowed()) return;
    
    // Réinitialiser les valeurs
    selectedLockersImportFormat = 'csv';
    selectedLockersImportMode = 'update';
    selectedLockersImportSeparator = 'auto';
    
    document.getElementById('lockersImportFormat').value = 'csv';
    document.getElementById('lockersImportMode').value = 'update';
    document.getElementById('lockersImportSeparator').value = 'auto';
    document.getElementById('lockersImportWarning').style.display = 'none';
    
    // Afficher/masquer le sélecteur de séparateur selon le format
    updateSeparatorVisibility();
    
    // Gérer l'affichage du warning
    const modeSelect = document.getElementById('lockersImportMode');
    const warning = document.getElementById('lockersImportWarning');
    
    modeSelect.onchange = function() {
        selectedLockersImportMode = this.value;
        if (this.value === 'replace') {
            warning.style.display = 'block';
        } else {
            warning.style.display = 'none';
        }
    };
    
    const formatSelect = document.getElementById('lockersImportFormat');
    formatSelect.onchange = function() {
        selectedLockersImportFormat = this.value;
        updateSeparatorVisibility();
    };
    
    // Gestionnaire pour le séparateur
    const separatorSelect = document.getElementById('lockersImportSeparator');
    if (separatorSelect) {
        separatorSelect.onchange = function() {
            selectedLockersImportSeparator = this.value;
        };
    }
    
    // Ouvrir le modal
    document.getElementById('lockersImportOptionsModal').classList.add('active');
}

// Afficher (CSV) ou masquer (JSON) le champ séparateur
function updateSeparatorVisibility() {
    const separatorGroup = document.getElementById('lockersImportSeparatorGroup');
    if (separatorGroup) {
        separatorGroup.style.display = selectedLockersImportFormat === 'csv' ? 'block' : 'none';
    }
}

// Close modal Import Casiers
function closeLockersImportOptions() {
    document.getElementById('lockersImportOptionsModal').classList.remove('active');
}

function selectFileForLockersImport() {
    closeLockersImportOptions();
    
    const fileInput = document.getElementById('lockersFileInput');
    fileInput.value = '';
    fileInput.accept = selectedLockersImportFormat === 'csv' ? '.csv' : '.json';
    fileInput.onchange = handleLockersFileSelected;
    fileInput.click();
}

// Fonction d'analyse des fichiers casiers à importer 
function analyzeLockersFile(content, format, separator) {
    try {
        if (format === 'json') {
            const jsonData = JSON.parse(content);
            const data = jsonData.lockers || jsonData;
            
            if (!Array.isArray(data)) {
                return { valid: false, error: 'Format JSON invalide : doit contenir un tableau de casiers' };
            }
            
            // Vérifier les champs obligatoires
            const requiredFields = ['number', 'zone'];
            const sampleLocker = data[0] || {};
            const missingFields = requiredFields.filter(f => !(f in sampleLocker));
            
            if (missingFields.length > 0) {
                return { 
                    valid: false, 
                    error: `Champs manquants : ${missingFields.join(', ')}` 
                };
            }
            
            return {
                valid: true,
                format: 'JSON',
                totalRows: data.length,
                occupiedRows: data.filter(l => l.name && l.firstName).length,
                columns: Object.keys(sampleLocker),
                metadata: jsonData.metadata || null,
                sample: data.slice(0, 3)
            };
            
        } else {
            // CSV
            const lines = content.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                return { valid: false, error: 'Fichier CSV vide ou invalide (moins de 2 lignes)' };
            }
            
            // Détecter séparateur
            const usedSeparator = separator === 'auto' 
                ? detectCSVSeparator(content) 
                : separator;
            
            const headers = parseCsvLine(lines[0], usedSeparator);
            const dataLines = lines.slice(1);
            
            // Vérifier nombre de colonnes
            const expectedColumns = 13; // number, zone, name, firstName, code, birthDate, recoverable, marque, hosp, hospDate, stup, idel, comment
            
            if (headers.length < 6) {
                return { 
                    valid: false, 
                    error: `Nombre de colonnes insuffisant : ${headers.length} trouvées, au moins 6 requises\nColonnes détectées : ${headers.join(', ')}` 
                };
            }
            
            // Parser quelques lignes pour vérifier
            const sampleData = dataLines.slice(0, 3).map(line => {
                const values = parseCsvLine(line, usedSeparator);
                return {
                    number: values[0],
                    zone: values[1],
                    name: values[2],
                    firstName: values[3],
                    columnCount: values.length
                };
            });
            
            const occupiedCount = dataLines.filter(line => {
                const values = parseCsvLine(line, usedSeparator);
                return values[2] && values[3]; // name et firstName
            }).length;
            
            return {
                valid: true,
                format: 'CSV',
                separator: usedSeparator === '\t' ? 'TAB' : usedSeparator,
                totalRows: dataLines.length,
                occupiedRows: occupiedCount,
                emptyRows: dataLines.length - occupiedCount,
                columns: headers,
                columnCount: headers.length,
                expectedColumnCount: expectedColumns,
                columnsMatch: headers.length >= expectedColumns,
                sample: sampleData
            };
        }
    } catch (err) {
        return { 
            valid: false, 
            error: `Erreur parsing : ${err.message}` 
        };
    }
}

// Modal d'analyse de fichier à importer
async function handleLockersFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!isEditAllowed()) return;

    try {
        const text = await file.text();
        
        // Analyser le fichier
        const analysis = analyzeLockersFile(text, selectedLockersImportFormat, selectedLockersImportSeparator);
        
        if (!analysis.valid) {
            alert(`❌ Fichier invalide\n\n${analysis.error}`);
            return;
        }
        
        // Afficher popup de confirmation avec analyse
        const confirmImport = await showImportConfirmation(file.name, analysis);
        
        if (!confirmImport) {
            return;
        }
        
        // Procéder à l'import
        await performLockersImport(text, file.name);
        
    } catch (err) {
        console.error('Erreur lecture fichier:', err);
        alert('❌ Erreur lecture fichier : ' + err.message);
    }
}

// Parser une ligne CSV avec séparateur personnalisé et échappement des guillemets (copie de server.js)
function parseCsvLine(line, separator = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"'; // Guillemet échappé
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === separator && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result.map(v => v.replace(/^"|"$/g, ''));
}

// // Fonction de détection automatique du séparateur CSV (copie de server.js)
function detectCSVSeparator(fileContent) {
    const lines = fileContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return ',';

    const firstLine = lines[0];
    const secondLine = lines[1];

    const separators = [';', ',', '\t', '|'];
    const scores = {};

    for (const sep of separators) {
      try {
        // Utiliser parseCsvLine si disponible pour compter les colonnes
        const cols1 = parseCsvLine(firstLine, sep).length;
        const cols2 = parseCsvLine(secondLine, sep).length;
        scores[sep] = (cols1 + cols2);
      } catch (e) {
        scores[sep] = 0;
      }
    }

    // Choisir le séparateur avec le meilleur score; fallback ','
    let bestSep = ',';
    let bestScore = -1;
    for (const [sep, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestSep = sep;
      }
    }

    console.log('detectCSVSeparator → choisi:', bestSep, 'scores:', scores);
    return bestSep || ',';
}

// Fonction de confirmation avec popup
async function showImportConfirmation(filename, analysis) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '10000';
    
    let detailsHTML = '';
    
    if (analysis.format === 'JSON') {
        detailsHTML = `
            <div class="analysis-details">
                <div class="detail-row">
                    <span class="label">Format :</span>
                    <span class="value">JSON</span>
                </div>
                <div class="detail-row">
                    <span class="label">Casiers totaux :</span>
                    <span class="value">${analysis.totalRows}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Casiers occupés :</span>
                    <span class="value">${analysis.occupiedRows}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Champs détectés :</span>
                    <span class="value">${analysis.columns.length} (${analysis.columns.join(', ')})</span>
                </div>
                ${analysis.metadata ? `
                    <div class="detail-row">
                        <span class="label">Métadonnées :</span>
                        <span class="value">Exporté le ${new Date(analysis.metadata.exportDate).toLocaleString('fr-FR')} par ${analysis.metadata.exportBy}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="sample-section">
                <strong>Aperçu (3 premiers casiers) :</strong>
                <div style="font-family: monospace; font-size: 11px; background: var(--bg-secondary); padding: 10px; border-radius: 4px; margin-top: 8px; max-height: 150px; overflow-y: auto;">
                    ${analysis.sample.map(l => `${l.number} - ${l.zone} - ${l.name || '(vide)'} ${l.firstName || ''}`).join('<br>')}
                </div>
            </div>
        `;
    } else {
        // CSV
        const warningIcon = !analysis.columnsMatch ? '⚠️' : '✓';
        const warningColor = !analysis.columnsMatch ? '#f59e0b' : '#10b981';
        
        detailsHTML = `
            <div class="analysis-details">
                <div class="detail-row">
                    <span class="label">Format :</span>
                    <span class="value">CSV</span>
                </div>
                <div class="detail-row">
                    <span class="label">Séparateur :</span>
                    <span class="value">${analysis.separator}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Lignes totales :</span>
                    <span class="value">${analysis.totalRows}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Casiers occupés :</span>
                    <span class="value">${analysis.occupiedRows}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Casiers vides :</span>
                    <span class="value">${analysis.emptyRows}</span>
                </div>
                <div class="detail-row" style="border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 8px;">
                    <span class="label">Colonnes détectées :</span>
                    <span class="value" style="color: ${warningColor};">${warningIcon} ${analysis.columnCount} / ${analysis.expectedColumnCount} attendues</span>
                </div>
            </div>
            
            ${!analysis.columnsMatch ? `
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin: 16px 0;">
                    <strong style="color: #92400e;">⚠️ Avertissement :</strong>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #78350f;">
                        Le fichier contient ${analysis.columnCount} colonne(s), ${analysis.expectedColumnCount} attendues.<br>
                        Colonnes manquantes potentielles : IDEL, Commentaire, etc.<br>
                        L'import peut échouer ou être incomplet.
                    </p>
                </div>
            ` : ''}
            
            <div class="sample-section">
                <strong>En-têtes détectés :</strong>
                <div style="font-family: monospace; font-size: 11px; background: var(--bg-secondary); padding: 10px; border-radius: 4px; margin-top: 8px;">
                    ${analysis.columns.map((col, i) => `${i+1}. ${col}`).join('; ')}
                </div>
            </div>
            
            <div class="sample-section">
                <strong>Aperçu (3 premières lignes) :</strong>
                <div style="font-family: monospace; font-size: 11px; background: var(--bg-secondary); padding: 10px; border-radius: 4px; margin-top: 8px; max-height: 120px; overflow-y: auto;">
                    ${analysis.sample.map(l => `${l.number || '?'} | ${l.zone || '?'} | ${l.name || '(vide)'} ${l.firstName || ''} | ${l.columnCount} col.`).join('<br>')}
                </div>
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">📋 Analyse du fichier</div>
            
            <div style="padding: 20px;">
                <div style="background: #e0f2fe; border: 1px solid #0ea5e9; border-radius: 6px; padding: 12px; margin-bottom: 20px;">
                    <strong style="color: #0c4a6e;">📁 ${filename}</strong>
                </div>
                
                ${detailsHTML}
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                    <strong>Mode d'import sélectionné :</strong>
                    <p style="margin: 8px 0; font-size: 14px; color: var(--text-secondary);">
                        ${selectedLockersImportMode === 'replace' 
                            ? '🗑️ Remplacement complet (vide tous les casiers puis importe)' 
                            : '📝 Mise à jour (remplace uniquement les casiers du fichier)'}
                    </p>
                </div>
                
                <div class="modal-footer" style="margin-top: 24px;">
                    <button class="btn-secondary" id="btnCancelImport">Annuler</button>
                    <button class="btn-primary" id="btnConfirmImport">✓ Importer</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    return new Promise((resolve) => {
        document.getElementById('btnConfirmImport').onclick = () => {
            document.body.removeChild(modal);
            resolve(true);
        };
        document.getElementById('btnCancelImport').onclick = () => {
            document.body.removeChild(modal);
            resolve(false);
        };
    });
}

// Réaliser l'import en base
async function performLockersImport(content, filename) {
    const importBtn = Array.from(document.querySelectorAll('.admin-tools-content button'))
        .find(btn => btn.textContent.includes('Import casiers'));
    const originalText = importBtn ? importBtn.innerHTML : '';
    
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = '⏳ Import...';
        importBtn.classList.add('btn-loading');
    }
    
    try {

        const routeImport = `${API_URL}/import`; // Claude
        //const routeImport = `${API_URL}/lockers/import`; // version GEMINI

        const res = await fetch(routeImport, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include',
            body: JSON.stringify({ 
                rawContent: content,
                mode: selectedLockersImportMode,
                separator: selectedLockersImportSeparator
            })
        });

        if (!res.ok) {
            handleCsrfError(res);
            const error = await res.json();
            throw new Error(error.error || 'Erreur serveur XXX');
        } else {
            const result = await res.json();
            
            let message = `✅ Import terminé !\n\n`;
            message += `✓ Importés : ${result.imported}\n`;
            if (result.skipped > 0) {
                message += `⭐ Ignorés : ${result.skipped}\n`;
            }
            if (result.invalidIPP > 0) {
                message += `⚠️ IPP inconnus : ${result.invalidIPP} (marqués récupérables)\n`;
            }
            if (result.errors > 0) {
                message += `✗ Erreurs : ${result.errors}\n`;
            }
            if (result.validationErrors > 0) {
                message += `⚠️ Validation échouée : ${result.validationErrors}\n`;
            }

            // GEMINI: Affichage des erreurs détaillées
            if (result.detailedErrors && result.detailedErrors.length > 0) {
                message += `\n--- Détail des erreurs de validation (${result.validationErrors} lignes) ---\n`;
                // Limiter l'affichage pour éviter un trop long message d'alerte
                const errorsToShow = result.detailedErrors.slice(0, 10);
                errorsToShow.forEach(err => {
                    message += `Ligne ${err.line} (Casier ${err.casier}) : ${err.error}\n`;
                });
                if (result.detailedErrors.length > 10) {
                     message += `\n... et ${result.detailedErrors.length - 10} autres erreurs non affichées.`;
                }
                message += `\n---------------------------------------------\n`;
                message += `\nVeuillez corriger le fichier source et réessayer.`;
            }

            message += `\nTotal des lignes traitées : ${result.total}`;
            
            alert(message);
            loadData();
            closeLockersImportOptions();
        }
        
    } catch (err) {
        alert('❌ Erreur import : ' + err.message);
        console.error('Erreur import casiers:', err);
    } finally {
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = originalText;
            importBtn.classList.remove('btn-loading');
        }
    }
}

// Vider la table lockers dans la base de données
async function clearLockersDatabase() {
    const confirmFirst = confirm(
        '⚠️ ATTENTION - LIBÉRATION DE TOUS LES CASIERS\n\n' +
        'Vous allez libérer TOUS les casiers de TOUTES les zones.\n\n' +
        'Cette action est IRRÉVERSIBLE.\n\n' +
        'Voulez-vous continuer ?'
    );
    
    if (!confirmFirst) return;
    
    const confirmSecond = confirm(
        '⚠️ DERNIÈRE CONFIRMATION\n\n' +
        'Êtes-vous ABSOLUMENT CERTAIN de vouloir libérer tous les casiers ?\n\n' +
        'Tapez OK pour confirmer.'
    );
    
    if (!confirmSecond) return;
    
    try {
        const res = await fetch(`${API_URL}/lockers/clear`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include'
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Erreur serveur');
        }
        
        const data = await res.json();
        
        alert(`✓ Tous les casiers ont été libérés\n\n${data.cleared} casier(s) libéré(s)`);
        
        // Recharger les données
        loadData();
        
        // Fermer le modal
        closeLockersImportOptions();
        
    } catch (err) {
        console.error('Erreur libération casiers:', err);
        alert('❌ Erreur : ' + err.message);
    }
}

// ============ MARQUAGE/DÉMARQUAGE GROUPÉ DES RÉSULTATS ============

async function toggleMarkSearchResults() {
    if (!isEditAllowed()) return;
    
    if (SEARCH_RESULTS.length === 0) {
        alert('Aucun résultat de recherche');
        return;
    }
    
    const lockerNumbers = SEARCH_RESULTS.map(l => l.number);
    const willMark = !SEARCH_RESULTS_MARKED;
    
    const action = willMark ? 'marquer' : 'démarquer';
    const icon = willMark ? '🔖' : '🗑️';
    
    const confirmMsg = `${icon} ${action.toUpperCase()}\n\n` +
        `Vous allez ${action} ${lockerNumbers.length} casier${lockerNumbers.length > 1 ? 's' : ''} ` +
        `trouvé${lockerNumbers.length > 1 ? 's' : ''} par la recherche.\n\n` +
        `Voulez-vous continuer ?`;
    
    if (!confirm(confirmMsg)) return;
    
    const btn = document.getElementById('btnToggleMarkResults');
    const originalText = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳';
        btn.classList.add('btn-loading');
    }
    
    try {
        const res = await fetch(`${API_URL}/lockers/bulk-mark`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include',
            body: JSON.stringify({
                lockerNumbers: lockerNumbers,
                mark: willMark
            })
        });
        
        if (!res.ok) {
            handleCsrfError(res);
            const error = await res.json();
            throw new Error(error.error || 'Erreur serveur');
        }
        
        const data = await res.json();
        
        const successIcon = willMark ? '🔖' : '✓';
        const actionText = willMark ? 'marqué' : 'démarqué';
        showStatus(`${successIcon} ${data.updated} casier${data.updated > 1 ? 's' : ''} ${actionText}${data.updated > 1 ? 's' : ''}`, 'success');
        
        // Mettre à jour l'état
        SEARCH_RESULTS_MARKED = willMark;
        
        // Mettre à jour l'apparence du bouton
        if (btn) {
            if (willMark) {
                btn.classList.add('active');
                btn.title = 'Démarquer les casiers trouvés';
            } else {
                btn.classList.remove('active');
                btn.title = 'Marquer les casiers trouvés';
            }
        }
        
        // Recharger les données
        await loadData();
        
        // Relancer la recherche pour mettre à jour SEARCH_RESULTS avec les nouvelles valeurs de marque
        const searchInput = document.getElementById('globalSearch');
        if (searchInput && searchInput.value.trim()) {
            searchLockers(searchInput.value.trim());
        }
        
    } catch (err) {
        console.error('Erreur toggle marquage:', err);
        showStatus('❌ Erreur : ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.classList.remove('btn-loading');
        }
    }
}

async function clearAllMarks() {
    if (!isEditAllowed()) return;
    
    // Compter les marques actuelles
    const markedCount = DATA.filter(l => l.marque).length;
    
    if (markedCount === 0) {
        alert('✓ Aucun casier marqué actuellement');
        return;
    }
    
    const confirmFirst = confirm(
        `⚠️ ATTENTION - SUPPRESSION DE TOUTES LES MARQUES\n\n` +
        `Vous allez retirer les marques de ${markedCount} casier${markedCount > 1 ? 's' : ''}.\n\n` +
        `Cette action est IRRÉVERSIBLE.\n\n` +
        `Voulez-vous continuer ?`
    );
    
    if (!confirmFirst) return;
    
    // Trouver le bouton
    const clearBtn = Array.from(document.querySelectorAll('.admin-tools-content button'))
        .find(btn => btn.textContent.includes('Effacer marques'));
    const originalText = clearBtn ? clearBtn.innerHTML : '';
    
    // LOADING STATE
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.innerHTML = '⏳ Suppression...';
        clearBtn.classList.add('btn-loading');
    }
    
    try {
        const res = await fetch(`${API_URL}/lockers/clear-marks`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include'
        });
        
        if (!res.ok) {
            handleCsrfError(res);
            const error = await res.json();
            throw new Error(error.error || 'Erreur serveur');
        }
        
        const data = await res.json();
        
        alert(`✓ Toutes les marques ont été retirées\n\n${data.cleared} casier${data.cleared > 1 ? 's' : ''} modifié${data.cleared > 1 ? 's' : ''}`);
        
        // Recharger les données
        loadData();
        
    } catch (err) {
        console.error('Erreur suppression marques:', err);
        alert('❌ Erreur : ' + err.message);
    } finally {
        // RESET STATE
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.innerHTML = originalText;
            clearBtn.classList.remove('btn-loading');
        }
    }
}

function showMarkButtons() {
    const btn = document.getElementById('btnToggleMarkResults');
    if (btn) {
        btn.style.display = 'inline-block';
        // Vérifier si les résultats actuels sont marqués
        checkIfResultsMarked();
    }
}

function hideMarkButtons() {
    const btn = document.getElementById('btnToggleMarkResults');
    if (btn) {
        btn.style.display = 'none';
        btn.classList.remove('active');
    }
    SEARCH_RESULTS_MARKED = false;
}

function checkIfResultsMarked() {
    if (SEARCH_RESULTS.length === 0) return;
    
    // Vérifier si tous les résultats sont marqués
    const allMarked = SEARCH_RESULTS.every(l => l.marque);
    
    const btn = document.getElementById('btnToggleMarkResults');
    if (btn) {
        if (allMarked) {
            btn.classList.add('active');
            btn.title = 'Démarquer les casiers trouvés';
            SEARCH_RESULTS_MARKED = true;
        } else {
            btn.classList.remove('active');
            btn.title = 'Marquer les casiers trouvés';
            SEARCH_RESULTS_MARKED = false;
        }
    }
}

// ============ MODAL IMPORT CLIENTS ============

// Variables globales pour l'import
let selectedImportFormat = null;
let selectedImportMode = 'replace';

// --- Modal d'import
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
        const defaultFormat = config.clientImportFormat || 'BASIQUE';
        const formats = config.availableFormats || ['BASIQUE'];
        
        // Ajouter le format par défaut en premier
        const defaultOption = document.createElement('option');
        defaultOption.value = defaultFormat;
        defaultOption.textContent = `${defaultFormat} (source à privilégier)`;
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
        selectedImportSeparator = 'auto';
        document.getElementById('importMode').value = 'replace';
        document.getElementById('importSeparator').value = 'auto';

        // Gestionnaires d'événements: Gérer l'affichage du warning
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
        
        // Gestionnaire pour le séparateur
        const separatorSelect = document.getElementById('importSeparator');
        separatorSelect.onchange = function() {
            selectedImportSeparator = this.value;
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

// --- Fermer le modal
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
        if (VERBCONSOLE>0) { 
            console.log('📂 Lecture du fichier patients...');
            console.log('Format sélectionné:', selectedImportFormat);
            console.log('Mode sélectionné:', selectedImportMode);
            console.log('Séparateur sélectionné:', selectedImportSeparator);
        }
        
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
                mode: selectedImportMode,
                separator: selectedImportSeparator
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

// --- Vider la base patients
async function clearClientsDatabase() {
    const confirmFirst = confirm(
        '⚠️ ATTENTION - SUPPRESSION DÉFINITIVE\n\n' +
        'Vous allez supprimer TOUS les patients de la base de données.\n\n' +
        'Cette action est IRRÉVERSIBLE.\n\n' +
        'Voulez-vous continuer ?'
    );
    
    if (!confirmFirst) return;
    
/*    // Double confirmation
    const confirmSecond = confirm(
        '⚠️ DERNIÈRE CONFIRMATION\n\n' +
        'Êtes-vous ABSOLUMENT CERTAIN de vouloir vider la base patients ?\n\n' +
        'Tous les patients seront supprimés définitivement.\n\n' +
        'Tapez OK pour confirmer.'
    );
    
    if (!confirmSecond) return;*/
    
    try {
        const res = await fetch(`${API_URL}/clients/clear`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include'
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Erreur serveur');
        }
        
        const data = await res.json();
        
        alert(`✓ Base patients vidée avec succès\n\n${data.deleted} client(s) supprimé(s)`);
        
        closeImportOptions(); // Fermer le modal

        // Mettre à jour le statut immédiatement
        await updateImportStatus();
        
    } catch (err) {
        console.error('Erreur suppression clients:', err);
        alert('❌ Erreur : ' + err.message);
    }
}

// --- Bouton recherche patients si le champ IPP est renseigné
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

// Imprimer le tableau affiché dans l'onglet. TODO: CSS à revoir
function printTable() {
    window.print();
}

// TODO plus appelée? remplacée par event listener ci dessous?
function toggleDropdown(e) {
    e.stopPropagation();
    const menu = e.target.nextElementSibling;
    document.querySelectorAll('.dropdown-menu.active').forEach(m => {
        if (m !== menu) m.classList.remove('active');
    });
    menu.classList.toggle('active');
}

// --- Gestion du menu dropdown Actions
document.addEventListener('click', function() {
    document.querySelectorAll('.dropdown-menu.active').forEach(m => m.classList.remove('active'));
});

// ================== MODAL STATS PATIENTS =========================

// Modal affichant quelques stats sur la base patients
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

// Générer le modal
function renderClientsStats(data) {
    const content = document.getElementById('clientsStatsContent');
    
    // Formater la date du dernier import
    let lastImportInfo = 'Aucun import';
    if (data.lastImport) {
        const importDate = new Date(data.lastImport.importDate);
        console.log(data.lastImport.importDate, 'Date import', importDate, 'Now:', Date.now())
        const daysSince = Math.floor((Date.now() - importDate) / (1000 * 60 * 60 * 24));
        lastImportInfo = `${importDate} (il y a ${daysSince} jour${daysSince > 1 ? 's' : ''})`;
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

// Fermer le modal (bouton croix)
function closeClientsStats() {
    document.getElementById('clientsStatsPanel').classList.remove('active');
}

// ============ MODAL CONSULTATION MULTIZONES DES CASIERS  ============

// Ouvrir le modal de consultation
function openConsultationCasiers(filterType = 'idel') {
    const modal = document.getElementById('consultationCasiersModal');
    
    // Remplir le sélecteur de zones dynamiquement
    const zoneSelect = document.getElementById('consultationZone');
    zoneSelect.innerHTML = '<option value="all">Toutes les zones</option>';
    ZONES_CONFIG.forEach(zone => {
        const option = document.createElement('option');
        option.value = zone.name;
        option.textContent = zone.name;
        zoneSelect.appendChild(option);
    });
    
    // Définir le filtre par défaut
    document.getElementById('consultationFilter').value = filterType;
    document.getElementById('consultationZone').value = 'all';
    
    // Réinitialiser le tri
    consultationSortColumn = 'name';
    consultationSortDirection = 'asc';
    
    // Charger les données
    updateConsultationTable();
    
    // Afficher le modal
    modal.classList.add('active');
}

// Fermer le modal
function closeConsultationCasiers() {
    document.getElementById('consultationCasiersModal').classList.remove('active');
    consultationData = [];
}

// Mettre à jour la table selon les filtres
function updateConsultationTable() {
    const filterType = document.getElementById('consultationFilter').value;
    const zone = document.getElementById('consultationZone').value;
    
    // Filtrer les données
    let filtered = DATA.filter(l => l.occupied);
    
    // Appliquer le filtre de type
    switch(filterType) {
        case 'idel':
            filtered = filtered.filter(l => l.idel);
            break;
        case 'had':
            filtered = filtered.filter(l => !l.idel);
            break;
        case 'hosp':
            filtered = filtered.filter(l => l.hosp);
            break;
        case 'stup':
            filtered = filtered.filter(l => l.stup);
            break;
        case 'frigo':
            filtered = filtered.filter(l => l.frigo);
            break;
        case 'meopa':
            filtered = filtered.filter(l => l.meopa);
            break;
        case 'marked':
            filtered = filtered.filter(l => l.marque);
            break;
        case 'duplicates':
            const duplicateInfo = detectDuplicates();
            filtered = filtered.filter(l => duplicateInfo.duplicates.has(l.number));
            break;
        case 'homonyms':
            const homonymInfo = detectHomonyms();
            filtered = filtered.filter(l => homonymInfo.homonyms.has(l.number));
            break;
    }
    
    // Appliquer le filtre de zone
    if (zone !== 'all') {
        filtered = filtered.filter(l => l.zone === zone);
    }
    consultationData = filtered;

    sortConsultationData(); // Appliquer le tri actuel
    renderConsultationTable(); // Mettre à jour l'affichage
}

// Trier les données
function sortConsultationTable(column) {
    if (consultationSortColumn === column) {
        // Inverser la direction si même colonne
        consultationSortDirection = consultationSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // Nouvelle colonne, tri ascendant par défaut
        consultationSortColumn = column;
        consultationSortDirection = 'asc';
    }
    
    sortConsultationData();
    renderConsultationTable();
}

// Fonction de tri des données
function sortConsultationData() {
    consultationData.sort((a, b) => {
        let valA = a[consultationSortColumn] || '';
        let valB = b[consultationSortColumn] || '';
        
        // Pour les dates, convertir en timestamp
        if (consultationSortColumn === 'birthDate') {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        
        if (consultationSortDirection === 'asc') {
            return valA > valB ? 1 : valA < valB ? -1 : 0;
        } else {
            return valA < valB ? 1 : valA > valB ? -1 : 0;
        }
    });
}

// Afficher la table
function renderConsultationTable() {
    const tbody = document.getElementById('consultationTableBody');
    const countEl = document.getElementById('consultationCount');
    
    // Mettre à jour le compteur
    countEl.textContent = `${consultationData.length} patient${consultationData.length > 1 ? 's' : ''}`;
    
    if (consultationData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    Aucun patient trouvé avec ces critères
                </td>
            </tr>
        `;
        return;
    }
    
    // Générer les lignes
    tbody.innerHTML = consultationData.map(locker => {
        const name = anonymizeName(locker.name);
        const firstName = anonymizeFirstName(locker.firstName);
        const birthDate = locker.birthDate ? formatDate(locker.birthDate) : '—';
        const comment = locker.comment || '—';
        
        return `
            <tr>
                <td><strong>${name}</strong></td>
                <td>${firstName}</td>
                <td>${birthDate}</td>
                <td>${locker.code}</td>
                <td><strong>${locker.number}</strong> <span style="font-size: 11px; color: var(--text-secondary);">(${locker.zone})</span></td>
                <td style="font-size: 12px; color: var(--text-secondary);">${comment}</td>
            </tr>
        `;
    }).join('');
}

// Exporter consultation en CSV.   TODO: à voir si on garde ou pas. Liste déroulante à adapter
function exportConsultationCSV() {
    if (consultationData.length === 0) {
        alert('Aucune donnée à exporter');
        return;
    }
    
    const filterType = document.getElementById('consultationFilter').value;
    const filterLabels = {
        'idel': 'IDEL-AS',
        'had': 'nonIDEL',
        'hosp': 'Hospi',
        'stup': 'Stupefiants',
        'marked': 'Marques',
        'duplicates': 'Doublons',
        'homonyms': 'Homonymes'
    };
    
    const headers = ['Nom', 'Prenom', 'Date de naissance', 'N°IPP', 'N° Casier', 'Zone', 'Commentaire'];
    const rows = consultationData.map(l => [
        l.name,
        l.firstName,
        l.birthDate || '',
        l.code,
        l.number,
        l.zone,
        l.comment || ''
    ]);
    
    const csv = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');
    
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `consultation_${filterLabels[filterType]}_${timestamp}.csv`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    showStatus(`✓ ${consultationData.length} patients exportés`, 'success');
}

// Imprimer la table de consultation  TODO: à voir si on garde ou pas. Liste déroulante à adapter
function printConsultationTable() {
    // Récupérer les données actuelles du modal
    const filterType = document.getElementById('consultationFilter').value;
    const zone = document.getElementById('consultationZone').value;
    
    const filterLabels = {
        'idel': 'IDEL-AS',
        'had': '100% HAD',
        'hosp': 'Hospitalisations',
        'stup': 'Stupéfiants',
        'marked': 'Marqués',
        'duplicates': 'Doublons',
        'homonyms': 'Homonymes'
    };
    
    const title = `Consultation : ${filterLabels[filterType]}${zone !== 'all' ? ` - Zone ${zone}` : ''}`;
    
    // Créer une fenêtre d'impression
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 15mm;
        }
        
        body {
            font-family: Arial, sans-serif;
            font-size: 11pt;
        }
        
        h1 {
            font-size: 16pt;
            margin-bottom: 10px;
        }
        
        .info {
            font-size: 10pt;
            color: #666;
            margin-bottom: 15px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
        }
        
        th, td {
            border: 1px solid #000;
            padding: 6px 8px;
            text-align: left;
        }
        
        th {
            background: #f0f0f0;
            font-weight: bold;
        }
        
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="info">
        ${consultationData.length} patient${consultationData.length > 1 ? 's' : ''} - 
        Édité le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}
    </div>
    <table>
        <thead>
            <tr>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Date de naissance</th>
                <th>N°IPP</th>
                <th>N° Casier</th>
                <th>Commentaire</th>
            </tr>
        </thead>
        <tbody>
            ${consultationData.map(locker => {
                const name = anonymizeName(locker.name);
                const firstName = anonymizeFirstName(locker.firstName);
                const birthDate = locker.birthDate ? formatDate(locker.birthDate) : '—';
                const comment = locker.comment || '—';
                
                return `
                    <tr>
                        <td><strong>${name}</strong></td>
                        <td>${firstName}</td>
                        <td>${birthDate}</td>
                        <td>${locker.code}</td>
                        <td><strong>${locker.number}</strong> <span style="font-size: 9pt; color: #666;">(${locker.zone})</span></td>
                        <td style="font-size: 9pt;">${comment}</td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    </table>
</body>
</html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Attendre le chargement puis imprimer
    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
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
        const bodyData = {};
        if (selectedBackupFile) {
            bodyData.filename = selectedBackupFile;
        }
        if (uploadedBackupData) {
            bodyData.fileData = uploadedBackupData;
        }
        
        const res = await fetch(`${API_URL}/restore`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include',
            body: JSON.stringify(bodyData)
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

// Fonction qui affiche les stats backup :
async function showBackupInfo() {
    try {
        const res = await fetch(`${API_URL}/config/backup`, {
            credentials: 'include'
        });
        
        if (res.ok) {
            const config = await res.json();
            
            let message = '⏰ Configuration backup automatique\n\n';
            if (config.mode === 'fixed') {
                message += `Mode : Quotidien à heure fixe\n`;
                message += `Heure : ${config.backupTime}\n`;
            } else if (config.mode === 'periodic') {
                message += `Mode : Périodique\n`;
                message += `Fréquence : Toutes les ${config.backupFrequencyHours}h\n`;
            } else {
                message += `Mode : Désactivé\n`;
            }
            message += `\nNombre de backups conservés : ${config.backupRetentionCount}`;
            
            alert(message);
        }
    } catch (err) {
        console.error('Erreur récupération config backup:', err);
    }
}

// ============ MODAL STATS DES CONNEXIONS =====================

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
                const timestamp = new Date(conn.timestamp + 'Z');
                const formattedDateTime = timestamp.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: 'Europe/Paris' // Force le fuseau horaire
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

// ============ MODAL STATS MODIFICATIONS DES CASIERS ============

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
            const timestamp = new Date(mod.timestamp + 'Z');
            const formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Europe/Paris'
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

// ================ MODAL CONFIG ANONYMISATION ================

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

// Gérer la soumission du formulaire d'anonymisation
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

// ============ MARQUES CASIER ============

// Fonction générique pour activer un marqueur (IDEL, Stup, Marque etc.) : remplace les fonctions spécifiques
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
        const response = await fetch(`${API_URL}/lockers/${lockerNumber}/toggle/${marker}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            }
        });

        if (!response.ok) {
            handleCsrfError(response);
            throw new Error('Erreur ' + response.status);
        }

        const updatedLocker = await response.json();
        
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

// ============ STATISTIQUES STUPÉFIANTS ============
// Fonction utilitaire : Compter les stupéfiants. TODO : à intégrer au modal de consultation
function getStupStats() {
    const stupLockers = DATA.filter(l => l.stup);
    const occupied = stupLockers.filter(l => l.occupied);
    
    const byZone = {};
    ZONES_CONFIG.forEach(zone => {
        byZone[zone.name] = stupLockers.filter(l => l.zone === zone.name).length;
    });

    return {
        total: stupLockers.length,
        occupied: occupied.length,
        empty: stupLockers.length - occupied.length,
        byZone: byZone
    };
}

// DEPRECATED Afficher les stats de getStupStats. Stup. TODO: à intégrer au modal de consultation
function showStupStats() {
    const stats = getStupStats();
    
    let message = `📊 STATISTIQUES STUPÉFIANTS\n======================\n\n`;
    message += `Total casiers avec Stupéfiants: ${stats.total}\n`
    message += `\n  • Occupés: ${stats.occupied}`
    message += `\n  • Vides: ${stats.empty}`
    message += `\n\nPar zone:`
    Object.entries(stats.byZone).forEach(([zone, count]) => {
        message += `\n  • ${zone}: ${count}`;
         });   
    message += `\n`

    if (VERBCONSOLE>0) { console.log(message) }
    alert(message);
}


// ============ MODAL HOSPITALISATION ==================

function openHospitalisationModal(lockerNumber) {
    const locker = DATA.find(l => l.number === lockerNumber);
    
    if (!locker) {
        alert('Casier non trouvé');
        return;
    }
    if (!locker.occupied) {
        alert('Ce casier n\'est pas attribué, impossible de lui associer une hospitalisation!');
        return;
    }

    CURRENT_LOCKER_FOR_HOSP = locker;
    
    // Remplir les infos
    const infoDiv = document.getElementById('hospitalisationInfo');
    infoDiv.innerHTML = `
        <div style="font-size: 14px;">
            <strong style="font-size: 16px;">${locker.number} - Zone ${locker.zone}</strong><br>
            ${locker.occupied 
                ? `<span style="color: var(--text-secondary);">
                    ${locker.name} ${locker.firstName}<br>
                    IPP: ${locker.code}
                   </span>`
                : '<span style="color: var(--text-secondary);">Casier vide</span>'
            }
        </div>
    `;
    
    // Pré-remplir le formulaire
    const hospCheckbox = document.getElementById('hospCheckbox');
    const hospDateInput = document.getElementById('hospDateInput');
    const hospDateGroup = document.getElementById('hospDateGroup');
    
    hospCheckbox.checked = locker.hosp ? true : false;
    hospDateInput.value = locker.hospDate || '';
    
    // Afficher/masquer le champ date selon la checkbox
    hospDateGroup.style.display = hospCheckbox.checked ? 'block' : 'none';
    
    // Event listener pour la checkbox
    hospCheckbox.onchange = function() {
        hospDateGroup.style.display = this.checked ? 'block' : 'none';
        if (!this.checked) {
            hospDateInput.value = '';
        }
    };
    
    // Reset status message
    document.getElementById('hospitalisationStatus').innerHTML = '';
    
    // Ouvrir le modal
    document.getElementById('hospitalisationModal').classList.add('active');
}

function closeHospitalisationModal() {
    document.getElementById('hospitalisationModal').classList.remove('active');
    CURRENT_LOCKER_FOR_HOSP = null;
}

// Gérer la soumission du formulaire d'hospitalisation
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('hospitalisationForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!CURRENT_LOCKER_FOR_HOSP) return;
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            const statusEl = document.getElementById('hospitalisationStatus');
            
            // LOADING STATE
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Enregistrement...';
            submitBtn.classList.add('btn-loading');
            
            try {
                const hospCheckbox = document.getElementById('hospCheckbox');
                const hospDateInput = document.getElementById('hospDateInput');
                
                const hosp = hospCheckbox.checked;
                const hospDate = hosp ? hospDateInput.value : '';
                
                const response = await fetch(`${API_URL}/lockers/${CURRENT_LOCKER_FOR_HOSP.number}/hospitalisation`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': CSRF_TOKEN
                    },
                    body: JSON.stringify({ hosp, hospDate })
                });
                
                if (!response.ok) {
                    handleCsrfError(response);
                    const error = await response.json();
                    throw new Error(error.error || 'Erreur ' + response.status);
                }
                
                const updatedLocker = await response.json();
                
                // Mettre à jour DATA
                const index = DATA.findIndex(l => l.number === CURRENT_LOCKER_FOR_HOSP.number);
                if (index !== -1) {
                    DATA[index] = updatedLocker;
                }
                
                // Rafraîchir l'affichage
                renderAllTables();
                
                // Fermer le modal
                closeHospitalisationModal();
                
                // Message de succès
                const icon = updatedLocker.hosp ? '🏥' : '✓';
                const message = updatedLocker.hosp 
                    ? `${icon} Hospitalisation enregistrée pour ${CURRENT_LOCKER_FOR_HOSP.number}${updatedLocker.hospDate ? ` (${formatDate(updatedLocker.hospDate)})` : ''}`
                    : `${icon} Hospitalisation retirée du casier ${CURRENT_LOCKER_FOR_HOSP.number}`;
                
                showStatus(message, 'success');
                
            } catch (err) {
                console.error('Erreur modification hospitalisation:', err);
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

// DEPRECATED Fonction utilitaire
function showHospitalisationList() {
    // Filtrer les casiers occupés avec hosp = 1
    const hospLockers = DATA.filter(l => l.occupied && l.hosp);
    
    if (hospLockers.length === 0) {
        alert('✓ Aucun casier avec hospitalisation');
        return;
    }
    
    // Trier par zone puis par numéro
    hospLockers.sort((a, b) => {
        if (a.zone !== b.zone) {
            return a.zone.localeCompare(b.zone);
        }
        return a.number.localeCompare(b.number);
    });
    
    // Construire le message
    let message = `🏥 CASIERS AVEC HOSPITALISATION\n`;
    message += `═══════════════════════════════\n\n`;
    message += `Total : ${hospLockers.length} casier${hospLockers.length > 1 ? 's' : ''}\n\n`;
    
    // Grouper par zone
    const byZone = {};
    hospLockers.forEach(locker => {
        if (!byZone[locker.zone]) {
            byZone[locker.zone] = [];
        }
        byZone[locker.zone].push(locker);
    });
    
    // Afficher par zone
    Object.keys(byZone).sort().forEach(zone => {
        message += `─── Zone ${zone} (${byZone[zone].length}) ───\n`;
        
        byZone[zone].forEach(locker => {
            const name = anonymizeName(locker.name);
            const firstName = anonymizeFirstName(locker.firstName);
            const dateInfo = locker.hospDate ? ` - ${formatDate(locker.hospDate)}` : '';
            
            message += `  • ${locker.number} : ${name} ${firstName}${dateInfo}\n`;
            if (locker.comment) {
                message += `    💬 ${locker.comment}\n`;
            }
        });
        message += `\n`;
    });
    
    alert(message);
}

// ============ MODAL GLOBAL IMPRESSION ÉTIQUETTES ================

function updateLabelPreview() {
    const selection = document.getElementById('labelSelection').value;
    
    // Afficher/masquer les options
    document.getElementById('zoneSelector').style.display = selection === 'zone' ? 'block' : 'none';
    document.getElementById('rangeSelector').style.display = selection === 'range' ? 'block' : 'none';
    
    // Calculer le nombre de casiers et d'étiquettes
    const lockers = getSelectedLockersForLabels();
    const repetition = parseInt(document.getElementById('labelRepetition').value) || 1;
    const totalLabels = lockers.length * repetition;
    
    // Mettre à jour l'affichage
    document.getElementById('labelLockerCount').textContent = lockers.length;
    document.getElementById('labelTotalCount').textContent = totalLabels;
    
    // Calculer le nombre de pages
    const format = document.getElementById('labelFormat').value;
    const labelsPerPage = format === '5x13' ? 65 : 27;
    const pagesNeeded = Math.ceil(totalLabels / labelsPerPage);
    const lastPageLabels = totalLabels % labelsPerPage || labelsPerPage;
    
    // Afficher les infos de pagination
    const pagesInfo = document.getElementById('labelPagesInfo');
    if (totalLabels === 0) {
        pagesInfo.innerHTML = '<span style="color: var(--text-tertiary);">Aucun casier sélectionné</span>';
    } else {
        pagesInfo.innerHTML = `
            📄 ${pagesNeeded} page${pagesNeeded > 1 ? 's' : ''} nécessaire${pagesNeeded > 1 ? 's' : ''}
            ${pagesNeeded > 1 ? `<br><span style="font-size: 11px;">(Dernière page : ${lastPageLabels} étiquette${lastPageLabels > 1 ? 's' : ''})</span>` : ''}
        `;
    }
}

function showLabelPrintDialog() {
    const modal = document.getElementById('labelPrintModal');
    
    // Remplir le sélecteur de zones
    const zoneSelect = document.getElementById('labelZone');
    zoneSelect.innerHTML = ZONES_CONFIG.map(zone => 
        `<option value="${zone.name}">${zone.name}</option>`
    ).join('');
    
    // Réinitialiser
    document.getElementById('labelFormat').value = '3x9';
    document.getElementById('labelSelection').value = 'all';
    document.getElementById('labelRepetition').value = '1';
    document.getElementById('zoneSelector').style.display = 'none';
    document.getElementById('rangeSelector').style.display = 'none';
    // Pré-cocher selon ANONYMIZE_ENABLED
    document.getElementById('labelAnonymize').checked = ANONYMIZE_ENABLED;    
    //document.getElementById('labelHomonymes').checked = false;
    

    updateLabelPreview();
    modal.classList.add('active');
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
    } else if (selection === 'marked') {
        lockers = lockers.filter(l => l.marque);
    } else if (selection === 'stup') { 
        lockers = lockers.filter(l => l.stup);
    } else if (selection === 'idel') { 
        lockers = lockers.filter(l => l.idel);
    }
    
    // Trier par numéro
    lockers.sort((a, b) => a.number.localeCompare(b.number));
    
    return lockers;
}

// Ouvrir la page d'impression d'étiquettes (Bouton Imprimer du modal)
function openLabelPrintWindow() {
    const format = document.getElementById('labelFormat').value;
    const anonymize = document.getElementById('labelAnonymize').checked;
    const repetitionInput = document.getElementById('labelRepetition');
    let repetition = parseInt(repetitionInput.value);
    
    // Validation stricte
    if (isNaN(repetition) || repetition < 1) {
        repetition = 1;
        repetitionInput.value = 1;
        alert('⚠️ Le nombre de copies doit être au minimum 1.\nValeur réinitialisée à 1.');
        return;
    }
    
    if (repetition > 10) {
        repetition = 10;
        repetitionInput.value = 10;
        alert('⚠️ Le nombre de copies ne peut pas dépasser 10.\nValeur limitée à 10.');
        return;
    }

    const lockers = getSelectedLockersForLabels();
    
    if (lockers.length === 0) {
        alert('Aucun casier sélectionné');
        return;
    }

    // Vérification de la taille totale
    const totalLabels = lockers.length * repetition;
    const labelsPerPage = format === '5x13' ? 65 : 27;
    const pagesNeeded = Math.ceil(totalLabels / labelsPerPage);
    
    // Avertissement si trop de pages
    if (pagesNeeded > 20) {
        const confirm = window.confirm(
            `⚠️ ATTENTION\n\n` +
            `Vous allez imprimer ${totalLabels} étiquettes sur ${pagesNeeded} pages.\n\n` +
            `Cela peut prendre du temps et consommer beaucoup de papier.\n\n` +
            `Voulez-vous continuer ?`
        );
        if (!confirm) return;
    }

    // Dupliquer les casiers selon le nombre de répétitions
    const duplicatedLockers = [];
    lockers.forEach(locker => {
        for (let i = 0; i < repetition; i++) {
            duplicatedLockers.push(locker);
        }
    });
    
    if (VERBCONSOLE > 0) {
        console.log(`🏷️ Impression d'étiquettes:`);
        console.log(`   - Casiers uniques: ${lockers.length}`);
        console.log(`   - Répétitions: ${repetition}`);
        console.log(`   - Total étiquettes: ${duplicatedLockers.length}`);
        console.log(`   - Pages nécessaires: ${pagesNeeded}`);
    }
    
    // Créer une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Générer le HTML
    const html = generateLabelHTML(duplicatedLockers, format, anonymize);
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Attendre le chargement puis imprimer
    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

// Générer la page d'étiquettes au format HTML
function generateLabelHTML(lockers, format, anonymize) {

    if (VERBCONSOLE==1) {
        console.log('🏷️ generateLabelHTML appelée avec:');
        console.log('  - Nombre de casiers:', lockers.length);
        console.log('  - Anonymisation:', anonymize);
        console.log('  - ANONYMIZE_ENABLED (global):', ANONYMIZE_ENABLED);
    }

    const [cols, rows] = format === '5x13' ? [5, 13] : [3, 9];
    const perPage = cols * rows;
    
    // Dimensions calculées (A4 = 210mm × 297mm)
    const pageWidth = 210; // mm
    const pageHeight = 297; // mm
    const marginTop = format === '5x13' ? 10 : 15; // mm
    const marginBottom = format === '5x13' ? 10 : 15; // mm
    const marginLeft = format === '5x13' ? 5 : 6; // mm
    const marginRight = format === '5x13' ? 5 : 6; // mm
    
    const usableWidth = pageWidth - marginLeft - marginRight;
    const usableHeight = pageHeight - marginTop - marginBottom;
    
    const labelWidth = usableWidth / cols;
    const labelHeight = usableHeight / rows;

    // Compter les casiers uniques
    const uniqueLockers = new Set(lockers.map(l => l.number));
    const totalPages = Math.ceil(lockers.length / perPage);

    // FONCTION LOCALE D'ANONYMISATION
    const anonymizeNameLocal = (name) => {
        if (!anonymize || !name) return name;
        return name.substring(0, 3).toUpperCase();
    };
    
    const anonymizeFirstNameLocal = (firstName) => {
        if (!anonymize || !firstName) return firstName;
        return firstName.substring(0, 2);
    };
    
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
            border: 1px solid transparent;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 2mm;
            overflow: hidden;
            text-align: center;
        }

        .label-locker {
            font-size: ${format === '5x13' ? '9' : '11'}pt;
            font-weight: bold;
            margin-bottom: ${format === '5x13' ? '0.5' : '1'}mm;
            padding: 1mm 3mm;
            border-radius: 3px;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }
        

        .label-name {
            font-size: ${format === '5x13' ? '10' : '12'}pt;
            font-weight: bold;
            margin-bottom: ${format === '5x13' ? '0.5' : '1'}mm;
        }
        
        .label-info {
            font-size: ${format === '5x13' ? '7' : '9'}pt;
            color: #333;
            line-height: 1.3;
        }
        
        .label-zone {
            font-size: ${format === '5x13' ? '6' : '8'}pt;
            color: #666;
            margin-top: 1mm;
        }
        
        /* Footer avec info */
        .page-footer {
            position: absolute;
            bottom: 2mm;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 7pt;
            color: #999;
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

    // Créer une map des couleurs par zone
    const zoneColors = {};
    ZONES_CONFIG.forEach(zone => {
        zoneColors[zone.name] = zone.color || '#667eea';
    });
    //Détection homonymes
    const homonymInfo = detectHomonyms();
    const homonymNumbers = homonymInfo.homonyms;

    // Générer les pages
    for (let i = 0; i < lockers.length; i += perPage) {
        const pageLockers = lockers.slice(i, i + perPage);
        const currentPage = Math.floor(i / perPage) + 1;
        
        html += `<div class="page">
            <div class="label-grid">`;
        
        // Remplir la page
        for (let j = 0; j < perPage; j++) {
            if (j < pageLockers.length) {
                const locker = pageLockers[j];
                const name = anonymizeNameLocal(locker.name);
                const firstName = anonymizeFirstNameLocal(locker.firstName);               console.log(`  Casier ${locker.number}: "${locker.name}" → "${name}"`);
                //console.log(`  Prénom: "${locker.firstName}" → "${firstName}"`);
                const zoneColor = zoneColors[locker.zone] || '#667eea';

                const isHomonym = homonymNumbers.has(locker.number);
                const homonymStyle = isHomonym ? 'text-decoration: underline wavy #9333ea;' : '';

                html += `
                    <div class="label">
                        <div class="label-info">IPP: ${locker.code}</div>
                        <div class="label-name" style="${homonymStyle}">
                            ${name} ${firstName}
                        </div>
                        <div class="label-info">
                            DDN: ${locker.birthDate ? formatDate(locker.birthDate) : ''}
                        </div>
                        <div class="label-locker" style="color: ${zoneColor};">${locker.number}</div>
                    </div>
                `;
            } else {
                // Étiquette vide pour compléter la grille
                html += `<div class="label"></div>`;
            }
        }
        
        html += `</div>
            <div class="page-footer">
                Page ${currentPage}/${totalPages} • ${uniqueLockers.size} casier${uniqueLockers.size > 1 ? 's' : ''} • ${lockers.length} étiquette${lockers.length > 1 ? 's' : ''} • Généré le ${new Date().toLocaleDateString('fr-FR')}
            </div>
        </div>`;
    }
    
    html += `
</body>
</html>
`;
    
    return html;
}

// Fermer le modal "Etiquettes 1 casier" (bouton Annuler du modal)
function closeLabelPrintDialog() {
    document.getElementById('labelPrintModal').classList.remove('active');
}


// ============ MODAL IMPRESSION ÉTIQUETTES POUR CASIER ============

let CURRENT_LOCKER_FOR_PRINT = null;

// Configurer le modal "Etiquettes 1 casier"
function printSingleLockerLabels(lockerNumber) {
    const locker = DATA.find(l => l.number === lockerNumber);
    
    if (!locker) {
        alert('Casier non trouvé');
        return;
    }
    if (!locker.occupied) {
        alert('Ce casier n\'est pas attribué, impossible d\'imprimer des étiquettes!');
        return;
    }
    
    CURRENT_LOCKER_FOR_PRINT = locker;
    
    // Remplir les infos
    const infoDiv = document.getElementById('singleLabelInfo');
    infoDiv.innerHTML = `
        <div style="font-size: 14px;">
            <span style="color: var(--text-secondary); text-align: center;">IPP: ${locker.code}</span>            
            <strong style="font-size: 16px; text-align: center;">${locker.name} ${locker.firstName}</strong><br>
            <span style="color: var(--text-secondary);">DDN: ${locker.birthDate ? formatDate(locker.birthDate) : ''}</span>
            <span style="color: var(--text-secondary);">${locker.number}</span>
        </div>
    `;
    
    // Réinitialiser
    document.getElementById('singleLabelFormat').value = '3x9';
    document.getElementById('singleLabelAnonymize').checked = false;
    
    // Ouvrir le modal
    document.getElementById('singleLabelModal').classList.add('active');
}

// Fermer le modal "Etiquettes 1 casier" (bouton Annuler du modal)
function closeSingleLabelModal() {
    document.getElementById('singleLabelModal').classList.remove('active');
    CURRENT_LOCKER_FOR_PRINT = null;
}

// Fenêtre de confirmation avant impression
function confirmPrintSingleLabel() {
    if (!CURRENT_LOCKER_FOR_PRINT) return;
    
    const format = document.getElementById('singleLabelFormat').value;
    const anonymize = document.getElementById('singleLabelAnonymize').checked;
    const count = format === '3x9' ? 27 : 65;

    // Debug
    if (VERBCONSOLE > 0) {
        console.log('🏷️ Impression étiquette unique:');
        console.log('  - Casier:', CURRENT_LOCKER_FOR_PRINT.number);
        console.log('  - Anonymisation:', anonymize);
        console.log('  - Format:', format);
    }

    // Créer un tableau avec le même casier répété
    const lockers = Array(count).fill(CURRENT_LOCKER_FOR_PRINT);
    
    // Fermer le modal
    closeSingleLabelModal();
    
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
