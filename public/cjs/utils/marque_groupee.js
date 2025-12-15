// ===== (DÉ)MARQUAGE GROUPÉ DES RÉSULTATS DE RECHERCHE ==========

// ============ (DÉ)MARQUAGE GROUPÉ DES RÉSULTATS ============

async function toggleMarkSearchResults() {
    if (!isEditAllowed()) return;
    
    if (getState('ui.searchResults').length === 0) {
        alert('Aucun résultat de recherche');
        return;
    }
    
    const lockerNumbers = getState('ui.searchResults').map(l => l.number);
    const willMark = !getState('ui.searchResultsMarked');
    
    const action = willMark ? 'marquer' : 'démarquer';
    const icon = willMark ? '🔖' : '🗑️';
    
    const confirmMsg = `${icon} ${action.toUpperCase()}\n\n` +
        `Vous allez ${action} ${lockerNumbers.length} casier${lockerNumbers.length > 1 ? 's' : ''} ` +
        `trouvé${lockerNumbers.length > 1 ? 's' : ''} par la recherche.\n\n` +
        `Voulez-vous continuer ?`;
    
    if (!confirm(confirmMsg)) return;
    
    const btn = document.getElementById('btnToggleMarkResults');
    const originalText = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳';
        btn.classList.add('btn-loading');
    }
    
    try {
        const data = await fetchJSON(`${API_URL}/lockers/bulk-mark`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include',
            body: JSON.stringify({
                lockerNumbers: lockerNumbers,
                mark: willMark
            })
        });
        
        const successIcon = willMark ? '🔖' : '✓';
        const actionText = willMark ? 'marqué' : 'démarqué';
        showStatus(`${successIcon} ${data.updated} casier${data.updated > 1 ? 's' : ''} ${actionText}${data.updated > 1 ? 's' : ''}`, 'success');
        
        // Mettre à jour l'état
        setState('ui.searchResultsMarked', willMark); //SEARCH_RESULTS_MARKED = willMark;
        
        // Mettre à jour l'apparence du bouton
        if (btn) {
            if (willMark) {
                btn.classList.add('active');
                btn.title = 'Démarquer les casiers trouvés';
            } else {
                btn.classList.remove('active');
                btn.title = 'Marquer les casiers trouvés';
            }
        }
        
        // Recharger les données
        await loadData();
        
        // Relancer la recherche pour mettre à jour SEARCH_RESULTS avec les nouvelles valeurs de marque
        const searchInput = document.getElementById('globalSearch');
        if (searchInput && searchInput.value.trim()) {
            searchLockers(searchInput.value.trim());
        }
        
    } catch (err) {
        console.error('Erreur toggle marquage:', err);
        showStatus('❌ Erreur : ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.classList.remove('btn-loading');
        }
    }
}

async function clearAllMarks() {
    if (!isEditAllowed()) return;
    
    // Compter les marques actuelles
    const markedCount = getState('data.lockers').filter(l => l.marque).length;
    
    if (markedCount === 0) {
        alert('✓ Aucun casier marqué actuellement');
        return;
    }
    
    const confirmFirst = confirm(
        `⚠️ ATTENTION - SUPPRESSION DE TOUTES LES MARQUES\n\n` +
        `Vous allez retirer les marques de ${markedCount} casier${markedCount > 1 ? 's' : ''}.\n\n` +
        `Cette action est IRRÉVERSIBLE.\n\n` +
        `Voulez-vous continuer ?`
    );
    
    if (!confirmFirst) return;
    
    // Trouver le bouton
    const clearBtn = Array.from(document.querySelectorAll('.admin-tools-content button'))
        .find(btn => btn.textContent.includes('Effacer marques'));
    const originalText = clearBtn ? clearBtn.innerHTML : '';
    
    // LOADING STATE
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.innerHTML = '⏳ Suppression...';
        clearBtn.classList.add('btn-loading');
    }
    
    try {
        const data = await fetchJSON(`${API_URL}/lockers/clear-marks`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': CSRF_TOKEN
            },
            credentials: 'include'
        });
        
        alert(`✓ Toutes les marques ont été retirées\n\n${data.cleared} casier${data.cleared > 1 ? 's' : ''} modifié${data.cleared > 1 ? 's' : ''}`);
        // Recharger les données
        loadData();
        
    } catch (err) {
        console.error('Erreur suppression marques:', err);
        alert('❌ Erreur : ' + err.message);
    } finally {
        // RESET STATE
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.innerHTML = originalText;
            clearBtn.classList.remove('btn-loading');
        }
    }
}

function checkIfResultsMarked() {
    if (getState('ui.searchResults').length === 0) return;
    
    // Vérifier si tous les résultats sont marqués
    const allMarked = getState('ui.searchResults').every(l => l.marque);
    
    const btn = document.getElementById('btnToggleMarkResults');
    if (btn) {
        if (allMarked) {
            btn.classList.add('active');
            btn.title = 'Démarquer les casiers trouvés';
            setState('ui.searchResultsMarked', true); //SEARCH_RESULTS_MARKED = true;
        } else {
            btn.classList.remove('active');
            btn.title = 'Marquer les casiers trouvés';
            setState('ui.searchResultsMarked', false); //SEARCH_RESULTS_MARKED = false;
        }
    }
}

function showMarkButton() {
    const btn = document.getElementById('btnToggleMarkResults');
    if (btn) {
        btn.style.display = 'inline-block';
        // Vérifier si les résultats actuels sont marqués
        checkIfResultsMarked();
    }
}

function hideMarkButton() {
    const btn = document.getElementById('btnToggleMarkResults');
    if (btn) {
        btn.style.display = 'none';
        btn.classList.remove('active');
    }
    setState('ui.searchResultsMarked', false); //SEARCH_RESULTS_MARKED = false;
}

/*// A SUPPRIMER?
function showMarkButtons() {
    const btnMark = document.getElementById('btnMarkSearchResults');
    const btnUnmark = document.getElementById('btnUnmarkSearchResults');
    if (btnMark) btnMark.style.display = 'inline-block';
    if (btnUnmark) btnUnmark.style.display = 'inline-block';
}
function hideMarkButtons() {
    const btnMark = document.getElementById('btnMarkSearchResults');
    const btnUnmark = document.getElementById('btnUnmarkSearchResults');
    if (btnMark) btnMark.style.display = 'none';
    if (btnUnmark) btnUnmark.style.display = 'none';
}
*/

// Rendre les fonctions globales
window.toggleMarkSearchResults = toggleMarkSearchResults;
window.clearAllMarks = clearAllMarks;
window.showMarkButton = showMarkButton;
window.hideMarkButton = hideMarkButton;
window.checkIfResultsMarked = checkIfResultsMarked;
