// ============ MARQUES CASIER ON/OFF ============

function toggleDropdown(event) {
  event.stopPropagation();
  
  const menu = event.target.closest('.menu-dot').querySelector('.dropdown-menu');
  
  // Fermer tous les autres menus
  document.querySelectorAll('.dropdown-menu').forEach(m => {
    if (m !== menu) m.classList.remove('active');
  });
  
  menu.classList.toggle('active');
}

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

// Fermer les dropdowns au clic extérieur
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-dot')) {
    document.querySelectorAll('.dropdown-menu').forEach(m => {
      m.classList.remove('active');
    });
  }
});

// Rendre les fonctions globales
window.toggleDropdown = toggleDropdown;
window.toggleMarker = toggleMarker;
