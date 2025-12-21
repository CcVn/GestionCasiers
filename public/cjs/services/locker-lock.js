//import { fetchJSON } from '../core/api.js';
//import { getState } from '../core/state.js';

let activeLocks = new Map(); // Map<lockerNumber, intervalId>
const RENEW_INTERVAL = 2 * 60 * 1000; // Renouveler toutes les 2 minutes
//const RENEW_INTERVAL = getState('config.ui.lockRenewInterval');

/**
 * Acquiert un lock sur un casier
 */
async function acquireLockerLock(lockerNumber) {
    try {
        //const API_URL = getState('API_URL');
        
        const result = await fetchJSON(`${API_URL}/lockers/${lockerNumber}/lock`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'X-CSRF-Token': getState('auth.csrfToken')
            }
        });
        
        if (result.success) {
            // Démarrer le heartbeat pour renouveler le lock
            startLockHeartbeat(lockerNumber);
        }
        
        return result;
        
    } catch (err) {
        if (err.status === 423) {
            // Casier verrouillé par un autre utilisateur
            throw new Error(err.data?.error || 'Casier en cours d\'édition');
        }
        throw err;
    }
}

/**
 * Libère un lock sur un casier
 */
async function releaseLockerLock(lockerNumber) {
    try {
        //const API_URL = getState('API_URL');
        
        // Arrêter le heartbeat
        stopLockHeartbeat(lockerNumber);
        
        await fetchJSON(`${API_URL}/lockers/${lockerNumber}/lock`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'X-CSRF-Token': getState('auth.csrfToken')
            }
        });
        
    } catch (err) {
        Logger.error('Erreur libération lock:', err);
    }
}

/**
 * Démarre le heartbeat pour renouveler le lock
 */
function startLockHeartbeat(lockerNumber) {
    // Arrêter l'ancien heartbeat s'il existe
    stopLockHeartbeat(lockerNumber);
    
    const intervalId = setInterval(async () => {
        try {
            //const API_URL = getState('API_URL');
            
            await fetchJSON(`${API_URL}/lockers/${lockerNumber}/lock/renew`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'X-CSRF-Token': getState('auth.csrfToken')
                }
            });
            
            console.log(`🔄 Lock renouvelé pour ${lockerNumber}`);
            
        } catch (err) {
            Logger.error('Erreur renouvellement lock:', err);
            
            // Si le renouvellement échoue, arrêter le heartbeat
            stopLockHeartbeat(lockerNumber);
            
            // Alerter l'utilisateur
            alert(`⚠️ Le verrouillage du casier ${lockerNumber} a expiré.\n\nVeuillez sauvegarder rapidement vos modifications.`);
        }
    }, RENEW_INTERVAL);
    
    activeLocks.set(lockerNumber, intervalId);
}

/**
 * Arrête le heartbeat
 */
function stopLockHeartbeat(lockerNumber) {
    const intervalId = activeLocks.get(lockerNumber);
    if (intervalId) {
        clearInterval(intervalId);
        activeLocks.delete(lockerNumber);
    }
}

/**
 * Nettoie tous les locks actifs (lors de la déconnexion)
 */
async function cleanupAllLocks() {
    const promises = Array.from(activeLocks.keys()).map(lockerNumber => 
        releaseLockerLock(lockerNumber)
    );
    
    await Promise.all(promises);
}

// Rendre les fonctions globales
window.acquireLockerLock = acquireLockerLock;
window.releaseLockerLock = releaseLockerLock;
window.startLockHeartbeat = startLockHeartbeat;
window.stopLockHeartbeat = stopLockHeartbeat;
window.cleanupAllLocks = cleanupAllLocks;
