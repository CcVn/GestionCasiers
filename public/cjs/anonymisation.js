// ============ UTILITAIRES D'ANONYMISATION ===============

// PascalCase (UpperCamelCase) 1er caractère en majuscule, le reste en minuscules
function PascalCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Anonymisation du nom de famille
function anonymizeName(name, force = false, crypto = false) {
    if (!name) return name;
    if (crypto) {
        const hash = crypto.createHash('md5').update(name).digest('hex');
        return `${name.charAt(0)}***${hash.substring(0, (ANONYMIZE_ENABLED || force) ? 3 : 20)}`; // "D***a4f"
    } else {
        const maxLength = (ANONYMIZE_ENABLED || force) ? (NB_MAX_ANON_NOM || 3) : (NB_MAX_CAR_NOM || 20);
        return name.substring(0, maxLength).toUpperCase();
    }
}

// Anonymisation du prénom
function anonymizeFirstName(firstName, force = false) {
    if (!firstName) return firstName;
    const maxLength = (ANONYMIZE_ENABLED || force) ? (NB_MAX_ANON_PRENOM || 2) : (NB_MAX_CAR_PRENOM || 15);
    return PascalCase(firstName.substring(0, maxLength));
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
                
                const data = await fetchJSON(`${API_URL}/config/anonymization`, {
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


// Rendre les fonctions globales
window.anonymizeName = anonymizeName;
window.anonymizeFirstName = anonymizeFirstName;
window.PascalCase = PascalCase;
window.showAnonymizationConfig = showAnonymizationConfig;
window.closeAnonymizationConfig = closeAnonymizationConfig;
