// Routes pour la configuration

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { ZONES_CONFIG } = require('../config/zones');
const { getSession } = require('../services/session');
const { 
    getAnonymizeGuest, 
    getAnonymizeAdmin,
    setAnonymizeGuest,
    setAnonymizeAdmin,
    ANONYMIZE_GUEST,
    ANONYMIZE_ADMIN,
    BACKUP_TIME,
    BACKUP_FREQUENCY_HOURS,
    BACKUP_RETENTION_COUNT,
    isProduction,
    VERBOSE
} = require('../config');
const { getLocalIP } = require('../utils/misc-utils');

const getCsrfProtection = (req) => req.app.get('csrfProtection');

// Route pour obtenir la configuration des zones
router.get('/config/zones', (req, res) => {
    const rawColors = '#E7180B,#31C950,#8A0194,#193CB8';
    const colors = (process.env.ZONE_COLORS || rawColors).trim().split(',');

    const zonesWithColors = ZONES_CONFIG.map((zone, index) => ({
        name: zone.name,
        count: zone.count,
        prefix: zone.prefix,
        color: colors[index] || '#667eea'
    }));

    res.json({
        zones: zonesWithColors,
        total: ZONES_CONFIG.reduce((sum, z) => sum + z.count, 0)
    });
});

// GET configuration d'anonymisation actuelle
router.get('/config/anonymization', requireAuth, (req, res) => {
    const token = req.cookies.auth_token;
    const session = getSession(token);
    const isAdmin = session?.isAdmin;
    
    if (!isAdmin) {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    res.json({
        anonymizeGuest: getAnonymizeGuest(),
        anonymizeAdmin: getAnonymizeAdmin(),
        anonymizeGuestDefault: ANONYMIZE_GUEST,
        anonymizeAdminDefault: ANONYMIZE_ADMIN
    });
});

// POST modifier la configuration d'anonymisation (temporaire)
router.post('/config/anonymization', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, () => {
        const token = req.cookies.auth_token;
        const session = getSession(token);
        const isAdmin = session?.isAdmin;
        
        if (!isAdmin) {
            return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
        }
        
        const { anonymizeGuest, anonymizeAdmin } = req.body;
        
        if (typeof anonymizeGuest === 'boolean') {
            setAnonymizeGuest(anonymizeGuest);
            if (!isProduction && VERBOSE) console.log('🔧 Anonymisation guest modifiée:', anonymizeGuest);
        }
        
        if (typeof anonymizeAdmin === 'boolean') {
            setAnonymizeAdmin(anonymizeAdmin);
            if (!isProduction && VERBOSE) console.log('🔧 Anonymisation admin modifiée:', anonymizeAdmin);
        }
        
        res.json({
            success: true,
            anonymizeGuest: getAnonymizeGuest(),
            anonymizeAdmin: getAnonymizeAdmin(),
            message: 'Configuration modifiée (temporaire - perdue au redémarrage)'
        });
    });
});

// GET format d'import configuré
router.get('/config/import-format', (req, res) => {
    const { IMPORT_FORMATS } = require('../config/import-formats');
    const format = process.env.CLIENT_IMPORT_FORMAT || 'INTERNE';
    res.json({
        clientImportFormat: format,
        availableFormats: Object.keys(IMPORT_FORMATS)
    });
});

// GET configuration backup
router.get('/config/backup', requireAuth, (req, res) => {
    const token = req.cookies.auth_token;
    const session = getSession(token);
    const isAdmin = session?.isAdmin;
    
    if (!isAdmin) {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    res.json({
        backupTime: BACKUP_TIME,
        backupFrequencyHours: BACKUP_FREQUENCY_HOURS,
        backupRetentionCount: BACKUP_RETENTION_COUNT,
        mode: BACKUP_TIME ? 'fixed' : (BACKUP_FREQUENCY_HOURS > 0 ? 'periodic' : 'disabled')
    });
});

// GET configuration générale
router.get('/config', (req, res) => {
    const localIP = getLocalIP();
    const port = process.env.PORT || 5000;
    const apiUrl = `http://${localIP}:${port}/api`;
    
    res.json({
        apiUrl: apiUrl,
        localIP: localIP,
        port: port
    });
});

module.exports = router;
