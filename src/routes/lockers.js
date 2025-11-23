// Routes pour la gestion des casiers

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { dbAll, dbGet, dbRun } = require('../database');
const { lockerSchema } = require('../models/schemas');
const { ZONES_CONFIG } = require('../config/zones');
const { getSession } = require('../services/session');
const { recordHistory } = require('../services/history');
const { isProduction, VERBOSE } = require('../config');

const getCsrfProtection = (req) => req.app.get('csrfProtection');

// ============ ROUTES SPÉCIALES (avant les routes paramétrées) ============

// DEPRECATED: déplacée dans /admin
// DELETE vider tous les casiers - Route spéciale en premier !
router.delete('/all/clear', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const isAdmin = session?.isAdmin;
            const { getClientIP } = require('../utils/misc-utils');
            
            if (!isAdmin) {
                return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
            }
            
            const userName = session?.userName || 'Inconnu';
            
            console.log('🗑️ Libération de tous les casiers...');
            
            const result = await dbRun(
                `UPDATE lockers 
                 SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', 
                     birthDate = '', comment = '', marque = 0, hosp = 0, hospDate = '', 
                     idel = 0, stup = 0, frigo = 0, pca = 0, meopa = 0,
                     updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                 WHERE occupied = 1`,
                [userName]
            );
            
            const count = result.changes || 0;
            
            await recordHistory('ALL', 'CLEAR_ALL', userName, 'admin', `${count} casiers libérés`);
            
            console.log(`✓ ${count} casiers libérés`);
         
            const clientIP = getClientIP(req);
            await dbRun(
                'INSERT INTO connection_logs (role, userName, ipAddress) VALUES (?, ?, ?)',
                ['admin', `EFFACEMENT_CASIERS (${count})`, clientIP]
            );

            res.json({
                success: true,
                cleared: count,
                message: 'Tous les casiers ont été libérés'
            });
        } catch (err) {
            console.error('Erreur libération casiers:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// ============ ROUTES STANDARDS ============

// GET tous les casiers
router.get('/', async (req, res) => {
    try {
        const lockers = await dbAll('SELECT * FROM lockers ORDER BY number ASC');
        res.json(lockers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET casiers par zone
router.get('/zone/:zone', async (req, res) => {
    try {
        const zone = req.params.zone;
        if (!ZONES_CONFIG.some(z => z.name === zone)) {
            return res.status(400).json({ error: 'Zone invalide' });
        }
        
        const lockers = await dbAll(
            'SELECT * FROM lockers WHERE zone = ? ORDER BY number ASC',
            [zone]
        );
        res.json(lockers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET un casier spécifique
router.get('/:number', async (req, res) => {
    try {
        const locker = await dbGet(
            'SELECT * FROM lockers WHERE number = ?',
            [req.params.number]
        );
        
        if (!locker) {
            return res.status(404).json({ error: 'Casier non trouvé' });
        }
        res.json(locker);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST créer ou modifier un casier
router.post('/', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            if (!isProduction && VERBOSE) console.log('📝 POST /api/lockers - Body:', req.body);
            
            // Validation Zod
            const validationResult = lockerSchema.safeParse(req.body);
            if (!validationResult.success) {
                console.error('❌ Validation Zod échouée:', validationResult.error);
                return res.status(400).json({ 
                    error: 'Données invalides', 
                    details: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
                });
            }
            
            const { number, zone, name, firstName, code, birthDate, recoverable, comment, stup, idel, frigo, pca, meopa, expectedVersion } = req.body;

            // Vérifier que la zone existe
            const zoneExists = ZONES_CONFIG.some(z => z.name === zone);
            if (!zoneExists) {
                return res.status(400).json({ 
                    error: `Zone invalide: ${zone}. Zones disponibles: ${ZONES_CONFIG.map(z => z.name).join(', ')}` 
                });
            }

            const token = req.cookies.auth_token;
            const session = getSession(token);
            const userName = session?.userName || 'Inconnu';

            const existingLocker = await dbGet(
                'SELECT * FROM lockers WHERE number = ?',
                [number]
            );

            if (!existingLocker) {
                return res.status(404).json({ error: 'Casier non trouvé' });
            }

            // Vérification du conflit de version
            if (expectedVersion !== undefined && expectedVersion !== null) {
                if (existingLocker.version !== expectedVersion) {
                    console.warn(`⚠️ Conflit de version détecté sur casier ${number}: attendu=${expectedVersion}, actuel=${existingLocker.version}`);
                    return res.status(409).json({ 
                        error: 'Conflit de version: ce casier a été modifié par un autre utilisateur',
                        currentVersion: existingLocker.version,
                        expectedVersion: expectedVersion
                    });
                }
            }

            let isRecoverable = recoverable ? 1 : 0;
            let ippValid = true;
            if (code) {
                const client = await dbGet('SELECT * FROM clients WHERE ipp = ?', [code]);
                if (!client) {
                    isRecoverable = 1;
                    ippValid = false;
                }
            }

            const action = existingLocker.occupied ? 'MODIFICATION' : 'ATTRIBUTION';
            const details = `${name} ${firstName} (IPP: ${code})`;

            await dbRun(
                `UPDATE lockers 
                 SET zone = ?, occupied = 1, recoverable = ?, name = ?, firstName = ?, code = ?, birthDate = ?, comment = ?, stup = ?, idel = ?, frigo = ?, pca = ?, meopa = ?,
                     updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                 WHERE number = ? AND version = ?`,
                [zone, isRecoverable, name, firstName, code, birthDate, comment || '', stup ? 1 : 0, idel ? 1 : 0, frigo ? 1 : 0, pca ? 1 : 0, meopa ? 1 : 0, userName, number, expectedVersion || existingLocker.version]
            );

            // Vérifier que la mise à jour a eu lieu
            const result = await dbGet('SELECT changes() as changes');
            if (result.changes === 0) {
                return res.status(409).json({ 
                    error: 'Conflit de version: ce casier a été modifié par un autre utilisateur'
                });
            }

            await recordHistory(number, action, userName, 'admin', details);

            const updatedLocker = await dbGet(
                'SELECT * FROM lockers WHERE number = ?',
                [number]
            );

            res.json({
                locker: updatedLocker,
                ippValid: ippValid
            });
        } catch (err) {
            console.error('Erreur modification casier:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// POST marquer plusieurs casiers
router.post('/bulk-mark', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const isAdmin = session?.isAdmin;
            
            if (!isAdmin) {
                return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
            }
            
            const { lockerNumbers, mark } = req.body;
            
            if (!Array.isArray(lockerNumbers) || lockerNumbers.length === 0) {
                return res.status(400).json({ error: 'Liste de casiers invalide' });
            }
            
            const userName = session?.userName || 'Inconnu';
            const markValue = mark ? 1 : 0;
            
            console.log(`📖 ${mark ? 'Marquage' : 'Démarquage'} de ${lockerNumbers.length} casiers...`);
            
            const placeholders = lockerNumbers.map(() => '?').join(',');
            
            const result = await dbRun(
                `UPDATE lockers 
                 SET marque = ?, updatedAt = CURRENT_TIMESTAMP, 
                     updatedBy = ?, version = version + 1
                 WHERE number IN (${placeholders})`,
                [markValue, userName, ...lockerNumbers]
            );
            
            const count = result.changes || 0;
            
            const action = mark ? 'BULK_MARK' : 'BULK_UNMARK';
            const details = `${count} casiers: ${lockerNumbers.slice(0, 5).join(', ')}${lockerNumbers.length > 5 ? '...' : ''}`;
            await recordHistory('BULK', action, userName, 'admin', details);
            
            console.log(`✓ ${count} casiers ${mark ? 'marqués' : 'démarqués'}`);

            res.json({
                success: true,
                updated: count,
                message: `${count} casier${count > 1 ? 's' : ''} ${mark ? 'marqué' : 'démarqué'}${count > 1 ? 's' : ''}`
            });
        } catch (err) {
            console.error('Erreur marquage groupé:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// DELETE retirer toutes les marques
router.delete('/clear-marks', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const isAdmin = session?.isAdmin;
            const { getClientIP } = require('../utils/misc-utils');
            
            if (!isAdmin) {
                return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
            }
            
            const userName = session?.userName || 'Inconnu';
            
            console.log('🗑️ Suppression de toutes les marques...');
            
            const result = await dbRun(
                `UPDATE lockers 
                 SET marque = 0, updatedAt = CURRENT_TIMESTAMP, 
                     updatedBy = ?, version = version + 1
                 WHERE marque = 1`,
                [userName]
            );
            
            const count = result.changes || 0;
            
            await recordHistory('ALL', 'CLEAR_ALL_MARKS', userName, 'admin', `${count} marques retirées`);
            
            console.log(`✓ ${count} marques retirées`);
         
            // Log de sécurité
            const clientIP = getClientIP(req);
            await dbRun(
                'INSERT INTO connection_logs (role, userName, ipAddress) VALUES (?, ?, ?)',
                ['admin', `CLEAR_MARKS (${count})`, clientIP]
            );

            res.json({
                success: true,
                cleared: count,
                message: 'Toutes les marques ont été retirées'
            });
        } catch (err) {
            console.error('Erreur suppression marques:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// DELETE vider tous les casiers (route explicite pour éviter tout conflit)
router.delete('/all/clear', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const isAdmin = session?.isAdmin;
            const { getClientIP } = require('../utils/misc-utils');
            
            if (!isAdmin) {
                return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
            }
            
            const userName = session?.userName || 'Inconnu';
            
            console.log('🗑️ Libération de tous les casiers...');
            
            const result = await dbRun(
                `UPDATE lockers 
                 SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', 
                     birthDate = '', comment = '', updatedAt = CURRENT_TIMESTAMP, 
                     updatedBy = ?, version = version + 1
                 WHERE occupied = 1`,
                [userName]
            );
            
            const count = result.changes || 0;
            
            await recordHistory('ALL', 'CLEAR_ALL', userName, 'admin', `${count} casiers libérés`);
            
            console.log(`✓ ${count} casiers libérés`);
         
            const clientIP = getClientIP(req);
            await dbRun(
                'INSERT INTO connection_logs (role, userName, ipAddress) VALUES (?, ?, ?)',
                ['admin', `EFFACEMENT_CASIERS (${count})`, clientIP]
            );

            res.json({
                success: true,
                cleared: count,
                message: 'Tous les casiers ont été libérés'
            });
        } catch (err) {
            console.error('Erreur libération casiers:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// POST Toggle marqueur générique
router.post('/:number/toggle/:marker', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const { number, marker } = req.params;
            
            const validMarkers = ['hosp', 'idel', 'stup', 'frigo', 'pca', 'meopa', 'marque'];
            if (!validMarkers.includes(marker)) {
                return res.status(400).json({ error: 'Marqueur invalide' });
            }
            
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const userName = session?.userName || 'Inconnu';

            const locker = await dbGet('SELECT * FROM lockers WHERE number = ?', [number]);

            if (!locker) {
                return res.status(404).json({ error: 'Casier non trouvé' });
            }

            const newValue = locker[marker] ? 0 : 1;

            await dbRun(
                `UPDATE lockers 
                 SET ${marker} = ?, updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                 WHERE number = ?`,
                [newValue, userName, number]
            );

            const markerLabels = {
                'hosp': { add: 'HOSPITALISATION_AJOUTÉE', remove: 'HOSPITALISATION_RETIRÉE' },
                'idel': { add: 'IDEL_AJOUTÉ', remove: 'IDEL_RETIRÉ' },
                'stup': { add: 'STUPÉFIANTS_AJOUTÉS', remove: 'STUPÉFIANTS_RETIRÉS' },
                'frigo': { add: 'FRIGO_AJOUTÉ', remove: 'FRIGO_RETIRÉ' },
                'pca': { add: 'PCA_AJOUTÉ', remove: 'PCA_RETIRÉ' },
                'meopa': { add: 'MEOPA_AJOUTÉ', remove: 'MEOPA_RETIRÉ' },
                'marque': { add: 'MARQUE_AJOUTÉE', remove: 'MARQUE_RETIRÉE' }
            };
            
            const action = newValue ? markerLabels[marker].add : markerLabels[marker].remove;
            const details = locker.occupied 
                ? `${locker.name} ${locker.firstName} (IPP: ${locker.code})`
                : 'Casier vide';
            
            await recordHistory(number, action, userName, 'admin', details);

            const updatedLocker = await dbGet('SELECT * FROM lockers WHERE number = ?', [number]);

            res.json(updatedLocker);
        } catch (err) {
            console.error('Erreur toggle marqueur:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// POST Modifier l'hospitalisation
router.post('/:number/hospitalisation', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const userName = session?.userName || 'Inconnu';

            const { hosp, hospDate } = req.body;

            if (typeof hosp !== 'boolean') {
                return res.status(400).json({ error: 'hosp doit être un boolean' });
            }

            if (hosp && hospDate && !hospDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD)' });
            }

            const locker = await dbGet(
                'SELECT * FROM lockers WHERE number = ?',
                [req.params.number]
            );

            if (!locker) {
                return res.status(404).json({ error: 'Casier non trouvé' });
            }

            const finalHospDate = hosp ? (hospDate || '') : '';

            await dbRun(
                `UPDATE lockers 
                 SET hosp = ?, hospDate = ?, updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                 WHERE number = ?`,
                [hosp ? 1 : 0, finalHospDate, userName, req.params.number]
            );

            const action = hosp ? 'HOSPITALISATION_AJOUTÉE' : 'HOSPITALISATION_RETIRÉE';
            const details = locker.occupied 
                ? `${locker.name} ${locker.firstName} (IPP: ${locker.code})${finalHospDate ? ` - Date: ${finalHospDate}` : ''}`
                : `Casier vide${finalHospDate ? ` - Date: ${finalHospDate}` : ''}`;
            
            await recordHistory(req.params.number, action, userName, 'admin', details);

            const updatedLocker = await dbGet(
                'SELECT * FROM lockers WHERE number = ?',
                [req.params.number]
            );

            res.json(updatedLocker);
        } catch (err) {
            console.error('Erreur modification hospitalisation:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// DELETE vider tous les casiers (route explicite pour éviter tout conflit)
router.delete('/all/clear', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const isAdmin = session?.isAdmin;
            const { getClientIP } = require('../utils/misc-utils');
            
            if (!isAdmin) {
                return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
            }
            
            const userName = session?.userName || 'Inconnu';
            
            console.log('🗑️ Libération de tous les casiers...');
            
            const result = await dbRun(
                `UPDATE lockers 
                 SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', 
                     birthDate = '', comment = '', marque = 0, hosp = 0, hospDate = '', 
                     idel = 0, stup = 0, frigo = 0, pca = 0, meopa = 0,
                     updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                 WHERE occupied = 1`,
                [userName]
            );
            
            const count = result.changes || 0;
            
            await recordHistory('ALL', 'CLEAR_ALL', userName, 'admin', `${count} casiers libérés`);
            
            console.log(`✓ ${count} casiers libérés`);
         
            const clientIP = getClientIP(req);
            await dbRun(
                'INSERT INTO connection_logs (role, userName, ipAddress) VALUES (?, ?, ?)',
                ['admin', `EFFACEMENT_CASIERS (${count})`, clientIP]
            );

            res.json({
                success: true,
                cleared: count,
                message: 'Tous les casiers ont été libérés'
            });
        } catch (err) {
            console.error('Erreur libération casiers:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// DELETE libérer un casier individuel
router.delete('/:number', requireAuth, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const userName = session?.userName || 'Inconnu';
            const reason = req.query.reason || 'LIBÉRATION';

            const locker = await dbGet(
                'SELECT * FROM lockers WHERE number = ?',
                [req.params.number]
            );

            if (!locker) {
                return res.status(404).json({ error: 'Casier non trouvé' });
            }

            const details = locker.occupied 
                ? `${locker.name} ${locker.firstName} (IPP: ${locker.code})${reason === 'TRANSFERT' ? ' - TRANSFERT' : ''}` 
                : '';

            await dbRun(
                `UPDATE lockers 
                 SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', birthDate = '', comment = '',
                     marque = 0, hosp = 0, hospDate = '', idel = 0, stup = 0, frigo = 0, pca = 0, meopa = 0,
                     updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                 WHERE number = ?`,
                [userName, req.params.number]
            );

            await recordHistory(req.params.number, reason, userName, 'admin', details);

            const updatedLocker = await dbGet(
                'SELECT * FROM lockers WHERE number = ?',
                [req.params.number]
            );

            res.json(updatedLocker);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
});

// GET recherche par nom
router.get('/search/:query', async (req, res) => {
    try {
        const query = '%' + req.params.query + '%';
        const lockers = await dbAll(
            `SELECT * FROM lockers 
             WHERE name LIKE ? OR firstName LIKE ? OR CAST(code AS TEXT) LIKE ?
             ORDER BY number ASC`,
            [query, query, query]
        );
        res.json(lockers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET historique des modifications d'un casier
router.get('/:number/history', async (req, res) => {
    try {
        const history = await dbAll(
            `SELECT * FROM locker_history 
             WHERE lockerNumber = ? 
             ORDER BY timestamp DESC 
             LIMIT 50`,
            [req.params.number]
        );
        
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
