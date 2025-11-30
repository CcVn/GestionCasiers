// ============ MODAL CONSULTATION MULTIZONES DES CASIERS  ============

// Dépendances: AppState, Utils, CONSTANTS, LockersModule, TablesModule

const ConsultationModule = {
    
    loadConsultationData() {
        // En mode consultation (guest), créer une vue simplifiée
        const lockers = LockersModule.getOccupiedLockers();
        
        AppState.consultationData = lockers.map(locker => ({
            number: locker.number,
            name: AppState.config.anonymizeEnabled 
                ? Utils.anonymizeName(locker.client_name || '')
                : locker.client_name || '',
            surname: AppState.config.anonymizeEnabled
                ? Utils.anonymizeName(locker.client_surname || '')
                : locker.client_surname || '',
            dateEntry: locker.date_entry ? Utils.formatDate(locker.date_entry) : '-',
            markers: this._getMarkers(locker),
            hospitalized: locker.hospitalisation ? '🚑' : '',
            idel: locker.idel ? 'ℹ️' : '',
            stupefiants: locker.stupefiants ? '💊' : ''
        }));
        
        return AppState.consultationData;
    },
    
    _getMarkers(locker) {
        const markers = [];
        if (locker.hospitalization) markers.push('Hospi');
        if (locker.idel) markers.push('IDEL');
        if (locker.stupefiants) markers.push('Stup');
        if (locker.recuperable) markers.push('Récup');
        return markers.join(', ');
    },
    
    sortData(column, direction) {
        AppState.config.consultation.sortColumn = column;
        AppState.config.consultation.sortDirection = direction;
        
        const sorted = Utils.sortBy(
            AppState.consultationData,
            column,
            direction
        );
        
        AppState.consultationData = sorted;
        return sorted;
    },
    
    toggleSort(column) {
        const current = AppState.config.consultation.sortColumn;
        let direction = 'asc';
        
        if (current === column) {
            direction = AppState.config.consultation.sortDirection === 'asc' ? 'desc' : 'asc';
        }
        
        return this.sortData(column, direction);
    },
    
    renderConsultationTable(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const data = AppState.consultationData;
        
        const table = Utils.createElement('table', 'consultation-table');
        
        // Header
        const thead = Utils.createElement('thead');
        const headerRow = Utils.createElement('tr');
        
        const headers = [
            { label: 'N°', column: 'number' },
            { label: 'Nom', column: 'name' },
            { label: 'Prénom', column: 'surname' },
            { label: 'Entrée', column: 'dateEntry' },
            { label: 'Marqueurs', column: 'markers' }
        ];
        
        headers.forEach(header => {
            const th = Utils.createElement('th');
            const btn = Utils.createElement('button');
            btn.textContent = header.label;
            btn.className = 'sort-button';
            
            if (AppState.config.consultation.sortColumn === header.column) {
                btn.classList.add('active');
                const arrow = AppState.config.consultation.sortDirection === 'asc' ? '↑' : '↓';
                btn.textContent += ' ' + arrow;
            }
            
            btn.addEventListener('click', () => {
                this.toggleSort(header.column);
                this.renderConsultationTable(containerId);
            });
            
            th.appendChild(btn);
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Body
        const tbody = Utils.createElement('tbody');
        data.forEach(row => {
            const tr = Utils.createElement('tr');
            tr.innerHTML = `
                <td>${row.number}</td>
                <td>${row.name}</td>
                <td>${row.surname}</td>
                <td>${row.dateEntry}</td>
                <td>${row.hospitalized}${row.idel}${row.stupefiants}</td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        
        container.innerHTML = '';
        container.appendChild(table);
    }
};

// Ouvrir le modal de consultation
function openConsultationCasiers(filterType = 'all') {
    const modal = document.getElementById('consultationCasiersModal');
    
    // Remplir le sélecteur de zones dynamiquement
    const zoneSelect = document.getElementById('consultationZone');
    zoneSelect.innerHTML = '<option value="all">Toutes les zones</option>';
    ZONES_CONFIG.forEach(zone => {
        const option = document.createElement('option');
        option.value = zone.name;
        option.textContent = zone.name;
        zoneSelect.appendChild(option);
    });
    
    // Définir le filtre par défaut
    document.getElementById('consultationFilter').value = filterType;
    document.getElementById('consultationZone').value = 'all';
    
    // Réinitialiser le tri
    consultationSortColumn = 'name';
    consultationSortDirection = 'asc';
    
    // Charger les données
    updateConsultationTable();
    
    // Afficher le modal
    modal.classList.add('active');
}

// Fermer le modal
function closeConsultationCasiers() {
    document.getElementById('consultationCasiersModal').classList.remove('active');
    consultationData = [];
}

// Mettre à jour la table selon les filtres
function updateConsultationTable() {
    const filterType = document.getElementById('consultationFilter').value;
    const zone = document.getElementById('consultationZone').value;
    
    // Filtrer les données
    let filtered = DATA.filter(l => l.occupied);
    
    // Appliquer le filtre de type
    switch(filterType) {
        case 'idel':
            filtered = filtered.filter(l => l.idel);
            break;
        case 'had':
            filtered = filtered.filter(l => !l.idel);
            break;
        case 'hosp':
            filtered = filtered.filter(l => l.hosp);
            break;
        case 'stup':
            filtered = filtered.filter(l => l.stup);
            break;
        case 'frigo':
            filtered = filtered.filter(l => l.frigo);
            break;
        case 'meopa':
            filtered = filtered.filter(l => l.meopa);
            break;
        case 'marked':
            filtered = filtered.filter(l => l.marque);
            break;
        case 'duplicates':
            const duplicateInfo = detectDuplicates();
            filtered = filtered.filter(l => duplicateInfo.duplicates.has(l.number));
            break;
        case 'homonyms':
            const homonymInfo = detectHomonyms();
            filtered = filtered.filter(l => homonymInfo.homonyms.has(l.number));
            break;
    }
    
    // Appliquer le filtre de zone
    if (zone !== 'all') {
        filtered = filtered.filter(l => l.zone === zone);
    }
    consultationData = filtered;

    sortConsultationData(); // Appliquer le tri actuel
    renderConsultationTable(); // Mettre à jour l'affichage
}

// Trier les données
function sortConsultationTable(column) {
    if (consultationSortColumn === column) {
        // Inverser la direction si même colonne
        consultationSortDirection = consultationSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // Nouvelle colonne, tri ascendant par défaut
        consultationSortColumn = column;
        consultationSortDirection = 'asc';
    }
    
    sortConsultationData();
    renderConsultationTable();
}

// Fonction de tri des données
function sortConsultationData() {
    consultationData.sort((a, b) => {
        let valA = a[consultationSortColumn] || '';
        let valB = b[consultationSortColumn] || '';
        
        // Pour les dates, convertir en timestamp
        if (consultationSortColumn === 'birthDate') {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        
        if (consultationSortDirection === 'asc') {
            return valA > valB ? 1 : valA < valB ? -1 : 0;
        } else {
            return valA < valB ? 1 : valA > valB ? -1 : 0;
        }
    });
}

// Afficher la table
function renderConsultationTable() {
    const tbody = document.getElementById('consultationTableBody');
    const countEl = document.getElementById('consultationCount');
    
    // Mettre à jour le compteur
    const byZone = {};
    ZONES_CONFIG.forEach(zone => {
        byZone[zone.name] = consultationData.filter(l => l.zone === zone.name).length;
    });
    let message = `📊 ${consultationData.length} patient${consultationData.length > 1 ? 's' : ''}`
    message += `\t[ Par zone : `
    Object.entries(byZone).forEach(([zone, count]) => {
        message += ` • ${zone}: ${count}`;
         });
    message += ` ]`;
    countEl.textContent = message;
    
    if (consultationData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    Aucun patient trouvé avec ces critères
                </td>
            </tr>
        `;
        return;
    }
    
    // Générer les lignes
    tbody.innerHTML = consultationData.map(locker => {
        const name = anonymizeName(locker.name);
        const firstName = anonymizeFirstName(locker.firstName);
        const birthDate = locker.birthDate ? formatDate(locker.birthDate) : '—';
        const comment = locker.comment || '—';
        
        return `
            <tr>
                <td><strong>${name}</strong></td>
                <td>${firstName}</td>
                <td>${birthDate}</td>
                <td>${locker.code}</td>
                <td><strong>${locker.number}</strong> <span style="font-size: 11px; color: var(--text-secondary);">(${locker.zone})</span></td>
                <td style="font-size: 12px; color: var(--text-secondary);">${comment}</td>
            </tr>
        `;
    }).join('');
}

// Exporter consultation en CSV.   TODO: à voir si on garde ou pas. Liste déroulante à adapter
function exportConsultationCSV() {
    if (consultationData.length === 0) {
        alert('Aucune donnée à exporter');
        return;
    }
    
    const filterType = document.getElementById('consultationFilter').value;
    const filterLabels = {
        'idel': 'IDEL-AS',
        'had': 'nonIDEL',
        'hosp': 'Hospi',
        'stup': 'Stupefiants',
        'marked': 'Marques',
        'duplicates': 'Doublons',
        'homonyms': 'Homonymes'
    };
    
    const headers = ['Nom', 'Prenom', 'Date de naissance', 'N°IPP', 'N° Casier', 'Zone', 'Commentaire'];
    const rows = consultationData.map(l => [
        l.name,
        l.firstName,
        l.birthDate || '',
        l.code,
        l.number,
        l.zone,
        l.comment || ''
    ]);
    
    const csv = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');
    
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `consultation_${filterLabels[filterType]}_${timestamp}.csv`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    showStatus(`✓ ${consultationData.length} patients exportés`, 'success');
}

// Imprimer la table de consultation  TODO: à voir si on garde ou pas. Liste déroulante à adapter
function printConsultationTable() {
    // Récupérer les données actuelles du modal
    const filterType = document.getElementById('consultationFilter').value;
    const zone = document.getElementById('consultationZone').value;
    
    const filterLabels = {
        'idel': 'IDEL-AS',
        'had': '100% HAD',
        'hosp': 'Hospitalisations',
        'stup': 'Stupéfiants',
        'marked': 'Marqués',
        'duplicates': 'Doublons',
        'homonyms': 'Homonymes'
    };
    
    const title = `Consultation : ${filterLabels[filterType]}${zone !== 'all' ? ` - Zone ${zone}` : ''}`;
    
    // Créer une fenêtre d'impression
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 15mm;
        }
        
        body {
            font-family: Arial, sans-serif;
            font-size: 11pt;
        }
        
        h1 {
            font-size: 16pt;
            margin-bottom: 10px;
        }
        
        .info {
            font-size: 10pt;
            color: #666;
            margin-bottom: 15px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
        }
        
        th, td {
            border: 1px solid #000;
            padding: 6px 8px;
            text-align: left;
        }
        
        th {
            background: #f0f0f0;
            font-weight: bold;
        }
        
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="info">
        ${consultationData.length} patient${consultationData.length > 1 ? 's' : ''} - 
        Édité le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}
    </div>
    <table>
        <thead>
            <tr>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Date de naissance</th>
                <th>N°IPP</th>
                <th>N° Casier</th>
                <th>Commentaire</th>
            </tr>
        </thead>
        <tbody>
            ${consultationData.map(locker => {
                const name = anonymizeName(locker.name);
                const firstName = anonymizeFirstName(locker.firstName);
                const birthDate = locker.birthDate ? formatDate(locker.birthDate) : '—';
                const comment = locker.comment || '—';
                
                return `
                    <tr>
                        <td><strong>${name}</strong></td>
                        <td>${firstName}</td>
                        <td>${birthDate}</td>
                        <td>${locker.code}</td>
                        <td><strong>${locker.number}</strong> <span style="font-size: 9pt; color: #666;">(${locker.zone})</span></td>
                        <td style="font-size: 9pt;">${comment}</td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    </table>
</body>
</html>
    `;
    
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
window.ConsultationModule = ConsultationModule;
window.openConsultationCasiers = openConsultationCasiers;
window.closeConsultationCasiers = closeConsultationCasiers;
window.updateConsultationTable = updateConsultationTable;
window.sortConsultationTable = sortConsultationTable;
window.sortConsultationData = sortConsultationData;
window.renderConsultationTable = renderConsultationTable;
window.exportConsultationCSV = exportConsultationCSV;
window.printConsultationTable = printConsultationTable;
