// ============ BACKUP =======================================

function createBackup() {
    if (!isEditAllowed()) return;
    
    if (!confirm('Créer un backup de la base de données maintenant ?\nNB: évitez de créer un backup en période de forte utilisation.')) return;
    
    const btn = event.target;
    const originalText = btn.innerHTML;
    
    // LOADING STATE
    btn.disabled = true;
    btn.innerHTML = '⏳ Création...';
    btn.classList.add('btn-loading');
 
    fetch(`${API_URL}/backup`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': CSRF_TOKEN
        }
    })
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        return res.json();
    })
    .then(data => {
        alert(`✓ Backup créé avec succès !\n\nFichier : ${data.filename}\nTaille : ${(data.size / 1024).toFixed(2)} KB`);
    })
    .catch(err => {
        alert('Erreur lors du backup : ' + err.message);
        console.error('Erreur backup:', err);
    })
    .finally(() => {
        // RESET STATE
        btn.disabled = false;
        btn.innerHTML = originalText;
        btn.classList.remove('btn-loading');
    });
}


// ============ RESTORE BACKUP ============

let selectedBackupFile = null;
let uploadedBackupData = null;

async function showRestorePanel() {
    if (!isEditAllowed()) return;
    
    const panel = document.getElementById('restorePanel');
    const content = document.getElementById('restoreContent');
    
    // Afficher le panel
    panel.classList.add('active');
    content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Chargement des backups...</p>';
    
    try {
        const data = await fetchJSON(`${API_URL}/backups`, {
            credentials: 'include'
        });
        renderRestorePanel(data.backups);
        
    } catch (err) {
        console.error('Erreur chargement backups:', err);
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 60px;">
                <div class="spinner"></div>
                <p style="margin-top: 20px; font-weight: 600; color: var(--text-primary);">Chargement des backups...</p>
            </div>
        `;
    }
}

function renderRestorePanel(backups) {
    const content = document.getElementById('restoreContent');
    
    let html = '';
    
    // Zone d'upload
    html += `
        <div class="upload-zone" id="uploadZone" onclick="document.getElementById('fileInput').click()">
            <div class="icon">📁</div>
            <p><strong>Importer un fichier backup (.db)</strong></p>
            <p style="font-size: 12px;">Cliquez ou glissez-déposez un fichier ici</p>
        </div>
        <input type="file" id="fileInput" accept=".db" style="display: none;" onchange="handleFileSelect(event)">
    `;
    
    // Liste des backups disponibles
    if (backups && backups.length > 0) {
        html += `
            <div class="backup-list">
                <h3>Backups disponibles sur le serveur (${backups.length})</h3>
        `;
        
        backups.forEach((backup, index) => {
            const date = new Date(backup.date);
            const formattedDate = date.toLocaleString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const size = (backup.size / 1024).toFixed(2);
            
            html += `
                <div class="backup-item" onclick="selectBackup('${backup.filename}', this)">
                    <div class="info">
                        <div class="name">📦 ${backup.filename}</div>
                        <div class="meta">📅 ${formattedDate}</div>
                    </div>
                    <div class="size">${size} KB</div>
                </div>
            `;
        });
        
        html += `</div>`;
    } else {
        html += `
            <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                <p style="font-size: 18px; margin-bottom: 10px;">📭</p>
                <p>Aucun backup disponible sur le serveur</p>
                <p style="font-size: 12px; margin-top: 8px;">Importez un fichier backup ou créez-en un nouveau</p>
            </div>
        `;
    }
    
    // Boutons d'action
    html += `
        <div class="restore-actions">
            <button class="btn-secondary" onclick="closeRestorePanel()">Annuler</button>
            <button class="btn-primary" id="btnRestore" onclick="confirmRestore()" disabled>
                🔄 Restaurer
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    
    // Configurer drag & drop
    setupDragAndDrop();
}

function setupDragAndDrop() {
    const zone = document.getElementById('uploadZone');
    if (!zone) return;
    
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    if (!file.name.endsWith('.db')) {
        alert('❌ Format invalide : seuls les fichiers .db sont acceptés');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Vérifier le header SQLite
        const header = String.fromCharCode.apply(null, uint8Array.slice(0, 16));
        if (!header.startsWith('SQLite format 3')) {
            alert('❌ Fichier invalide : ce n\'est pas une base SQLite');
            return;
        }
        
        // Convertir en base64
        const base64 = btoa(String.fromCharCode.apply(null, uint8Array));
        
        uploadedBackupData = base64;
        selectedBackupFile = null;
        
        // Désélectionner tous les backups de la liste
        document.querySelectorAll('.backup-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Mettre à jour l'interface
        const zone = document.getElementById('uploadZone');
        zone.innerHTML = `
            <div class="icon">✅</div>
            <p><strong>${file.name}</strong></p>
            <p style="font-size: 12px;">Taille : ${(file.size / 1024).toFixed(2)} KB</p>
            <p style="font-size: 11px; margin-top: 8px; color: var(--text-tertiary);">Cliquez pour changer de fichier</p>
        `;
        zone.style.borderColor = 'var(--primary-color)';
        zone.style.background = '#e3f2fd';
        
        // Activer le bouton restore
        document.getElementById('btnRestore').disabled = false;
    };
    
    reader.readAsArrayBuffer(file);
}

function selectBackup(filename, element) {
    selectedBackupFile = filename;
    uploadedBackupData = null;
    
    // Désélectionner tous
    document.querySelectorAll('.backup-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Sélectionner celui-ci
    element.classList.add('selected');
    
    // Réinitialiser la zone d'upload
    const zone = document.getElementById('uploadZone');
    zone.innerHTML = `
        <div class="icon">📁</div>
        <p><strong>Importer un fichier backup (.db)</strong></p>
        <p style="font-size: 12px;">Cliquez ou glissez-déposez un fichier ici</p>
    `;
    zone.style.borderColor = '';
    zone.style.background = '';
    
    // Activer le bouton restore
    document.getElementById('btnRestore').disabled = false;
}

async function confirmRestore() {
    if (!selectedBackupFile && !uploadedBackupData) {
        alert('Veuillez sélectionner un backup');
        return;
    }
    
    const source = selectedBackupFile || 'fichier importé';
    
    const confirmed = confirm(
        `⚠️ CONFIRMATION REQUISE\n\n` +
        `Vous allez restaurer la base depuis :\n"${source}"\n\n` +
        `Cette action va :\n` +
        `• Créer un backup de sécurité de la base actuelle\n` +
        `• Remplacer TOUTES les données par celles du backup\n` +
        `• Redémarrer le serveur automatiquement\n\n` +
        `Cette opération est IRRÉVERSIBLE.\n\n` +
        `Voulez-vous continuer ?`
    );
    
    if (!confirmed) return;
    
    // Double confirmation
    const doubleConfirm = confirm(
        `⚠️ DERNIÈRE CONFIRMATION\n\n` +
        `Êtes-vous absolument certain de vouloir restaurer la base ?\n\n` +
        `Tapez OK pour confirmer.`
    );
    
    if (!doubleConfirm) return;
    
    // Afficher un loader
    const content = document.getElementById('restoreContent');
    content.innerHTML = `
        <div style="text-align: center; padding: 60px;">
            <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
            <p style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Restauration en cours...</p>
            <p style="color: var(--text-secondary); font-size: 14px;">Ne fermez pas cette fenêtre</p>
        </div>
    `;
    
    try {
        const bodyData = {};
        if (selectedBackupFile) {
            bodyData.filename = selectedBackupFile;
        }
        if (uploadedBackupData) {
            bodyData.fileData = uploadedBackupData;
        }
        
        const data = await fetchJSON(`${API_URL}/restore`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include',
            body: JSON.stringify(bodyData)
        });
        
        // Succès
        content.innerHTML = `
            <div style="text-align: center; padding: 60px;">
                <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
                <p style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #10b981;">Restauration réussie !</p>
                <p style="color: var(--text-secondary); margin-bottom: 8px;">Backup de sécurité créé : ${data.safetyBackup}</p>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">Le serveur va redémarrer dans quelques secondes...</p>
                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px; margin-top: 20px;">
                    <p style="font-size: 14px; color: var(--text-primary); margin: 0;">
                        ⏳ Rechargement automatique de la page...
                    </p>
                </div>
            </div>
        `;
        
        // Recharger la page après 3 secondes
        setTimeout(() => {
            window.location.reload();
        }, 3000);
        
    } catch (err) {
        console.error('Erreur restauration:', err);
        content.innerHTML = `
            <div style="text-align: center; padding: 60px;">
                <div style="font-size: 64px; margin-bottom: 20px;">❌</div>
                <p style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #ef4444;">Erreur lors de la restauration</p>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">${err.message}</p>
                <button class="btn-primary" onclick="showRestorePanel()">Réessayer</button>
            </div>
        `;
    }
}

function closeRestorePanel() {
    document.getElementById('restorePanel').classList.remove('active');
    selectedBackupFile = null;
    uploadedBackupData = null;
}

// Fonction qui affiche les stats backup :
async function showBackupInfo() {
    try {
        const config = await fetchJSON(`${API_URL}/config/backup`, {
            credentials: 'include'
        });
        
        let message = '⏰ Configuration backup automatique\n\n';
        if (config.mode === 'fixed') {
            message += `Mode : Quotidien à heure fixe\n`;
            message += `Heure : ${config.backupTime}\n`;
        } else if (config.mode === 'periodic') {
            message += `Mode : Périodique\n`;
            message += `Fréquence : Toutes les ${config.backupFrequencyHours}h\n`;
        } else {
            message += `Mode : Désactivé\n`;
        }
        message += `\nNombre de backups conservés : ${config.backupRetentionCount}`;
        
        alert(message);

    } catch (err) {
        console.error('Erreur récupération config backup:', err);
    }
}

// Rendre les fonctions globales
window.createBackup = createBackup;

window.showRestorePanel = showRestorePanel;
window.renderRestorePanel = renderRestorePanel;
window.setupDragAndDrop = setupDragAndDrop;
window.handleFileSelect = handleFileSelect;
window.handleFile = handleFile;
window.selectBackup = selectBackup;
window.confirmRestore = confirmRestore;
window.closeRestorePanel = closeRestorePanel;
window.showBackupInfo = showBackupInfo;
