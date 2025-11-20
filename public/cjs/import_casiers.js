// ============ MODAL IMPORT CASIERS UNIFIÉ ============

let selectedLockersImportFormat = 'csv';
let selectedLockersImportMode = 'update';
let selectedLockersImportSeparator = 'auto';

// Modal de sélection de fichiers casiers à importer
async function showLockersImportOptions() {
    if (!isEditAllowed()) return;
    
    // Réinitialiser les valeurs
    selectedLockersImportFormat = 'csv';
    selectedLockersImportMode = 'update';
    selectedLockersImportSeparator = 'auto';
    
    document.getElementById('lockersImportFormat').value = 'csv';
    document.getElementById('lockersImportMode').value = 'update';
    document.getElementById('lockersImportSeparator').value = 'auto';
    document.getElementById('lockersImportWarning').style.display = 'none';
    
    // Afficher/masquer le sélecteur de séparateur selon le format
    updateSeparatorVisibility();
    
    // Gérer l'affichage du warning
    const modeSelect = document.getElementById('lockersImportMode');
    const warning = document.getElementById('lockersImportWarning');
    
    modeSelect.onchange = function() {
        selectedLockersImportMode = this.value;
        if (this.value === 'replace') {
            warning.style.display = 'block';
        } else {
            warning.style.display = 'none';
        }
    };
    
    const formatSelect = document.getElementById('lockersImportFormat');
    formatSelect.onchange = function() {
        selectedLockersImportFormat = this.value;
        updateSeparatorVisibility();
    };
    
    // Gestionnaire pour le séparateur
    const separatorSelect = document.getElementById('lockersImportSeparator');
    if (separatorSelect) {
        separatorSelect.onchange = function() {
            selectedLockersImportSeparator = this.value;
        };
    }
    
    // Ouvrir le modal
    document.getElementById('lockersImportOptionsModal').classList.add('active');
}

// Afficher (CSV) ou masquer (JSON) le champ séparateur
function updateSeparatorVisibility() {
    const separatorGroup = document.getElementById('importLockersSeparatorGroup');
    if (separatorGroup) {
        separatorGroup.style.display = selectedLockersImportFormat === 'csv' ? 'block' : 'none';
    }
}

// Close modal Import Casiers
function closeLockersImportOptions() {
    document.getElementById('lockersImportOptionsModal').classList.remove('active');
}

function selectFileForLockersImport() {
    closeLockersImportOptions();
    
    const fileInput = document.getElementById('lockersFileInput');
    fileInput.value = '';
    fileInput.accept = selectedLockersImportFormat === 'csv' ? '.csv' : '.json';
    fileInput.onchange = handleLockersFileSelected;
    fileInput.click();
}

// Fonction d'analyse des fichiers casiers à importer 
function analyzeLockersFile(content, format, separator) {
    try {
        if (format === 'json') {
            const jsonData = JSON.parse(content);
            const data = jsonData.lockers || jsonData;
            
            if (!Array.isArray(data)) {
                return { valid: false, error: 'Format JSON invalide : doit contenir un tableau de casiers' };
            }
            
            // Vérifier les champs obligatoires
            const requiredFields = ['number', 'zone'];
            const sampleLocker = data[0] || {};
            const missingFields = requiredFields.filter(f => !(f in sampleLocker));
            
            if (missingFields.length > 0) {
                return { 
                    valid: false, 
                    error: `Champs manquants : ${missingFields.join(', ')}` 
                };
            }
            
            return {
                valid: true,
                format: 'JSON',
                totalRows: data.length,
                occupiedRows: data.filter(l => l.name && l.firstName).length,
                columns: Object.keys(sampleLocker),
                metadata: jsonData.metadata || null,
                sample: data.slice(0, 3),
                rawConent: content,
                backContent: jsonData
            };
            
        } else {
            // CSV
            const lines = content.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                return { valid: false, error: 'Fichier CSV vide ou invalide (moins de 2 lignes)' };
            }
            
            // Détecter séparateur
            const usedSeparator = separator === 'auto' 
                ? detectCSVSeparator(content) 
                : separator;
            
            const headers = parseCsvLine(lines[0], usedSeparator);
            const dataLines = lines.slice(1);
            
            // Vérifier nombre de colonnes
            const expectedColumns = 16; // number, zone, name, firstName, code, birthDate, recoverable, marque, hosp, hospDate, stup, idel, frigo, pca, meopa, comment
            
            if (headers.length < 6) {
                return { 
                    valid: false, 
                    error: `Nombre de colonnes insuffisant : ${headers.length} trouvées, au moins 6 requises\nColonnes détectées : ${headers.join(', ')}` 
                };
            }
            
            // Parser quelques lignes pour vérifier
            const sampleData = dataLines.slice(0, 3).map(line => {
                const values = parseCsvLine(line, usedSeparator);
                return {
                    number: values[0],
                    zone: values[1],
                    name: values[2],
                    firstName: values[3],
                    code: values[4], 
                    birthDate: values[5],
                    columnCount: values.length,
                    rawConent: content,
                    backContent: content
                };
            });
            
            const occupiedCount = dataLines.filter(line => {
                const values = parseCsvLine(line, usedSeparator);
                return values[2] && values[3]; // name et firstName
            }).length;
            
            return {
                valid: true,
                format: 'CSV',
                separator: usedSeparator === '\t' ? 'TAB' : usedSeparator,
                totalRows: dataLines.length,
                occupiedRows: occupiedCount,
                emptyRows: dataLines.length - occupiedCount,
                columns: headers,
                columnCount: headers.length,
                expectedColumnCount: expectedColumns,
                columnsMatch: headers.length >= expectedColumns,
                sample: sampleData
            };
        }
    } catch (err) {
        return { 
            valid: false, 
            error: `Erreur parsing : ${err.message}` 
        };
    }
}

// Modal d'analyse de fichier à importer
async function handleLockersFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!isEditAllowed()) return;

    try {
        const text = await file.text();
        
        // Analyser le fichier
        const analysis = analyzeLockersFile(text, selectedLockersImportFormat, selectedLockersImportSeparator);
        
        if (!analysis.valid) {
            alert(`❌ Fichier invalide\n\n${analysis.error}`);
            return;
        }
        
        // Afficher popup de confirmation avec analyse
        const confirmImport = await showImportConfirmation(file.name, analysis);
        
        if (!confirmImport) {
            return;
        }
        
        // Procéder à l'import
        await performLockersImport(text, file.name);
        
    } catch (err) {
        console.error('Erreur lecture fichier:', err);
        alert('❌ Erreur lecture fichier : ' + err.message);
    }
}

// Parser une ligne CSV avec séparateur personnalisé et échappement des guillemets (copie de server.js)
// TODO: éviter le doublon server.js, utiliser la librairie csv
function parseCsvLine(line, separator = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"'; // Guillemet échappé
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === separator && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result.map(v => v.replace(/^"|"$/g, ''));
}

// // Fonction de détection automatique du séparateur CSV (copie de server.js)
function detectCSVSeparator(fileContent) {
    const lines = fileContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return ',';

    const firstLine = lines[0];
    const secondLine = lines[1];

    const separators = [';', ',', '\t', '|'];
    const scores = {};

    for (const sep of separators) {
      try {
        // Utiliser parseCsvLine si disponible pour compter les colonnes
        const cols1 = parseCsvLine(firstLine, sep).length;
        const cols2 = parseCsvLine(secondLine, sep).length;
        scores[sep] = (cols1 + cols2);
      } catch (e) {
        scores[sep] = 0;
      }
    }

    // Choisir le séparateur avec le meilleur score; fallback ','
    let bestSep = ',';
    let bestScore = -1;
    for (const [sep, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestSep = sep;
      }
    }

    console.log('detectCSVSeparator → choisi:', bestSep, 'scores:', scores);
    return bestSep || ',';
}

// Fonction de confirmation avec popup
async function showImportConfirmation(filename, analysis) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '10000';
    
    let detailsHTML = '';
    
    if (analysis.format === 'JSON') {
        detailsHTML = `
            <div class="analysis-details">
                <div class="detail-row">
                    <span class="label">Format :</span>
                    <span class="value">JSON</span>
                </div>
                <div class="detail-row">
                    <span class="label">Casiers totaux :</span>
                    <span class="value">${analysis.totalRows}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Casiers occupés :</span>
                    <span class="value">${analysis.occupiedRows}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Champs détectés :</span>
                    <span class="value">${analysis.columns.length} (${analysis.columns.join(', ')})</span>
                </div>
                ${analysis.metadata ? `
                    <div class="detail-row">
                        <span class="label">Métadonnées :</span>
                        <span class="value">Exporté le ${new Date(analysis.metadata.exportDate).toLocaleString('fr-FR')} par ${analysis.metadata.exportBy}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="sample-section">
                <strong>Aperçu (3 premiers casiers) :</strong>
                <div style="font-family: monospace; font-size: 11px; background: var(--bg-secondary); padding: 10px; border-radius: 4px; margin-top: 8px; max-height: 150px; overflow-y: auto;">
                    ${analysis.sample.map(l => `${l.number} - ${l.zone} - ${l.name || '(vide)'} ${l.firstName || ''}`).join('<br>')}
                </div>
            </div>
        `;
    } else {
        //--- CSV
        const warningIcon = !analysis.columnsMatch ? '⚠️' : '✓';
        const warningColor = !analysis.columnsMatch ? '#f59e0b' : '#10b981';
        
        detailsHTML = `
            <div class="analysis-details">
                <div class="detail-row">
                    <span class="label">Format :</span>
                    <span class="value">CSV</span>
                </div>
                <div class="detail-row">
                    <span class="label">Séparateur :</span>
                    <span class="value">${analysis.separator}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Lignes totales :</span>
                    <span class="value">${analysis.totalRows}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Casiers occupés :</span>
                    <span class="value">${analysis.occupiedRows}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Casiers vides :</span>
                    <span class="value">${analysis.emptyRows}</span>
                </div>
                <div class="detail-row" style="border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 8px;">
                    <span class="label">Colonnes détectées :</span>
                    <span class="value" style="color: ${warningColor};">${warningIcon} ${analysis.columnCount} / ${analysis.expectedColumnCount} attendues</span>
                </div>
            </div>
            
            ${!analysis.columnsMatch ? `
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin: 16px 0;">
                    <strong style="color: #92400e;">⚠️ Avertissement :</strong>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #78350f;">
                        Le fichier contient ${analysis.columnCount} colonne(s), ${analysis.expectedColumnCount} attendues.<br>
                        Colonnes manquantes potentielles : IDEL, Commentaire, etc.<br>
                        L'import peut échouer ou être incomplet.
                    </p>
                </div>
            ` : ''}
            
            <div class="sample-section">
                <strong>En-têtes détectés :</strong>
                <div style="font-family: monospace; font-size: 11px; background: var(--bg-secondary); padding: 10px; border-radius: 4px; margin-top: 8px;">
                    ${analysis.columns.map((col, i) => `${i+1}. ${col}`).join('; ')}
                </div>
            </div>
            
            <div class="sample-section">
                <strong>Aperçu (3 premières lignes) :</strong>
                <div style="font-family: monospace; font-size: 11px; background: var(--bg-secondary); padding: 10px; border-radius: 4px; margin-top: 8px; max-height: 120px; overflow-y: auto;">
                    ${analysis.sample.map(l => `${l.number || '?'} | ${l.zone || '?'} | ${l.name || '(vide)'} ${l.firstName || ''} | ${l.columnCount} col.`).join('<br>')}
                </div>
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">📋 Analyse du fichier</div>
            
            <div style="padding: 20px;">
                <div style="background: #e0f2fe; border: 1px solid #0ea5e9; border-radius: 6px; padding: 12px; margin-bottom: 20px;">
                    <strong style="color: #0c4a6e;">📁 ${filename}</strong>
                </div>
                
                ${detailsHTML}
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                    <strong>Mode d'import sélectionné :</strong>
                    <p style="margin: 8px 0; font-size: 14px; color: var(--text-secondary);">
                        ${selectedLockersImportMode === 'replace' 
                            ? '🗑️ Remplacement complet (vide tous les casiers puis importe)' 
                            : '📝 Mise à jour (remplace uniquement les casiers du fichier)'}
                    </p>
                </div>
                
                <div class="modal-footer" style="margin-top: 24px;">
                    <button class="btn-secondary" id="btnCancelImport">Annuler</button>
                    <button class="btn-primary" id="btnConfirmImport">✓ Importer</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    return new Promise((resolve) => {
        document.getElementById('btnConfirmImport').onclick = () => {
            document.body.removeChild(modal);
            resolve(true);
        };
        document.getElementById('btnCancelImport').onclick = () => {
            document.body.removeChild(modal);
            resolve(false);
        };
    });
}

// Réaliser l'import des casiers 
async function performLockersImport(content, filename) {
    const importBtn = Array.from(document.querySelectorAll('.admin-tools-content button'))
        .find(btn => btn.textContent.includes('Import casiers'));
    const originalText = importBtn ? importBtn.innerHTML : '';
    
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = '⏳ Import...';
        importBtn.classList.add('btn-loading');
    }
    
    try {

        let routeImport = '';
        let routeContent = '';
        if (selectedLockersImportFormat === 'json') {
            routeImport = `${API_URL}/import-json`; 
/*            data = content.backContent;   // provient de JSON.parse(content);
            routeData = data.lockers;
            routeMetadata = data.metadata;*/
            console.log("Route d'import JSON:", routeImport)
        } else {
            routeImport = `${API_URL}/import`; 
/*            routeMetadata = filename; // TODO: analyser le nom du fichier pour récupérer la date
            routeData = ''; // rien en CSV*/
            console.log("Route d'import CSV:", routeImport)
        }

        //TEST: route unifiée
        //routeImport = `${API_URL}/import-unified`
        const result = await fetchJSON(routeImport, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include',
            body: JSON.stringify({ 
                rawContent: content,
                format: selectedLockersImportFormat,
                mode: selectedLockersImportMode,
                separator: selectedLockersImportSeparator
            })
        });

        let message = `✅ Import terminé !\n\n`;
        message += `✓ Importés : ${result.imported}\n`;
        if (result.skipped > 0) {
            message += `⭐ Ignorés (déjà occupés) : ${result.skipped}\n`;
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
        // Suggestion GEMINI: Affichage des erreurs détaillées
        if (result.detailedErrors && result.detailedErrors.length > 0) {
            message += `\n--- Détail des erreurs de validation (${result.validationErrors} lignes) ---\n`;
            // Limiter l'affichage pour éviter un trop long message d'alerte
            const errorsToShow = result.detailedErrors.slice(0, 10);
            errorsToShow.forEach(err => {
                message += `Ligne ${err.line} (Casier ${err.casier}) : ${err.error}\n`;
            });
            if (result.detailedErrors.length > 10) {
                 message += `\n... et ${result.detailedErrors.length - 10} autres erreurs non affichées.`;
            }
            message += `\n---------------------------------------------\n`;
            message += `\nVeuillez corriger le fichier source et réessayer.`;
        }
        message += `\nTotal des lignes traitées : ${result.total}`;
        
        alert(message);
        loadData();
        closeLockersImportOptions();
        
    } catch (err) {
        if (err instanceof SyntaxError) {
            alert('❌ Erreur : Le fichier n\'est pas un JSON valide.\n\n' + err.message);
        } else {
            alert('❌ Erreur lors de l\'import casiers : ' + err.message);
        }
        console.error('Erreur lors de l\'import casiers :', err);
    } finally {
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = originalText;
            importBtn.classList.remove('btn-loading');
        }
    }
}

// Vider la table lockers dans la base de données
async function clearLockersDatabase() {
    console.log('✓ Route DELETE /api/admin/clear-all-lockers montée');

    const confirmFirst = confirm(
        '⚠️ ATTENTION - LIBÉRATION DE TOUS LES CASIERS\n\n' +
        'Vous allez libérer TOUS les casiers de TOUTES les zones.\n\n' +
        'Êtes-vous ABSOLUMENT CERTAIN de vouloir libérer tous les casiers ?\n\n' +
        'Sans export préalable, cette action est IRRÉVERSIBLE.\n\n' +
        'Avez-vous fait un export des casiers pour sauvegarder la base actuelle?\n\n' +
        'Voulez-vous continuer ?'
    );
    
    if (!confirmFirst) return;
    
/*    const confirmSecond = confirm(
        '⚠️ DERNIÈRE CONFIRMATION\n\n' +
        'Êtes-vous ABSOLUMENT CERTAIN de vouloir libérer tous les casiers ?\n' +
        'Avez-vous fait un export pour sauvegarder la base actuelle?\n\n' +
        'Tapez OK pour confirmer.'
    );
    
    if (!confirmSecond) return;
*/    
    try {
        const data = await fetchJSON(`${API_URL}/admin/clear-all-lockers`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 
                'X-CSRF-Token': CSRF_TOKEN
            }
        }, {
            retries: 3,
            timeout: 100,  // 60s pour les gros imports
            retryOn: [500, 502, 503, 504]
        });
    
        alert(`✓ Tous les casiers ont été libérés\n\n${data.cleared} casier(s) libéré(s)`);
        loadData();  // Recharger les données
        closeLockersImportOptions();  // Fermer le modal
        
    } catch (err) {
        console.error('Erreur libération casiers:', err);
        alert('❌ Erreur : ' + err.message);
    }
}

// Rendre les fonctions globales
window.showLockersImportOptions = showLockersImportOptions;
window.updateSeparatorVisibility = updateSeparatorVisibility;
window.closeLockersImportOptions = closeLockersImportOptions;
window.selectFileForLockersImport = selectFileForLockersImport;
window.analyzeLockersFile = analyzeLockersFile;
window.handleLockersFileSelected = handleLockersFileSelected;
window.parseCsvLine = parseCsvLine;
window.detectCSVSeparator = detectCSVSeparator;
window.showImportConfirmation = showImportConfirmation;
window.performLockersImport = performLockersImport;
window.clearLockersDatabase = clearLockersDatabase;
