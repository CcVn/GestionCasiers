/*  Résumé du système
- Lock acquis à l'ouverture du modal d'édition
- Heartbeat automatique toutes les 2 minutes
- Lock libéré à la fermeture du modal ou sauvegarde
- Timeout de 5 minutes si inactivité
- Protection double : lock + version
- Nettoyage automatique des locks expirés
- Messages clairs à l'utilisateur si conflit
*/
const { getDb, dbRun, dbGet } = require('../database/index');

// Durée du lock en millisecondes (5 minutes par défaut)
const LOCK_TIMEOUT = 5 * 60 * 1000;

/**
 * Tente d'acquérir un lock sur un casier
 * @returns {Object} { success: boolean, lock?: object, error?: string }
 */
async function acquireLock(lockerNumber, userId, userName, ipAddress) {
    const now = Date.now();
    const expiresAt = now + LOCK_TIMEOUT;
    
    try {
        // 1. Nettoyer les locks expirés
        await cleanExpiredLocks();
        
        // 2. Vérifier si un lock existe déjà
        const existingLock = await dbGet(
            'SELECT * FROM locker_locks WHERE locker_number = ?',
            [lockerNumber]
        );
        
        if (existingLock) {
            // Vérifier si le lock est expiré
            if (existingLock.expires_at < now) {
                // Lock expiré, le supprimer et en créer un nouveau
                await dbRun('DELETE FROM locker_locks WHERE locker_number = ?', [lockerNumber]);
            } else if (existingLock.locked_by === userId) {
                // Le même utilisateur, renouveler le lock
                await dbRun(
                    'UPDATE locker_locks SET expires_at = ?, locked_at = ? WHERE locker_number = ?',
                    [expiresAt, now, lockerNumber]
                );
                
                return {
                    success: true,
                    lock: { ...existingLock, expires_at: expiresAt, locked_at: now }
                };
            } else {
                // Lock actif par un autre utilisateur
                return {
                    success: false,
                    error: 'LOCKED_BY_OTHER',
                    lockedBy: existingLock.user_name || existingLock.ip_address || 'Utilisateur inconnu',
                    expiresIn: Math.ceil((existingLock.expires_at - now) / 1000) // secondes
                };
            }
        }
        
        // 3. Créer un nouveau lock
        await dbRun(
            `INSERT INTO locker_locks (locker_number, locked_by, locked_at, expires_at, user_name, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [lockerNumber, userId, now, expiresAt, userName, ipAddress]
        );
        
        return {
            success: true,
            lock: {
                locker_number: lockerNumber,
                locked_by: userId,
                locked_at: now,
                expires_at: expiresAt,
                user_name: userName,
                ip_address: ipAddress
            }
        };
        
    } catch (err) {
        console.error('Erreur acquisition lock:', err);
        return {
            success: false,
            error: 'DATABASE_ERROR',
            message: err.message
        };
    }
}

/**
 * Libère un lock sur un casier
 */
async function releaseLock(lockerNumber, userId) {
    try {
        const result = await dbRun(
            'DELETE FROM locker_locks WHERE locker_number = ? AND locked_by = ?',
            [lockerNumber, userId]
        );
        
        return { success: result.changes > 0 };
    } catch (err) {
        console.error('Erreur libération lock:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Vérifie si un casier est verrouillé
 */
async function checkLock(lockerNumber) {
    try {
        await cleanExpiredLocks();
        
        const lock = await dbGet(
            'SELECT * FROM locker_locks WHERE locker_number = ?',
            [lockerNumber]
        );
        
        if (!lock) {
            return { locked: false };
        }
        
        const now = Date.now();
        if (lock.expires_at < now) {
            // Lock expiré
            await dbRun('DELETE FROM locker_locks WHERE locker_number = ?', [lockerNumber]);
            return { locked: false };
        }
        
        return {
            locked: true,
            lockedBy: lock.user_name || lock.ip_address || 'Utilisateur inconnu',
            expiresIn: Math.ceil((lock.expires_at - now) / 1000)
        };
    } catch (err) {
        console.error('Erreur vérification lock:', err);
        return { locked: false, error: err.message };
    }
}

/**
 * Renouvelle un lock existant (heartbeat)
 */
async function renewLock(lockerNumber, userId) {
    const now = Date.now();
    const expiresAt = now + LOCK_TIMEOUT;
    
    try {
        const result = await dbRun(
            'UPDATE locker_locks SET expires_at = ?, locked_at = ? WHERE locker_number = ? AND locked_by = ?',
            [expiresAt, now, lockerNumber, userId]
        );
        
        return {
            success: result.changes > 0,
            expiresAt: result.changes > 0 ? expiresAt : null
        };
    } catch (err) {
        console.error('Erreur renouvellement lock:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Nettoie tous les locks expirés
 */
async function cleanExpiredLocks() {
    const now = Date.now();
    
    try {
        const result = await dbRun(
            'DELETE FROM locker_locks WHERE expires_at < ?',
            [now]
        );
        
        if (result.changes > 0) {
            console.log(`🧹 ${result.changes} lock(s) expiré(s) nettoyé(s)`);
        }
        
        return { cleaned: result.changes };
    } catch (err) {
        console.error('Erreur nettoyage locks:', err);
        return { cleaned: 0, error: err.message };
    }
}

/**
 * Liste tous les locks actifs
 */
async function listActiveLocks() {
    try {
        await cleanExpiredLocks();
        
        const db = getDb();
        const locks = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM locker_locks ORDER BY locked_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        return { locks };
    } catch (err) {
        console.error('Erreur liste locks:', err);
        return { locks: [], error: err.message };
    }
}

/**
 * Force la libération d'un lock (admin seulement)
 */
async function forceReleaseLock(lockerNumber) {
    try {
        const result = await dbRun(
            'DELETE FROM locker_locks WHERE locker_number = ?',
            [lockerNumber]
        );
        
        return { success: result.changes > 0 };
    } catch (err) {
        console.error('Erreur force release lock:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    acquireLock,
    releaseLock,
    checkLock,
    renewLock,
    cleanExpiredLocks,
    listActiveLocks,
    forceReleaseLock,
    LOCK_TIMEOUT
};
