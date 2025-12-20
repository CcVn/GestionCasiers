// ============ MODAL EXPORT UNIFIÉ ============

let selectedExportFormat = 'csv';
let selectedExportSeparator = ';';
let selectedExportIncludeEmpty = false;

// Fonction utilitaire
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Modal Export Casiers
function showLockersExportOptions() {
    if (!isEditAllowed()) return;
    
    // Réinitialiser les valeurs
    selectedExportFormat = 'csv';
    selectedExportSeparator = ';';
    selectedExportIncludeEmpty = false;
    
    document.getElementById('exportFormat').value = 'csv';
    document.getElementById('exportSeparator').value = ';';
    document.getElementById('exportIncludeEmpty').checked = false;
    
    // Afficher/masquer le sélecteur de séparateur selon le format
    updateExportSeparatorVisibility();
    
    // Gestionnaires d'événements
    const formatSelect = document.getElementById('exportFormat');
    formatSelect.onchange = function() {
        selectedExportFormat = this.value;
        updateExportSeparatorVisibility();
    };
    
    const separatorSelect = document.getElementById('exportSeparator');
    separatorSelect.onchange = function() {
        selectedExportSeparator = this.value;
    };
    
    const includeEmptyCheckbox = document.getElementById('exportIncludeEmpty');
    includeEmptyCheckbox.onchange = function() {
        selectedExportIncludeEmpty = this.checked;
    };
    
    // Ouvrir le modal
    document.getElementById('exportOptionsModal').classList.add('active');
}

// Close modal Export Casiers
function closeExportOptions() {
    document.getElementById('exportOptionsModal').classList.remove('active');
}

// Afficher (CSV) ou masquer (JSON) le champ séparateur
function updateExportSeparatorVisibility() {
    const separatorGroup = document.getElementById('exportLockersSeparatorGroup');
    if (separatorGroup) {
        separatorGroup.style.display = selectedExportFormat === 'csv' ? 'block' : 'none';
    }
}

// Gestionnaire de soumission du formulaire d'export unifié
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('exportOptionsForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            
            // LOADING STATE
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Export...';
            submitBtn.classList.add('btn-loading');
            
            try {
                const data = await fetchJSON(`${API_URL}/export`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getState('auth.csrfToken')
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        format: selectedExportFormat,
                        separator: selectedExportSeparator,
                        includeEmpty: selectedExportIncludeEmpty
                    })
                });
                
                // Télécharger le fichier
                downloadFile(data.content, data.filename, data.mimeType);
                // Fermer le modal
                closeExportOptions();
                // Message de succès
                showStatus(`✓ ${data.recordCount} casier${data.recordCount > 1 ? 's' : ''} exporté${data.recordCount > 1 ? 's' : ''}`, 'success');
                
            } catch (err) {
                console.error('Erreur export:', err);
                alert('❌ Erreur lors de l\'export : ' + err.message);
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
window.downloadFile = downloadFile;
window.showLockersExportOptions = showLockersExportOptions;
window.closeExportOptions = closeExportOptions;
window.updateExportSeparatorVisibility = updateExportSeparatorVisibility;