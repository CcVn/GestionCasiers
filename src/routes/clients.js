// Routes pour la gestion des clients/patients

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { dbAll, dbGet, dbRun, getDb } = require('../database');
const { clientSchema } = require('../models/schemas');
const { getSession } = require('../services/session');
const { CLIENT_IMPORT_WARNING_DAYS, isProduction, VERBOSE } = require('../config');
const { importLimiter } = require('../middleware/rate-limit');
const { getClientIP, capitalizeFirstLetter } = require('../utils/misc-utils');
const getCsrfProtection = (req) => req.app.get('csrfProtection');
// IMPORTS DES UTILITAIRES DE PRÉTRAITEMENT
const { normalizeDateFormat } = require('../utils/date');
const { cleanCSVHeaders  } = require('../utils/csv-cleaner');
const { preprocessWinpharmClients  } = require('../utils/winpharm-parser');
// A implémenter
const {
  CLIENT_COLUMNS,
  createColumnMapping,
  validateRequiredColumns,
  getFieldVariants,
  generateMappingReport
} = require('../config/import-formats');

const COUNT_PREVIEW_CLIENTS = 10


// ----- Configuration des colonnes attendues avec leurs variantes  -----

// Permet de gérer différents formats d'export (MH, Winpharm, etc.) --> en cours de transfert dans import-format
const expectedColumns = {
  ipp: ['ipp', 'n°ipp', 'noipp', 'numero_ipp', 'ipp_patient', 'code', 'patient_id'],
  name: ['nom', 'name', 'nom_patient', 'nom_usage', 'lastname', 'patient_nom'],
  firstName: ['prenom', 'prénom', 'firstname', 'prenom_patient', 'prenom_usage', 'patient_prenom'],
  birthName: ['nom_de_naissance', 'nom_naissance', 'nomdenaissance', 'birthname', 'né(e)', 'née'],
  birthDate: ['date_de_naissance', 'ddn', 'birthdate', 'date_naissance', 'naissance', 'birth_date'],
  sex: ['sexe', 'sex', 'genre', 'gender'],
  zone: ['zone', 'unite medicale', 'um', 'unité medicale'],
  entryDate: ['date_entree', 'dateentree', 'date_entrée', 'dateentrée', 'date_admission', 'entrydate', 'admission', 'date_début'],
  exitDate: ['date_sortie', 'exitdate', 'sortie', 'date_fin']
};

// ------------------------------------------------------------------------------------
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
            'SELECT ipp, name, firstName, birthDate, sex, zone, entryDate FROM clients ORDER BY ipp ASC LIMIT ' + String(COUNT_PREVIEW_CLIENTS)
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

            let { data, rawContent, format, mode, separator } = req.body;

            let clients = [];
            let stats = {
                imported: 0,
                skipped: 0,
                filtered: 0,
                errors: 0,
                total: 0
            };
            let columnMapping = null;
            let unmappedColumns = [];
            let parseResult = null;
            let preprocessingReport = {
                headersCleaned: false,
                winpharmParsed: false,
                datesNormalized: false
            };

            // --------------------------------------------------------
            // PRÉTRAITEMENT 1 : Nettoyer les headers (retours chariot)
            // --------------------------------------------------------
            if (rawContent) {
                if (!isProduction && VERBOSE) {
                    console.log('🧹 Étape 1/4 : Nettoyage des headers CSV...');
                    const preview = rawContent.substring(0, 100).replace(/\n/g, '\\n');
                    console.log(`   Preview brut: ${preview}...`);
                }
                
                // Nettoyer avant tout traitement
                rawContent = cleanCSVHeaders(rawContent);
                preprocessingReport.headersCleaned = true;
                
                if (!isProduction && VERBOSE) {
                    const firstLine = rawContent.split('\n')[0];
                    console.log(`   ✓ Headers nettoyés: ${firstLine.substring(0, 150)}...`);
                }
            }

            // ============================================================
            // CAS 1 : Import depuis rawContent (CSV brut)
            // ============================================================
            if (rawContent) {

                // --------------------------------------------------------
                // ÉTAPE 2 : Parser le CSV
                // --------------------------------------------------------
                if (!isProduction && VERBOSE) {
                    console.log('📋 Étape 2/4 : Parsing du CSV...');
                }
                // Parser avec le format spécifié (Winpharm: sur données prétraitées)
                const { parseClientsWithFormat } = require('../services/csv-parser');
                const parseResult = parseClientsWithFormat(rawContent, format, separator);
                
                // Vérifier si le parser a retourné les headers
                if (parseResult.headers) {
                    // Créer le mapping des colonnes
                    const mappingResult = createColumnMapping(parseResult.headers);
                    columnMapping = mappingResult.mapping;
                    unmappedColumns = mappingResult.unmappedColumns;
                    
                    if (!isProduction && VERBOSE) {
                        console.log('🗺️ Mapping des colonnes:', columnMapping);
                        if (unmappedColumns.length > 0) {
                            console.warn('⚠️ Colonnes non reconnues:', unmappedColumns.map(c => c.name));
                        }
                    }
                    
                    // Valider les colonnes obligatoires
                    const validation = validateRequiredColumns(columnMapping);
                    if (!validation.isValid) {
                        return res.status(400).json({
                            error: 'Colonnes obligatoires manquantes',
                            missingFields: validation.missingFields,
                            expectedVariants: validation.missingFields.map(field => ({
                                field,
                                acceptedNames: expectedColumns[field]
                            })),
                            detectedHeaders: parseResult.headers,
                            unmappedColumns: unmappedColumns.map(col => col.name)
                        });
                    }
                } else {
                    console.warn('⚠️ Pas de headers retournés par parseClientsWithFormat.');
                }
                
                clients = parseResult.clients || [];
                stats = parseResult.stats || stats;
                
            // ============================================================
            // CAS 2 : Import depuis données déjà parsées
            // ============================================================
            } else if (data && Array.isArray(data)) {
                if (!isProduction && VERBOSE) {
                    console.log(`📥 Import clients depuis données déjà parsées`);
                }
                clients = data;
                stats.imported = data.length;
                stats.total = data.length;
            } else {
                return res.status(400).json({ 
                    error: 'Données manquantes',
                    details: 'rawContent ou data requis'
                });
            }

            // --------------------------------------------------------
            // PRÉTRAITEMENT 2 : Normaliser les dates
            // --------------------------------------------------------
            if (!isProduction && VERBOSE) {
                console.log('📅 Étape 3/4 : Normalisation des dates...');
            }
            
            let datesNormalized = 0;
            clients = clients.map(client => {
                if (client.birthDate) {
                    const original = client.birthDate;
                    client.birthDate = normalizeDateFormat(client.birthDate);
                    if (original !== client.birthDate) datesNormalized++;
                }
                if (client.entryDate) {
                    const original = client.entryDate;
                    client.entryDate = normalizeDateFormat(client.entryDate);
                    if (original !== client.entryDate) datesNormalized++;
                }
                if (client.exitDate) {
                    const original = client.exitDate;
                    client.exitDate = normalizeDateFormat(client.exitDate);
                    if (original !== client.exitDate) datesNormalized++;
                }
                return client;
            });
            
            preprocessingReport.datesNormalized = datesNormalized > 0;
            
            if (!isProduction && VERBOSE) {
                console.log(`   ✓ ${datesNormalized} date(s) normalisée(s)`);
            }

            // --------------------------------------------------------
            // PRÉTRAITEMENT 3 : Parser format Winpharm (si applicable)
            // --------------------------------------------------------
            if (format === 'WINPHARM' || format === 'AUTO') {
                if (!isProduction && VERBOSE) {
                    console.log('🏥 Étape 4/4 : Prétraitement Winpharm...');
                }
                
                const beforeCount = clients.length;
                clients = preprocessWinpharmClients(clients);
                preprocessingReport.winpharmParsed = true;
                
                if (!isProduction && VERBOSE) {
                    console.log(`   ✓ ${beforeCount} client(s) prétraité(s) (Nom/Prénom/Sexe)`);
                    
                    // Afficher un exemple de prétraitement
                    const sample = clients[0];
                    if (sample) {
                        console.log('   📋 Exemple de résultat:');
                        console.log(`      Nom: ${sample.name || 'N/A'}`);
                        console.log(`      Prénom: ${sample.firstName || 'N/A'}`);
                        console.log(`      Nom naissance: ${sample.birthName || 'N/A'}`);
                        console.log(`      Sexe: ${sample.sex || 'N/A'}`);
                    }
                }
            } else {
                if (!isProduction && VERBOSE) {
                    console.log('⏭️  Étape 4/4 : Prétraitement Winpharm ignoré (format différent)');
                }
            }

            // ---  Si clients ne contient aucune donnée validée  --> STOP
            if (clients.length === 0) {
                return res.status(400).json({ 
                    error: 'Aucune donnée correspondant au schéma de fichier sélectionné. Assurez-vous que le fichier contient les champs attendus avec ce format.',
                    stats: stats
                });
            }

            if (!isProduction && VERBOSE) {
                console.log('Import de', clients.length, 'patients...');
                console.log('Mode:', mode || 'replace');
            }

            // --- Validation ZOD de chaque ligne
            const validatedClients = [];
            let validationErrors = 0;
            
            for (const client of clients) {
                //console.log(' - IPP: '+client.ipp+' - Nom: '+client.Name+' - prénom: '+client.firstName+' - Date entrée: '+client.entryDate);
                const result = clientSchema.safeParse(client);

                if (result.success) {
                    validatedClients.push(result.data);
                } else {
                    console.warn(`Patient invalide ignoré (IPP: ${client.ipp}):`, result.error.errors[0].message);
                    validationErrors++;
                }
            }
            
            // ---  Si clients ne contient aucune donnée validée selon schéma Zod --> STOP
            if (validatedClients.length === 0) {
                return res.status(400).json({ 
                    error: 'Aucun client valide après validation Zod',
                    validationErrors: validationErrors
                });
            }

            // ============================================================
            // MODE REPLACE : VIDER LA BASE
            // ============================================================
            if (!mode || mode === 'replace') {
                await dbRun('DELETE FROM clients');
                if (!isProduction && VERBOSE) { console.log('Base patients vidée (mode replace)') };
            }

            // ============================================================
            // INSERTION DANS LA BASE
            // ============================================================
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
                            console.error(`Erreur insertion patient (IPP: ${ipp}):`, err.message);
                        } else if (this.changes === 0 && mode === 'merge') {
                            skippedCount++;
                            if (!isProduction && VERBOSE) {
                                console.warn(`Patient (IPP: ${ipp}) ignoré : doublon`);
                            }
                        } else {
                            importedCount++;
                        }
                    });
                } catch (err) {
                    console.error('Erreur traitement ligne:', err);
                    errorCount++;
                }
            }

            // ============================================================
            // FINALISATION ET RÉPONSE
            // ============================================================
            stmt.finalize(async () => {
                if (!isProduction && VERBOSE) {
                    console.log(`\n✅ Import terminé:`);
                    console.log(`   Importés: ${importedCount}`);
                    console.log(`   Ignorés: ${skippedCount}`);
                    console.log(`   Erreurs: ${errorCount}`);
                    console.log(`   Validations échouées: ${validationErrors}`);
                }

                // Enregistrer l'import dans l'historique
                const token = req.cookies.auth_token;
                const session = getSession(token);
                const userName = session?.userName || 'Inconnu';
                
                await dbRun(
                    'INSERT INTO client_imports (recordCount, userName, importDate) VALUES (?, ?, ?)',
                    [importedCount, userName, new Date().toISOString()]
                );
                
                // Compter le nombre total de clients en base
                const totalInDb = await dbGet('SELECT COUNT(*) as count FROM clients');
                
                // Créer un objet de mapping lisible pour le client
                const readableMapping = columnMapping && parseResult?.headers ? 
                    Object.entries(columnMapping).reduce((acc, [index, field]) => {
                        acc[parseResult.headers[index]] = field;
                        return acc;
                    }, {}) : null;
                
                res.json({
                    success: true,
                    imported: importedCount,
                    skipped: skippedCount,
                    errors: errorCount,
                    validationErrors: validationErrors,
                    filtered: stats.filtered,
                    total: stats.total,
                    totalInDb: totalInDb.count,
                    // Informations sur le mapping
                    columnMapping: readableMapping,
                    unmappedColumns: unmappedColumns.map(col => col.name),
                    detectedHeaders: parseResult?.headers || null,
                    // Rapport de prétraitement
                    preprocessingReport
                });
            });
        } catch (err) {
            console.error('❌ Erreur import patients:', err);
            res.status(500).json({ 
                error: 'Erreur lors de l\'import',
                details: err.message 
            });
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
