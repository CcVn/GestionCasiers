// ============ AFFICHAGE TABLEAUX ============

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
    if (getState('auth.isGuest')) {
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
                    <button class="btn-secondary dropdown-trigger" onclick="toggleDropdown(event)">⋮</button>
                    <div class="dropdown-menu">
                        <button onclick="openModalEdit('${locker.number}')">
                            ✏️ Modifier
                        </button>
                        <button class="btn-delete" onclick="releaseLocker('${locker.number}')">
                            🗑️ Libérer
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
                                    ${locker.hosp ? '❌ Retirer hospi' : '🚑 Hospitalisation'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'idel', ${locker.idel ? 'true' : 'false'})">
                                    ${locker.idel ? '❌ Retirer IDEL' : 'ℹ️ Avec IDEL'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'stup', ${locker.stup ? 'true' : 'false'})">
                                    ${locker.stup ? '❌ Retirer stup.' : '💊 Avec stupéfiants'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'frigo', ${locker.frigo ? 'true' : 'false'})">
                                    ${locker.frigo ? '❌ Retirer frigo' : '❄️ Avec frigo'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'pca', ${locker.pca ? 'true' : 'false'})">
                                    ${locker.pca ? '❌ Retirer PCA' : '💉 Avec PCA'}
                                </button>
                                <button onclick="toggleMarker('${locker.number}', 'meopa', ${locker.meopa ? 'true' : 'false'})">
                                    ${locker.meopa ? '❌ Retirer MEOPA' : '⛽️ Avec MEOPA'}
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
    let lockers = getState('data.lockers').filter(l => l.zone === zone);

    // Appliquer le filtre selon la valeur du select
    let CURRENT_FILTER = getState('ui.currentFilter');
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
        
    if (getState('auth.isGuest')) {
        lockers.sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }
    
   // Utiliser la fonction de génération de ligne (commune avec la table de recherche renderSearchResults)
    tbody.innerHTML = lockers.map(locker => generateTableRow(locker, false)).join('');

    // Initialiser l'accessibilité après le rendu
    requestAnimationFrame(() => {
      initDropdownAccessibility();
    });
}

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
        getState('data.zonesConfig').forEach(zone => {
            renderTable(zone.name);
        });
    }
}

// --------  Créer la table de recherche ------------
function renderSearchResults(zone, results, searchTerm) {
    const tbody = document.getElementById(`tbody-${zone}`);
    if (!tbody) return;
    
    if (results.length === 0) {
        const colspan = getState('auth.isGuest') ? (zone === 'SEARCH' ? '6' : '5') : (zone === 'SEARCH' ? '9' : '8');
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

    // Initialiser l'accessibilité après le rendu
    requestAnimationFrame(() => {
      initDropdownAccessibility();
    });
}

// ---- FILTRE de la table : avec gestion du filtre "duplicates" ----
function filterTable(zone, value) {
    let CURRENT_FILTER = getState('ui.currentFilter');
    CURRENT_FILTER[zone] = value;
    setState('ui.currentFilter', CURRENT_FILTER);

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

// ---- Imprimer le tableau affiché dans l'onglet. TODO: CSS à revoir
function printTable() {
    window.print();
}

// ============ NAVIGATION ============

function switchTab(zone) {
    setState('ui.currentZone', zone); //CURRENT_ZONE = zone;
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    
    const tabButton = document.querySelector(`[data-zone="${zone}"]`);
    const contentSection = document.getElementById(`content-${zone}`);
    
    if (tabButton) tabButton.classList.add('active');
    if (contentSection) contentSection.classList.add('active');
}

// Rendre les fonctions globales
window.renderAllTables = renderAllTables;
window.generateTableRow = generateTableRow;
window.renderTable = renderTable;
window.printTable = printTable;
window.renderSearchResults = renderSearchResults;
window.filterTable = filterTable;
window.sortTable = sortTable;
window.switchTab = switchTab;
