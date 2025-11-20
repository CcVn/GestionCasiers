// =============== MODAL IMPORT PATIENTS =====================

// Variables globales pour l'import
let selectedImportFormat = null;
let selectedImportMode = 'replace';

// --- Modal d'import
async function importClients() {
    if (!isEditAllowed()) return;
    
    try {
        // Charger les formats disponibles
        const config = await fetchJSON(`${API_URL}/config/import-format`, {
            credentials: 'include'
        });
        
        // Remplir le select des formats
        const formatSelect = document.getElementById('importFormat');
        formatSelect.innerHTML = '';
        
        // Format par défaut en premier
        const defaultFormat = config.clientImportFormat || 'INTERNE';
        const formats = config.availableFormats || ['INTERNE'];
        
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

// Sélecteur de fichiers
function selectFileForImport() {
    // Fermer le modal d'options
    closeImportOptions();
    
    // Ouvrir le sélecteur de fichier
    const fileInput = document.getElementById('clientFileInput');
    fileInput.value = ''; // Reset
    fileInput.onchange = handleClientFileSelected;
    fileInput.click();
}

// util
function isUTF8valid(csvFileName = 'data.csv') { 
  const buffer = fs.readFileSync(csvFileName);

  // Vérification BOM UTF-8
  const hasBom = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;

  console.log("BOM UTF-8 détectée ?", hasBom);

  // Si besoin : vérifier que le contenu est décodable en UTF-8
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    console.log("Décodage UTF-8 valide");
    return 1;
  } catch {
    console.error("Le fichier contient des octets invalides pour l'UTF-8");
    return 0;
  }
}

async function handleClientFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!isUTF8valid) {
        alert('Format UTF8 invalide!');
        return;
    }
    
    const importBtn = document.querySelector('button[onclick="importClients()"]');
    const originalText = importBtn ? importBtn.innerHTML : '';
    
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = '⏳ Import...';
        importBtn.classList.add('btn-loading');
    }
    
    try {
        if (VERBCONSOLE > 0) {
            console.log('📂 Lecture du fichier patients...');
            //console.log('Format sélectionné:', selectedImportFormat);
            //console.log('Mode sélectionné:', selectedImportMode);
            //console.log('Séparateur sélectionné:', selectedImportSeparator);
        }
        
        const text = await file.text();
        
        const result = await fetchJSON(`${API_URL}/clients/import`, {
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
        }, {
            retries: 2,
            timeout: 60000,  // 60s pour les gros imports
            retryOn: [500, 502, 503, 504]
        });

        // result contient déjà les données parsées
        let message = `✅ Import terminé !\n\n`;
        message += `✓ Importés : ${result.imported}\n`;
        if (result.skipped > 0) {
            message += `⏭ Ignorés : ${result.skipped}\n`;
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
        message += `\nTotal des lignes traitées : ${result.total}`;
        
        alert(message);
        loadData();
        closeLockersImportOptions();
        
    } catch (err) {
        if (err.isTimeout) {
            alert('⏱️ L\'import a pris trop de temps.\n\nEssayez de réduire la taille du fichier ou contactez l\'administrateur.');
        } else if (err.isNetworkError) {
            alert('🔌 Impossible de contacter le serveur.\n\nVérifiez votre connexion.');
        } else if (err.message.includes('413')) {
            alert('📦 Fichier trop volumineux.\n\nRéduisez la taille du fichier ou divisez-le en plusieurs parties.');
        } else if (err.message.includes('401')) {
            alert('Session expirée. Veuillez vous reconnecter.');
            logout();
        } else {
            alert('❌ Erreur lors de l\'import patients :\n\n' + err.message);
        }
       console.error('Erreur import patients:', err);
 
    } finally {
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
        const data = await fetchJSON(`${API_URL}/clients/clear`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include'
        });
        
        alert(`✓ Base patients vidée avec succès\n\n${data.deleted} client(s) supprimé(s)`);
        
        closeImportOptions(); // Fermer le modal

        // Mettre à jour le statut immédiatement
        await updateImportStatus();
        
    } catch (err) {
        console.error('Erreur suppression clients:', err);
        throw new Error(err.message);
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

// Info sur le dernier import patients
async function updateImportStatus() {
    try {

        const data = await fetchJSON(`${API_URL}/clients/import-status`, {
            credentials: 'include'
        });
        
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

// Rendre les fonctions globales
window.importClients = importClients;
window.closeImportOptions = closeImportOptions;
window.selectFileForImport = selectFileForImport;
window.isUTF8valid = isUTF8valid;
window.handleClientFileSelected = handleClientFileSelected;
window.clearClientsDatabase = clearClientsDatabase;
window.searchClient = searchClient;
window.updateImportStatus = updateImportStatus;
