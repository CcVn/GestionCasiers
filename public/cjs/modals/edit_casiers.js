// ===================== MODAL CASIER ========================
//import { acquireLockerLock, releaseLockerLock } from '../../services/locker-lock.js';
EDITING_LOCKER_NUMBER = null;
EDITING_LOCKER_VERSION = null;

// Générer dynamiquement la liste des zones (sur la base de config.env)
function populateZoneSelect() {
    const zoneSelect = document.getElementById('zone');
    if (!zoneSelect) return;
    
    zoneSelect.innerHTML = getState('data.zonesConfig').map(zone => 
        `<option value="${zone.name}">${zone.name}</option>`
    ).join('');
}

// Générer la liste déroulante des casiers (avec état libre/occupé) dans le modal
async function populateLockerSelect(zone, selected = null) {
    const select = document.getElementById('lockerNumber');
    const lockers = getState('data.lockers').filter(l => l.zone === zone);

    // Récupérer la liste des casiers verrouillés
    let lockedLockers = new Set();
    try {
        //const API_URL = getState('API_URL');  //TODO 
        const response = await fetchJSON(`${API_URL}/lockers/locks/active`, {
            credentials: 'include'
        });
        
        if (response.locks) {
            lockedLockers = new Set(response.locks.map(l => l.locker_number));
        }
    } catch (err) {
        console.warn('Impossible de récupérer les locks actifs:', err);
    }
    
    select.innerHTML = lockers.map(locker => {
        const isAvailable = !locker.occupied || locker.number === selected;
        const isLocked = lockedLockers.has(locker.number) && locker.number !== selected;
            let label = locker.number;
        if (!isAvailable) label += ' (occupé)';
        if (isLocked) label += ' 🔒';
        
        //return `<option value="${locker.number}" ${!isAvailable ? 'disabled' : ''}>${locker.number}${isAvailable ? '' : ' (occupé)'}</option>`;
        return `<option 
            value="${locker.number}" 
            ${!isAvailable || isLocked ? 'disabled' : ''}
            ${isLocked ? 'data-locked="true"' : ''}
        >${label}</option>`;

    }).join('');
    
    if (selected) {
        select.value = selected;
    }
}

// --- Attribuer nouveau casier
async function openModal(zone) {
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
    //document.getElementById('hosp').checked = false;
    document.getElementById('idel').checked = false;
    document.getElementById('statusMessage').innerHTML = '';
    
    populateLockerSelect(zone);
    
    const zoneSelect = document.getElementById('zone');
    const lockerSelect = document.getElementById('lockerNumber');

    // ============================================================
    // GESTION DU LOCK LORS DU CHANGEMENT DE ZONE
    // ============================================================
    zoneSelect.onchange = function() {
        // Si un casier était verrouillé, le libérer
        if (EDITING_LOCKER_NUMBER) {
            releaseLockerLock(EDITING_LOCKER_NUMBER).then(() => {
                console.log(`🔓 Casier ${EDITING_LOCKER_NUMBER} déverrouillé (changement de zone)`);
                EDITING_LOCKER_NUMBER = null;
            });
        }
        
        populateLockerSelect(this.value);
    };

    // ============================================================
    // ACQUÉRIR LE LOCK LORS DE LA SÉLECTION D'UN CASIER
    // ============================================================
    lockerSelect.onchange = async function() {
        const selectedLocker = this.value;
        
        if (!selectedLocker) return;
        
        // Si un autre casier était verrouillé, le libérer
        if (EDITING_LOCKER_NUMBER && EDITING_LOCKER_NUMBER !== selectedLocker) {
            await releaseLockerLock(EDITING_LOCKER_NUMBER);
            console.log(`🔓 Casier ${EDITING_LOCKER_NUMBER} déverrouillé (changement de sélection)`);
        }
        
        // Tenter d'acquérir le lock sur le nouveau casier
        try {
            showStatus('🔒 Verrouillage du casier...', 'info');
            
            const lockResult = await acquireLockerLock(selectedLocker);

            if (!lockResult.success) {
                // Quelqu'un d'autre a pris ce casier
                const lockedBy = lockResult.lockedBy || 'un autre utilisateur';
                const expiresIn = lockResult.expiresIn || 300;
                const minutes = Math.ceil(expiresIn / 60);
                
                showStatus(`⚠️ Casier verrouillé par ${lockedBy}`, 'error');
                
                alert(
                    `⚠️ Ce casier est en cours d'attribution par ${lockedBy}\n\n` +
                    `Le verrouillage expire dans environ ${minutes} minute${minutes > 1 ? 's' : ''}.\n\n` +
                    `Veuillez choisir un autre casier ou réessayer dans quelques minutes.`
                );
                
                // Réinitialiser la sélection
                this.value = '';
                EDITING_LOCKER_NUMBER = null;
                return;
            }
            
            // Lock acquis avec succès
            EDITING_LOCKER_NUMBER = selectedLocker;
            EDITING_LOCKER_VERSION = null; // Nouveau casier, pas de version
            
            console.log(`🔒 Casier ${selectedLocker} verrouillé pour attribution`);
            showStatus(`✓ Casier ${selectedLocker} verrouillé`, 'success');
            
            // Mettre en évidence visuellement le casier sélectionné
            this.style.borderColor = '#10b981';
            this.style.backgroundColor = '#d1fae5';

        } catch (err) {
            console.error('Erreur verrouillage casier:', err);
            
            showStatus('❌ Erreur lors du verrouillage', 'error');
            
            alert(
                `❌ Impossible de verrouiller le casier ${selectedLocker}\n\n` +
                `Erreur: ${err.message}\n\n` +
                `Veuillez réessayer ou choisir un autre casier.`
            );
            
            // Réinitialiser la sélection
            this.value = '';
            EDITING_LOCKER_NUMBER = null;
        }   
    };
    document.getElementById('modal').classList.add('active');
    trapFocus(document.getElementById('modal'));
    
    enableRealtimeValidation(); // Activer validation temps réel
}

// --- Editer casier existant
async function openModalEdit(lockerNumber) {
    if (!isEditAllowed()) return;

    try {
        // ============================================================
        // ACQUÉRIR LE LOCK AVANT D'OUVRIR LE MODAL
        // ============================================================
        showStatus('🔒 Verrouillage du casier...', 'info');
        
        const lockResult = await acquireLockerLock(lockerNumber);
        
        if (!lockResult.success) {
            throw new Error('Impossible de verrouiller le casier');
        }
        
        console.log(`🔒 Casier ${lockerNumber} verrouillé`);
        
        // ============================================================
        // CHARGER LES DONNÉES DU CASIER
        // ============================================================
        const locker = getState('data.lockers').find(l => l.number === lockerNumber);
        if (!locker) {
            await releaseLockerLock(lockerNumber);
            alert('Casier non trouvé');
            return;
        }

        // Mémoriser le numéro pour libérer le lock à la fermeture
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
        //document.getElementById('hosp').checked = locker.hosp || false;
        document.getElementById('stup').checked = locker.stup || false;
        document.getElementById('idel').checked = locker.idel || false;
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
        enableRealtimeValidation(); // Activer validation temps réel

    } catch (err) {
        console.error('Erreur ouverture modal:', err);
        
        if (err.message.includes('en cours d\'édition')) {
            alert(`⚠️ ${err.message}\n\nCe casier est actuellement modifié par un autre utilisateur. Veuillez réessayer dans quelques minutes.`);
        } else {
            alert('Erreur lors de l\'ouverture du casier: ' + err.message);
        }
    }
}

// --- Fermeture du modal (utilisé par handleFormSubmit)
async function closeModal() {
    // Libérer le lock à la fermeture
    if (EDITING_LOCKER_NUMBER) {
        await releaseLockerLock(EDITING_LOCKER_NUMBER);
        console.log(`🔓 Casier ${EDITING_LOCKER_NUMBER} déverrouillé (fermeture modal)`);
    }
    document.getElementById('modal').classList.remove('active');
    EDITING_LOCKER_NUMBER = null;
    EDITING_LOCKER_VERSION = null;
}

// Validation côté client
function validateLockerForm() {
  const errors = [];
  
  const lastName = document.getElementById('lastName').value.trim();
  const firstName = document.getElementById('firstName').value.trim();
  const code = document.getElementById('code').value.trim();
  const birthDate = document.getElementById('birthDate').value;
  
  if (!lastName || lastName.length < 2) {
    errors.push('Le nom doit contenir au moins 2 caractères');
  }
  
  if (!firstName || firstName.length < 2) {
    errors.push('Le prénom doit contenir au moins 2 caractères');
  }
  
  if (!code || !/^\d+$/.test(code)) {
    errors.push('L\'IPP doit être un nombre');
  }
  
  if (!birthDate) {
    errors.push('La date de naissance est obligatoire');
  } else {
    const date = new Date(birthDate);
    const now = new Date();
    if (date > now) {
      errors.push('La date de naissance ne peut pas être dans le futur');
    }
    if (date < new Date('1900-01-01')) {
      errors.push('La date de naissance est invalide');
    }
  }
  
  return errors;
}

// --- Soumission du formulaire
async function handleFormSubmit(e) {
    e.preventDefault();
      
    // Valider avant soumission
    const validationErrors = validateLockerForm();
    if (validationErrors.length > 0) {
      displayValidationErrors(validationErrors);
      return; // Arrêter la soumission
    }

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

        // VÉRIFIER QU'ON A BIEN LE LOCK AVANT DE SAUVEGARDER
        if (!EDITING_LOCKER_NUMBER) {
            showStatus('❌ Erreur: casier non verrouillé', 'error');
            alert(
                '⚠️ Erreur de verrouillage\n\n' +
                'Le casier n\'est pas correctement verrouillé.\n' +
                'Veuillez fermer et rouvrir le modal.'
            );
            return;
        }

        // Détecter si le numéro de casier a changé
        const isLockerChanged = (EDITING_LOCKER_NUMBER !== newLockerNumber);
        
        // Gestion du tranfert
        if (isLockerChanged) {
            console.log(`/!\ Déplacement de casier détecté: ${EDITING_LOCKER_NUMBER} → ${newLockerNumber}`);
            
            // Afficher une popup de confirmation
            const oldNumber = EDITING_LOCKER_NUMBER;
            const patientName = document.getElementById('lastName').value + ' ' + document.getElementById('firstName').value;
            
            // Vérifier que le nouveau casier est disponible
            const targetLocker = getState('data.lockers').find(l => l.number === newLockerNumber);
            if (targetLocker && targetLocker.occupied) {
              showStatus('✖ Le casier cible est déjà occupé', 'error');
              alert(
                `❌ CASIER OCCUPÉ\n\n` +
                `Le casier ${newLockerNumber} est déjà occupé par:\n` +
                `${targetLocker.name} ${targetLocker.firstName}\n\n` +
                `Veuillez choisir un autre casier.`
              );
              return;
            }

            // Demander confirmation
            const confirmMessage = `⚠️ CHANGEMENT DE CASIER\n\n` +
                `Patient : ${patientName}\n` +
                `Ancien casier : ${oldNumber}\n` +
                `Nouveau casier : ${newLockerNumber}\n\n` +
                `Voulez-vous libérer automatiquement l'ancien casier ${oldNumber} ?`;

            const shouldReleaseOld = confirm(confirmMessage);
            
            if (shouldReleaseOld) {
                // Enregistrer le nouveau casier d'abord
                try {

                    // IMPORTANT : Libérer le lock de l'ancien casier AVANT de sauvegarder
                    await releaseLockerLock(oldNumber);
                    console.log(`🔓 Lock libéré pour ${oldNumber}`);
                    
                    // Acquérir le lock sur le NOUVEAU casier
                    const lockResult = await acquireLockerLock(newLockerNumber);
                    if (!lockResult.success) {
                      throw new Error(`Impossible de verrouiller ${newLockerNumber}`);
                    }
                    console.log(`🔒 Lock acquis pour ${newLockerNumber}`);
                    
                    // Mettre à jour le state avec le nouveau numéro
                    EDITING_LOCKER_NUMBER = newLockerNumber; //setState('locks.editingLockerNumber', newLockerNumber);
                    // Sauvegarder le nouveau casier SANS vérification de version
                    const oldVersion = EDITING_LOCKER_VERSION;
                    // Désactiver la vérification
                    EDITING_LOCKER_VERSION = null; //setState('locks.editingLockerVersion', null); // Nouveau casier = pas de version

                    await saveLocker(newLockerNumber, zone, recoverable, comment, stup, idel, frigo, pca, meopa);
                    
                    // Restaurer la version pour la libération
                    EDITING_LOCKER_VERSION = oldVersion;
                    // Puis libérer l'ancien casier
                    await releaseLockerSilent(oldNumber);

                    // Libérer le lock du nouveau casier
                    await releaseLockerLock(newLockerNumber);
                    console.log(`🔓 Lock libéré pour ${newLockerNumber}`);

                    closeModal();
                    loadData();
                    showStatus(`✓ ${patientName} déplacé de ${oldNumber} vers ${newLockerNumber}`, 'success');
                } catch (err) {
                    console.error('Erreur déplacement:', err);
                    showStatus('Erreur lors du déplacement: ' + err.message, 'error');
                    
                    // Nettoyer en cas d'erreur
                    await releaseLockerLock(oldNumber).catch(() => {});
                    await releaseLockerLock(newLockerNumber).catch(() => {});
                    EDITING_LOCKER_NUMBER = null; //setState('locks.editingLockerNumber', null);
                    EDITING_LOCKER_VERSION = null; //setState('locks.editingLockerVersion', null);
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
        // Sauvegarde normale

        } else {
        // Pas de changement de numéro, comportement normal avec vérification de version
            try {
                await saveLocker(newLockerNumber, zone, recoverable, comment, stup, idel, frigo, pca, meopa);
                // Libérer le lock après sauvegarde réussie
                await releaseLockerLock(newLockerNumber);
                console.log(`🔓 Casier ${newLockerNumber} déverrouillé (sauvegarde réussie)`);
                
                closeModal();
                loadData();
                
                // Vérifier si l'IPP était dans la base patients
                const data = await fetchJSON(`${API_URL}/lockers/${newLockerNumber}`, {
                    credentials: 'include'
                });
                
                if (data.ippValid === false) {
                    showStatus('⚠️ Casier enregistré mais N°IPP non trouvé dans la base patients (marqué récupérable)', 'error');
                } else {
                    showStatus('✓ Casier enregistré', 'success');
                }
            } catch (err) {
                // Gérer spécifiquement les conflits
                if (err.message.includes('conflit') || err.message.includes('version')) {
                    const reload = confirm(
                        '⚠️ CONFLIT DÉTECTÉ\n\n' +
                        'Ce casier a été modifié par un autre utilisateur pendant que vous le modifiiez.\n\n' +
                        'Voulez-vous recharger les données actuelles et réessayer ?'
                    );
                    
                    if (reload) {
                        await releaseLockerLock(newLockerNumber);
                        closeModal();
                        await loadData();
                        // Rouvrir le modal avec les nouvelles données
                        setTimeout(() => openModalEdit(newLockerNumber), 500);
                    }

                } else if (err.message.includes('en cours d\'édition')) {
                    // Lock perdu pendant l'édition
                    alert(
                        '⚠️ VERROUILLAGE PERDU\n\n' +
                        'Un autre utilisateur a pris le contrôle de ce casier.\n\n' +
                        'Vos modifications n\'ont pas été enregistrées.'
                    );
                    closeModal();
                    loadData();
                } else {
                    showStatus('Erreur: ' + err.message, 'error');
                }
            }
        }
    } catch (err) {
        console.error('Erreur générale handleFormSubmit:', err);
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
            'X-CSRF-Token': getState('auth.csrfToken')
        }
    })
    .then(res => {
        if (!res.ok) {
            handleCsrfError(res);
            throw new Error('Erreur ' + res.status);
        }
        invalidateDetectionCache();
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
                'X-CSRF-Token': getState('auth.csrfToken')
            },
            credentials: 'include',
            body: JSON.stringify(bodyData)
        }, {
            retries: 2,
            retryOn: [500, 502, 503, 504],
            timeout: 10000
        });
        
        invalidateDetectionCache(); 
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
            'X-CSRF-Token': getState('auth.csrfToken')
        }
    });
    return data;
}

// --- Message affiché en haut de modal pour réussite ou échec
function showStatus(msg, type) {
    const el = document.getElementById('statusMessage');
    el.className = 'status-message status-' + type;
    el.textContent = msg;
    setTimeout(() => {
        el.innerHTML = '';
    }, 3000);
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
window.showStatus = showStatus;
