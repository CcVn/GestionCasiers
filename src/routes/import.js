// Routes pour les imports

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { dbAll, dbGet, dbRun } = require('../database');
const { importCasierSchema } = require('../models/schemas');
const { getSession } = require('../services/session');
const { recordHistory } = require('../services/history');
const { importLimiter } = require('../middleware/rate-limit');
const { isProduction, VERBOSE } = require('../config');

const getCsrfProtection = (req) => req.app.get('csrfProtection');

// POST import CSV casiers
router.post('/import', requireAuth, importLimiter, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const { rawContent, mode, separator } = req.body;
            const { detectCSVSeparator, parseCsvLine } = require('../services/csv-parser');
            
            if (!rawContent) {
                return res.status(400).json({ error: 'Contenu CSV requis' });
            }
            
            // Détecter le séparateur
            const usedSeparator = separator === 'auto' || !separator 
                ? detectCSVSeparator(rawContent) 
                : separator;
            
            if (VERBOSE > 0) {
                console.log(`📥 Import casiers CSV`);
                console.log(`   Séparateur: "${usedSeparator === '\t' ? 'TAB' : usedSeparator}"`);
                console.log(`   Mode: ${mode || 'update'}`);
            }
            
            const lines = rawContent.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                return res.status(400).json({ error: 'Fichier vide ou invalide (moins de 2 lignes)' });
            }
            
            // Parser les headers
            const headers = parseCsvLine(lines[0], usedSeparator);
            const dataLines = lines.slice(1);
            
            if (VERBOSE > 0) {
                console.log(`   Headers: ${headers.join(', ')}`);
                console.log(`   Lignes de données: ${dataLines.length}`);
            }
            
            // Mapper les colonnes
            const columnMap = {};
            const expectedColumns = {
                'number': ['number', 'numéro', 'n°', 'casier'],
                'zone': ['zone'],
                'name': ['name', 'nom'],
                'firstName': ['firstname', 'prénom', 'prenom'],
                'code': ['code', 'ipp', 'n°ipp'],
                'birthDate': ['birthdate', 'ddn', 'date de naissance', 'naissance'],
                'recoverable': ['recoverable', 'récupérable', 'recuperable'],
                'marque': ['marque', 'marqué', 'marked'],
                'hosp': ['hosp', 'hospitalisation', 'hospi'],
                'hospDate': ['hospdate', 'date hosp', 'date hospitalisation'],
                'stup': ['stup', 'stupéfiants', 'stupefiants'],
                'idel': ['idel'],
                'frigo': ['frigo'],
                'pca': ['pca'],
                'meopa': ['meopa'],
                'comment': ['comment', 'commentaire', 'remarque']
            };

            const headerLower = headers.map(h => h.toLowerCase().trim());
            
            // Trouver les index des colonnes
            for (const [key, variants] of Object.entries(expectedColumns)) {
                const index = headerLower.findIndex(h => 
                    variants.some(v => h.includes(v))
                );
                if (index !== -1) {
                    columnMap[key] = index;
                }
            }
            
            if (VERBOSE > 0) {
                console.log('   Mapping colonnes:', columnMap);
            }
            
            // Parser les données
            const parsedData = [];
            let parseErrors = 0;
            
            for (let i = 0; i < dataLines.length; i++) {
                try {
                    const values = parseCsvLine(dataLines[i], usedSeparator);
                    
                    if (values.length < 2) {
                        parseErrors++;
                        console.warn(`   Ligne ${i + 2} ignorée: trop peu de colonnes (${values.length})`);
                        continue;
                    }
                    
                    const row = {
                        number: columnMap.number !== undefined ? values[columnMap.number]?.trim() : '',
                        zone: columnMap.zone !== undefined ? values[columnMap.zone]?.trim() : '',
                        name: columnMap.name !== undefined ? values[columnMap.name]?.trim() : '',
                        firstName: columnMap.firstName !== undefined ? values[columnMap.firstName]?.trim() : '',
                        code: columnMap.code !== undefined ? values[columnMap.code]?.trim() : '',
                        birthDate: columnMap.birthDate !== undefined ? values[columnMap.birthDate]?.trim() : '',
                        recoverable: columnMap.recoverable !== undefined ? (values[columnMap.recoverable]?.trim() === '1') : false,
                        marque: columnMap.marque !== undefined ? (values[columnMap.marque]?.trim() === '1') : false,
                        hosp: columnMap.hosp !== undefined ? (values[columnMap.hosp]?.trim() === '1') : false,
                        hospDate: columnMap.hospDate !== undefined ? values[columnMap.hospDate]?.trim() : '',
                        stup: columnMap.stup !== undefined ? (values[columnMap.stup]?.trim() === '1') : false,
                        idel: columnMap.idel !== undefined ? (values[columnMap.idel]?.trim() === '1') : false,
                        frigo: columnMap.frigo !== undefined ? (values[columnMap.frigo]?.trim() === '1') : false,
                        pca: columnMap.pca !== undefined ? (values[columnMap.pca]?.trim() === '1') : false,
                        meopa: columnMap.meopa !== undefined ? (values[columnMap.meopa]?.trim() === '1') : false,
                        comment: columnMap.comment !== undefined ? values[columnMap.comment]?.trim() : ''
                    };
                    
                    // Valider avec Zod
                    const validationResult = importCasierSchema.safeParse(row);
                    if (!validationResult.success) {
                        parseErrors++;
                        console.warn(`   Ligne ${i + 2} invalide:`, validationResult.error.errors[0].message);
                        continue;
                    }
                    
                    parsedData.push(validationResult.data);
                    
                } catch (err) {
                    parseErrors++;
                    console.error(`   Erreur ligne ${i + 2}:`, err.message);
                }
            }
            
            if (parsedData.length === 0) {
                return res.status(400).json({ 
                    error: 'Aucune donnée valide après parsing',
                    parseErrors: parseErrors,
                    totalLines: dataLines.length
                });
            }
            
            if (VERBOSE > 0) {
                console.log(`   ✓ Données valides: ${parsedData.length}`);
                console.log(`   ✗ Erreurs parsing: ${parseErrors}`);
            }
            
            const token = req.cookies.auth_token;
            const session = getSession(token);
            const userName = session?.userName || 'Inconnu';
            
            // MODE REPLACE
            if (mode === 'replace') {
                if (VERBOSE > 0) console.log('🗑️ Mode remplacement : libération de tous les casiers...');
                
                await dbRun(
                    `UPDATE lockers 
                     SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', birthDate = '', comment = '',
                         marque = 0, hosp = 0, hospDate = '', stup = 0, idel = 0, frigo = 0, pca = 0, meopa = 0,
                         updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                     WHERE occupied = 1`,
                    [userName]
                );
                
                await recordHistory('ALL', 'CLEAR_BEFORE_IMPORT', userName, 'admin', 'Tous les casiers libérés avant import');
            }
            
            // Insérer les données
            let imported = 0;
            let errors = 0;
            let invalidIPP = 0;
            let notFound = 0;
            
            for (const row of parsedData) {
                try {
                    const { number, zone, name, firstName, code, birthDate, recoverable, comment, marque, hosp, hospDate, stup, idel, frigo, pca, meopa } = row;
                    
                    const locker = await dbGet('SELECT * FROM lockers WHERE number = ?', [number]);
                    
                    if (!locker) {
                        notFound++;
                        console.warn(`   Casier ${number} non trouvé, ignoré`);
                        continue;
                    }
                    
                    let isRecoverable = recoverable ? 1 : 0;
                    if (code) {
                        const client = await dbGet('SELECT * FROM clients WHERE ipp = ?', [code]);
                        if (!client) {
                            isRecoverable = 1;
                            invalidIPP++;
                        }
                    }
                    
                    await dbRun(
                        `UPDATE lockers 
                         SET zone = ?, occupied = 1, recoverable = ?, name = ?, firstName = ?, code = ?, birthDate = ?, comment = ?,
                             marque = ?, hosp = ?, hospDate = ?, stup = ?, idel = ?, frigo = ?, pca = ?, meopa = ?,
                             updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                         WHERE number = ?`,
                        [zone, isRecoverable, name, firstName, code, birthDate, comment || '', 
                         marque ? 1 : 0, hosp ? 1 : 0, hospDate || '', stup ? 1 : 0, idel ? 1 : 0, 
                         frigo ? 1 : 0, pca ? 1 : 0, meopa ? 1 : 0, userName, number]
                    );
                    
                    imported++;
                    
                } catch (err) {
                    errors++;
                    console.error('   Erreur insertion casier:', err.message);
                }
            }
            
            if (VERBOSE > 0) {
                console.log(`✓ Import terminé:`);
                console.log(`  - Importés: ${imported}`);
                console.log(`  - Non trouvés: ${notFound}`);
                console.log(`  - IPP invalides: ${invalidIPP}`);
                console.log(`  - Erreurs: ${errors}`);
                console.log(`  - Erreurs parsing: ${parseErrors}`);
            }
            
            res.json({
                success: true,
                imported: imported,
                notFound: notFound,
                errors: errors,
                invalidIPP: invalidIPP,
                validationErrors: parseErrors,
                total: dataLines.length
            });
            
        } catch (err) {
            console.error('Erreur import casiers:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// POST import JSON casiers
router.post('/import-json', requireAuth, importLimiter, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const { data, metadata } = req.body;
            
            if (!data || !Array.isArray(data)) {
                return res.status(400).json({ error: 'Données JSON invalides - champ "data" requis et doit être un tableau' });
            }
            
            if (!isProduction && VERBOSE) {
                console.log(`📥 Import JSON - ${data.length} casiers à importer`);
                if (metadata) {
                    console.log(`   Metadata: exporté le ${metadata.exportDate} par ${metadata.exportBy}`);
                }
            }

            const token = req.cookies.auth_token;
            const session = getSession(token);
            const userName = session?.userName || 'Inconnu';

            let imported = 0;
            let errors = 0;
            let invalidIPP = 0;
            let validationErrors = 0;
            let skipped = 0;

            for (const row of data) {
                try {
                    const validationResult = importCasierSchema.safeParse(row);
                    if (!validationResult.success) {
                        console.warn('Ligne invalide ignorée:', validationResult.error.errors[0].message);
                        validationErrors++;
                        continue;
                    }
                    
                    const { number, zone, name, firstName, code, birthDate, recoverable, comment } = validationResult.data;
                    
                    const locker = await dbGet('SELECT * FROM lockers WHERE number = ?', [number]);
                    
                    if (!locker) {
                        console.warn(`Casier ${number} non trouvé, ignoré`);
                        skipped++;
                        continue;
                    }
                    
                    if (locker.occupied) {
                        console.warn(`Casier ${number} déjà occupé (${locker.name} ${locker.firstName}), ignoré`);
                        skipped++;
                        continue;
                    }
                    
                    let isRecoverable = recoverable ? 1 : 0;
                    if (code) {
                        const client = await dbGet('SELECT * FROM clients WHERE ipp = ?', [code]);
                        if (!client) {
                            isRecoverable = 1;
                            invalidIPP++;
                        }
                    }
                    
                    await dbRun(
                        `UPDATE lockers 
                         SET zone = ?, occupied = 1, recoverable = ?, name = ?, firstName = ?, code = ?, birthDate = ?, comment = ?,
                             updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                         WHERE number = ?`,
                        [zone, isRecoverable, name, firstName, code, birthDate, comment || '', userName, number]
                    );
                    
                    await recordHistory(number, 'IMPORT_JSON', userName, 'admin', `${name} ${firstName} (IPP: ${code})`);
                    imported++;
                    
                } catch (err) {
                    console.error('Erreur import ligne:', err);
                    errors++;
                }
            }

            if (!isProduction && VERBOSE) {
                console.log(`✓ Import JSON terminé: ${imported} importés, ${skipped} ignorés, ${errors} erreurs`);
            }

            res.json({
                success: true,
                imported: imported,
                skipped: skipped,
                errors: errors,
                invalidIPP: invalidIPP,
                validationErrors: validationErrors,
                total: data.length
            });
        } catch (err) {
            console.error('Erreur import JSON:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

module.exports = router;
