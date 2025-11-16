// Rate limiting

const rateLimit = require('express-rate-limit');

// Limiteur général pour toutes les routes
const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiteur strict pour le login
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 5 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

// Limiteur pour les imports
const importLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: { error: 'Trop d\'imports. Limite: 15 par heure.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiteur pour les exports
const exportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Trop d\'exports. Réessayez plus tard.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Limiteur pour les backups/restore
const backupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Trop d\'opérations de backup/restore. Limite: 5 par heure.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    generalLimiter,
    loginLimiter,
    importLimiter,
    exportLimiter,
    backupLimiter
};
