// Routes pour la gestion des clients/patients

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { dbAll, dbGet, dbRun, getDb } = require('../database');
const { clientSchema } = require('../models/schemas');
const { getSession } = require('../services/session');
const { CLIENT_IMPORT_WARNING_DAYS, isProduction, VERBOSE } = require('../config');
const { importLimiter } = require('../middleware/rate-limit');
const { getClientIP } = require('../utils');

const getCsrfProtection = (req) => req.app.get('csrfProtection');

// GET statut import clients
router.get('/import-status', async (req, res) => {
    try {
        const lastImport = await dbGet(
            'SELECT * FROM client_imports ORDER BY importDate DESC LIMIT 1'
        );
        
        const clientCount = await dbGet('SELECT COUNT(*) as count FROM clients');
        const isBaseEmpty = clientCount.count === 0;

        if (!lastImport || isBaseEmpty) {
            return res.json({
                hasImport: false,
                isEmpty: true,
                warning: true,
                warningThreshold: CLIENT_IMPORT_WARNING_DAYS,
                message: 'Aucune donnée patient en base'
            });
        }

        if (lastImport.recordCount < 0) {
            return res.json({
                hasImport: true,
                lastImportDate: lastImport.importDate,
                wasCleared: true,
                clearedBy: lastImport.userName,
                isEmpty: isBaseEmpty,
                warning: true,
                warningThreshold: CLIENT_IMPORT_WARNING_DAYS,
                message: `Base vidée le ${new Date(lastImport.importDate).toLocaleDateString('fr-FR')}`
            });
        }

        const importDate = new Date(lastImport.importDate);
        const now = new Date();
        const daysSince = Math.floor((now - importDate) / (1000 * 60 * 60 * 24));
        const hoursSince = Math.floor((now - importDate) / (1000 * 60 * 60));
        
        res.json({
            hasImport: true,
            lastImportDate: lastImport.importDate,
            daysSinceImport: daysSince,
            hoursSinceImport: hoursSince,
            recordCount: lastImport.recordCount,
            userName: lastImport.userName,
            clientCount: clientCount.count,
            isEmpty: isBaseEmpty,
            warning: daysSince > CLIENT_IMPORT_WARNING_DAYS || isBaseEmpty,
            warningThreshold: CLIENT_IMPORT_WARNING_DAYS
        });
    } catch (err) {
        console.error('Erreur récupération statut import:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET statistiques de la base clients
router.get('/stats', async (req, res) => {
    try {
        const total = await dbGet('SELECT COUNT(*) as count FROM clients');
        
        const lastImport = await dbGet(
            'SELECT * FROM client_imports ORDER BY importDate DESC LIMIT 1'
        );
        
        const byZone = await dbAll(
            'SELECT zone, COUNT(*) as count FROM clients WHERE zone IS NOT NULL AND zone != "" GROUP BY zone ORDER BY count DESC'
        );
        
        const bySex = await dbAll(
            'SELECT sex, COUNT(*) as count FROM clients WHERE sex IS NOT NULL AND sex != "" GROUP BY sex'
        );
        
        const preview = await dbAll(
            'SELECT ipp, name, firstName, birthDate, sex, zone, entryDate FROM clients ORDER BY ipp ASC LIMIT 10'
        );
        
        res.json({
            total: total.count,
            lastImport: lastImport,
            byZone: byZone,
            bySex: bySex,
            preview: preview
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET un client par IPP
router.get('/:ipp', async (req, res) => {
    try {
        const client = await dbGet(
            'SELECT * FROM clients WHERE ipp = ?',
            [req.params.ipp]
        );
        
        if (!client) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }
        
        res.json(client);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST import clients/patients depuis CSV
router.post('/import', requireAuth, importLimiter, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const { data, rawContent, format, mode, separator } = req.body;
            const { parseClientsWithFormat } = require('../services/csv-parser');
            
            let clients = [];
            let stats = {
                imported: 0,
                skipped: 0,
                filtered: 0,
                errors: 0,
                total: 0
            };
            
            if (rawContent) {
                const formatName = format;
                const csvSeparator = separator;
                const result = parseClientsWithFormat(rawContent, formatName, csvSeparator);
                clients = result.clients;
                stats = result.stats;
            } else if (data && Array.isArray(data)) {
                clients = data;
                stats.imported = data.length;
                stats.total = data.length;
            }
            
            if (clients.length === 0) {
                return res.status(400).json({ 
                    error: 'Aucune donnée valide trouvée',
                    stats: stats
                });
            }

            if (!isProduction && VERBOSE) {
                console.log('Import de', clients.length, 'patients...');
                console.log('Mode:', mode || 'replace');
            }

            const validatedClients = [];
            let validationErrors = 0;
            
            for (const client of clients) {
                const result = clientSchema.safeParse(client);
                if (result.success) {
                    validatedClients.push(result.data);
                } else {
                    console.warn(`Patient invalide ignoré (IPP: ${client.ipp}):`, result.error.errors[0].message);
                    validationErrors++;
                }
            }
            
            if (validatedClients.length === 0) {
                return res.status(400).json({ 
                    error: 'Aucun client valide après validation',
                    validationErrors: validationErrors
                });
            }

            if (!mode || mode === 'replace') {
                await dbRun('DELETE FROM clients');
                if (!isProduction && VERBOSE) console.log('Base patients vidée (mode replace)');
            }

            let importedCount = 0;
            let errorCount = 0;
            let skippedCount = 0;

            const sqlQuery = (mode === 'merge') 
                ? `INSERT OR IGNORE INTO clients (ipp, name, firstName, birthName, birthDate, sex, zone, entryDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                : `INSERT INTO clients (ipp, name, firstName, birthName, birthDate, sex, zone, entryDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

            const db = getDb();
            const stmt = db.prepare(sqlQuery);

            for (const row of validatedClients) {
                try {
                    const { ipp, name, firstName, birthName, birthDate, sex, zone, entryDate } = row;
                    
                    stmt.run(ipp, name, firstName, birthName, birthDate, sex, zone, entryDate, function(err) {
                        if (err) {
                            errorCount++;
                            console.error('Erreur insertion patient N°' + (errorCount+skippedCount+importedCount) + ' with IPP='+ ipp +' :', err);
                        } else if (this.changes === 0 && mode === 'merge') {
                            skippedCount++;
                            console.warn('Patient N°' + (errorCount+skippedCount+importedCount) + ' with IPP='+ ipp +' ignoré : doublon');
                        } else {
                            importedCount++;
                        }
                    });
                } catch (err) {
                    console.error('Erreur traitement ligne:', err);
                    errorCount++;
                }
            }

            stmt.finalize(async () => {
                if (!isProduction && VERBOSE) {
                    console.log('Import terminé:', importedCount, 'importés,', skippedCount, 'ignorés,', errorCount, 'erreurs,', validationErrors, 'validations échouées');
                }
                
                const token = req.cookies.auth_token;
                const session = getSession(token);
                const userName = session?.userName || 'Inconnu';
                
                await dbRun(
                    'INSERT INTO client_imports (recordCount, userName, importDate) VALUES (?, ?, ?)',
                    [importedCount, userName, new Date().toISOString()]
                );
                
                const totalInDb = await dbGet('SELECT COUNT(*) as count FROM clients');
                
                res.json({
                    success: true,
                    imported: importedCount,
                    skipped: skippedCount,
                    errors: errorCount,
                    validationErrors: validationErrors,
                    filtered: stats.filtered,
                    total: stats.total,
                    totalInDb: totalInDb.count
                });
            });
        } catch (err) {
            console.error('Erreur import patients:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// DELETE vider la base clients
router.delete('/clear', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const isAdmin = session?.isAdmin;
            const userName = session?.userName || 'Inconnu';
            
            if (!isAdmin) {
                return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
            }
            
            console.log('🗑️ Suppression de tous les clients...');
            
            const resultClients = await dbRun('DELETE FROM clients');
            const countClients = resultClients.changes || 0;
            console.log(`✓ ${countClients} clients supprimés`);
            
            await dbRun(
                'INSERT INTO client_imports (recordCount, userName, importDate) VALUES (?, ?, ?)',
                [-countClients, `EFFACEMENT par ${userName}`, new Date().toISOString()]
            );

            res.json({
                success: true,
                deleted: countClients,
                deletedBy: userName,
                message: 'Base clients vidée avec succès'
            });
        } catch (err) {
            console.error('Erreur suppression clients:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

module.exports = router;
