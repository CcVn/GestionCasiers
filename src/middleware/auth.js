// Middleware d'authentification

const { getSession, deleteSession } = require('../services/session');
const { SESSION_DURATION_MS } = require('../config');

function requireAuth(req, res, next) {
    const token = req.cookies.auth_token;
    
    if (!token || !getSession(token)) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    
    const session = getSession(token);
    const now = Date.now();
    
    // Vérifier l'expiration
    if (now - session.createdAt > SESSION_DURATION_MS) {
        deleteSession(token);
        res.clearCookie('auth_token');
        return res.status(401).json({ error: 'Session expirée' });
    }
    
    // Renouveler la session (rolling session)
    session.createdAt = now;
    
    next();
}

module.exports = {
    requireAuth
};
