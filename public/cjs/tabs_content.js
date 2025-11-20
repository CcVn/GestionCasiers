// ===============  ONGLETS & CONTENU  ===================

// Fonction pour générer dynamiquement les onglets
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
        btn.addEventListener('keydown', function(e) {
            let targetIndex;
            
            switch(e.key) {
                case 'ArrowLeft':
                    targetIndex = index > 0 ? index - 1 : buttons.length - 1;
                    break;
                case 'ArrowRight':
                    targetIndex = index < buttons.length - 1 ? index + 1 : 0;
                    break;
                case 'Home':
                    targetIndex = 0;
                    break;
                case 'End':
                    targetIndex = buttons.length - 1;
                    break;
                default:
                    return;
            }
            buttons[targetIndex].click();
            buttons[targetIndex].focus();
            e.preventDefault();
        });
    });
}

// Fonction pour générer dynamiquement le contenu des onglets
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

                <div class="help-item" id="help-recherche">
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
                <div class="help-item" id="help-navig">
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
                <div class="help-item" id="help-navig-clavier">
                    <div class="help-title">Navigation au clavier</div>
                    <div class="help-content" style="margin: 1px; padding: 1px;">
                        <span><strong>Fenêtre modales</strong></span>
                        <ol>
                            <li><strong>ESC</strong>: Fermer</li>
                            <li><strong>Tab</strong> / <strong>Shift+Tab</strong> : Navigation entre champs (avec 'focus trap')</li>
                            <li><strong>Espace</strong> ou <strong>Entrée</strong> : Valider boutons</li>
                        </ol>
                        <span><strong> Menu actions ⋮ (Dropdowns)</strong></span>
                        <ol>
                            <li><strong>ESC</strong> : Fermer</li>
                            <li><strong>↓</strong> : Item suivant</li>
                            <li><strong>↑</strong> : Item précédent</li>
                            <li><strong>Entrée</strong> ou <strong>Espace</strong> : Activer l'action</li>
                        </ol>
                        <span><strong>Onglets (tabs)</strong></span>
                        <ol>
                            <li><strong>←</strong> : Onglet précédent</li>
                            <li><strong>→</strong> : Onglet suivant</li>
                            <li><strong>Home</strong> : Premier onglet</li>
                            <li><strong>End</strong> : Dernier onglet</li>
                        </ol>
                        <span><strong>Champs de formulaire</strong></span>
                        <ol>
                            <li><strong>Entrée</strong> : Soumettre formulaire</li>
                            <li><strong>Tab</strong> : Champ suivant</li>
                            <li><strong>Shift+Tab</strong> : Champ précédent</li>
                        </ol>
                        <div class="post-it">
                            <strong>💡 Note : </strong> Les dropdowns doivent être ouverts d'abord (clic ou Entrée sur le bouton ⋮) avant d'utiliser les flèches.
                        </div>
                    </div>
                </div>
                <div class="help-item">
                    <div class="help-title">Explications sur les lignes colorées</div>
                    <div class="help-content">
                        <span>Il peut arriver que certaines lignes aient <strong>un texte ou un fonds coloré</strong>.</span>
                        <ol>
                            <li>Une ligne avec un fonds <strong>gris dégradé</strong> et avec une icone 🏥 signale que le casier a été attribué à un patient qui a été hospitalisé temporairement dans un autre établissement (hospitalisation programmée de courte durée, ou passage aux urgences par exemple). Ce type de casier est libéré en cas de pénurie de casiers, ou s'il est avéré que le patient ne retournera pas en HAD.</li>
                            <li>Un nom et un prénom qui apparaissent en <strong>violet</strong> signalent que des <strong>homonymes</strong> ont été détectés. NB: la détection d'homonymes est activée sur la base du nom de famille seul.</li>
                            <li>Une ligne avec un fonds <strong>orangé</strong> et avec une icone ⚠️ signale qu'un double de casier été détecté, sur la base de numéros IPP identiques ou bien sur une combinaison nom+prénom+date de naissance identiques. Cela peut être une erreur (nouveau casier créé après un retour d'hospi alors que l'ancien avait été gardé), mais pas forcément : il peut y avoir deux casiers pour un patient (un casier NORD ou SUD + un casier PCA par exemple).</li>
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

// ============ AFFICHAGE TABLEAUX ============

// --- Génération de toutes les tables, mode normal ou recherche ---
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

// --- Génération d'une ligne de tableau (normal ou recherche) ----
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

// ---- TRI de la table  ----------------------------------
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

// Rendre les fonctions globales
window.generateTabs = generateTabs;
window.generateContentSections = generateContentSections;
window.updateImportExportButtons = updateImportExportButtons;
window.renderAllTables = renderAllTables;
window.generateTableRow = generateTableRow;
window.renderTable = renderTable;
window.renderSearchResults = renderSearchResults;
window.filterTable = filterTable;
window.sortTable = sortTable;
window.switchTab = switchTab;