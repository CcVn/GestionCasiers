// ============ MODAL HOSPITALISATION ==================

function openHospitalisationModal(lockerNumber) {
    const locker = DATA.find(l => l.number === lockerNumber);
    
    if (!locker) {
        alert('Casier non trouvé');
        return;
    }
    if (!locker.occupied) {
        alert('Ce casier n\'est pas attribué, impossible de lui associer une hospitalisation!');
        return;
    }

    CURRENT_LOCKER_FOR_HOSP = locker;
    
    // Remplir les infos
    const infoDiv = document.getElementById('hospitalisationInfo');
    infoDiv.innerHTML = `
        <div style="font-size: 14px;">
            <strong style="font-size: 16px;">${locker.number} - Zone ${locker.zone}</strong><br>
            ${locker.occupied 
                ? `<span style="color: var(--text-secondary);">
                    ${locker.name} ${locker.firstName}<br>
                    IPP: ${locker.code}
                   </span>`
                : '<span style="color: var(--text-secondary);">Casier vide</span>'
            }
        </div>
    `;
    
    // Pré-remplir le formulaire
    const hospCheckbox = document.getElementById('hospCheckbox');
    const hospDateInput = document.getElementById('hospDateInput');
    const hospDateGroup = document.getElementById('hospDateGroup');
    
    hospCheckbox.checked = locker.hosp ? true : false;
    hospDateInput.value = locker.hospDate || '';
    
    // Afficher/masquer le champ date selon la checkbox
    hospDateGroup.style.display = hospCheckbox.checked ? 'block' : 'none';
    
    // Event listener pour la checkbox
    hospCheckbox.onchange = function() {
        hospDateGroup.style.display = this.checked ? 'block' : 'none';
        if (!this.checked) {
            hospDateInput.value = '';
        }
    };
    
    // Reset status message
    document.getElementById('hospitalisationStatus').innerHTML = '';
    
    // Ouvrir le modal
    document.getElementById('hospitalisationModal').classList.add('active');
}

function closeHospitalisationModal() {
    document.getElementById('hospitalisationModal').classList.remove('active');
    CURRENT_LOCKER_FOR_HOSP = null;
}

// Gérer la soumission du formulaire d'hospitalisation
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('hospitalisationForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!CURRENT_LOCKER_FOR_HOSP) return;
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            const statusEl = document.getElementById('hospitalisationStatus');
            
            // LOADING STATE
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Enregistrement...';
            submitBtn.classList.add('btn-loading');
            
            try {
                const hospCheckbox = document.getElementById('hospCheckbox');
                const hospDateInput = document.getElementById('hospDateInput');
                
                const hosp = hospCheckbox.checked;
                const hospDate = hosp ? hospDateInput.value : '';
                
                const updatedLocker = await fetchJSON(`${API_URL}/lockers/${CURRENT_LOCKER_FOR_HOSP.number}/hospitalisation`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': CSRF_TOKEN
                    },
                    body: JSON.stringify({ hosp, hospDate })
                });
                
                // Mettre à jour DATA
                const index = DATA.findIndex(l => l.number === CURRENT_LOCKER_FOR_HOSP.number);
                if (index !== -1) {
                    DATA[index] = updatedLocker;
                }
                
                renderAllTables(); // Rafraîchir l'affichage
                closeHospitalisationModal();  // Fermer le modal
                
                // Message de succès
                const icon = updatedLocker.hosp ? '🏥' : '✓';
                const message = updatedLocker.hosp 
                    ? `${icon} Hospitalisation enregistrée pour ${CURRENT_LOCKER_FOR_HOSP.number}${updatedLocker.hospDate ? ` (${formatDate(updatedLocker.hospDate)})` : ''}`
                    : `${icon} Hospitalisation retirée du casier ${CURRENT_LOCKER_FOR_HOSP.number}`;
                
                showStatus(message, 'success');
                
            } catch (err) {
                console.error('Erreur modification hospitalisation:', err);
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

// Affichage listing hospi avec dates : à relooker
function showHospitalisationList() {
    // Filtrer les casiers occupés avec hosp = 1
    const hospLockers = DATA.filter(l => l.occupied && l.hosp);
    
    if (hospLockers.length === 0) {
        alert('✓ Aucun casier avec hospitalisation');
        return;
    }
    
    // Trier par zone puis par numéro
    hospLockers.sort((a, b) => {
        if (a.zone !== b.zone) {
            return a.zone.localeCompare(b.zone);
        }
        return a.number.localeCompare(b.number);
    });
    
    // Construire le message
    let message = `🏥 CASIERS AVEC HOSPITALISATION\n`;
    message += `═══════════════════════════════\n\n`;
    message += `Total : ${hospLockers.length} casier${hospLockers.length > 1 ? 's' : ''}\n\n`;
    
    // Grouper par zone
    const byZone = {};
    hospLockers.forEach(locker => {
        if (!byZone[locker.zone]) {
            byZone[locker.zone] = [];
        }
        byZone[locker.zone].push(locker);
    });
    
    // Afficher par zone
    Object.keys(byZone).sort().forEach(zone => {
        message += `─── Zone ${zone} (${byZone[zone].length}) ───\n`;
        
        byZone[zone].forEach(locker => {
            const name = anonymizeName(locker.name);
            const firstName = anonymizeFirstName(locker.firstName);
            const dateInfo = locker.hospDate ? ` - ${formatDate(locker.hospDate)}` : '';
            
            message += `  • ${locker.number} : ${name} ${firstName}${dateInfo}\n`;
            if (locker.comment) {
                message += `    💬 ${locker.comment}\n`;
            }
        });
        message += `\n`;
    });
    
    alert(message);
}

// Rendre les fonctions globales
window.openHospitalisationModal = openHospitalisationModal;
window.closeHospitalisationModal = closeHospitalisationModal;
window.showHospitalisationList = showHospitalisationList;
