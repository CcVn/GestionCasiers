// server.js - Backend Node.js avec Express et SQLite

// ⚠️ Charger les variables d'environnement DE .env EN PREMIER !
require('dotenv').config();

// Parser la configuration des zones
function parseZonesConfig() {
    const names = (process.env.ZONE_NAMES || 'NORD,SUD,PCA').split(',').map(s => s.trim());
    const counts = (process.env.ZONE_COUNTS || '75,75,40').split(',').map(s => parseInt(s.trim()));
    const prefixes = (process.env.ZONE_PREFIXES || 'N,S,P').split(',').map(s => s.trim());
    
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

// ============ CONFIGURATION ============

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ANONYMIZE_GUEST = process.env.ANONYMIZE_GUEST === 'true';
const ANONYMIZE_ADMIN = process.env.ANONYMIZE_ADMIN === 'true';
const DARK_MODE = process.env.DARK_MODE || 'system';
const CLIENT_IMPORT_WARNING_DAYS = parseInt(process.env.CLIENT_IMPORT_WARNING_DAYS) || 4;
const BACKUP_FREQUENCY_HOURS = parseInt(process.env.BACKUP_FREQUENCY_HOURS) || 24;
const BACKUP_RETENTION_COUNT = parseInt(process.env.BACKUP_RETENTION_COUNT) || 7;

console.log('🔐 Mot de passe admin configuré');
console.log('👁️ Anonymisation guest:', ANONYMIZE_GUEST);
console.log('🔓 Anonymisation admin:', ANONYMIZE_ADMIN);
console.log('🌓 Mode sombre:', DARK_MODE);

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

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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
            'IPP': 'ipp',
            'NOM': 'name',
            'PRENOM': 'firstName',
            'SEXE': 'sex',
            'DATE_DE_NAISSANCE': 'birthDate',
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
app.post('/api/login', async (req, res) => {
  const { password, userName } = req.body;
  
  if (password === ADMIN_PASSWORD) {
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
    const { number, zone, name, firstName, code, birthDate, recoverable, comment } = req.body;

    if (!number || !zone) {
      return res.status(400).json({ error: 'Numéro et zone requis' });
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
app.post('/api/exports/log', async (req, res) => {
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
app.post('/api/clients/import', requireAuth, async (req, res) => {
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

        // Supprimer tous les clients existants
        await dbRun('DELETE FROM clients');

        let importedCount = 0;
        let errorCount = 0;

        const stmt = db.prepare(`
            INSERT INTO clients (ipp, name, firstName, birthName, birthDate, sex, zone, entryDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const row of clients) {
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
            console.log('Import terminé:', importedCount, 'clients importés,', errorCount, 'erreurs');
            
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
app.post('/api/import', requireAuth, async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    let imported = 0;
    let errors = 0;
    let invalidIPP = 0;

    for (const row of data) {
      try {
        const { number, zone, name, firstName, code, birthDate, recoverable } = row;
        
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
      total: data.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ROUTES CLIENTS ============

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

// GET statut import clients (NOUVELLE ROUTE)
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

// ============ BACKUP ============

// POST créer un backup manuel (NOUVELLE ROUTE)
app.post('/api/backup', requireAuth, async (req, res) => {
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