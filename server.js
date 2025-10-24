// server.js - Backend Node.js avec Express et SQLite

// ⚠️ CHARGEMENT DE .env EN PREMIER !
require('dotenv').config();

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

console.log('🔐 Mot de passe admin configuré');
console.log('👁️ Anonymisation guest:', ANONYMIZE_GUEST);
console.log('🔓 Anonymisation admin:', ANONYMIZE_ADMIN);

// Gestion des sessions en mémoire
const sessions = new Map();

// Fonction pour enregistrer une connexion dans les stats
async function recordConnection(role) {
  const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
  
  try {
    // Vérifier si une entrée existe déjà pour aujourd'hui
    const existing = await dbGet(
      'SELECT * FROM connection_stats WHERE date = ? AND role = ?',
      [today, role]
    );
    
    if (existing) {
      // Incrémenter le compteur
      await dbRun(
        'UPDATE connection_stats SET count = count + 1 WHERE date = ? AND role = ?',
        [today, role]
      );
    } else {
      // Créer une nouvelle entrée
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
      // IPv4 et pas localhost
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
  console.warn('⚠️  ATTENTION: Dossier "public" introuvable à:', publicPath);
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
    // Créer la table lockers si elle n'existe pas
    db.run(`
      CREATE TABLE IF NOT EXISTS lockers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT UNIQUE NOT NULL,
        zone TEXT NOT NULL CHECK(zone IN ('NORD', 'SUD', 'PCA')),
        occupied BOOLEAN DEFAULT 0,
        recoverable BOOLEAN DEFAULT 0,
        name TEXT DEFAULT '',
        firstName TEXT DEFAULT '',
        code TEXT DEFAULT '',
        birthDate TEXT DEFAULT '',
        comment TEXT DEFAULT '',
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedBy TEXT DEFAULT '',
        version INTEGER DEFAULT 0
      )
    `, (err) => {
      if (err) console.error('Erreur création table lockers:', err);
      else {
        // Ajouter la colonne comment si elle n'existe pas
        db.run(`ALTER TABLE lockers ADD COLUMN comment TEXT DEFAULT ''`, () => {});
        // Ajouter la colonne updatedBy si elle n'existe pas
        db.run(`ALTER TABLE lockers ADD COLUMN updatedBy TEXT DEFAULT ''`, () => {});
      }
    });

    // Créer la table clients si elle n'existe pas
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

    // Créer la table d'historique des modifications
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

    // Initialiser les casiers si la table est vide
    db.get('SELECT COUNT(*) as count FROM lockers', async (err, row) => {
      if (err) {
        console.error('Erreur lecture table:', err);
      } else if (row.count === 0) {
        console.log('Initialisation des casiers...');
        const lockers = [];

        // NORD (75 casiers)
        for (let i = 1; i <= 75; i++) {
          lockers.push(['N' + String(i).padStart(2, '0'), 'NORD']);
        }

        // SUD (75 casiers)
        for (let i = 1; i <= 75; i++) {
          lockers.push(['S' + String(i).padStart(2, '0'), 'SUD']);
        }

        // PCA (40 casiers)
        for (let i = 1; i <= 40; i++) {
          lockers.push(['PCA' + String(i).padStart(2, '0'), 'PCA']);
        }

        const stmt = db.prepare('INSERT INTO lockers (number, zone) VALUES (?, ?)');
        
        lockers.forEach(([number, zone]) => {
          stmt.run(number, zone);
        });

        stmt.finalize(() => {
          console.log('✓ Casiers initialisés: ' + lockers.length);
        });
      }
    });
  });
}

// ============ MIDDLEWARE D'AUTHENTIFICATION ============

// Middleware de vérification d'authentification
function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  // Vérifier que la session n'a pas expiré (24h)
  const session = sessions.get(token);
  const now = Date.now();
  if (now - session.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expirée' });
  }
  
  next();
}

// ============ ROUTES API ============

// ============ AUTHENTIFICATION ============

// POST login
app.post('/api/login', async (req, res) => {
  const { password, userName } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    // Vérifier que le nom d'utilisateur est fourni en mode admin
    if (!userName || userName.trim() === '') {
      return res.status(400).json({ error: 'Nom/initiales requis en mode modification' });
    }
    
    const token = generateToken();
    sessions.set(token, {
      createdAt: Date.now(),
      isAdmin: true,
      userName: userName.trim()
    });
    
    // Enregistrer la connexion
    await recordConnection('admin');
    
    res.json({
      success: true,
      token: token,
      role: 'admin',
      userName: userName.trim(),
      anonymize: ANONYMIZE_ADMIN
    });
  } else if (!password || password === '') {
    // Mode consultation sans mot de passe
    const token = generateToken();
    sessions.set(token, {
      createdAt: Date.now(),
      isAdmin: false,
      userName: 'guest'
    });
    
    // Enregistrer la connexion guest
    await recordConnection('guest');
    
    res.json({
      success: true,
      token: token,
      role: 'guest',
      anonymize: ANONYMIZE_GUEST
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
    anonymize: isAdmin ? ANONYMIZE_ADMIN : ANONYMIZE_GUEST
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
    if (!['NORD', 'SUD', 'PCA'].includes(zone)) {
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

    // Récupérer l'utilisateur depuis la session
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    // Vérifier que le casier existe
    const existingLocker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [number]
    );

    if (!existingLocker) {
      return res.status(404).json({ error: 'Casier non trouvé' });
    }

    // Vérifier si l'IPP existe dans la base clients
    let isRecoverable = recoverable ? 1 : 0;
    let ippValid = true;
    if (code) {
      const client = await dbGet('SELECT * FROM clients WHERE ipp = ?', [code]);
      if (!client) {
        isRecoverable = 1; // IPP invalide → automatiquement récupérable
        ippValid = false;
      }
    }

    // Déterminer l'action pour l'historique
    const action = existingLocker.occupied ? 'MODIFICATION' : 'ATTRIBUTION';
    const details = `${name} ${firstName} (IPP: ${code})`;

    // Mettre à jour
    await dbRun(
      `UPDATE lockers 
       SET zone = ?, occupied = 1, recoverable = ?, name = ?, firstName = ?, code = ?, birthDate = ?, comment = ?,
           updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
       WHERE number = ?`,
      [zone, isRecoverable, name, firstName, code, birthDate, comment || '', userName, number]
    );

    // Enregistrer dans l'historique
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
    // Récupérer l'utilisateur depuis la session
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

    // Enregistrer dans l'historique
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
       WHERE name LIKE ? OR firstName LIKE ?
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), database: 'SQLite' });
});

// Config - retourne l'URL du serveur pour le frontend
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
        
        // Vérifier que le casier existe
        const locker = await dbGet('SELECT * FROM lockers WHERE number = ?', [number]);
        
        if (locker) {
          // Vérifier si l'IPP existe dans la base clients
          let isRecoverable = recoverable ? 1 : 0;
          if (code) {
            const client = await dbGet('SELECT * FROM clients WHERE ipp = ?', [code]);
            if (!client) {
              isRecoverable = 1; // IPP invalide → automatiquement récupérable
              invalidIPP++;
            }
          }
          
          // Mettre à jour le casier
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

    // Insérer les nouveaux clients
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

    stmt.finalize(() => {
      console.log('Import terminé:', imported, 'clients importés,', errors, 'erreurs');
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

// Route par défaut pour servir index.html
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  console.log('Tentative d\'accès à:', filePath);
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
});