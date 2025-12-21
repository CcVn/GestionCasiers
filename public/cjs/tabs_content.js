// ===============  ONGLETS & CONTENU  ===================

// Fonction pour générer dynamiquement les onglets
function generateTabs() {
    const tabsContainer = document.querySelector('.tabs');
    if (!tabsContainer) return;

    // Générer les onglets de zones
    let tabsHTML = getState('data.zonesConfig').map((zone, index) => `
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

    getState('data.zonesConfig').forEach((zone, index) => {
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
                    <div class="hide-mobile">
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
    
    //-------------- Section/onglet d'aide  ------------------------------
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
    //setState('ui.currentFilter', {});
    let CURRENT_FILTER = {};
    getState('data.zonesConfig').forEach(zone => {
        CURRENT_FILTER[zone.name] = 'all';
    });
    setState('ui.currentFilter', CURRENT_FILTER);
}

// --- Suivi occupation casiers ---
function updateCounters() {
    DATA = getState('data.lockers');
    if (!DATA || DATA.length === 0) {
        Logger.info('⚠️ Pas de données pour les compteurs');
        return;
    }
    
    let ZONES_CONFIG = getState('data.zonesConfig');
    if (!ZONES_CONFIG || ZONES_CONFIG.length === 0) {
        Logger.info('⚠️ ZONES_CONFIG non chargée');
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

// @TODO DEPRECATED? plus utilisée pour l'instant?
/*function updateImportExportButtons() {
    const importExportButtons = document.querySelectorAll('.search-bar button');
    Logger.debug('Mise à jour des boutons header, isGuest:', getState('auth.isGuest'));
    
    importExportButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        Logger.debug('Bouton:', text);
        
        if (text.includes('import') || text.includes('backup')|| 
            text.includes('json') || text.includes('csv') ) {
            if (getState('auth.isGuest')) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none';
                Logger.debug('Bouton désactivé:', text);
                //btn.style.display = 'none';
            } else {
                //btn.style.display = '';
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                Logger.debug('Bouton activé:', text);
            }
        }
    });
    
    const newLockerButtons = document.querySelectorAll('.controls .btn-primary');
    Logger.debug('Mise à jour des boutons "Attribuer" et "Imprimés", trouvés:', newLockerButtons.length);
    
    newLockerButtons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('attribuer') || text.includes('imprimer') ) {
            if (getState('auth.isGuest')) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.style.pointerEvents = 'none';
                Logger.debug('Boutons "Attribuer & Imprimer" désactivé');
                //btn.style.display = 'none';
            } else {
                //btn.style.display = '';
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                Logger.debug('Boutons "Attribuer & Imprimer" activé');
            }
        }
    });
}*/

// Rendre les fonctions globales
window.generateTabs = generateTabs;
window.generateContentSections = generateContentSections;
/*window.updateImportExportButtons = updateImportExportButtons;*/
window.updateCounters = updateCounters;
