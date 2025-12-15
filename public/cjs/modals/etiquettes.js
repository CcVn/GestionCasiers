// ============ MODAL GLOBAL IMPRESSION ÉTIQUETTES ================

function updateLabelPreview() {
    const selection = document.getElementById('labelSelection').value;
    
    // Afficher/masquer les options
    document.getElementById('zoneSelector').style.display = selection === 'zone' ? 'block' : 'none';
    document.getElementById('rangeSelector').style.display = selection === 'range' ? 'block' : 'none';
    
    // Calculer le nombre de casiers et d'étiquettes
    const lockers = getSelectedLockersForLabels();
    const repetition = parseInt(document.getElementById('labelRepetition').value) || 1;
    const totalLabels = lockers.length * repetition;
    
    // Mettre à jour l'affichage
    document.getElementById('labelLockerCount').textContent = lockers.length;
    document.getElementById('labelTotalCount').textContent = totalLabels;
    
    // Calculer le nombre de pages
    const format = document.getElementById('labelFormat').value;
    const labelsPerPage = format === '5x13' ? 65 : 27;
    const pagesNeeded = Math.ceil(totalLabels / labelsPerPage);
    const lastPageLabels = totalLabels % labelsPerPage || labelsPerPage;
    
    // Afficher les infos de pagination
    const pagesInfo = document.getElementById('labelPagesInfo');
    if (totalLabels === 0) {
        pagesInfo.innerHTML = '<span style="color: var(--text-tertiary);">Aucun casier sélectionné</span>';
    } else {
        pagesInfo.innerHTML = `
            📄 ${pagesNeeded} page${pagesNeeded > 1 ? 's' : ''} nécessaire${pagesNeeded > 1 ? 's' : ''}
            ${pagesNeeded > 1 ? `<br><span style="font-size: 11px;">(Dernière page : ${lastPageLabels} étiquette${lastPageLabels > 1 ? 's' : ''})</span>` : ''}
        `;
    }
}

// Réglages du modal
function showLabelPrintDialog() {
    const modal = document.getElementById('labelPrintModal');
    
    // Remplir le sélecteur de zones
    const zoneSelect = document.getElementById('labelZone');
    zoneSelect.innerHTML = getState('data.zonesConfig').map(zone => 
        `<option value="${zone.name}">${zone.name}</option>`
    ).join('');
    
    // Réinitialiser
    document.getElementById('labelFormat').value = '3x9';
    document.getElementById('labelSelection').value = 'all';
    document.getElementById('labelMarkerFilter').value = 'none'; // NOUVEAU
    document.getElementById('labelRepetition').value = '1';
    document.getElementById('zoneSelector').style.display = 'none';
    document.getElementById('rangeSelector').style.display = 'none';
    document.getElementById('labelAnonymize').checked = ANONYMIZE_ENABLED;

    updateLabelPreview();
    modal.classList.add('active');
}

// Sélectionner les casiers
function getSelectedLockersForLabels() {
    const selection = document.getElementById('labelSelection').value;
    const markerFilter = document.getElementById('labelMarkerFilter').value;
    let lockers = getState('data.lockers').filter(l => l.occupied);
    
    // Filtre de sélection (tous/zone/plage)
    if (selection === 'zone') {
        const zone = document.getElementById('labelZone').value;
        lockers = lockers.filter(l => l.zone === zone);
    } else if (selection === 'range') {
        const start = document.getElementById('labelRangeStart').value.trim().toUpperCase();
        const end = document.getElementById('labelRangeEnd').value.trim().toUpperCase();
        
        if (start && end) {
            lockers = lockers.filter(l => {
                const num = l.number;
                return num >= start && num <= end;
            });
        }
    }
    
    // Filtre par marqueur (s'applique après)
    if (markerFilter !== 'none') {
        switch(markerFilter) {
            case 'marked':
                lockers = lockers.filter(l => l.marque);
                break;
            case 'hosp':
                lockers = lockers.filter(l => l.hosp);
                break;
            case 'stup':
                lockers = lockers.filter(l => l.stup);
                break;
            case 'idel':
                lockers = lockers.filter(l => l.idel);
                break;
            case 'frigo':
                lockers = lockers.filter(l => l.frigo);
                break;
            case 'pca':
                lockers = lockers.filter(l => l.pca);
                break;
            case 'meopa':
                lockers = lockers.filter(l => l.meopa);
                break;
        }
    }
    
    // Trier par numéro
    lockers.sort((a, b) => a.number.localeCompare(b.number));
    
    return lockers;
}

// Ouvrir la page d'impression d'étiquettes (Bouton Imprimer du modal)
function openLabelPrintWindow() {
    const format = document.getElementById('labelFormat').value;
    const anonymize = document.getElementById('labelAnonymize').checked;
    const repetitionInput = document.getElementById('labelRepetition');
    let repetition = parseInt(repetitionInput.value);
    
    // Validation stricte
    if (isNaN(repetition) || repetition < 1) {
        repetition = 1;
        repetitionInput.value = 1;
        alert('⚠️ Le nombre de copies doit être au minimum 1.\nValeur réinitialisée à 1.');
        return;
    }
    
    const nb_max_repet = 20;
    if (repetition > nb_max_repet) {
        repetition = nb_max_repet;
        repetitionInput.value = nb_max_repet;
        alert(`⚠️ Le nombre de copies ne peut pas dépasser ${nb_max_repet}.\nValeur limitée à ${nb_max_repet}.`);
        return;
    }

    const lockers = getSelectedLockersForLabels();
    
    if (lockers.length === 0) {
        alert('Aucun casier sélectionné');
        return;
    }

    // Vérification de la taille totale
    const totalLabels = lockers.length * repetition;
    const labelsPerPage = format === '5x13' ? 65 : 27;
    const pagesNeeded = Math.ceil(totalLabels / labelsPerPage);
    
    // Avertissement si trop de pages
    if (pagesNeeded > 20) {
        const confirm = window.confirm(
            `⚠️ ATTENTION\n\n` +
            `Vous allez imprimer ${totalLabels} étiquettes sur ${pagesNeeded} pages.\n\n` +
            `Cela peut prendre du temps et consommer beaucoup de papier.\n\n` +
            `Voulez-vous continuer ?`
        );
        if (!confirm) return;
    }

    // Dupliquer les casiers selon le nombre de répétitions
    const duplicatedLockers = [];
    lockers.forEach(locker => {
        for (let i = 0; i < repetition; i++) {
            duplicatedLockers.push(locker);
        }
    });
    
    if (VERBCONSOLE > 0) {
        console.log(`🏷️ Impression d'étiquettes:`);
        console.log(`   - Casiers uniques: ${lockers.length}`);
        console.log(`   - Répétitions: ${repetition}`);
        console.log(`   - Total étiquettes: ${duplicatedLockers.length}`);
        console.log(`   - Pages nécessaires: ${pagesNeeded}`);
    }
    
    // Créer une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Générer le HTML
    const html = generateLabelHTML(duplicatedLockers, format, anonymize);
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Attendre le chargement puis imprimer
    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

// Générer la page d'étiquettes au format HTML
function generateLabelHTML(lockers, format, anonymize) {

    if (VERBCONSOLE==1) {
        console.log('🏷️ generateLabelHTML appelée avec:');
        console.log('  - Nombre de casiers:', lockers.length);
        console.log('  - Anonymisation:', anonymize);
        console.log('  - ANONYMIZE_ENABLED (global):', ANONYMIZE_ENABLED);
    }

    const [cols, rows] = format === '5x13' ? [5, 13] : [3, 9];
    const perPage = cols * rows;
    
    // Dimensions calculées (A4 = 210mm × 297mm)
    const pageWidth = 210; // mm
    const pageHeight = 297; // mm
    const marginTop = format === '5x13' ? 11 : 15; // physiquement 10 et 15 mm
    const marginBottom = format === '5x13' ? 10 : 15; // physiquement 10 et 15 mm
    const marginLeft = format === '5x13' ? 6 : 6; // physiquement 5 et 6 mm
    const marginRight = format === '5x13' ? 5 : 6; // physiquement 5 et 6 mm
    
    const usableWidth = pageWidth - marginLeft - marginRight;
    const usableHeight = pageHeight - marginTop - marginBottom;
    
    const labelWidth = usableWidth / cols;
    const labelHeight = usableHeight / rows;

    // Compter les casiers uniques
    const uniqueLockers = new Set(lockers.map(l => l.number));
    const totalPages = Math.ceil(lockers.length / perPage);

    // FONCTION LOCALE D'ANONYMISATION
    const anonymizeNameLocal = (name) => {
        if (!anonymize || !name) return name;
        return name.substring(0, 3).toUpperCase();
    };
    
    const anonymizeFirstNameLocal = (firstName) => {
        if (!anonymize || !firstName) return firstName;
        return firstName.substring(0, 2);
    };
    
    let html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Étiquettes casiers</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        @page {
            size: A4;
            margin: 0;
        }
        
        body {
            font-family: Arial, sans-serif;
            background: white;
        }
        
        .page {
            width: ${pageWidth}mm;
            height: ${pageHeight}mm;
            padding: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
            page-break-after: always;
            position: relative;
        }
        
        .page:last-child {
            page-break-after: auto;
        }
        
        .label-grid {
            display: grid;
            grid-template-columns: repeat(${cols}, ${labelWidth}mm);
            grid-template-rows: repeat(${rows}, ${labelHeight}mm);
            width: 100%;
            height: 100%;
        }
        
        .label {
            border: 1px solid transparent;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 2mm;
            overflow: hidden;
            text-align: center;
        }

        .label-locker {
            font-size: ${format === '5x13' ? '9' : '11'}pt;
            font-weight: bold;
            margin-bottom: ${format === '5x13' ? '0.5' : '1'}mm;
            padding: 1mm 3mm;
            border-radius: 3px;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }
        

        .label-name {
            font-size: ${format === '5x13' ? '10' : '12'}pt;
            font-weight: bold;
            margin-bottom: ${format === '5x13' ? '0.5' : '1'}mm;
        }
        
        .label-info {
            font-size: ${format === '5x13' ? '7' : '9'}pt;
            color: #333;
            line-height: 1.3;
        }
        
        .label-zone {
            font-size: ${format === '5x13' ? '6' : '8'}pt;
            color: #666;
            margin-top: 1mm;
        }
        
        /* Footer avec info */
        .page-footer {
            position: absolute;
            bottom: 2mm;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 7pt;
            color: #999;
        }

        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .label {
                border: 1px solid #000;
            }
        }
    </style>
</head>
<body>
`;

    // Créer une map des couleurs par zone
    const zoneColors = {};
    getState('data.zonesConfig').forEach(zone => {
        zoneColors[zone.name] = zone.color || '#667eea';
    });
    //Détection homonymes
    const homonymInfo = detectHomonyms();
    const homonymNumbers = homonymInfo.homonyms;

    // Générer les pages
    for (let i = 0; i < lockers.length; i += perPage) {
        const pageLockers = lockers.slice(i, i + perPage);
        const currentPage = Math.floor(i / perPage) + 1;
        
        html += `<div class="page">
            <div class="label-grid">`;
        
        // Remplir la page
        for (let j = 0; j < perPage; j++) {
            if (j < pageLockers.length) {
                const locker = pageLockers[j];
                const name = anonymizeNameLocal(locker.name);
                const firstName = anonymizeFirstNameLocal(locker.firstName);
                const zoneColor = zoneColors[locker.zone] || '#667eea';

                const isHomonym = homonymNumbers.has(locker.number);
                const homonymStyle = isHomonym ? 'text-decoration: underline wavy #9333ea;' : '';

                // NOUVEAU : Icônes pour IDEL et Frigo
                const idelIcon = locker.idel ? '<span style="font-size: 10pt; margin-left: 2mm;">ℹ️</span>' : '';
                const frigoIcon = locker.frigo ? '<span style="font-size: 10pt; margin-left: 2mm;">❄️</span>' : '';
                const markers = idelIcon + frigoIcon;

                html += `
                    <div class="label">
                        <div class="label-info">IPP: ${locker.code}</div>
                        <div class="label-name" style="${homonymStyle}">
                            ${name} ${firstName}
                        </div>
                        <div class="label-info">
                            DDN: ${locker.birthDate ? formatDate(locker.birthDate) : ''}
                        </div>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 2mm; width: 100%;">
                            <div class="label-locker" style="color: ${zoneColor};">${locker.number}</div>
                            ${markers ? `<div style="display: flex; align-items: center;">${markers}</div>` : ''}
                        </div>
                    </div>
                `;
            } else {
                // Étiquette vide pour compléter la grille
                html += `<div class="label"></div>`;
            }
        }
        
        html += `</div>
            <div class="page-footer">
                Page ${currentPage}/${totalPages} • ${uniqueLockers.size} casier${uniqueLockers.size > 1 ? 's' : ''} • ${lockers.length} étiquette${lockers.length > 1 ? 's' : ''} • Généré le ${new Date().toLocaleDateString('fr-FR')}
            </div>
        </div>`;
    }
    
    html += `
</body>
</html>
`;
    
    return html;
}

// Fermer le modal "Etiquettes 1 casier" (bouton Annuler du modal)
function closeLabelPrintDialog() {
    document.getElementById('labelPrintModal').classList.remove('active');
}


// ============ MODAL IMPRESSION ÉTIQUETTES POUR CASIER ============

let CURRENT_LOCKER_FOR_PRINT = null;

// Configurer le modal "Etiquettes 1 casier"
function printSingleLockerLabels(lockerNumber) {
    const locker = getState('data.lockers').find(l => l.number === lockerNumber);
    
    if (!locker) {
        alert('Casier non trouvé');
        return;
    }
    if (!locker.occupied) {
        alert('Ce casier n\'est pas attribué, impossible d\'imprimer des étiquettes!');
        return;
    }
    
    CURRENT_LOCKER_FOR_PRINT = locker;
    
    // Remplir les infos
    const infoDiv = document.getElementById('singleLabelInfo');
    infoDiv.innerHTML = `
        <div style="font-size: 14px;">
            <span style="color: var(--text-secondary); text-align: center;">IPP: ${locker.code}</span>            
            <strong style="font-size: 16px; text-align: center;">${locker.name} ${locker.firstName}</strong><br>
            <span style="color: var(--text-secondary);">DDN: ${locker.birthDate ? formatDate(locker.birthDate) : ''}</span>
            <span style="color: var(--text-secondary);">${locker.number}</span>
        </div>
    `;
    
    // Réinitialiser
    document.getElementById('singleLabelFormat').value = '3x9';
    document.getElementById('singleLabelAnonymize').checked = false;
    
    // Ouvrir le modal
    document.getElementById('singleLabelModal').classList.add('active');
}

// Fermer le modal "Etiquettes 1 casier" (bouton Annuler du modal)
function closeSingleLabelModal() {
    document.getElementById('singleLabelModal').classList.remove('active');
    CURRENT_LOCKER_FOR_PRINT = null;
}

// Fenêtre de confirmation avant impression
function confirmPrintSingleLabel() {
    if (!CURRENT_LOCKER_FOR_PRINT) return;
    
    const format = document.getElementById('singleLabelFormat').value;
    const anonymize = document.getElementById('singleLabelAnonymize').checked;
    const count = format === '3x9' ? 27 : 65;

    // Debug
    if (VERBCONSOLE > 0) {
        console.log('🏷️ Impression étiquette unique:');
        console.log('  - Casier:', CURRENT_LOCKER_FOR_PRINT.number);
        console.log('  - Anonymisation:', anonymize);
        console.log('  - Format:', format);
    }

    // Créer un tableau avec le même casier répété
    const lockers = Array(count).fill(CURRENT_LOCKER_FOR_PRINT);
    
    // Fermer le modal
    closeSingleLabelModal();
    
    // Créer une nouvelle fenêtre pour l'impression
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Générer le HTML
    const html = generateLabelHTML(lockers, format, anonymize);
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Attendre le chargement puis imprimer
    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

// Rendre les fonctions globales
window.updateLabelPreview = updateLabelPreview;
window.showLabelPrintDialog = showLabelPrintDialog;
window.getSelectedLockersForLabels = getSelectedLockersForLabels;
window.openLabelPrintWindow = openLabelPrintWindow;
window.generateLabelHTML = generateLabelHTML;
window.closeLabelPrintDialog = closeLabelPrintDialog;
window.printSingleLockerLabels = printSingleLockerLabels;
window.closeSingleLabelModal = closeSingleLabelModal;
window.confirmPrintSingleLabel = confirmPrintSingleLabel;
