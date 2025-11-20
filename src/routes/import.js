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

// POST import des casiers au format CSV 
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

// POST import des casiers au format JSON
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

// POST import casiers unifié (CSV ou JSON) 
router.post('/import-unified', requireAuth, importLimiter, async (req, res) => {

    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {

      try {
        const { rawContent, format, mode, separator } = req.body;
        
        if (!rawContent) {
          return res.status(400).json({ error: 'Contenu requis' });
        }

        // Limite de taille
        const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
        if (rawContent.length > MAX_SIZE) {
            return res.status(400).json({ 
                error: `Fichier trop volumineux (max ${MAX_SIZE / 1024 / 1024} MB)` 
            });
        }

        if (VERBOSE > 0) {
          console.log(`📥 Import casiers unifié`);
          console.log(` - Mode: ${mode || 'update'}`);
          console.log(` - Format: ${format || 'auto-detect'}`);
        }

        // ============ AUTO-DETECTION DU FORMAT ============
        let detectedFormat = format || 'auto';
        let parsedData = null;
        let parseErrors = 0;
        
        if (detectedFormat === 'auto') {
          // Essayer JSON d'abord
          try {
            const trimmed = rawContent.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              const jsonData = JSON.parse(trimmed);
              detectedFormat = 'json';
              parsedData = Array.isArray(jsonData) ? jsonData : (jsonData.lockers || jsonData.data);
              if (VERBOSE > 0) console.log('  --> Format auto-détecté: JSON');
            }
          } catch (jsonErr) {
            // Pas du JSON, essayer CSV
          }
          
          // Si pas JSON, c'est du CSV
          if (!parsedData) {
            detectedFormat = 'csv';
            if (VERBOSE > 0) console.log('   --> Format auto-détecté: CSV');
          }
        }

        // ============ PARSING SELON FORMAT ============
        if (detectedFormat === 'json' && !parsedData) {

          console.log('-------------------------------');
          // Parsing JSON manuel (si pas fait en auto-detect)
          try {
            const trimmed = rawContent.trim();
            const jsonData = JSON.parse(trimmed);
            parsedData = Array.isArray(jsonData) ? jsonData : (jsonData.lockers || jsonData.data);
            
            if (!Array.isArray(parsedData)) {
              return res.status(400).json({ 
                error: 'JSON invalide: "data" ou "lockers" doit être un tableau' 
              });
            }
            
            if (VERBOSE > 0) console.log(`   Lignes JSON: ${parsedData.length}`);
            
          } catch (err) {
            return res.status(400).json({ 
              error: 'Erreur parsing JSON: ' + err.message 
            });
          }
          
        } else if (detectedFormat === 'csv') {
          // Validation séparateur
          const VALID_SEPARATORS = [';', ',', '\t', '|', 'auto'];
          if (separator && !VALID_SEPARATORS.includes(separator)) {
            return res.status(400).json({ 
              error: `Séparateur invalide. Valeurs acceptées: ${VALID_SEPARATORS.join(', ')}` 
            });
          }

          // Parsing CSV
          const parseResult = parseCSVContent(rawContent, {
            separator: separator || 'auto',
            headers: true,
            skipEmptyLines: true,
            trim: true
          });
          
          if (!parseResult.success) {
            return res.status(400).json({ 
              error: 'Erreur parsing CSV: ' + parseResult.error 
            });
          }
          
          parsedData = parseResult.records;
          
          if (VERBOSE > 0) {
            console.log(`   Headers: ${parseResult.headers.join(', ')}`);
            console.log(`   Lignes CSV: ${parseResult.rowCount}`);
            console.log(`   Séparateur: ${parseResult.delimiter === '\t' ? 'TAB' : parseResult.delimiter}`);
          }
          
          // Valider colonnes requises pour CSV
          const requiredColumns = ['number', 'zone'];
          const headerLower = parseResult.headers.map(h => h.toLowerCase());
          const missingColumns = requiredColumns.filter(col => 
            !headerLower.some(h => h.includes(col))
          );
          
          if (missingColumns.length > 0) {
            return res.status(400).json({ 
              error: `Colonnes manquantes: ${missingColumns.join(', ')}`,
              headers: parseResult.headers,
              expected: ['number', 'zone', 'name', 'firstName', 'code', 'birthDate', 'recoverable', 'marque', 'hosp', 'hospDate', 'stup', 'idel', 'frigo', 'pca', 'meopa', 'comment']
            });
          }

          // Normaliser les données CSV
          const normalized = [];
          for (let i = 0; i < parsedData.length; i++) {
            try {
              const row = parsedData[i];
              
              const findValue = (variants) => {
                for (const variant of variants) {
                  const key = Object.keys(row).find(k => 
                    k.toLowerCase().includes(variant)
                  );
                  if (key) return row[key]?.trim() || '';
                }
                return '';
              };
              
              const findBoolValue = (variants) => {
                const value = findValue(variants);
                return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'oui';
              };
              
              normalized.push({
                number: findValue(['number', 'numéro', 'nÂ°', 'casier']),
                zone: findValue(['zone']),
                name: findValue(['name', 'nom']),
                firstName: findValue(['firstname', 'prénom', 'prenom']),
                code: findValue(['code', 'ipp']),
                birthDate: findValue(['birthdate', 'ddn', 'date de naissance']),
                recoverable: findBoolValue(['recoverable', 'récupérable']),
                marque: findBoolValue(['marque', 'marqué']),
                hosp: findBoolValue(['hosp', 'hospitalisation']),
                hospDate: findValue(['hospdate', 'date hosp']),
                stup: findBoolValue(['stup', 'stupéfiants']),
                idel: findBoolValue(['idel']),
                frigo: findBoolValue(['frigo']),
                pca: findBoolValue(['pca']),
                meopa: findBoolValue(['meopa']),
                comment: findValue(['comment', 'commentaire'])
              });
            } catch (err) {
              parseErrors++;
              console.error(`   Erreur ligne ${i + 2}:`, err.message);
            }
          }
          
          parsedData = normalized;
        }
        
        if (!parsedData || parsedData.length === 0) {
          return res.status(400).json({ error: 'Aucune donnée valide à importer' });
        }

        // ============ VALIDATION ZOD ============
        const validatedData = [];
        let validationErrors = 0;
        
        for (let i = 0; i < parsedData.length; i++) {
          const validationResult = importCasierSchema.safeParse(parsedData[i]);
          if (!validationResult.success) {
            validationErrors++;
            if (VERBOSE > 0) {
              console.warn(`   Ligne ${i + 1} invalide:`, validationResult.error.errors[0].message);
            }
            continue;
          }
          validatedData.push(validationResult.data);
        }
        
        if (VERBOSE > 0) {
          console.log(`   âœ" Données valides: ${validatedData.length}`);
          console.log(`   âœ— Erreurs validation: ${validationErrors}`);
        }
        
        if (validatedData.length === 0) {
          return res.status(400).json({ 
            error: 'Aucune donnée valide après validation',
            validationErrors: validationErrors,
            total: parsedData.length
          });
        }

        // ============ SESSION & USER ============
        const token = req.cookies.auth_token;
        const session = sessions.get(token);
        const userName = session?.userName || 'Inconnu';
        
        // ============ MODE REPLACE ============
        let clearedCount = 0;
        if (mode === 'replace') {
          if (VERBOSE > 0) console.log('Mode remplacement : libération de tous les casiers...');
          
          const result = await dbRun(
            `UPDATE lockers 
             SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', birthDate = '', comment = '',
                 marque = 0, hosp = 0, hospDate = '', stup = 0, idel = 0, frigo = 0, pca = 0, meopa = 0,
                 updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
             WHERE occupied = 1`,
            [userName]
          );
          
          clearedCount = result.changes || 0;
          await recordHistory('ALL', 'CLEAR_BEFORE_IMPORT', userName, 'admin', 
            `Tous les casiers (${clearedCount}) libérés avant import ${detectedFormat.toUpperCase()}`);
        }
        
        // ============ TRANSACTION IMPORT ============
        let imported = 0;
        let errors = 0;
        let invalidIPP = 0;
        let notFound = 0;
        let skipped = 0;
        
        await dbRun('BEGIN TRANSACTION');
        
        try {
            for (const row of validatedData) {
                try {
                  const { number, zone, name, firstName, code, birthDate, recoverable, comment, 
                          marque, hosp, hospDate, stup, idel, frigo, pca, meopa } = row;
                  
                  // Vérifier que le casier existe
                  const locker = await dbGet('SELECT * FROM lockers WHERE number = ?', [number]);
                  
                  if (!locker) {
                    notFound++;
                    if (VERBOSE > 0) console.warn(`   Casier ${number} non trouvé, ignoré`);
                    continue;
                  }
                  
                  // Mode update : ignorer si déjà occupé
                  if (mode === 'update' && locker.occupied) {
                    skipped++;
                    if (VERBOSE > 0) console.warn(`   Casier ${number} déjà occupé (${locker.name} ${locker.firstName}), ignoré`);
                    continue;
                  }
                  
                  // Vérifier l'IPP dans la base clients
                  let isRecoverable = recoverable ? 1 : 0;
                  if (code) {
                    const client = await dbGet('SELECT * FROM clients WHERE ipp = ?', [code]);
                    if (!client) {
                      isRecoverable = 1;
                      invalidIPP++;
                    }
                  }
                  
                  // Mettre à jour le casier
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
                  
                  // Seuil d'erreurs
                  if (errors > 100) {
                    await dbRun('ROLLBACK');
                    return res.status(500).json({ 
                      error: `Trop d'erreurs (${errors}), import annulé` 
                    });
                  }
                  
                } catch (err) {
                  errors++;
                  console.error('   Erreur insertion casier:', err.message);
                }
            }
              
            // Commit
            await dbRun('COMMIT');
          
        } catch (err) {
            await dbRun('ROLLBACK');
            throw err;
        }
        
        if (VERBOSE > 0) {
            console.log(`📥 Import ${detectedFormat.toUpperCase()} terminé:`);
            console.log(`  - Importés: ${imported}`);
            console.log(`  - Ignorés (occupés): ${skipped}`);
            console.log(`  - Non trouvés: ${notFound}`);
            console.log(`  - IPP invalides: ${invalidIPP}`);
            console.log(`  - Erreurs: ${errors}`);
            console.log(`  - Erreurs validation: ${validationErrors}`);
            if (clearedCount > 0) console.log(`  - Casiers libérés: ${clearedCount}`);
        }
        
        // Réponse
        res.json({
          success: true,
          format: detectedFormat,
          imported: imported,
          skipped: skipped,
          notFound: notFound,
          errors: errors,
          invalidIPP: invalidIPP,
          validationErrors: validationErrors,
          total: parsedData.length,
          cleared: clearedCount
        });
        
      } catch (err) {
        console.error('Erreur lors de l\'import unifié:', err);
        res.status(500).json({ error: err.message });
      }
    });
});

module.exports = router;
