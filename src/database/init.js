// Initialisation de la base de données

const { connectDatabase, getDb, dbRun } = require('./index');
const { ZONES_CONFIG } = require('../config/zones');
const { isProduction, VERBOSE } = require('../config');

async function initializeDatabase() {
    await connectDatabase();
    const db = getDb();
    
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Liste des zones valides
            const zonesList = ZONES_CONFIG.map(z => `'${z.name}'`).join(', ');

            // --- Table lockers
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
                    frigo BOOLEAN DEFAULT 0,
                    pca BOOLEAN DEFAULT 0,
                    meopa BOOLEAN DEFAULT 0,
                    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updatedBy TEXT DEFAULT '',
                    version INTEGER DEFAULT 0
                )
            `, (err) => {
                if (err) console.error('Erreur création table casiers:', err);
                else {
                    // Migrations temporaires
                    db.run(`ALTER TABLE lockers ADD COLUMN frigo BOOLEAN DEFAULT 0`, () => {});
                    db.run(`ALTER TABLE lockers ADD COLUMN pca BOOLEAN DEFAULT 0`, () => {});
                    db.run(`ALTER TABLE lockers ADD COLUMN meopa BOOLEAN DEFAULT 0`, () => {});
                    if (!isProduction && VERBOSE) console.log('✓ Table casiers créée/vérifiée');
                }
            });

            // --- Table clients
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
                else if (!isProduction && VERBOSE) console.log('✓ Table patients créée/vérifiée');
            });

            // --- Table lockers_locks pour gérer les verrous
            db.run(`
                CREATE TABLE IF NOT EXISTS locker_locks (
                    locker_number TEXT PRIMARY KEY,
                    locked_by TEXT NOT NULL,
                    locked_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    user_name TEXT,
                    ip_address TEXT
                )
            `, (err) => {
                if (err) console.error('Erreur création table lockers_locks:', err);
                else if (!isProduction && VERBOSE) console.log('✓ Table lockers_locks créée/vérifiée');
            });
            // Créer l'index si non existant
            db.get(`
                SELECT name FROM sqlite_master 
                WHERE type='index' AND name='idx_locker_locks_expires'
            `, (err, row) => {
                if (!row) {
                    // L'index n'existe pas, on le crée
                    db.run(`
                        CREATE INDEX idx_locker_locks_expires ON locker_locks(expires_at);
                    `, (err) => {
                        if (err) console.error('Erreur création index table lockers_locks:', err);
                    });
                }
            });

            // --- Table locker_history
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
                else if (!isProduction && VERBOSE) console.log('✓ Table locker_history créée/vérifiée');
            });

            // --- Table connection_stats
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
                else if (!isProduction && VERBOSE) console.log('✓ Table connection_stats créée/vérifiée');
            });

            // --- Table connection_logs
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
                else if (!isProduction && VERBOSE) console.log('✓ Table connection_logs créée/vérifiée');
            });

            // --- Table export_logs
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
                else if (!isProduction && VERBOSE) console.log('✓ Table export_logs créée/vérifiée');
            });

            // --- Table client_imports
            db.run(`
                CREATE TABLE IF NOT EXISTS client_imports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    importDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                    recordCount INTEGER,
                    userName TEXT
                )
            `, (err) => {
                if (err) console.error('Erreur création table client_imports:', err);
                else if (!isProduction && VERBOSE) console.log('✓ Table client_imports créée/vérifiée');
            });

            // Initialiser les casiers si vide
            db.get('SELECT COUNT(*) as count FROM lockers', async (err, row) => {
                if (err) {
                    console.error('Erreur lecture table:', err);
                } else if (row.count === 0) {
                    if (!isProduction && VERBOSE) console.log('🔧 Initialisation des casiers...');
                    const lockers = [];
                    
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
                
                resolve();
            });
        });
    });
}

module.exports = {
    initializeDatabase
};
