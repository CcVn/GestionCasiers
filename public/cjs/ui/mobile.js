// ============ UTILISATION SUR MOBILE =====================

function detectMobile() {
    let IS_MOBILE = window.innerWidth <= 768;
    if (VERBCONSOLE>0) { console.log('Mode mobile:', IS_MOBILE); }
    setState('ui.isMobile', IS_MOBILE);
    return IS_MOBILE;
}

//--- Support Swipe Tactile
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
        const ZONES_CONFIG = getState('data.zonesConfig');
        
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


// Rendre les fonctions globales
window.detectMobile = detectMobile;
window.initSwipeSupport = initSwipeSupport;
