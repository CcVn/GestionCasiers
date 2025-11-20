// ===================== MODAL CASIER ========================

// Générer dynamiquement la liste des zones (sur la base de config.env)
function populateZoneSelect() {
    const zoneSelect = document.getElementById('zone');
    if (!zoneSelect) return;
    
    zoneSelect.innerHTML = ZONES_CONFIG.map(zone => 
        `<option value="${zone.name}">${zone.name}</option>`
    ).join('');
}

// Générer la liste déroulante des casiers (avec état libre/occupé) dans le modal
function populateLockerSelect(zone, selected = null) {
    const select = document.getElementById('lockerNumber');
    const lockers = DATA.filter(l => l.zone === zone);
    
    select.innerHTML = lockers.map(locker => {
        const isAvailable = !locker.occupied || locker.number === selected;
        return `<option value="${locker.number}" ${!isAvailable ? 'disabled' : ''}>${locker.number}${isAvailable ? '' : ' (occupé)'}</option>`;
    }).join('');
    
    if (selected) {
        select.value = selected;
    }
}

// --- Attribuer nouveau casier
function openModal(zone) {
    if (!isEditAllowed()) return;

    // Réinitialiser (pas d'édition)
    EDITING_LOCKER_NUMBER = null;
    EDITING_LOCKER_VERSION = null; 
    
    populateZoneSelect();

    document.getElementById('zone').value = zone;
    document.getElementById('modalTitle').textContent = 'Attribuer un casier';
    document.getElementById('lastName').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('code').value = '';
    document.getElementById('birthDate').value = '';
    document.getElementById('comment').value = '';
    document.getElementById('recoverable').checked = false;
    document.getElementById('stup').checked = false;
    document.getElementById('idel').checked = false;
    document.getElementById('statusMessage').innerHTML = '';
    
    populateLockerSelect(zone);
    
    const zoneSelect = document.getElementById('zone');
    zoneSelect.onchange = function() {
        populateLockerSelect(this.value);
    };
    
    document.getElementById('modal').classList.add('active');
    trapFocus(document.getElementById('modal'));
}

// --- Editer casier existant
function openModalEdit(lockerNumber) {
    if (!isEditAllowed()) return;
    
    const locker = DATA.find(l => l.number === lockerNumber);
    if (!locker) return;
    
    //Mémoriser le numéro original
    EDITING_LOCKER_NUMBER = lockerNumber;
    EDITING_LOCKER_VERSION = locker.version || 0;

    populateZoneSelect();

    document.getElementById('zone').value = locker.zone;
    document.getElementById('modalTitle').textContent = `Modifier ${locker.number}`;
    document.getElementById('lockerNumber').value = lockerNumber;
    document.getElementById('lastName').value = locker.name;
    document.getElementById('firstName').value = locker.firstName;
    document.getElementById('code').value = locker.code;
    document.getElementById('birthDate').value = locker.birthDate;
    document.getElementById('comment').value = locker.comment || '';
    document.getElementById('recoverable').checked = locker.recoverable || false;
    document.getElementById('stup').checked = locker.stup || false;
    document.getElementById('idel').checked = locker.stup || false;
    document.getElementById('frigo').checked = locker.frigo || false;
    document.getElementById('pca').checked = locker.pca || false;
    document.getElementById('meopa').checked = locker.meopa || false;
    document.getElementById('statusMessage').innerHTML = '';
    
    populateLockerSelect(locker.zone, lockerNumber);
    
    const zoneSelect = document.getElementById('zone');
    zoneSelect.onchange = function() {
        populateLockerSelect(this.value, lockerNumber);
    };
    
    document.getElementById('modal').classList.add('active');
    trapFocus(document.getElementById('modal'));
}

// --- Fermeture du modal (utilisé par handleFormSubmit)
function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// --- Soumission du formulaire
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ Enregistrement...';
    submitBtn.classList.add('btn-loading');

    try {
        const newLockerNumber = document.getElementById('lockerNumber').value;
        const zone = document.getElementById('zone').value;
        const recoverable = document.getElementById('recoverable').checked;
        const comment = document.getElementById('comment').value;
        const stup = document.getElementById('stup').checked;
        const idel = document.getElementById('idel').checked;
        const frigo = document.getElementById('frigo')?.checked || false;
        const pca = document.getElementById('pca')?.checked || false;
        const meopa = document.getElementById('meopa')?.checked || false;

        // Détecter si le numéro de casier a changé
        const isLockerChanged = EDITING_LOCKER_NUMBER && EDITING_LOCKER_NUMBER !== newLockerNumber;
        
        if (isLockerChanged) {
            // Afficher une popup de confirmation
            const oldNumber = EDITING_LOCKER_NUMBER;
            const patientName = document.getElementById('lastName').value + ' ' + document.getElementById('firstName').value;
            
            const confirmMessage = `⚠️ CHANGEMENT DE CASIER\n\n` +
                `Patient : ${patientName}\n` +
                `Ancien casier : ${oldNumber}\n` +
                `Nouveau casier : ${newLockerNumber}\n\n` +
                `Voulez-vous libérer automatiquement l'ancien casier ${oldNumber} ?`;
            
            const shouldReleaseOld = confirm(confirmMessage);
            
            if (shouldReleaseOld) {
                // Enregistrer le nouveau casier d'abord
                try {
                    // Sauvegarder le nouveau casier SANS vérification de version
                    const oldVersion = EDITING_LOCKER_VERSION;
                    EDITING_LOCKER_VERSION = null;  // Désactiver la vérification
                    
                    await saveLocker(newLockerNumber, zone, recoverable, comment, stup, idel, frigo, pca, meopa);
                    
                    // Restaurer la version pour la libération
                    EDITING_LOCKER_VERSION = oldVersion;
                    
                    // Puis libérer l'ancien casier
                    await releaseLockerSilent(oldNumber);
                    
                    closeModal();
                    loadData();
                    showStatus(`✓ ${patientName} déplacé de ${oldNumber} vers ${newLockerNumber}`, 'success');
                } catch (err) {
                    showStatus('Erreur lors du déplacement: ' + err.message, 'error');
                }
            } else {
                // L'utilisateur ne veut pas libérer l'ancien, juste créer le nouveau
                const confirmKeepOld = confirm(
                    `L'ancien casier ${oldNumber} restera occupé.\n` +
                    `Voulez-vous continuer ?`
                );
                
                if (confirmKeepOld) {
                    try {
                        // Sauvegarder SANS vérification de version
                        EDITING_LOCKER_VERSION = null;
                        await saveLocker(newLockerNumber, zone, recoverable, comment, stup, idel, frigo, pca, meopa);
                        closeModal();
                        loadData();
                        showStatus(`✓ Nouveau casier ${newLockerNumber} créé (${oldNumber} toujours occupé)`, 'success');
                    } catch (err) {
                        showStatus('Erreur: ' + err.message, 'error');
                    }
                }
                // Sinon, on ne fait rien (l'utilisateur annule tout)
            }
        } else {
            // Pas de changement de numéro, comportement normal avec vérification de version
            try {
                await saveLocker(newLockerNumber, zone, recoverable, comment, stup, idel, frigo, pca, meopa);
                closeModal();
                loadData();
                
                // Vérifier si l'IPP était valide
                const data = await fetchJSON(`${API_URL}/lockers/${newLockerNumber}`, {
                    credentials: 'include'
                });
                
                if (data.ippValid === false) {
                    showStatus('⚠️ Casier enregistré mais N°IPP non trouvé dans la base patients (marqué récupérable)', 'error');
                } else {
                    showStatus('✓ Casier enregistré', 'success');
                }
            } catch (err) {
                // GÉRER SPÉCIFIQUEMENT LES CONFLITS
                if (err.message.includes('conflit') || err.message.includes('version')) {
                    const reload = confirm(
                        '⚠️ CONFLIT DÉTECTÉ\n\n' +
                        'Ce casier a été modifié par un autre utilisateur pendant que vous le modifiiez.\n\n' +
                        'Voulez-vous recharger les données actuelles et réessayer ?'
                    );
                    
                    if (reload) {
                        closeModal();
                        await loadData();
                        // Rouvrir le modal avec les nouvelles données
                        setTimeout(() => openModalEdit(newLockerNumber), 500);
                    }
                } else {
                    showStatus('Erreur: ' + err.message, 'error');
                }
            }
        }
    } catch (err) {
        showStatus('Erreur: ' + err.message, 'error');
    } finally {
        // RESET STATE (même en cas d'erreur)
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        submitBtn.classList.remove('btn-loading');
    }
}

// --- Libérer un casier (bouton action)
function releaseLocker(lockerNumber) {
    if (!isEditAllowed()) return;
    
    if (!confirm('Libérer ce casier ?')) return;
    
    const res = fetch(`${API_URL}/lockers/${lockerNumber}`, { 
        method: 'DELETE',
        credentials: 'include',
        headers: {
            'X-CSRF-Token': CSRF_TOKEN
        }
    })
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        loadData();
        showStatus('Casier libéré', 'success');
    })
    .catch(err => {
        showStatus('Erreur: ' + err.message, 'error');
    });
}

// --- Enregistrer un casier
async function saveLocker(lockerNumber, zone, recoverable, comment, stup, idel, frigo, pca, meopa) {
    const bodyData = {
        number: lockerNumber,
        zone: zone,
        name: document.getElementById('lastName').value,
        firstName: document.getElementById('firstName').value,
        code: document.getElementById('code').value,
        birthDate: document.getElementById('birthDate').value,
        comment: comment,
        recoverable: recoverable,
        stup: stup,
        idel: idel,
        frigo: frigo,
        pca: pca,
        meopa: meopa
    };

    if (EDITING_LOCKER_VERSION !== null) {
        bodyData.expectedVersion = EDITING_LOCKER_VERSION;
    }

    try {
        // fetchJSON retourne directement les données
        const data = await fetchJSON(`${API_URL}/lockers`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include',
            body: JSON.stringify(bodyData)
        }, {
            retries: 2,
            retryOn: [500, 502, 503, 504],
            timeout: 10000
        });
        
        // data contient déjà les données parsées
        return data;
        
    } catch (err) {
        // Enrichir l'erreur avec le contexte
        if (err.response) {
            throw new Error(err.message);  // Erreur simple, pas besoin de parser
        }
        throw err;
    }
}

// --- Libérer un casier sans message (utilisé lors d'un transfert)
async function releaseLockerSilent(lockerNumber, reason = 'TRANSFERT') {
    const data = await fetchJSON(`${API_URL}/lockers/${lockerNumber}?reason=${reason}`, {  
        method: 'DELETE',
        credentials: 'include',
        headers: {
            'X-CSRF-Token': CSRF_TOKEN
        }
    });
    return data;
}

// Rendre les fonctions globales
window.populateZoneSelect = populateZoneSelect;
window.populateLockerSelect = populateLockerSelect;
window.openModal = openModal;
window.openModalEdit = openModalEdit;
window.closeModal = closeModal;
window.handleFormSubmit = handleFormSubmit;
window.releaseLocker = releaseLocker;
window.saveLocker = saveLocker;
window.releaseLockerSilent = releaseLockerSilent;