// Gestion des sessions

const { SESSION_DURATION_MS, SESSION_CLEANUP_INTERVAL_MS, isProduction, VERBOSE } = require('../config');

// Map des sessions en mémoire
const sessions = new Map();

// Fonction de nettoyage des sessions expirées
function cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [token, session] of sessions.entries()) {
        if (now - session.createdAt > SESSION_DURATION_MS) {
            sessions.delete(token);
            cleaned++;
        }
    }
    
    if (cleaned > 0 && !isProduction && VERBOSE) {
        console.log(`🧹 ${cleaned} session(s) expirée(s) nettoyée(s)`);
    }
}

// Lancer le nettoyage périodique
function startSessionCleanup() {
    setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL_MS);
    if (!isProduction && VERBOSE) {
        console.log(`✓ Nettoyage automatique des sessions activé (toutes les ${SESSION_CLEANUP_INTERVAL_MS / 60000} minutes)`);
    }
}

// Créer une session
function createSession(token, data) {
    sessions.set(token, {
        createdAt: Date.now(),
        ...data
    });
}

// Obtenir une session
function getSession(token) {
    return sessions.get(token);
}

// Supprimer une session
function deleteSession(token) {
    return sessions.delete(token);
}

// Vérifier si une session existe
function hasSession(token) {
    return sessions.has(token);
}

module.exports = {
    sessions,
    createSession,
    getSession,
    deleteSession,
    hasSession,
    cleanupExpiredSessions,
    startSessionCleanup
};
