// Connexion et helpers base de données

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { isProduction, VERBOSE } = require('../config');

// Chemin de la base de données
const dbPath = path.join(__dirname, '../../app.db');
const DB_EXISTS = fs.existsSync(dbPath);

// Connexion SQLite
let db = null;

function connectDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('✗ Erreur SQLite:', err.message);
                reject(err);
            } else {
                if (!isProduction && VERBOSE) console.log('✓ SQLite connecté');
                resolve(db);
            }
        });
        
        // Gestion des erreurs
        db.on('error', (err) => {
            console.error('Erreur base de données:', err);
        });
    });
}

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

module.exports = {
    connectDatabase,
    dbRun,
    dbGet,
    dbAll,
    getDb: () => db,
    dbPath,
    DB_EXISTS
};
