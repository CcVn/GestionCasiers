// Charger les variables d'environnement DE .env EN PREMIER
require('dotenv').config({path: './config.env'});

const isProduction = process.env.NODE_ENV === 'production';
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
    comment: z.string().max(500, 'Commentaire trop long').optional().default(''),
    marque: z.boolean().optional().default(false),
    hosp: z.boolean().optional().default(false),
    hospDate: z.string().optional().default(''),
    idel: z.boolean().optional().default(false),
    stup: z.boolean().optional().default(false),
    expectedVersion: z.union([z.number(), z.null()]).optional()  // accepter number, null ou undefined
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
    recoverable: z.boolean().optional().default(false),
    marque: z.boolean().optional().default(false),
    hosp: z.boolean().optional().default(false),
    hospDate: z.string().optional().default(''),
    stup: z.boolean().optional().default(false)
});

// Schéma pour restauration backup
const restoreSchema = z.object({
    filename: z.string().optional(),
    fileData: z.string().optional()
}).refine(
    data => data.filename || data.fileData,
    {
        message: 'Un fichier ou un nom de backup doit être fourni'
    }
);

// Schéma pour login
const loginSchema = z.object({
    password: z.string()
        .max(100, 'Mot de passe trop long')
        .optional()
        .default(''),
    userName: z.string()
        .max(50, 'Nom/initiales trop long')
        .optional()
        .default('')
        .transform(val => val.trim())  // Nettoyer les espaces
}).refine(data => {
    // Si userName est vide ou contient seulement des espaces, c'est OK (sera remplacé par l'IP)
    if (!data.userName || data.userName === '') {
        return true;
    }
    // Si userName est fourni, vérifier les caractères
    return /^[a-zA-Z0-9\s\-_.]+$/.test(data.userName);
}, {
    message: 'Caractères invalides dans le nom',
    path: ['userName']
});

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
const cookieParser = require('cookie-parser');
const csrf = require('csurf');

// ============ CONFIGURATION ============

const VERBOSE = true  // console.log ou non?

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
//const ADMIN_PASSWORD_LEGACY = process.env.ADMIN_PASSWORD; // Pour migration

// Vérifier qu'un mot de passe est configuré
if (!ADMIN_PASSWORD_HASH) {
    console.error('❌ ERREUR: Aucun mot de passe admin configuré !');
    console.error('   Définissez ADMIN_PASSWORD_HASH dans le fichier .env');
    console.error('   Utilisez: node generate-password.js pour générer un hash');
    process.exit(1);
}

/*if (ADMIN_PASSWORD_LEGACY && !ADMIN_PASSWORD_HASH) {
    console.warn('⚠️  ATTENTION: ADMIN_PASSWORD en clair détecté !');
    console.warn('   Utilisez: node generate-password.js pour générer un hash');
    console.warn('   Puis ajoutez ADMIN_PASSWORD_HASH dans .env');
} */
if (!isProduction && VERBOSE) console.log('🔐 Authentification configurée');

const ANONYMIZE_GUEST = process.env.ANONYMIZE_GUEST === 'true';
const ANONYMIZE_ADMIN = process.env.ANONYMIZE_ADMIN === 'true';
// Configuration anonymisation (peut être overridée à chaud)
let ANONYMIZE_GUEST_RUNTIME = ANONYMIZE_GUEST;
let ANONYMIZE_ADMIN_RUNTIME = ANONYMIZE_ADMIN;
if (!isProduction && VERBOSE) console.log('👁️ Anonymisation guest:', ANONYMIZE_GUEST);
if (!isProduction && VERBOSE) console.log('🔓 Anonymisation admin:', ANONYMIZE_ADMIN);

const DARK_MODE = process.env.DARK_MODE || 'system';
if (!isProduction && VERBOSE) console.log('🌓 Mode sombre:', DARK_MODE);

const CLIENT_IMPORT_WARNING_DAYS = parseInt(process.env.CLIENT_IMPORT_WARNING_DAYS) || 4;
const BACKUP_FREQUENCY_HOURS = parseInt(process.env.BACKUP_FREQUENCY_HOURS) || 24;
const BACKUP_RETENTION_COUNT = parseInt(process.env.BACKUP_RETENTION_COUNT) || 7;

// Nettoyage automatique des sessions expirées : Pour ce cas d'usage (pharmacie, quelques dizaines d'utilisateurs)
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 heures (journée de travail)
const SESSION_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // Nettoyer toutes les 30 minutes

// Parser la configuration des zones
function parseZonesConfig() {
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
    
    if (!isProduction && VERBOSE) {
      console.log('📋 Configuration des zones:');
      zones.forEach(z => {
        console.log(`   - ${z.name}: ${z.count} casiers (${z.prefix}01-${z.prefix}${String(z.count).padStart(2, '0')})`);
      });      
    } 
    return zones;
}
const ZONES_CONFIG = parseZonesConfig();

// Gestion des sessions en mémoire
const sessions = new Map();

// Fonction pour enregistrer une connexion dans les stats
async function recordConnection(role, userName = null, ipAddress = null) {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Stats agrégées (existant)
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
    
    // Log individuel
    await dbRun(
      'INSERT INTO connection_logs (role, userName, ipAddress) VALUES (?, ?, ?)',
      [role, userName || null, ipAddress || null]
    );
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

// Fonction pour obtenir l'IP du client
function getClientIP(req) {
  // Vérifier les headers de proxy (si derrière nginx/apache)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Prendre la première IP si plusieurs
    return forwarded.split(',')[0].trim();
  }
  
  if (!isProduction && VERBOSE) console.log('Adresse IP entrante: ', req.ip);
  // Fallback sur l'IP directe
  return req.ip || req.connection.remoteAddress || 'unknown';
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
  max: 5, // Max 5 tentatives de login
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
app.use(cors({
  origin: true,  // @TODO: En production, mettre l'URL exacte du frontend
  credentials: true  // CRITIQUE : permet l'envoi de cookies cross-origin
}));
app.use(express.json({limit: '50mb'}));
app.use(cookieParser());
// Protection CSRF
const csrfProtection = csrf({ 
  cookie: {
    httpOnly: false,  // Le token doit être lisible par JS côté client
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});
app.use('/api/', generalLimiter); // Appliquer le rate limiting général

// ---- HELMET : voir plus tard pour ajouter les nonces avec crypto
// par ex remplacer <button onclick="toggleAdminTools()">...</button> par <button id="btnToggleAdminTools">...</button>
/* app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Scripts : autoriser self + inline (onclick="" dans le HTMLetc.)
        styleSrc: ["'self'", "'unsafe-inline'"], // Pour les styles inline dans vos composants
        scriptSrcAttr: ["'unsafe-inline'"], 
        imgSrc: ["'self'", "data:"],   // Pour les images en base64 si nécessaire
        fontSrc: ["'self'"],
        connectSrc: ["'self'"], // Connexions : autoriser self (pour vos API fetch)
        frameSrc: ["'none'"], // Frames : bloquer (pas besoin d'iframes)
        objectSrc: ["'none'"], // Objects : bloquer (pas de Flash, etc.)
        baseUri: ["'self'"], // Base URI : restreindre
        formAction: ["'self'"],  // Form actions : autoriser self
        // Activer upgradeInsecureRequests SEULEMENT en production
        ...(isProduction && { upgradeInsecureRequests: [] })
      }
    },
    crossOriginEmbedderPolicy: false,  // Désactiver si problèmes CORS
    crossOriginResourcePolicy: { policy: "same-origin" },
    frameguard: { action: 'deny' }, // Protection contre le clickjacking
    // Force HTTPS en production
    // HSTS seulement en production
    hsts: isProduction ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false,
    hidePoweredBy: true, // Cache les headers serveur
    //noSniff: true,  // Bloque le MIME sniffing
    //ieNoOpen: true, // Force le téléchargement au lieu de l'affichage
    xssFilter: true, // Protection XSS (ancienne méthode, mais garde-fou)
  })
); */
app.use(
  helmet({
    contentSecurityPolicy: false,  // Désactive toute la CSP
  })
);
// Pour les étiquettes
app.set("views", path.join(__dirname, 'views')); // Définir le dossier des vues
app.set("view engine", "ejs"); // Choisir le moteur de rendu (EJS dans cet exemple)

//---- Vérifier que le dossier public existe
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
  console.warn('⚠️  ATTENTION: Dossier "public" introuvable à :', publicPath);
  console.warn('   Créez le dossier "public" et y mettre le fichier index.html');
} else {
  if (!isProduction && VERBOSE) console.log('✓ Dossier public trouvé:', publicPath);
}

app.use(express.static('public'));

// ====================== BASE SQLITE3 ================================
// Chemin de la base de données
const dbPath = path.join(__dirname, 'app.db');
const DB_EXISTS = fs.existsSync(dbPath);

// Connexion SQLite
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('✗ Erreur SQLite:', err.message);
    process.exit(1);
  } else {
    if (!isProduction && VERBOSE) console.log('✓ SQLite connecté');
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
        marque BOOLEAN DEFAULT 0,
        hosp BOOLEAN DEFAULT 0,
        hospDate TEXT DEFAULT '',
        stup BOOLEAN DEFAULT 0,
        idel BOOLEAN DEFAULT 0,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedBy TEXT DEFAULT '',
        version INTEGER DEFAULT 0
      )
    `, (err) => {
      if (err) console.error('Erreur création table casiers:', err);
      else {
        if (!isProduction && VERBOSE) console.log('✓ Table casiers créée/vérifiée');
      }
    });

    // Créer la table patients/clients
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
      if (err) console.error('Erreur création table patients:', err);
      else {
        if (!isProduction && VERBOSE) console.log('✓ Table patients créée/vérifiée');
      }
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
      else {
        if (!isProduction && VERBOSE) console.log('✓ Table locker_history créée/vérifiée');
      }
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
      else {
        if (!isProduction && VERBOSE) console.log('✓ Table connection_stats créée/vérifiée');
      }
    });

    // Créer la table des logs de connexion individuels
    db.run(`
      CREATE TABLE IF NOT EXISTS connection_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        role TEXT NOT NULL,
        userName TEXT,
        ipAddress TEXT
      )
    `, (err) => {
      if (err) console.error('Erreur création table connection_logs:', err);
      else {
        if (!isProduction && VERBOSE) console.log('✓ Table connection_logs créée/vérifiée');
      }
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
      else {
        if (!isProduction && VERBOSE) console.log('✓ Table export_logs créée/vérifiée');
      }
    });

    // Créer la table des imports patients
    db.run(`
      CREATE TABLE IF NOT EXISTS client_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        importDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        recordCount INTEGER,
        userName TEXT
      )
    `, (err) => {
      if (err) console.error('Erreur création table client_imports:', err);
      else {
        if (!isProduction && VERBOSE) console.log('✓ Table client_imports créée/vérifiée');
      }
    });

    // Initialiser les casiers si la table est vide
    db.get('SELECT COUNT(*) as count FROM lockers', async (err, row) => {
        if (err) {
            console.error('Erreur lecture table:', err);
        } else if (row.count === 0) {
            if (!isProduction && VERBOSE) console.log('🔧 Initialisation des casiers...');
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
                if (!isProduction && VERBOSE) console.log(`✓ ${lockers.length} casiers initialisés`);
            });
        }
    });
  });
}

// ============ MIDDLEWARE D'AUTHENTIFICATION ============

function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  const session = sessions.get(token);
  const now = Date.now();
  
  // Vérifier l'expiration
  if (now - session.createdAt > SESSION_DURATION_MS) {
    sessions.delete(token);
    res.clearCookie('auth_token');
    return res.status(401).json({ error: 'Session expirée' });
  }
  
  // Renouveler la session
  if (true) {
    // OPTION A : Renouveler la session à chaque requête (rolling session)
    session.createdAt = now;
    sessions.set(token, session);
  } else {
    // OPTION B : Renouveler seulement si proche de l'expiration (50% du temps écoulé)
    const halfDuration = SESSION_DURATION_MS / 2;
    if (now - session.createdAt > halfDuration) {
      session.createdAt = now;
      sessions.set(token, session);
    }
  }

  next();
}

// Fonction de nettoyage des sessions expirées
function cleanupExpiredSessions() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [token, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_DURATION_MS) {
      sessions.delete(token);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
       if (!isProduction && VERBOSE) console.log(`🧹 ${cleaned} session(s) expirée(s) nettoyée(s)`);
  }
}

// Lancer le nettoyage périodique
setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL_MS);
if (!isProduction && VERBOSE) console.log(`✓ Nettoyage automatique des sessions activé (toutes les ${SESSION_CLEANUP_INTERVAL_MS / 60000} minutes)`);

// ============ CONFIGURATION DES FORMATS D'IMPORT ============

// Configuration des formats d'import
const IMPORT_FORMATS = {
    'BASIQUE': {
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

// Fonction de détection automatique du séparateur CSV
function detectCSVSeparator(fileContent) {
    const lines = fileContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return ',';
    
    const firstLine = lines[0];
    const secondLine = lines[1];
    
    const separators = [';', ',', '\t', '|'];
    const scores = {};
    
    for (const sep of separators) {
        const firstCount = (firstLine.match(new RegExp(`\\${sep}`, 'g')) || []).length;
        const secondCount = (secondLine.match(new RegExp(`\\${sep}`, 'g')) || []).length;
        
        // Un bon séparateur apparaît le même nombre de fois sur chaque ligne
        if (firstCount > 0 && firstCount === secondCount) {
            scores[sep] = firstCount;
        }
    }
    
    // Retourner le séparateur avec le meilleur score (plus de colonnes)
    const bestSep = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b, ',');
    
    if (!isProduction && VERBOSE) {
        console.log('🔍 Détection séparateur CSV:', {
            détecté: bestSep === '\t' ? 'TAB' : bestSep,
            scores: scores
        });
    }
    
    return bestSep || ',';
}

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

// Fonction principale d'import avec format
function parseClientsWithFormat(fileContent, formatName, separator = ',') {
    const format = IMPORT_FORMATS[formatName];
    
    if (!format) {
        throw new Error(`Format d'import "${formatName}" non reconnu`);
    }
    
    // Si separator pas fourni ou 'auto', détecter automatiquement
    let usedSeparator;
    if (!separator || separator === 'auto') {
        usedSeparator = detectCSVSeparator(fileContent);
    } else {
        usedSeparator = separator || format.separator;
    }

    if (!isProduction && VERBOSE) {
      console.log(`📥 Import avec format: ${formatName}`);
      console.log(`   Séparateur: "${format.separator}"`);
    }
    
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
        throw new Error('Fichier vide ou invalide');
    }
    
    const headers = parseCsvLine(lines[0], usedSeparator);
    if (!isProduction && VERBOSE) console.log(`   Headers trouvés: ${headers.join(', ')}`);
    
    const dataLines = lines.slice(1 + format.skipRows);
    let imported = 0;
    let filtered = 0;
    let errors = 0;
    
    const clients = [];
    
    for (const line of dataLines) {
        try {
            const values = parseCsvLine(line, usedSeparator);
            
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
    
    if (!isProduction && VERBOSE) {
      console.log(`✓ Parsing terminé:`);
      console.log(`  - Importés: ${imported}`);
      console.log(`  - Filtrés: ${filtered}`);
      console.log(`  - Erreurs: ${errors}`);
    }

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

// ============ ROUTES API ============

// Route pour obtenir la configuration des zones
app.get('/api/config/zones', (req, res) => {

    //console.log('Valeur brute de ZONE_COLORS:', JSON.stringify(process.env.ZONE_COLORS));
    const rawColors = ('#E7180B,#31C950,#8A0194,#193CB8'); //'#3b82f6,#10b981,#f59e0b,#ef4444'
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

// Route pour obtenir le token CSRF
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// ============ ROUTES AUTHENTIFICATION ============

// POST login
app.post('/api/login', loginLimiter, csrfProtection, async (req, res) => {
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

       // Utiliser l'IP comme userName par défaut si non fourni
      const clientIP = getClientIP(req);
      const finalUserName = (userName && userName.trim() !== '') 
        ? userName.trim() 
        : clientIP;

      const token = generateToken();
      sessions.set(token, {
        createdAt: Date.now(),
        isAdmin: true,
        userName: finalUserName
      });
      if (!isProduction && VERBOSE) console.log ("Username: ", finalUserName)

      // Stocker le token dans un cookie httpOnly
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',  // HTTPS en prod
        sameSite: 'lax',  // Protection CSRF (strict si même domaine)
        maxAge: 24 * 60 * 60 * 1000  // 24h
      });
      
      await recordConnection('admin', finalUserName, clientIP);
      
      // Ne plus renvoyer le token dans la réponse JSON
      res.json({
          success: true,
          role: 'admin',
          userName: finalUserName,
          anonymize: ANONYMIZE_ADMIN_RUNTIME,  // Utiliser la valeur runtime
          darkMode: DARK_MODE
      });

} else if (!password || password === '') {
      const token = generateToken();
      sessions.set(token, {
        createdAt: Date.now(),
        isAdmin: false,
        userName: 'guest'
      });
      
      // Stocker le token dans un cookie httpOnly
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });
      
      const clientIP = getClientIP(req);
      await recordConnection('guest', null, clientIP);
      
      res.json({
        success: true,
        role: 'guest',
        anonymize: ANONYMIZE_GUEST_RUNTIME,  // Utiliser la valeur runtime
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
app.post('/api/logout', csrfProtection, (req, res) => {
  const token = req.cookies.auth_token;
  if (token) {
    sessions.delete(token);
  }
  
  // Supprimer le cookie
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  
  res.json({ success: true });
});

// GET vérifier le rôle de l'utilisateur
app.get('/api/auth/check', (req, res) => {
  const token = req.cookies.auth_token;
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ authenticated: false });
  }
  
  const session = sessions.get(token);
  const isAdmin = session.isAdmin;
  
  res.json({
      authenticated: true,
      role: isAdmin ? 'admin' : 'guest',
      userName: session.userName || '',
      anonymize: isAdmin ? ANONYMIZE_ADMIN_RUNTIME : ANONYMIZE_GUEST_RUNTIME,
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
app.post('/api/lockers', requireAuth, csrfProtection, async (req, res) => {
  try {

    if (!isProduction && VERBOSE) console.log('📝 POST /api/lockers - Body:', req.body);
    
    // VALIDATION ZOD
    const validationResult = lockerSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.error('❌ Validation Zod échouée:', validationResult.error);
      return res.status(400).json({ 
        error: 'Données invalides', 
        details: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }
    
    const { number, zone, name, firstName, code, birthDate, recoverable, comment, stup, idel, expectedVersion } = req.body;

    // Vérifier que la zone existe dans la config
    const zoneExists = ZONES_CONFIG.some(z => z.name === zone);
    if (!zoneExists) {
      return res.status(400).json({ 
        error: `Zone invalide: ${zone}. Zones disponibles: ${ZONES_CONFIG.map(z => z.name).join(', ')}` 
      });
    }

    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    const existingLocker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [number]
    );

    if (!existingLocker) {
      return res.status(404).json({ error: 'Casier non trouvé' });
    }

    // VÉRIFICATION DU CONFLIT DE VERSION
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
       SET zone = ?, occupied = 1, recoverable = ?, name = ?, firstName = ?, code = ?, birthDate = ?, comment = ?, stup = ?, idel = ?,
           updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
       WHERE number = ? AND version = ?`,
      [zone, isRecoverable, name, firstName, code, birthDate, comment || '', stup ? 1 : 0, idel ? 1 : 0, userName, number, expectedVersion || existingLocker.version]
    );

    // Vérifier que la mise à jour a bien eu lieu
    const result = await dbGet('SELECT changes() as changes');
    if (result.changes === 0) {
      // Cas rare : la version a changé entre le SELECT et l'UPDATE
      return res.status(409).json({ 
        error: 'Conflit de version: ce casier a été modifié par un autre utilisateur',
      });
    }

    await recordHistory(number, action, userName, 'admin', details);

    const updatedLocker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [number]
    );

    //if (!isProduction && VERBOSE) console.log('📝 updatedLocker:', updatedLocker);

    res.json({
      locker: updatedLocker,
      ippValid: ippValid
    });
  } catch (err) {
    console.error('Erreur modification casier:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Toggle marque d'un casier
app.post('/api/lockers/:number/marque', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    const locker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [req.params.number]
    );

    if (!locker) {
      return res.status(404).json({ error: 'Casier non trouvé' });
    }

    // Toggle la marque
    const newMarque = locker.marque ? 0 : 1;

    await dbRun(
      `UPDATE lockers 
       SET marque = ?, updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
       WHERE number = ?`,
      [newMarque, userName, req.params.number]
    );

    // Logger dans l'historique
    const action = newMarque ? 'MARQUE_AJOUTÉE' : 'MARQUE_RETIRÉE';
    const details = locker.occupied 
      ? `${locker.name} ${locker.firstName} (IPP: ${locker.code})`
      : 'Casier vide';
    
    await recordHistory(req.params.number, action, userName, 'admin', details);

    const updatedLocker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [req.params.number]
    );

    res.json(updatedLocker);
  } catch (err) {
    console.error('Erreur toggle marque:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST marquer plusieurs casiers
app.post('/api/lockers/bulk-mark', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
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
    
    console.log(`🔖 ${mark ? 'Marquage' : 'Démarquage'} de ${lockerNumbers.length} casiers...`);
    
    // Créer les placeholders pour la requête SQL
    const placeholders = lockerNumbers.map(() => '?').join(',');
    
    const result = await dbRun(
      `UPDATE lockers 
       SET marque = ?, updatedAt = CURRENT_TIMESTAMP, 
           updatedBy = ?, version = version + 1
       WHERE number IN (${placeholders})`,
      [markValue, userName, ...lockerNumbers]
    );
    
    const count = result.changes || 0;
    
    // Logger dans l'historique
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

// DELETE retirer toutes les marques
app.delete('/api/lockers/clear-marks', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const isAdmin = session?.isAdmin;
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    const userName = session?.userName || 'Inconnu';
    
    console.log('🗑️ Suppression de toutes les marques...');
    
    // Retirer toutes les marques
    const result = await dbRun(
      `UPDATE lockers 
       SET marque = 0, updatedAt = CURRENT_TIMESTAMP, 
           updatedBy = ?, version = version + 1
       WHERE marque = 1`,
      [userName]
    );
    
    const count = result.changes || 0;
    
    // Logger dans l'historique
    await recordHistory('ALL', 'CLEAR_ALL_MARKS', userName, 'admin', `${count} marques retirées`);
    
    console.log(`✓ ${count} marques retirées`);
 
    // Log de sécurité supplémentaire
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

// POST Toggle stupéfiants d'un casier
app.post('/api/lockers/:number/stup', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    const locker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [req.params.number]
    );

    if (!locker) {
      return res.status(404).json({ error: 'Casier non trouvé' });
    }

    // Toggle stup
    const newStup = locker.stup ? 0 : 1;

    await dbRun(
      `UPDATE lockers 
       SET stup = ?, updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
       WHERE number = ?`,
      [newStup, userName, req.params.number]
    );

    // Logger dans l'historique
    const action = newStup ? 'STUPÉFIANTS_AJOUTÉS' : 'STUPÉFIANTS_RETIRÉS';
    const details = locker.occupied 
      ? `${locker.name} ${locker.firstName} (IPP: ${locker.code})`
      : 'Casier vide';
    
    await recordHistory(req.params.number, action, userName, 'admin', details);

    const updatedLocker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [req.params.number]
    );

    res.json(updatedLocker);
  } catch (err) {
    console.error('Erreur toggle stupéfiants:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Toggle idel d'un casier
app.post('/api/lockers/:number/idel', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    const locker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [req.params.number]
    );

    if (!locker) {
      return res.status(404).json({ error: 'Casier non trouvé' });
    }

    // Toggle IDEL
    const newIDEL = locker.idel ? 0 : 1;

    await dbRun(
      `UPDATE lockers 
       SET idel = ?, updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
       WHERE number = ?`,
      [newIDEL, userName, req.params.number]
    );

    // Logger dans l'historique
    const action = newIDEL ? 'IDEL_AJOUTÉ' : 'IDEL_RETIRÉ';
    const details = locker.occupied 
      ? `${locker.name} ${locker.firstName} (IPP: ${locker.code})`
      : 'Casier vide';
    
    await recordHistory(req.params.number, action, userName, 'admin', details);

    const updatedLocker = await dbGet(
      'SELECT * FROM lockers WHERE number = ?',
      [req.params.number]
    );

    res.json(updatedLocker);
  } catch (err) {
    console.error('Erreur toggle IDEL:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Modifier l'hospitalisation d'un casier
app.post('/api/lockers/:number/hospitalisation', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    const { hosp, hospDate } = req.body;

    // Validation
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

    // Si hosp = false, vider hospDate
    const finalHospDate = hosp ? (hospDate || '') : '';

    await dbRun(
      `UPDATE lockers 
       SET hosp = ?, hospDate = ?, updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
       WHERE number = ?`,
      [hosp ? 1 : 0, finalHospDate, userName, req.params.number]
    );

    // Logger dans l'historique
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

// DELETE libérer un casier
app.delete('/api/lockers/:number', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
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

    // 15 dernières connexions individuelles
    const recentConnections = await dbAll(
      `SELECT 
        id,
        timestamp,
        role,
        userName,
        ipAddress
       FROM connection_logs 
       ORDER BY timestamp DESC 
       LIMIT 15`,
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
      last7Days: last7Days,
      recentConnections: recentConnections
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

// GET statistiques des modifications de casiers
app.get('/api/stats/modifications', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Calculer les dates de début
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const weekStart = startOfWeek.toISOString().split('T')[0];
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStart = startOfMonth.toISOString().split('T')[0];
    
    // Aujourd'hui
    const todayStats = await dbGet(
      `SELECT COUNT(*) as count 
       FROM locker_history 
       WHERE DATE(timestamp) = ?`,
      [today]
    );
    
    // Semaine en cours
    const weekStats = await dbGet(
      `SELECT COUNT(*) as count 
       FROM locker_history 
       WHERE DATE(timestamp) >= ?`,
      [weekStart]
    );
    
    // Mois en cours
    const monthStats = await dbGet(
      `SELECT COUNT(*) as count 
       FROM locker_history 
       WHERE DATE(timestamp) >= ?`,
      [monthStart]
    );
    
    // Total
    const totalStats = await dbGet(
      `SELECT COUNT(*) as count FROM locker_history`
    );
    
    // Répartition par type d'action
    const byAction = await dbAll(
      `SELECT action, COUNT(*) as count 
       FROM locker_history 
       GROUP BY action 
       ORDER BY count DESC`
    );
    
    // 10 dernières modifications avec détails du casier
    const recentModifications = await dbAll(
      `SELECT 
        h.id,
        h.lockerNumber,
        h.action,
        h.userName,
        h.userRole,
        h.details,
        h.timestamp,
        l.name,
        l.firstName,
        l.code,
        l.zone
       FROM locker_history h
       LEFT JOIN lockers l ON h.lockerNumber = l.number
       ORDER BY h.timestamp DESC 
       LIMIT 10`
    );
    
    // Utilisateurs les plus actifs
    const topUsers = await dbAll(
      `SELECT userName, COUNT(*) as count 
       FROM locker_history 
       WHERE userName IS NOT NULL AND userName != ''
       GROUP BY userName 
       ORDER BY count DESC 
       LIMIT 5`
    );
    
    // Activité par jour (7 derniers jours)
    const dailyActivity = await dbAll(
      `SELECT 
        DATE(timestamp) as date,
        COUNT(*) as count
       FROM locker_history 
       WHERE DATE(timestamp) >= date('now', '-7 days')
       GROUP BY DATE(timestamp)
       ORDER BY date DESC`
    );
    
    res.json({
      today: todayStats.count,
      week: weekStats.count,
      month: monthStats.count,
      total: totalStats.count,
      byAction: byAction,
      recentModifications: recentModifications,
      topUsers: topUsers,
      dailyActivity: dailyActivity
    });
  } catch (err) {
    console.error('Erreur stats modifications:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST enregistrer un export
app.post('/api/exports/log', exportLimiter, csrfProtection, async (req, res) => {
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

// POST import clients/patients depuis CSV
app.post('/api/clients/import', requireAuth, importLimiter, csrfProtection, async (req, res) => {
    try {
        const { data, rawContent, format, mode, separator } = req.body;  // Ajouter 'mode'
        
        let clients = [];
        let stats = {
            imported: 0,
            skipped: 0,
            filtered: 0,
            errors: 0,
            total: 0
        };
        
        // rawContent fourni → parser avec le format
        if (rawContent) {
            const formatName = format || process.env.CLIENT_IMPORT_FORMAT || 'BASIQUE';
            const csvSeparator = separator || ',';
            const result = parseClientsWithFormat(rawContent, formatName, csvSeparator);
            clients = result.clients;
            stats = result.stats;
        } else if (data && Array.isArray(data)) {
            // Format legacy
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

        // VALIDATION ZOD - Valider chaque client avant import
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

        // MODE REPLACE : Supprimer tous les clients existants
        if (!mode || mode === 'replace') {
            await dbRun('DELETE FROM clients');
            if (!isProduction && VERBOSE) console.log('Base patients vidée (mode replace)');
        }

        let importedCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        // MODE MERGE : Utiliser INSERT OR IGNORE (SQLite)
        const sqlQuery = (mode === 'merge') 
            ? `INSERT OR IGNORE INTO clients (ipp, name, firstName, birthName, birthDate, sex, zone, entryDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            : `INSERT INTO clients (ipp, name, firstName, birthName, birthDate, sex, zone, entryDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        const stmt = db.prepare(sqlQuery);

        for (const row of validatedClients) {
            try {
                const { ipp, name, firstName, birthName, birthDate, sex, zone, entryDate } = row;
                
                stmt.run(ipp, name, firstName, birthName, birthDate, sex, zone, entryDate, function(err) {
                    if (err) {
                        errorCount++;
                        console.error('Erreur insertion patient N°' + (errorCount+skippedCount+importedCount) + ' with IPP='+ ipp +' :', err);
                    } else if (this.changes === 0 && mode === 'merge') {
                        skippedCount++; // INSERT OR IGNORE n'a pas inséré = doublon
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
            if (!isProduction && VERBOSE) console.log('Import terminé:', importedCount, 'importés,', skippedCount, 'ignorés,', errorCount, 'erreurs,', validationErrors, 'validations échouées');
            
            const token = req.cookies.auth_token;
            const session = sessions.get(token);
            const userName = session?.userName || 'Inconnu';
            
            await dbRun(
                'INSERT INTO client_imports (recordCount, userName) VALUES (?, ?)',
                [importedCount, userName]
            );
            
            // Compter le total en base (pour mode merge)
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

// DELETE vider la base clients
app.delete('/api/clients/clear', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const isAdmin = session?.isAdmin;
    const userName = session?.userName || 'Inconnu';
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    if (true) { console.log('🗑️ Suppression de tous les clients...'); }
    
    // Supprimer les clients
    const resultClients = await dbRun('DELETE FROM clients');
    const countClients = resultClients.changes || 0;
    if (true) { console.log(`✓ ${countClients} clients supprimés`); }
    
    // Supprimer aussi l'historique des imports ? pour détection mise à jour... bof bof...
/*    const resultImports = await dbRun('DELETE FROM client_imports');
    const countImports = resultImports.changes || 0;
    console.log(`✓ ${countImports} historique(s) d'import supprimé(s)`);*/
    
    // Log de sécurité
    await dbRun(
      'INSERT INTO client_imports (recordCount, userName, importDate) VALUES (?, ?, ?)',
      [-countClients, `EFFACEMENT par ${userName}`, new Date().toISOString()]
    );

    res.json({
      success: true,
      deleted: countClients,
      deletedBy: userName,
      //importsDeleted: countImports,
      message: 'Base clients vidée avec succès'
    });
  } catch (err) {
    console.error('Erreur suppression clients:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE vider tous les casiers
app.delete('/api/lockers/clear', requireAuth, csrfProtection, async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const isAdmin = session?.isAdmin;
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    const userName = session?.userName || 'Inconnu';
    
    console.log('🗑️ Libération de tous les casiers...');
    
    // Libérer tous les casiers (pas DELETE, juste UPDATE)
    const result = await dbRun(
      `UPDATE lockers 
       SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', 
           birthDate = '', comment = '', updatedAt = CURRENT_TIMESTAMP, 
           updatedBy = ?, version = version + 1
       WHERE occupied = 1`,
      [userName]
    );
    
    const count = result.changes || 0;
    
    // Logger dans l'historique
    await recordHistory('ALL', 'CLEAR_ALL', userName, 'admin', `${count} casiers libérés`);
    
    console.log(`✓ ${count} casiers libérés`);
 
    // Log de sécurité supplémentaire
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

// GET format d'import configuré
app.get('/api/config/import-format', (req, res) => {
    const format = process.env.CLIENT_IMPORT_FORMAT || 'BASIQUE';
    res.json({
        clientImportFormat: format,
        availableFormats: Object.keys(IMPORT_FORMATS)
    });
});

// GET configuration d'anonymisation actuelle
app.get('/api/config/anonymization', requireAuth, (req, res) => {
  const token = req.cookies.auth_token;
  const session = sessions.get(token);
  const isAdmin = session?.isAdmin;
  
  if (!isAdmin) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  
  res.json({
    anonymizeGuest: ANONYMIZE_GUEST_RUNTIME,
    anonymizeAdmin: ANONYMIZE_ADMIN_RUNTIME,
    anonymizeGuestDefault: ANONYMIZE_GUEST,  // Valeur du .env
    anonymizeAdminDefault: ANONYMIZE_ADMIN   // Valeur du .env
  });
});

// POST modifier la configuration d'anonymisation (temporaire)
app.post('/api/config/anonymization', requireAuth, csrfProtection, (req, res) => {
  const token = req.cookies.auth_token;
  const session = sessions.get(token);
  const isAdmin = session?.isAdmin;
  
  if (!isAdmin) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  
  const { anonymizeGuest, anonymizeAdmin } = req.body;
  
  if (typeof anonymizeGuest === 'boolean') {
    ANONYMIZE_GUEST_RUNTIME = anonymizeGuest;
    if (!isProduction && VERBOSE) console.log('🔧 Anonymisation guest modifiée:', anonymizeGuest);
  }
  
  if (typeof anonymizeAdmin === 'boolean') {
    ANONYMIZE_ADMIN_RUNTIME = anonymizeAdmin;
    if (!isProduction && VERBOSE) console.log('🔧 Anonymisation admin modifiée:', anonymizeAdmin);
  }
  
  res.json({
    success: true,
    anonymizeGuest: ANONYMIZE_GUEST_RUNTIME,
    anonymizeAdmin: ANONYMIZE_ADMIN_RUNTIME,
    message: 'Configuration modifiée (temporaire - perdue au redémarrage)'
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
app.post('/api/import', requireAuth, importLimiter, csrfProtection, async (req, res) => {
  try {
    const { data, mode, separator, rawContent } = req.body;  // AJOUTER separator et rawContent
    
    if (!isEditAllowed()) return;
    
    let parsedData = [];
    
    // Si rawContent fourni, parser avec séparateur
    if (rawContent) {
      const usedSeparator = separator === 'auto' || !separator 
        ? detectCSVSeparator(rawContent) 
        : separator;
      
      if (!isProduction && VERBOSE) {
        console.log(`📥 Import casiers CSV`);
        console.log(`   Séparateur: "${usedSeparator === '\t' ? 'TAB' : usedSeparator}" ${separator === 'auto' ? '(auto-détecté)' : ''}`);
      }
      
      const lines = rawContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return res.status(400).json({ error: 'Fichier vide ou invalide' });
      }
      
      const headers = parseCsvLine(lines[0], usedSeparator);
      const dataLines = lines.slice(1);
      
      parsedData = dataLines.map(line => {
        const values = parseCsvLine(line, usedSeparator);
        if (!values || values.length < 6) return null;
        
        return {
          number: values[0]?.trim() || '',
          zone: values[1]?.trim() || '',
          name: values[2]?.trim() || '',
          firstName: values[3]?.trim() || '',
          code: values[4]?.trim() || '',
          birthDate: values[5]?.trim() || '',
          recoverable: values[6] ? (values[6].trim() === '1') : false,
          marque: values[7] ? (values[7].trim() === '1') : false,
          hosp: values[8] ? (values[8].trim() === '1') : false,
          hospDate: values[9]?.trim() || '',
          stup: values[10] ? (values[10].trim() === '1') : false,
          comment: values[11]?.trim() || ''
        };
      }).filter(item => item !== null);
      
    } else if (data && Array.isArray(data)) {
      // Format legacy
      parsedData = data;
    } else {
      return res.status(400).json({ error: 'Données invalides' });
    }
    
    if (parsedData.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée valide' });
    }

    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    // MODE REPLACE : Libérer tous les casiers d'abord
    if (mode === 'replace') {
      console.log('🗑️ Mode remplacement : libération de tous les casiers...');
      await dbRun(
        `UPDATE lockers 
         SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', birthDate = '', comment = '',
             marque = 0, hosp = 0, hospDate = '', stup = 0,
             updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
         WHERE occupied = 1`,
        [userName]
      );
      await recordHistory('ALL', 'CLEAR_BEFORE_IMPORT', userName, 'admin', 'Tous les casiers libérés avant import');
    }

    let imported = 0;
    let errors = 0;
    let invalidIPP = 0;
    let validationErrors = 0;

    for (const row of parsedData) {
      try {
        // VALIDATION ZOD
        const validationResult = importCasierSchema.safeParse(row);
        if (!validationResult.success) {
          console.warn('Ligne invalide ignorée:', validationResult.error.errors[0].message);
          validationErrors++;
          continue;
        }
        
        const { number, zone, name, firstName, code, birthDate, recoverable, marque, hosp, hospDate, stup, comment } = validationResult.data;
        
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
             SET zone = ?, occupied = 1, recoverable = ?, name = ?, firstName = ?, code = ?, birthDate = ?, comment = ?,
                 marque = ?, hosp = ?, hospDate = ?, stup = ?,
                 updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
             WHERE number = ?`,
            [zone, isRecoverable, name, firstName, code, birthDate, comment || '', 
             marque ? 1 : 0, hosp ? 1 : 0, hospDate || '', stup ? 1 : 0, userName, number]
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
      total: parsedData.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST import JSON casiers
app.post('/api/import-json', requireAuth, importLimiter, csrfProtection, async (req, res) => {
  try {
    const { data, metadata } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Données JSON invalides - champ "data" requis et doit être un tableau' });
    }
    
    if (!isProduction && VERBOSE) {
      if (!isProduction && VERBOSE) console.log(`📥 Import JSON - ${data.length} casiers à importer`);
      if (metadata) {
        if (!isProduction && VERBOSE) console.log(`   Metadata: exporté le ${metadata.exportDate} par ${metadata.exportBy}`);
      }
    }

    const token = req.cookies.auth_token;
    const session = sessions.get(token);
    const userName = session?.userName || 'Inconnu';

    let imported = 0;
    let errors = 0;
    let invalidIPP = 0;
    let validationErrors = 0;
    let skipped = 0;

    for (const row of data) {
      try {
        // VALIDATION ZOD
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
        
        // Vérifier si déjà occupé
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

    if (!isProduction && VERBOSE) console.log(`✓ Import JSON terminé: ${imported} importés, ${skipped} ignorés, ${errors} erreurs`);

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

// POST export unifié
app.post('/api/export', requireAuth, exportLimiter, csrfProtection, async (req, res) => {
    try {
        const { format, separator, includeEmpty } = req.body;
        
        const token = req.cookies.auth_token;
        const session = sessions.get(token);
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
            const headers = ['N° Casier', 'Zone', 'Nom', 'Prénom', 'N°IPP', 'DDN', 'Récupérable', 'Marque', 'Hospitalisation', 'Date Hosp', 'Stupéfiants', 'Commentaire'];
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
        await logExport(format, lockers.length, userName, role);
        
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

// ============ ROUTES IMPORT CLIENTS ============

// POST import clients depuis CSV
app.post('/api/clients/import', requireAuth, csrfProtection, async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    if (!isProduction && VERBOSE) console.log('Import de', data.length, 'clients...');

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
      if (!isProduction && VERBOSE) console.log('Import terminé:', imported, 'clients importés,', errors, 'erreurs');
      
      // Enregistrer l'import
      const token = req.cookies.auth_token;
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
    //console.log(lastImport)
    
    const rows = await dbGet(
      'SELECT COUNT(*)=0 AS is_empty FROM clients'
    );
    const isempty = rows[0].is_empty
    console.log(isempty)

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
    const hoursSince = Math.floor((now - importDate) / (1000 * 60 * 60));
    
    res.json({
      hasImport: true,
      lastImportDate: lastImport.importDate,
      daysSinceImport: daysSince,
      hoursSinceImport: hoursSince,
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
    
    // 10 premiers patients
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
app.post('/api/restore', requireAuth, backupLimiter, csrfProtection, async (req, res) => {
  try {
    if (!isProduction && VERBOSE) console.log('📥 Requête restore reçue:', req.body);
    
    // VALIDATION ZOD
    const validationResult = restoreSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.error('❌ Validation Zod échouée:', validationResult.error);
      return res.status(400).json({ 
        error: 'Données invalides',
        details: validationResult.error.errors?.map(e => e.message).join(', ') || 'Validation failed'
      });
    }
    
    const { filename, fileData } = validationResult.data;
    
    if (!isProduction && VERBOSE) {
      console.log('Filename:', filename);
      console.log('FileData présent:', !!fileData);
    }
    
    // Créer un backup de sécurité avant restauration
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const safetyBackupPath = path.join(backupDir, `backup_before_restore_${timestamp}.db`);
    
    if (!isProduction && VERBOSE) console.log('🔒 Création backup de sécurité...');
    fs.copyFileSync(dbPath, safetyBackupPath);
    if (!isProduction && VERBOSE) console.log('✓ Backup de sécurité créé:', path.basename(safetyBackupPath));
    
    let restorePath;
    
    // Si c'est un fichier uploadé (base64)
    if (fileData) {
      if (!isProduction && VERBOSE) console.log('📤 Restauration depuis fichier uploadé...');
      
      // Décoder base64
      const buffer = Buffer.from(fileData, 'base64');
      
      // Créer un fichier temporaire
      const tempPath = path.join(backupDir, `temp_restore_${timestamp}.db`);
      fs.writeFileSync(tempPath, buffer);
      restorePath = tempPath;
      
    } else if (filename) {
      // Restauration depuis un backup existant
      if (!isProduction && VERBOSE) console.log('📁 Restauration depuis backup existant:', filename);
      restorePath = path.join(backupDir, filename);
      
      if (!fs.existsSync(restorePath)) {
        throw new Error('Fichier backup non trouvé');
      }
    } else {
      throw new Error('Aucun fichier spécifié');
    }
    
    // Vérifier que c'est bien une base SQLite valide
    if (!isProduction && VERBOSE) console.log('🔍 Vérification du fichier...');
    const fileBuffer = fs.readFileSync(restorePath);
    const header = fileBuffer.toString('utf8', 0, 16);
    
    if (!header.startsWith('SQLite format 3')) {
      if (fileData) fs.unlinkSync(restorePath); // Nettoyer le temp
      throw new Error('Fichier invalide : ce n\'est pas une base SQLite');
    }
    
    // Fermer la connexion actuelle
    if (!isProduction && VERBOSE) console.log('🔌 Fermeture connexion base actuelle...');
    await new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Remplacer la base de données
    if (!isProduction && VERBOSE) console.log('🔄 Remplacement de la base...');
    fs.copyFileSync(restorePath, dbPath);
    
    // Nettoyer le fichier temporaire si nécessaire
    if (fileData) {
      fs.unlinkSync(restorePath);
    }
    
    if (!isProduction && VERBOSE) {
      console.log('✅ Base restaurée avec succès');
      console.log('⚠️ REDÉMARRAGE DU SERVEUR NÉCESSAIRE');
    }

    res.json({
      success: true,
      message: 'Base restaurée avec succès. Redémarrage du serveur nécessaire.',
      safetyBackup: path.basename(safetyBackupPath)
    });
    
    // Redémarrer le serveur après un court délai
    setTimeout(() => {

    }, 1000);
    
    // Redémarrer le serveur en touchant le fichier
    setTimeout(() => {
        if (!isProduction && VERBOSE) console.log('🔄 Redémarrage du serveur...');
        //process.exit(1);   // Exit code 1 force nodemon à redémarrer //avant: process.exit(0); mais restait bloqué
        const now = new Date();
        fs.utimesSync(__filename, now, now); // Touch le fichier actuel
    }, 1000);

  } catch (err) {
    if (!isProduction && VERBOSE) console.error('❌ Erreur restauration:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST créer un backup manuel 
app.post('/api/backup', requireAuth, backupLimiter, csrfProtection, async (req, res) => {
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
        if (!isProduction && VERBOSE) console.log('Backup supprimé:', f.name);
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
    if (!isProduction && VERBOSE) console.log('⏭️  Backups automatiques désactivés');
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
      if (!isProduction && VERBOSE) console.log('✓ Backup automatique créé:', path.basename(backupPath));
      
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
          if (!isProduction && VERBOSE) console.log('Backup supprimé:', f.name);
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
  
  if (!isProduction && VERBOSE) console.log(`✓ Backups automatiques activés (toutes les ${BACKUP_FREQUENCY_HOURS}h, ${BACKUP_RETENTION_COUNT} fichiers conservés)`);
}

//-------------------------------------------
// Route → affichage étiquettes; npm install ejs
// app.get("/etiquettes", async (req, res) => {
//   db.all(`SELECT number, name, firstName, birthDate, code, zone 
//       FROM lockers 
//       WHERE occupied>0
//       ORDER BY number`, [], (err, rows) => {
//     if (err) {
//       return console.error(err.message);
//     }
//     res.render('etiquettes', { lockers : rows });
//   });
// });

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), database: 'SQLite' });
});

// GET temps restant avant expiration
app.get('/api/session/time-remaining', requireAuth, (req, res) => {
  const token = req.cookies.auth_token;
  const session = sessions.get(token);
  
  if (!session) {
    return res.status(401).json({ error: 'Session non trouvée' });
  }
  
  const now = Date.now();
  const elapsed = now - session.createdAt;
  const remaining = SESSION_DURATION_MS - elapsed;
  const remainingMinutes = Math.floor(remaining / 60000);
  
  res.json({
    expiresIn: remaining,
    expiresInMinutes: remainingMinutes,
    expiresAt: new Date(session.createdAt + SESSION_DURATION_MS).toISOString()
  });
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

// Route pour obtenir l'IP du client
app.get('/api/client-ip', (req, res) => {
  const clientIP = getClientIP(req);
  res.json({ ip: clientIP });
});

// Route par défaut pour servir index.html
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  if (!isProduction && VERBOSE) {
    console.log('Tentative d\'accès à :', filePath);
    console.log('Fichier existe?', fs.existsSync(filePath));
  }
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
  
  if (!isProduction && VERBOSE) {
    console.log(`✓ Serveur démarré`);
    console.log(`  - Local:    http://localhost:${PORT}`);
    console.log(`  - Réseau:   http://${LOCAL_IP}:${PORT}`);
    console.log(`✓ Base de données: ${dbPath}`);
    console.log(`✓ Prêt pour accès réseau`);
  }

  // Configurer les backups automatiques
  setupAutoBackup();
});