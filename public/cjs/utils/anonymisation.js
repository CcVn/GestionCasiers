// ============ UTILITAIRES D'ANONYMISATION ===============

// toPascalCase (UpperCamelCase) 1er caractère en majuscule, le reste en minuscules
function toPascalCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Anonymisation du nom de famille
function anonymizeName(name, forceAnonymize = false, crypto = false) {
    if (!name) return '';
    const maxAnonNameL = getState('display.anonymization.maxAnonNameLength');
    const maxNameL = getState('display.anonymization.maxNameLength');
    const shouldAnonymize = forceAnonymize || getState('ui.anonymizeEnabled');
    const maxLength = shouldAnonymize ? (maxAnonNameL || 3) : (maxNameL || 20);

    if (crypto) {
        const hash = crypto.createHash('md5').update(name).digest('hex');
        return `${name.charAt(0)}***${hash.substring(0, maxLength)}`; // "D***a4f"
    } else {
        return name.substring(0, maxLength).toUpperCase();
    }
}

// Anonymisation du prénom
function anonymizeFirstName(firstName, forceAnonymize = false, crypto = false) {
    if (!firstName) return firstName;
    const maxAnonFirstL = getState('display.anonymization.maxAnonFirstNameLength');
    const maxFirstNameL = getState('display.anonymization.maxFirstNameLength');
    const shouldAnonymize = forceAnonymize || getState('ui.anonymizeEnabled');
    const maxLength = shouldAnonymize ? (maxAnonFirstL || 2) : (maxFirstNameL || 15);

    if (crypto) {
        const hash = crypto.createHash('md5').update(firstName).digest('hex');
        return `${firstName.charAt(0)}***${hash.substring(0, maxLength)}`;
    } else {
        return toPascalCase(firstName.substring(0, maxLength));
    }
}

// ================ MODAL CONFIG ANONYMISATION ================

async function showAnonymizationConfig() {
    const modal = document.getElementById('anonymizationConfigModal');
    
    // Charger la configuration actuelle
    try {
        const data = await fetchJSON(`${API_URL}/config/anonymization`, {
            credentials: 'include'
        });
        
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
        Logger.error('Erreur chargement config anonymisation:', err);
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
                
                const data = await fetchJSON(`${API_URL}/config/anonymization`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getState('auth.csrfToken')
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        anonymizeGuest: anonymizeGuest,
                        anonymizeAdmin: anonymizeAdmin
                    })
                });
                
                // Mettre à jour l'état local
                setState('ui.anonymizeEnabled', getState('auth.isGuest') ? anonymizeGuest : anonymizeAdmin);
                
                // Afficher le message de succès
                statusEl.className = 'status-message status-success';
                statusEl.textContent = '✓ Configuration appliquée ! Rechargez la page pour voir les changements.';
                
                updateAnonymizationStatus();

                // Proposer de recharger
                setTimeout(() => {
                    if (confirm('Configuration appliquée.\n\nVoulez-vous recharger la page pour appliquer les changements ?')) {
                        window.location.reload();
                    }
                }, 1000);
                
            } catch (err) {
                Logger.error('Erreur sauvegarde config:', err);
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

/**
 * Met à jour l'indicateur d'anonymisation
 * Appeler après chaque changement d'état d'anonymisation Par exemple dans setupApp() ou après login
 */
function updateAnonymizationStatus(icone = true) {
    const statusEl = document.getElementById('anonymizationStatus');
    if (!statusEl) return;
    
    const isGuest = getState('auth.isGuest');
    const isAuth = getState('auth.isAuthenticated');
    const isEnabled = getState('ui.anonymizeEnabled');
    
    // Retirer les classes existantes
    statusEl.classList.remove('active', 'inactive');
    
    // Déterminer le mode actuel
    const mode = isAuth ? 'Admin' : isGuest ? 'Guest' : 'N/A';
    
    if (icone) {
        if (isEnabled) {
            statusEl.classList.add('active');
            statusEl.innerHTML = '<span class="status-dot"></span> <span class="anon-icon">🎭</span>';
            statusEl.title = 'Anonymisation active';
        } else {
            statusEl.classList.add('inactive');
            statusEl.innerHTML = '<span class="status-dot"></span> <span class="anon-icon">🎭</span>';
            statusEl.title = 'Anonymisation inactive';
        }
    } else {
        if (isEnabled) {
            statusEl.classList.add('active');
            statusEl.innerHTML = '<span class="status-dot"></span> Anonymisation active';
            statusEl.title = `Anonymisation activée (mode ${mode})`;
        } else {
            statusEl.classList.add('inactive');
            statusEl.innerHTML = '<span class="status-dot"></span> Anonymisation inactive';
            statusEl.title = `Anonymisation désactivée (mode ${mode})`;
        }
    }
}

// Rendre les fonctions globales
window.anonymizeName = anonymizeName;
window.anonymizeFirstName = anonymizeFirstName;
window.toPascalCase = toPascalCase;
window.showAnonymizationConfig = showAnonymizationConfig;
window.closeAnonymizationConfig = closeAnonymizationConfig;
window.updateAnonymizationStatus = updateAnonymizationStatus;

// Export pour modules (si migration ES6 future)
if (typeof module !== 'undefined' && module.exports) {
  //module.exports = Logger;
}