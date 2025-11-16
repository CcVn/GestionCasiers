// Utilitaires

const os = require('os');
const crypto = require('crypto');
const { isProduction, VERBOSE } = require('./config');

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

// Normaliser le format de date (FORMAT FRANÇAIS : DD/MM/YYYY)
function normalizeDateFormat(dateStr) {
    if (!dateStr) return '';
    
    // Nettoyer la chaîne
    dateStr = dateStr.trim();
    
    // Format DD/MM/YYYY → YYYY-MM-DD (FORMAT FRANÇAIS)
    const match1 = dateStr.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
    if (match1) {
        const day = match1[1].padStart(2, '0');
        const month = match1[2].padStart(2, '0');
        const year = match1[3];
        return `${year}-${month}-${day}`;
    }
    
    // Format DD-MM-YYYY → YYYY-MM-DD (FORMAT FRANÇAIS)
    const match2 = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match2) {
        const day = match2[1].padStart(2, '0');
        const month = match2[2].padStart(2, '0');
        const year = match2[3];
        return `${year}-${month}-${day}`;
    }
    
    // Format YYYY-MM-DD (déjà bon - format ISO)
    const match3 = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match3) {
        return dateStr;
    }
    
    // Format YYYYMMDD → YYYY-MM-DD
    const match4 = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match4) {
        return `${match4[1]}-${match4[2]}-${match4[3]}`;
    }
    
    // Format DDMMYYYY → YYYY-MM-DD (sans séparateur, format français)
    const match5 = dateStr.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (match5) {
        return `${match5[3]}-${match5[2]}-${match5[1]}`;
    }
    
    return dateStr;
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
    normalizeDateFormat,
    capitalizeFirstLetter
};
