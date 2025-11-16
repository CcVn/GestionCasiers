// Routes pour les exports

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { dbAll, dbRun } = require('../database');
const { getSession } = require('../services/session');
const { exportLimiter } = require('../middleware/rate-limit');

const getCsrfProtection = (req) => req.app.get('csrfProtection');

// POST export unifié avec log internalisé
router.post('/export', requireAuth, exportLimiter, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const { format, separator, includeEmpty } = req.body;
            
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const userName = session?.userName || 'Inconnu';
            const role = session?.isAdmin ? 'admin' : 'guest';
            
            // Récupérer les données
            let lockers = includeEmpty 
                ? await dbAll('SELECT * FROM lockers ORDER BY number ASC')
                : await dbAll('SELECT * FROM lockers WHERE occupied = 1 ORDER BY number ASC');
            
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const readableDate = now.toLocaleString('fr-FR', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(/[/:]/g, '-').replace(', ', '_');
            
            let content, filename, mimeType;
            
            if (format === 'json') {
                const exportData = {
                    metadata: {
                        exportDate: now.toISOString(),
                        exportBy: userName,
                        userRole: role,
                        totalLockers: lockers.length,
                        includeEmpty: includeEmpty,
                        application: 'HADO - Casiers zone départ',
                        version: '1.0'
                    },
                    lockers: lockers
                };
                content = JSON.stringify(exportData, null, 2);
                filename = `casiers_${readableDate}_${userName}.json`;
                mimeType = 'application/json';
                
            } else if (format === 'csv') {
                const sep = separator || ',';
                const headers = ['N° Casier', 'Zone', 'Nom', 'Prénom', 'N°IPP', 'DDN', 'Récupérable', 'Marque', 'Hospitalisation', 'Date Hosp', 'Stupéfiants', 'IDEL', 'Frigo', 'PCA', 'MEOPA', 'Commentaire'];
                const rows = lockers.map(locker => [
                    locker.number, 
                    locker.zone, 
                    locker.name || '', 
                    locker.firstName || '', 
                    locker.code || '', 
                    locker.birthDate || '',
                    locker.recoverable ? '1' : '0',
                    locker.marque ? '1' : '0',
                    locker.hosp ? '1' : '0',
                    locker.hospDate || '',
                    locker.stup ? '1' : '0',
                    locker.idel ? '1' : '0',
                    locker.frigo ? '1' : '0',
                    locker.pca ? '1' : '0',
                    locker.meopa ? '1' : '0',
                    locker.comment || ''
                ]);
                
                content = [
                    headers.join(sep),
                    ...rows.map(row => row.map(cell => `"${cell}"`).join(sep))
                ].join('\n');
                
                const separatorName = sep === ';' ? 'semicolon' : sep === ',' ? 'comma' : 'other';
                filename = `casiers_${readableDate}_${userName}_${separatorName}.csv`;
                mimeType = 'text/csv';
            } else {
                return res.status(400).json({ error: 'Format invalide' });
            }
            
            // Logger l'export
            try {
                await dbRun(
                    'INSERT INTO export_logs (format, recordCount, userName, userRole) VALUES (?, ?, ?, ?)',
                    [format, lockers.length, userName, role]
                );
            } catch (logErr) {
                console.error('Erreur enregistrement log export:', logErr);
            }
            
            res.json({
                success: true,
                content: content,
                filename: filename,
                mimeType: mimeType,
                recordCount: lockers.length
            });
            
        } catch (err) {
            console.error('Erreur export unifié:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// POST enregistrer un export (pour compatibilité)
router.post('/exports/log', exportLimiter, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const { format, recordCount, userName, userRole } = req.body;
            
            await dbRun(
                'INSERT INTO export_logs (format, recordCount, userName, userRole) VALUES (?, ?, ?, ?)',
                [format, recordCount, userName, userRole]
            );
            
            res.json({ success: true });
        } catch (err) {
            console.error('Erreur enregistrement export:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// GET historique des exports
router.get('/exports/history', async (req, res) => {
    try {
        const { days } = req.query;
        const daysLimit = parseInt(days) || 30;
        
        const exports = await dbAll(
            `SELECT * FROM export_logs 
             WHERE timestamp >= datetime('now', '-${daysLimit} days')
             ORDER BY timestamp DESC 
             LIMIT 100`,
            []
        );
        
        res.json(exports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
