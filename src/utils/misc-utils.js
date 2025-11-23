// Utilitaires

const os = require('os');
const crypto = require('crypto');
const { isProduction, VERBOSE } = require('../config');

// Générer un token sécurisé
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Obtenir l'adresse IP locale
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Obtenir l'IP du client
function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    
    if (!isProduction && VERBOSE) console.log('Adresse IP entrante: ', req.ip);
    return req.ip || req.connection.remoteAddress || 'unknown';
}

// Mettre en majuscule la première lettre
function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = {
    generateToken,
    getLocalIP,
    getClientIP,
    capitalizeFirstLetter
};
