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
        showMarkButton();
    } else {
        hideMarkButton();
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


// Rendre les fonctions globales
window.searchLockers = searchLockers;
window.clearSearch = clearSearch;
window.debounce = debounce;
window.debouncedSearch = debouncedSearch;
