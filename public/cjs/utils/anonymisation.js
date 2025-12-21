// ============ UTILITAIRES D'ANONYMISATION ===============

// toPascalCase (UpperCamelCase) 1er caractère en majuscule, le reste en minuscules
function toPascalCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Fonction pour remplacer un caractère aléatoire par une étoile
function remplacerAleatoire(partie, nbEtoiles) {
    let result = partie.split('');
    for (let i = 0; i < nbEtoiles; i++) {
        let index;
        do {
            index = Math.floor(Math.random() * result.length);
        } while (result[index] === '*');
        result[index] = '*';
    }
    return result.join('');
}

// Anonymisation du nom de famille
function anonymizeName(name, forceAnonymize = false) {
    if (!name) return '';
    const maxAnonNameL = getState('display.anonymization.maxAnonNameLength');
    const maxNameL = getState('display.anonymization.maxNameLength');
    const forceAnon = getState('ui.anonymizeForce');
    const shouldAnonymize = forceAnonymize || getState('ui.anonymizeEnabled');
    const maxLength = shouldAnonymize ? (maxAnonNameL || 3) : (maxNameL || 20);

    const masque = name.substring(0, maxLength).toUpperCase();
    if (forceAnon>1) {
        return remplacerAleatoire(masque, masque.length/2);
        //const hash = crypto.createHash('md5').update(masque).digest('hex');
        //return `${name.charAt(0)}***${hash.substring(0, maxLength)}`; // "D***a4f"
    } else {
        return masque;
    }
}

// Anonymisation du prénom
function anonymizeFirstName(firstName, forceAnonymize = false) {
    if (!firstName) return '';
    const maxAnonFirstL = getState('display.anonymization.maxAnonFirstNameLength');
    const maxFirstNameL = getState('display.anonymization.maxFirstNameLength');
    const forceAnon = getState('ui.anonymizeForce');
    const shouldAnonymize = forceAnonymize || getState('ui.anonymizeEnabled');
    const maxLength = shouldAnonymize ? (maxAnonFirstL || 2) : (maxFirstNameL || 15);

    const masque = toPascalCase(firstName.substring(0, maxLength));
    if (forceAnon>1) {
        return remplacerAleatoire(masque, masque.length/2);
        //const hash = crypto.createHash('md5').update(masque).digest('hex');
        //return `${firstName.charAt(0)}***${hash.substring(0, maxLength)}`;
    } else {
        return masque;
    }
}

// Masquage partiel de la date
function maskDate(date, forceAnonymize = false) {
    const shouldAnonymize = forceAnonymize || getState('ui.anonymizeEnabled');
    if (!date || !shouldAnonymize) return date;

    if (date.length !== 10) { return "Format de date invalide"; }
    const parties = date.split('/');
    if (parties.length !== 3) { return "Format de date invalide"; }

    const jour = remplacerAleatoire(parties[0], 1); // 1 étoile dans le jour
    const mois = remplacerAleatoire(parties[1], 1); // 1 étoile dans le mois
    const annee = remplacerAleatoire(parties[2], 2); // 2 étoiles dans l'année
    const dateMasquee = `${jour}/${mois}/${annee}`;
    //Logger.info('Date masquée',dateMasquee);
    return dateMasquee;
}

// Format de date + 
function formatDate(dateStr, forceAnonymize = false) {
  if (!dateStr) return dateStr;
  
  try {
    const date = new Date(dateStr);
    let formDate = date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    return maskDate(formDate, forceAnonymize);
    //return formDate;

  } catch (err) {
    return dateStr;
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
window.maskDate = maskDate;
window.formatDate = formatDate;

// Export pour modules (si migration ES6 future)
if (typeof module !== 'undefined' && module.exports) {
  //module.exports = Logger;
}