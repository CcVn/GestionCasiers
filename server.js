// server.js - Backend Node.js avec Express et SQLite

// ⚠️ Charger les variables d'environnement DE .env EN PREMIER !
require('dotenv').config();

const { z } = require('zod');

// ============ SCHÉMAS DE VALIDATION ZOD ============

// Schéma pour créer/modifier un casier
const lockerSchema = z.object({
    number: z.string().min(1, 'Numéro de casier requis').regex(/^[A-Z]+\d{1,3}$/, 'Format numéro invalide'),
    zone: z.string().min(1, 'Zone requise'),
    name: z.string().max(100, 'Nom trop long').optional().default(''),
    firstName: z.string().max(100, 'Prénom trop long').optional().default(''),
    code: z.string().max(50, 'Code IPP trop long').optional().default(''),
    birthDate: z.string().optional().default(''),
    recoverable: z.boolean().optional().default(false),
    comment: z.string().max(500, 'Commentaire trop long').optional().default('')
});

// Schéma pour import clients
const clientSchema = z.object({
    ipp: z.string().min(1, 'IPP requis'),
    name: z.string().max(100).optional().default(''),
    firstName: z.string().max(100).optional().default(''),
    birthName: z.string().max(100).optional().default(''),
    birthDate: z.string().optional().default(''),
    sex: z.enum(['M', 'F', '']).optional().default(''),
    zone: z.string().max(50).optional().default(''),
    entryDate: z.string().optional().default('')
});

// Schéma pour import CSV casiers
const importCasierSchema = z.object({
    number: z.string().min(1),
    zone: z.string().min(1),
    name: z.string().max(100).optional().default(''),
    firstName: z.string().max(100).optional().default(''),
    code: z.string().max(50).optional().default(''),
    birthDate: z.string().optional().default(''),
    recoverable: z.boolean().optional().default(false)
});

// Schéma pour restauration backup
const restoreSchema = z.object({
    filename: z.string().optional(),
    fileData: z.string().optional()
}).refine(data => data.filename || data.fileData, {
    message: 'Un fichier ou un nom de backup doit être fourni'
});

// Schéma pour login
const loginSchema = z.object({
    password: z.string()
        .max(100, 'Mot de passe trop long')
        .optional()
        .default(''),
    userName: z.string()
        .min(1, 'Nom/initiales requis en mode modification')
        .max(50, 'Nom/initiales trop long')
        .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Caractères invalides dans le nom')
        .optional()
}).refine(data => {
    // Si password fourni et non vide, userName est obligatoire
    if (data.password && data.password.trim() !== '') {
        return data.userName && data.userName.trim() !== '';
    }
    return true;
}, {
    message: 'Nom/initiales requis en mode modification',
    path: ['userName']
});

// Parser la configuration des zones
function parseZonesConfig() {
//    const names = (process.env.ZONE_NAMES || 'NORD,SUD,PCA').split(',').map(s => s.trim());
//    const counts = (process.env.ZONE_COUNTS || '75,75,40').split(',').map(s => parseInt(s.trim()));
//    const prefixes = (process.env.ZONE_PREFIXES || 'N,S,P').split(',').map(s => s.trim());
    const names = (process.env.ZONE_NAMES).split(',').map(s => s.trim());
    const counts = (process.env.ZONE_COUNTS).split(',').map(s => parseInt(s.trim()));
    const prefixes = (process.env.ZONE_PREFIXES).split(',').map(s => s.trim());
    
    if (names.length !== counts.length || names.length !== prefixes.length) {
        console.error('❌ ERREUR: Configuration des zones invalide');
        console.error('   ZONE_NAMES, ZONE_COUNTS et ZONE_PREFIXES doivent avoir le même nombre d\'éléments');
        process.exit(1);
    }
    
    const zones = names.map((name, index) => ({
        name: name,
        count: counts[index],
        prefix: prefixes[index]
    }));
    
    console.log('📋 Configuration des zones:');
    zones.forEach(z => {
        console.log(`   - ${z.name}: ${z.count} casiers (${z.prefix}01-${z.prefix}${String(z.count).padStart(2, '0')})`);
    });
    
    return zones;
}
const ZONES_CONFIG = parseZonesConfig();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

// ============ CONFIGURATION ============

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_PASSWORD_LEGACY = process.env.ADMIN_PASSWORD; // Pour migration

// Vérifier qu'un mot de passe est configuré
if (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD_LEGACY) {
    console.error('❌ ERREUR: Aucun mot de passe admin configuré !');
    console.error('   Définissez ADMIN_PASSWORD_HASH dans le fichier .env');
    console.error('   Utilisez: node generate-password.js pour générer un hash');
    process.exit(1);
}

if (ADMIN_PASSWORD_LEGACY && !ADMIN_PASSWORD_HASH) {
    console.warn('⚠️  ATTENTION: ADMIN_PASSWORD en clair détecté !');
    console.warn('   Utilisez: node generate-password.js pour générer un hash');
    console.warn('   Puis ajoutez ADMIN_PASSWORD_HASH dans .env');
}
console.log('🔐 Authentification configurée');

const ANONYMIZE_GUEST = process.env.ANONYMIZE_GUEST === 'true';
const ANONYMIZE_ADMIN = process.env.ANONYMIZE_ADMIN === 'true';
const DARK_MODE = process.env.DARK_MODE || 'system';
console.log('🔐 Mot de passe admin configuré');
console.log('👁️ Anonymisation guest:', ANONYMIZE_GUEST);
console.log('🔓 Anonymisation admin:', ANONYMIZE_ADMIN);
console.log('🌓 Mode sombre:', DARK_MODE);

const CLIENT_IMPORT_WARNING_DAYS = parseInt(process.env.CLIENT_IMPORT_WARNING_DAYS) || 4;
const BACKUP_FREQUENCY_HOURS = parseInt(process.env.BACKUP_FREQUENCY_HOURS) || 24;
const BACKUP_RETENTION_COUNT = parseInt(process.env.BACKUP_RETENTION_COUNT) || 7;

// Gestion des sessions en mémoire
const sessions = new Map();

// Fonction pour enregistrer une connexion dans les stats
async function recordConnection(role) {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const existing = await dbGet(
      'SELECT * FROM connection_stats WHERE date = ? AND role = ?',
      [today, role]
    );
    
    if (existing) {
      await dbRun(
        'UPDATE connection_stats SET count = count + 1 WHERE date = ? AND role = ?',
        [today, role]
      );
    } else {
      await dbRun(
        'INSERT INTO connection_stats (date, role, count) VALUES (?, ?, 1)',
        [today, role]
      );
    }
  } catch (err) {
    console.error('Erreur enregistrement stats connexion:', err);
  }
}

// Fonction pour enregistrer une modification dans l'historique
async function recordHistory(lockerNumber, action, userName, userRole, details = '') {
  try {
    await dbRun(
      'INSERT INTO locker_history (lockerNumber, action, userName, userRole, details) VALUES (?, ?, ?, ?, ?)',
      [lockerNumber, action, userName, userRole, details]
    );
  } catch (err) {
    console.error('Erreur enregistrement historique:', err);
  }
}

// Fonction pour générer un token sécurisé
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Fonction pour obtenir l'adresse IP locale
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

// ============ RATE LIMITING ============

// Limiteur général pour toutes les routes
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Max 100 requêtes par IP
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiteur assez strict pour le login
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Max 10 tentatives de login
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 5 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Ne compte que les échecs
});

// Limiteur pour les imports (opérations lourdes)
const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 15, // Max 10 imports par heure
  message: { error: 'Trop d\'imports. Limite: 15 par heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiteur pour les exports
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 exports
  message: { error: 'Trop d\'exports. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiteur pour les backups/restore (très critique)
const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5, // Max 5 opérations
  message: { error: 'Trop d\'opérations de backup/restore. Limite: 5 par heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ APP & MIDDLEWARE ============
const app = express();

// Middleware
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(
  helmet({
    contentSecurityPolicy: false,
    //defaultSrc: ["'self'"],
    //scriptSrc: ["'self'", "'unsafe-inline'"],
    //styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
    //imgSrc: ["'self'", "data:"],    
    //fontSrc: ["'self'", "fonts.gstatic.com"],
  })
);
app.use('/api/', generalLimiter); // Appliquer le rate limiting général

// Vérifier que le dossier public existe
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
  console.warn('⚠️  ATTENTION: Dossier "public" introuvable à :', publicPath);
  console.warn('   Créez le dossier "public" et y mettre le fichier index.html');
} else {
  console.log('✓ Dossier public trouvé:', publicPath);
}

app.use(express.static('public'));

// Chemin de la base de données
const dbPath = path.join(__dirname, 'app.db');
const DB_EXISTS = fs.existsSync(dbPath);

// Connexion SQLite
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('✗ Erreur SQLite:', err.message);
    process.exit(1);
  } else {
    console.log('✓ SQLite connecté');
    initializeDatabase();
  }
});

// Gestion des erreurs de la base de données
db.on('error', (err) => {
  console.error('Erreur base de données:', err);
});

// Promisify pour async/await
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialiser la base de données
function initializeDatabase() {
  db.serialize(() => {
    // Créer la liste des zones valides pour la contrainte CHECK
    const zonesList = ZONES_CONFIG.map(z => `'${z.name}'`).join(', ');

    // Créer la table lockers
    db.run(`
      CREATE TABLE IF NOT EXISTS lockers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT UNIQUE NOT NULL,
        zone TEXT NOT NULL CHECK(zone IN (${zonesList})),
        occupied BOOLEAN DEFAULT 0,
        recoverable BOOLEAN DEFAULT 0,
        name TEXT DEFAULT '',
        firstName TEXT DEFAULT '',
        code TEXT DEFAULT '',
        birthDate TEXT DEFAULT '',
        comment TEXT DEFAULT '',
        Hospi BOOLEAN DEFAULT 0,
        Stup BOOLEAN DEFAULT 0,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedBy TEXT DEFAULT '',
        version INTEGER DEFAULT 0
      )
    `, (err) => {
      if (err) console.error('Erreur création table casiers:', err);
      else {
        db.run(`ALTER TABLE lockers ADD COLUMN comment TEXT DEFAULT ''`, () => {});
        db.run(`ALTER TABLE lockers ADD COLUMN updatedBy TEXT DEFAULT ''`, () => {});
        db.run(`ALTER TABLE lockers ADD COLUMN Hospi BOOLEAN DEFAULT ''`, () => {});
        db.run(`ALTER TABLE lockers ADD COLUMN Stup BOOLEAN DEFAULT ''`, () => {});
        console.log('✓ Table casiers créée/vérifiée');
      }
    });

    // Créer la table clients
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        ipp INTEGER PRIMARY KEY,
        name TEXT,
        firstName TEXT,
        birthName TEXT,
        birthDate TEXT,
        sex TEXT,
        zone TEXT,
        entryDate TEXT
      )
    `, (err) => {
      if (err) console.error('Erreur création table clients:', err);
      else console.log('✓ Table clients créée/vérifiée');
    });

    // Créer la table d'historique
    db.run(`
      CREATE TABLE IF NOT EXISTS locker_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lockerNumber TEXT NOT NULL,
        action TEXT NOT NULL,
        userName TEXT,
        userRole TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Erreur création table locker_history:', err);
      else console.log('✓ Table locker_history créée/vérifiée');
    });

    // Créer la table des statistiques de connexion
    db.run(`
      CREATE TABLE IF NOT EXISTS connection_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        role TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        UNIQUE(date, role)
      )
    `, (err) => {
      if (err) console.error('Erreur création table connection_stats:', err);
      else console.log('✓ Table connection_stats créée/vérifiée');
    });

    // Créer la table des logs d'export
    db.run(`
      CREATE TABLE IF NOT EXISTS export_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        format TEXT NOT NULL,
        recordCount INTEGER,
        userName TEXT,
        userRole TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Erreur création table export_logs:', err);
      else console.log('✓ Table export_logs créée/vérifiée');
    });

    // Créer la table des imports clients
    db.run(`
      CREATE TABLE IF NOT EXISTS client_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        importDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        recordCount INTEGER,
        userName TEXT
      )
    `, (err) => {
      if (err) console.error('Erreur création table client_imports:', err);
      else console.log('✓ Table client_imports créée/vérifiée');
    });

    // Initialiser les casiers si la table est vide
    db.get('SELECT COUNT(*) as count FROM lockers', async (err, row) => {
        if (err) {
            console.error('Erreur lecture table:', err);
        } else if (row.count === 0) {
            console.log('🔧 Initialisation des casiers...');
            const lockers = [];
            
            // Générer les casiers pour chaque zone
            ZONES_CONFIG.forEach(zone => {
                for (let i = 1; i <= zone.count; i++) {
                    const number = `${zone.prefix}${String(i).padStart(2, '0')}`;
                    lockers.push([number, zone.name]);
                }
            });
            
            const stmt = db.prepare('INSERT INTO lockers (number, zone) VALUES (?, ?)');
            
            lockers.forEach(([number, zone]) => {
                stmt.run(number, zone);
            });
            
            stmt.finalize(() => {
                console.log(`✓ ${lockers.length} casiers initialisés`);
            });
        }
    });
  });
}

// ============ MIDDLEWARE D'AUTHENTIFICATION ============

function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  const session = sessions.get(token);
  const now = Date.now();
  if (now - session.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expirée' });
  }
  
  next();
}

// ============ CONFIGURATION DES FORMATS D'IMPORT ============

// Configuration des formats d'import
const IMPORT_FORMATS = {
    'LEGACY': {
        separator: ',',
        mapping: {
            'IPP': 'ipp',
            'Nom': 'name',
            'Prénom': 'firstName',
            'Nom Naissance': 'birthName',
            'Date Naissance': 'birthDate',
            'Sexe': 'sex',
            'Zone': 'zone',
            'Date Entrée': 'entryDate'
        },
        filters: [],
        skipRows: 0
    },
    
    'MHCARE': {
        separator: ';',
        mapping: {
            'NOM': 'name',
            'PRENOM': 'firstName',
            'SEXE': 'sex',
            'DATE_DE_NAISSANCE': 'birthDate',
            'IPP': 'ipp',
            'DATE_DE_DEBUT': 'entryDate',
            'SECTEUR': 'zone'
        },
        ignored: ['SEJOUR', 'DATE_DE_FIN', 'ADRESSE', 'COMPLEMENT_ADRESSE', 'CODE_POSTAL', 'VILLE', 'TELEPHONE'],
        filters: [
            {
                field: 'STATUT',
                operator: 'in',
                values: ['Admission', 'Préadmission']
            }
        ],
        skipRows: 0
    },

    'WINPHARM': {
        separator: ';',
        mapping: {
            'N°\nIPP': 'ipp',
            'Nom': 'name',
            'Né(e) le': 'birthDate',
            'Entré(e)\nle': 'entryDate',
            'Unité Médicale': 'zone'
        },
        ignored: ['N°\nDossier', 'INS', 'Sorti(e)\nle', '', 'Age', 'Ch.', 'Lit', 'Dernier contrôle'],
        filters: [
            {
                //field: 'Unité Médicale',
                //operator: 'in',
                //values: ['O NORD', 'O NORD IDEL', 'O SUD', 'O SUD IDEL', 'M BLEU', 'M BLEU IDEL', 'M ROSE', 'M ROSE IDEL']
            }
        ],
        skipRows: 0
    }

};

// Parser une ligne CSV avec séparateur personnalisé
function parseCsvLine(line, separator = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === separator && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result.map(v => v.replace(/^"|"$/g, ''));
}

// Normaliser le format de date
function normalizeDateFormat(dateStr) {
    if (!dateStr) return '';
    
    // Format DD/MM/YYYY → YYYY-MM-DD
    const match1 = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match1) {
        return `${match1[3]}-${match1[2]}-${match1[1]}`;
    }
    
    // Format DD-MM-YYYY → YYYY-MM-DD
    const match2 = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (match2) {
        return `${match2[3]}-${match2[2]}-${match2[1]}`;
    }
    
    // Format YYYY-MM-DD (déjà bon)
    const match3 = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match3) {
        return dateStr;
    }
    
    // Format YYYYMMDD → YYYY-MM-DD
    const match4 = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match4) {
        return `${match4[1]}-${match4[2]}-${match4[3]}`;
    }
    
    return dateStr;
}

// Mettre en majuscule la première lettre
function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Mapper une ligne aux champs de la base de données
function mapRowToClient(row, mapping) {
    const client = {
        ipp: '',
        name: '',
        firstName: '',
        birthName: '',
        birthDate: '',
        sex: '',
        zone: '',
        entryDate: ''
    };
    
    for (const [sourceField, targetField] of Object.entries(mapping)) {
        if (row[sourceField] !== undefined) {
            client[targetField] = row[sourceField].trim();
        }
    }
    
    // Normaliser les données
    client.ipp = client.ipp.trim();
    client.name = client.name.toUpperCase();
    client.firstName = capitalizeFirstLetter(client.firstName);
    
    if (client.birthDate) {
        client.birthDate = normalizeDateFormat(client.birthDate);
    }
    
    if (client.entryDate) {
        client.entryDate = normalizeDateFormat(client.entryDate);
    }
    
    return client;
}

// Fonction principale d'import avec format
function parseClientsWithFormat(fileContent, formatName) {
    const format = IMPORT_FORMATS[formatName];
    
    if (!format) {
        throw new Error(`Format d'import "${formatName}" non reconnu`);
    }
    
    console.log(`📥 Import avec format: ${formatName}`);
    console.log(`   Séparateur: "${format.separator}"`);
    
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
        throw new Error('Fichier vide ou invalide');
    }
    
    const headers = parseCsvLine(lines[0], format.separator);
    console.log(`   Headers trouvés: ${headers.join(', ')}`);
    
    const dataLines = lines.slice(1 + format.skipRows);
    let imported = 0;
    let filtered = 0;
    let errors = 0;
    
    const clients = [];
    
    for (const line of dataLines) {
        try {
            const values = parseCsvLine(line, format.separator);
            
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            // Appliquer les filtres
            if (format.filters && format.filters.length > 0) {
                let passFilters = true;
                
                for (const filter of format.filters) {
                    const fieldValue = row[filter.field];
                    
                    if (filter.operator === 'in') {
                        if (!filter.values.includes(fieldValue)) {
                            passFilters = false;
                            break;
                        }
                    } else if (filter.operator === 'equals') {
                        if (fieldValue !== filter.value) {
                            passFilters = false;
                            break;
                        }
                    }
                }
                
                if (!passFilters) {
                    filtered++;
                    continue;
                }
            }
            
            const client = mapRowToClient(row, format.mapping);
            
            if (!client.ipp || client.ipp.trim() === '') {
                errors++;
                console.warn(`⚠️ Ligne ignorée (IPP manquant)`);
                continue;
            }
            
            clients.push(client);
            imported++;
            
        } catch (err) {
            errors++;
            console.error('Erreur parsing ligne:', err);
        }
    }
    
    console.log(`✓ Parsing terminé:`);
    console.log(`  - Importés: ${imported}`);
    console.log(`  - Filtrés: ${filtered}`);
    console.log(`  - Erreurs: ${errors}`);
    
    return {
        clients: clients,
        stats: {
            imported: imported,
            filtered: filtered,
            errors: errors,
            total: dataLines.length
        }
    };
}

// ============ ROUTES API ============

// Route pour obtenir la configuration des zones
app.get('/api/config/zones', (req, res) => {
    res.json({
        zones: ZONES_CONFIG,
        total: ZONES_CONFIG.reduce((sum, z) => sum + z.count, 0)
    });
});

// ============ AUTHENTIFICATION ============

// POST login
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    // VALIDATION ZOD
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: validationResult.error.errors[0].message
      });
    }
    
    const { password, userName } = validationResult.data;
    
    // Vérifier le mot de passe legacy ou hash
    let isPasswordValid = false;
    if (ADMIN_PASSWORD_HASH) {
        // Utiliser bcrypt pour comparer avec le hash
        isPasswordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    } else if (ADMIN_PASSWORD_LEGACY) {
        // Fallback: comparaison en clair (pour migration)
        isPasswordValid = password === ADMIN_PASSWORD_LEGACY;
        if (isPasswordValid) {
            console.warn('⚠️  Connexion avec mot de passe en clair. Migrez vers bcrypt !');
        }
    }

    if (isPasswordValid) {
      if (!userName || userName.trim() === '') {
        return res.status(400).json({ error: 'Nom/initiales requis en mode modification' });
      }
      
      const token = generateToken();
      sessions.set(token, {
        createdAt: Date.now(),
        isAdmin: true,
        userName: userName.trim()
      });
      
      await recordConnection('admin');
      
      res.json({
        success: true,
        token: token,
        role: 'admin',
        userName: userName.trim(),
        anonymize: ANONYMIZE_ADMIN,
        darkMode: DARK_MODE
      });
    } else if (!password || password === '') {
      const token = generateToken();
      sessions.set(token, {
        createdAt: Date.now(),
        isAdmin: false,
        userName: 'guest'
      });
      
      await recordConnection('guest');
      
      res.json({
        success: true,
        token: token,
        role: 'guest',
        anonymize: ANONYMIZE_GUEST,
        darkMode: DARK_MODE
      });
    } else {
      res.status(401).json({ error: 'Mot de passe incorrect' });
    }
  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

// POST logout
app.post('/api/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    sessions.delete(token);
  }
  res.json({ success: true });
});

// GET vérifier le rôle de l'utilisateur
app.get('/api/auth/check', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ authenticated: false });
  }
  
  const session = sessions.get(token);
  const isAdmin = session.isAdmin;
  
  res.json({
    authenticated: true,
    role: isAdmin ? 'admin' : 'guest',
    userName: session.userName || '',
    anonymize: isAdmin ? ANONYMIZE_ADMIN : ANONYMIZE_GUEST,
    darkMode: DARK_MODE
  });
});

// ============ ROUTES LOCKERS ============

// GET tous les casiers
app.get('/api/lockers', async (req, res) => {
  try {
    const lockers = await dbAll('SELECT * FROM lockers ORDER BY number ASC');
    res.json(lockers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET casiers par zone
app.get('/api/lockers/zone/:zone', async (req, res) => {
  try {
    const zone = req.params.zone.toUpperCase();
    if (!ZONES_CONFIG.includes(zone)) {
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
app.get('/api/lockers/:number', async (req, res) => {
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
app.post('/api/lockers', requireAuth, async (req, res) => {
  try {
    // VALIDATION ZOD
    const validationResult = lockerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Données invalides', 
        details: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }
    
    const { number, zone, name, firstName, code, birthDate, recoverable, comment } = validationResult.data;

    // Vérifier que la zone existe dans la config
    const zoneExists = ZONES_CONFIG.some(z => z.name === zone);
    if (!zoneExists) {
      return res.status(400).json({ 
        error: `Zone invalide: ${zone}. Zones disponibles: ${ZONES_CONFIG.map(z => z.name).join(', ')}` 
      });
    }

    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    const existingLocker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [number]
    );

    if (!existingLocker) {
      return res.status(404).json({ error: 'Casier non trouvé' });
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
       SET zone = ?, occupied = 1, recoverable = ?, name = ?, firstName = ?, code = ?, birthDate = ?, comment = ?,
           updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
       WHERE number = ?`,
      [zone, isRecoverable, name, firstName, code, birthDate, comment || '', userName, number]
    );

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
    res.status(500).json({ error: err.message });
  }
});

// DELETE libérer un casier
app.delete('/api/lockers/:number', requireAuth, async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    const locker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [req.params.number]
    );

    if (!locker) {
      return res.status(404).json({ error: 'Casier non trouvé' });
    }

    const details = locker.occupied ? `${locker.name} ${locker.firstName} (IPP: ${locker.code})` : '';

    await dbRun(
      `UPDATE lockers 
       SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', birthDate = '', comment = '',
           updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
       WHERE number = ?`,
      [userName, req.params.number]
    );

    await recordHistory(req.params.number, 'LIBÉRATION', userName, 'admin', details);

    const updatedLocker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [req.params.number]
    );

    res.json(updatedLocker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET recherche par nom
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = '%' + req.params.query + '%';
    const lockers = await dbAll(
      `SELECT * FROM lockers 
       WHERE name LIKE ? OR firstName LIKE ? OR CAST(code AS TEXT) LIKE ?
       ORDER BY number ASC`,
      [query, query]
    );
    res.json(lockers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET statistiques
app.get('/api/stats', async (req, res) => {
  try {
    const total = await dbGet('SELECT COUNT(*) as count FROM lockers');
    const occupied = await dbGet('SELECT COUNT(*) as count FROM lockers WHERE occupied = 1');
    
    const byZone = await dbAll(
      `SELECT zone, COUNT(*) as total, SUM(CASE WHEN occupied = 1 THEN 1 ELSE 0 END) as occupied
       FROM lockers
       GROUP BY zone`
    );

    res.json({
      total: total.count,
      occupied: occupied.count,
      empty: total.count - occupied.count,
      byZone: byZone
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET statistiques de connexion
app.get('/api/stats/connections', async (req, res) => {
  try {
    const { days } = req.query;
    const daysLimit = parseInt(days) || 30;
    
    const stats = await dbAll(
      `SELECT date, role, count 
       FROM connection_stats 
       WHERE date >= date('now', '-${daysLimit} days')
       ORDER BY date DESC, role`,
      []
    );
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET statistiques de connexion agrégées
app.get('/api/stats/connections/summary', async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Calculer les dates de début pour chaque période
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const weekStart = startOfWeek.toISOString().split('T')[0];
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStart = startOfMonth.toISOString().split('T')[0];
    
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const yearStart = startOfYear.toISOString().split('T')[0];
    
    // Aujourd'hui
    const todayStats = await dbAll(
      `SELECT role, SUM(count) as total 
       FROM connection_stats 
       WHERE date = ?
       GROUP BY role`,
      [today]
    );
    
    // Semaine en cours
    const weekStats = await dbAll(
      `SELECT role, SUM(count) as total 
       FROM connection_stats 
       WHERE date >= ?
       GROUP BY role`,
      [weekStart]
    );
    
    // Mois en cours
    const monthStats = await dbAll(
      `SELECT role, SUM(count) as total 
       FROM connection_stats 
       WHERE date >= ?
       GROUP BY role`,
      [monthStart]
    );
    
    // Année en cours
    const yearStats = await dbAll(
      `SELECT role, SUM(count) as total 
       FROM connection_stats 
       WHERE date >= ?
       GROUP BY role`,
      [yearStart]
    );
    
    // Derniers 7 jours détaillés
    const last7Days = await dbAll(
      `SELECT date, role, SUM(count) as count 
       FROM connection_stats 
       WHERE date >= date('now', '-7 days')
       GROUP BY date, role
       ORDER BY date DESC`,
      []
    );
    
    // Total général
    const totalStats = await dbAll(
      `SELECT role, SUM(count) as total 
       FROM connection_stats 
       GROUP BY role`,
      []
    );
    
    // Formater les résultats
    const formatStats = (stats) => {
      const admin = stats.find(s => s.role === 'admin')?.total || 0;
      const guest = stats.find(s => s.role === 'guest')?.total || 0;
      return { admin, guest, total: admin + guest };
    };
    
    res.json({
      today: formatStats(todayStats),
      week: formatStats(weekStats),
      month: formatStats(monthStats),
      year: formatStats(yearStats),
      total: formatStats(totalStats),
      last7Days: last7Days
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET historique des modifications d'un casier
app.get('/api/lockers/:number/history', async (req, res) => {
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

// POST enregistrer un export
app.post('/api/exports/log', exportLimiter, async (req, res) => {
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

// POST import clients depuis CSV
app.post('/api/clients/import', requireAuth, importLimiter, async (req, res) => {
    try {
        const { data, rawContent, format } = req.body;
        
        let clients = [];
        let stats = {
            imported: 0,
            filtered: 0,
            errors: 0,
            total: 0
        };
        
        //Si rawContent est fourni, parser avec le format
        if (rawContent) {
            const formatName = format || process.env.CLIENT_IMPORT_FORMAT || 'LEGACY';
            console.log(`📥 Parsing avec format: ${formatName}`);
            
            const result = parseClientsWithFormat(rawContent, formatName);
            clients = result.clients;
            stats = result.stats;
        } else if (data && Array.isArray(data)) {
            // Format legacy (déjà parsé côté client)
            clients = data;
            stats.imported = data.length;
            stats.total = data.length;
        } else {
            return res.status(400).json({ error: 'Données invalides' });
        }
        
        if (clients.length === 0) {
            return res.status(400).json({ 
                error: 'Aucune donnée valide trouvée',
                stats: stats
            });
        }

        console.log('Import de', clients.length, 'clients...');

        // VALIDATION ZOD - Valider chaque client avant import
        const validatedClients = [];
        let validationErrors = 0;
        
        for (const client of clients) {
            const result = clientSchema.safeParse(client);
            if (result.success) {
                validatedClients.push(result.data);
            } else {
                console.warn(`Client invalide ignoré (IPP: ${client.ipp}):`, result.error.errors[0].message);
                validationErrors++;
            }
        }
        
        if (validatedClients.length === 0) {
            return res.status(400).json({ 
                error: 'Aucun client valide après validation',
                validationErrors: validationErrors
            });
        }

        // Supprimer tous les clients existants
        await dbRun('DELETE FROM clients');

        let importedCount = 0;
        let errorCount = 0;

        const stmt = db.prepare(`
            INSERT INTO clients (ipp, name, firstName, birthName, birthDate, sex, zone, entryDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const row of validatedClients) {  // Utiliser validatedClients au lieu de clients
            try {
                const { ipp, name, firstName, birthName, birthDate, sex, zone, entryDate } = row;
                
                if (!ipp) {
                    errorCount++;
                    continue;
                }

                stmt.run(ipp, name, firstName, birthName || '', birthDate, sex, zone, entryDate, (err) => {
                    if (err) {
                        console.error('Erreur insertion client:', err);
                        errorCount++;
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
            console.log('Import terminé:', importedCount, 'clients importés,', errorCount, 'erreurs,', validationErrors, 'validations échouées');
            
            const token = req.headers['authorization']?.replace('Bearer ', '');
            const session = sessions.get(token);
            const userName = session?.userName || 'Inconnu';
            
            await dbRun(
                'INSERT INTO client_imports (recordCount, userName) VALUES (?, ?)',
                [importedCount, userName]
            );
            
            res.json({
                success: true,
                imported: importedCount,
                errors: errorCount,
                validationErrors: validationErrors,  // Ajouter cette info
                filtered: stats.filtered,
                total: stats.total
            });
        });
    } catch (err) {
        console.error('Erreur import clients:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET format d'import configuré
app.get('/api/config/import-format', (req, res) => {
    const format = process.env.CLIENT_IMPORT_FORMAT || 'LEGACY';
    res.json({
        clientImportFormat: format,
        availableFormats: Object.keys(IMPORT_FORMATS)
    });
});

// GET historique des exports
app.get('/api/exports/history', async (req, res) => {
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

// POST import CSV casiers
app.post('/api/import', requireAuth, importLimiter, async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    let imported = 0;
    let errors = 0;
    let invalidIPP = 0;
    let validationErrors = 0;

    for (const row of data) {
      try {
        // VALIDATION ZOD
        const validationResult = importCasierSchema.safeParse(row);
        if (!validationResult.success) {
          console.warn('Ligne invalide ignorée:', validationResult.error.errors[0].message);
          validationErrors++;
          continue;
        }
        const { number, zone, name, firstName, code, birthDate, recoverable } = validationResult.data;
        
        const locker = await dbGet('SELECT * FROM lockers WHERE number = ?', [number]);
        
        if (locker) {
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
             SET zone = ?, occupied = 1, recoverable = ?, name = ?, firstName = ?, code = ?, birthDate = ?,
                 updatedAt = CURRENT_TIMESTAMP, version = version + 1
             WHERE number = ?`,
            [zone, isRecoverable, name, firstName, code, birthDate, number]
          );
          imported++;
        } else {
          errors++;
        }
      } catch (err) {
        console.error('Erreur import ligne:', err);
        errors++;
      }
    }

    res.json({
      success: true,
      imported: imported,
      errors: errors,
      invalidIPP: invalidIPP,
      validationErrors: validationErrors,
      total: data.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ============ ROUTES CLIENTS ============

// GET statut import clients
app.get('/api/clients/import-status', async (req, res) => {
  try {
    const lastImport = await dbGet(
      'SELECT * FROM client_imports ORDER BY importDate DESC LIMIT 1'
    );
    
    if (!lastImport) {
      return res.json({
        hasImport: false,
        warning: true,
        warningThreshold: CLIENT_IMPORT_WARNING_DAYS
      });
    }
    
    const importDate = new Date(lastImport.importDate);
    const now = new Date();
    const daysSince = Math.floor((now - importDate) / (1000 * 60 * 60 * 24));
    
    res.json({
      hasImport: true,
      lastImportDate: lastImport.importDate,
      daysSinceImport: daysSince,
      recordCount: lastImport.recordCount,
      userName: lastImport.userName,
      warning: daysSince > CLIENT_IMPORT_WARNING_DAYS,
      warningThreshold: CLIENT_IMPORT_WARNING_DAYS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST import clients depuis CSV
app.post('/api/clients/import', requireAuth, async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    console.log('Import de', data.length, 'clients...');

    // Supprimer tous les clients existants
    await dbRun('DELETE FROM clients');

    let imported = 0;
    let errors = 0;

    const stmt = db.prepare(`
      INSERT INTO clients (ipp, name, firstName, birthName, birthDate, sex, zone, entryDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of data) {
      try {
        const { ipp, name, firstName, birthName, birthDate, sex, zone, entryDate } = row;
        
        if (!ipp) {
          errors++;
          continue;
        }

        stmt.run(ipp, name, firstName, birthName, birthDate, sex, zone, entryDate, (err) => {
          if (err) {
            console.error('Erreur insertion client:', err);
            errors++;
          } else {
            imported++;
          }
        });
      } catch (err) {
        console.error('Erreur traitement ligne:', err);
        errors++;
      }
    }

    stmt.finalize(async () => {
      console.log('Import terminé:', imported, 'clients importés,', errors, 'erreurs');
      
      // Enregistrer l'import
      const token = req.headers['authorization']?.replace('Bearer ', '');
      const session = sessions.get(token);
      const userName = session?.userName || 'Inconnu';
      
      await dbRun(
        'INSERT INTO client_imports (recordCount, userName) VALUES (?, ?)',
        [imported, userName]
      );
      
      res.json({
        success: true,
        imported: imported,
        errors: errors,
        total: data.length
      });
    });
  } catch (err) {
    console.error('Erreur import clients:', err);
    res.status(500).json({ error: err.message });
  }
});

//--- INFOS ---

// GET statut import clients
app.get('/api/clients/import-status', async (req, res) => {
  try {
    const lastImport = await dbGet(
      'SELECT * FROM client_imports ORDER BY importDate DESC LIMIT 1'
    );
    
    if (!lastImport) {
      return res.json({
        hasImport: false,
        warning: true,
        warningThreshold: CLIENT_IMPORT_WARNING_DAYS
      });
    }
    
    const importDate = new Date(lastImport.importDate);
    const now = new Date();
    const daysSince = Math.floor((now - importDate) / (1000 * 60 * 60 * 24));
    
    res.json({
      hasImport: true,
      lastImportDate: lastImport.importDate,
      daysSinceImport: daysSince,
      recordCount: lastImport.recordCount,
      userName: lastImport.userName,
      warning: daysSince > CLIENT_IMPORT_WARNING_DAYS,
      warningThreshold: CLIENT_IMPORT_WARNING_DAYS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET statistiques de la base clients
app.get('/api/clients/stats', async (req, res) => {
  try {
    // Nombre total de clients
    const total = await dbGet('SELECT COUNT(*) as count FROM clients');
    
    // Dernière import
    const lastImport = await dbGet(
      'SELECT * FROM client_imports ORDER BY importDate DESC LIMIT 1'
    );
    
    // Répartition par zone
    const byZone = await dbAll(
      'SELECT zone, COUNT(*) as count FROM clients WHERE zone IS NOT NULL AND zone != "" GROUP BY zone ORDER BY count DESC'
    );
    
    // Répartition par sexe
    const bySex = await dbAll(
      'SELECT sex, COUNT(*) as count FROM clients WHERE sex IS NOT NULL AND sex != "" GROUP BY sex'
    );
    
    // 10 premiers clients
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
app.get('/api/clients/:ipp', async (req, res) => {
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

// ============ BACKUP ============

// GET liste des backups disponibles
app.get('/api/backups', requireAuth, backupLimiter, async (req, res) => {
  try {
    const backupDir = path.join(__dirname, 'backups');
    
    if (!fs.existsSync(backupDir)) {
      return res.json({ backups: [] });
    }
    
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          size: stats.size,
          date: stats.mtime,
          path: filePath
        };
      })
      .sort((a, b) => b.date - a.date);
    
    res.json({ backups: files });
  } catch (err) {
    console.error('Erreur liste backups:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST restaurer un backup
app.post('/api/restore', requireAuth, backupLimiter, async (req, res) => {
  try {
    // VALIDATION ZOD
    const validationResult = restoreSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Données invalides', 
        details: validationResult.error.errors[0].message
      });
    }
    
    const { filename, fileData } = validationResult.data;
    
    // Créer un backup de sécurité avant restauration
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const safetyBackupPath = path.join(backupDir, `backup_before_restore_${timestamp}.db`);
    
    console.log('🔒 Création backup de sécurité...');
    fs.copyFileSync(dbPath, safetyBackupPath);
    console.log('✓ Backup de sécurité créé:', path.basename(safetyBackupPath));
    
    let restorePath;
    
    // Si c'est un fichier uploadé (base64)
    if (fileData) {
      console.log('📤 Restauration depuis fichier uploadé...');
      
      // Décoder base64
      const buffer = Buffer.from(fileData, 'base64');
      
      // Créer un fichier temporaire
      const tempPath = path.join(backupDir, `temp_restore_${timestamp}.db`);
      fs.writeFileSync(tempPath, buffer);
      restorePath = tempPath;
      
    } else if (filename) {
      // Restauration depuis un backup existant
      console.log('📁 Restauration depuis backup existant:', filename);
      restorePath = path.join(backupDir, filename);
      
      if (!fs.existsSync(restorePath)) {
        throw new Error('Fichier backup non trouvé');
      }
    } else {
      throw new Error('Aucun fichier spécifié');
    }
    
    // Vérifier que c'est bien une base SQLite valide
    console.log('🔍 Vérification du fichier...');
    const fileBuffer = fs.readFileSync(restorePath);
    const header = fileBuffer.toString('utf8', 0, 16);
    
    if (!header.startsWith('SQLite format 3')) {
      if (fileData) fs.unlinkSync(restorePath); // Nettoyer le temp
      throw new Error('Fichier invalide : ce n\'est pas une base SQLite');
    }
    
    // Fermer la connexion actuelle
    console.log('🔌 Fermeture connexion base actuelle...');
    await new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Remplacer la base de données
    console.log('🔄 Remplacement de la base...');
    fs.copyFileSync(restorePath, dbPath);
    
    // Nettoyer le fichier temporaire si nécessaire
    if (fileData) {
      fs.unlinkSync(restorePath);
    }
    
    console.log('✅ Base restaurée avec succès');
    console.log('⚠️ REDÉMARRAGE DU SERVEUR NÉCESSAIRE');
    
    res.json({
      success: true,
      message: 'Base restaurée avec succès. Redémarrage du serveur nécessaire.',
      safetyBackup: path.basename(safetyBackupPath)
    });
    
    // Redémarrer le serveur après un court délai
    setTimeout(() => {
      console.log('🔄 Redémarrage du serveur...');
      process.exit(0);
    }, 1000);
    
  } catch (err) {
    console.error('❌ Erreur restauration:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST créer un backup manuel 
app.post('/api/backup', requireAuth, backupLimiter, async (req, res) => {
  try {
    const backupDir = path.join(__dirname, 'backups');
    
    // Créer le dossier backups s'il n'existe pas
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(backupDir, `backup_${timestamp}.db`);
    
    // Copier la base de données
    fs.copyFileSync(dbPath, backupPath);
    
    const stats = fs.statSync(backupPath);
    
    // Nettoyer les vieux backups
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // Supprimer les backups en trop
    if (files.length > BACKUP_RETENTION_COUNT) {
      files.slice(BACKUP_RETENTION_COUNT).forEach(f => {
        fs.unlinkSync(f.path);
        console.log('Backup supprimé:', f.name);
      });
    }
    
    res.json({
      success: true,
      filename: path.basename(backupPath),
      size: stats.size,
      path: backupPath
    });
  } catch (err) {
    console.error('Erreur backup:', err);
    res.status(500).json({ error: err.message });
  }
});

// Backup automatique au démarrage et périodique
function setupAutoBackup() {
  if (BACKUP_FREQUENCY_HOURS === 0) {
    console.log('⏭️  Backups automatiques désactivés');
    return;
  }
  
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }
  
  const createBackup = () => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupPath = path.join(backupDir, `backup_auto_${timestamp}.db`);
      
      fs.copyFileSync(dbPath, backupPath);
      console.log('✓ Backup automatique créé:', path.basename(backupPath));
      
      // Nettoyer les vieux backups
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
        .map(f => ({
          name: f,
          path: path.join(backupDir, f),
          time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
      
      if (files.length > BACKUP_RETENTION_COUNT) {
        files.slice(BACKUP_RETENTION_COUNT).forEach(f => {
          fs.unlinkSync(f.path);
          console.log('Backup supprimé:', f.name);
        });
      }
    } catch (err) {
      console.error('Erreur backup automatique:', err);
    }
  };
  
  // Backup initial
  createBackup();
  
  // Backup périodique
  const intervalMs = BACKUP_FREQUENCY_HOURS * 60 * 60 * 1000;
  setInterval(createBackup, intervalMs);
  
  console.log(`✓ Backups automatiques activés (toutes les ${BACKUP_FREQUENCY_HOURS}h, ${BACKUP_RETENTION_COUNT} fichiers conservés)`);
}

//-------------------------------------------
// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), database: 'SQLite' });
});

// Config
app.get('/api/config', (req, res) => {
  const localIP = getLocalIP();
  const port = process.env.PORT || 5000;
  const apiUrl = `http://${localIP}:${port}/api`;
  
  res.json({
    apiUrl: apiUrl,
    localIP: localIP,
    port: port
  });
});

// Route par défaut pour servir index.html
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  console.log('Tentative d\'accès à :', filePath);
  console.log('Fichier existe?', fs.existsSync(filePath));
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('<h1>404 - index.html non trouvé</h1><p>Créez un fichier public/index.html</p>');
  }
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

// Démarrage du serveur
const PORT = process.env.PORT || 5000;
const LOCAL_IP = getLocalIP();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Serveur démarré`);
  console.log(`  - Local:    http://localhost:${PORT}`);
  console.log(`  - Réseau:   http://${LOCAL_IP}:${PORT}`);
  console.log(`✓ Base de données: ${dbPath}`);
  console.log(`✓ Prêt pour accès réseau`);
  
  // Configurer les backups automatiques
  setupAutoBackup();
});