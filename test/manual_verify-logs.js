// test/verify-logs.js
// Execution : node test/verify-logs.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 VÉRIFICATION MANUELLE DES LOGS\n');
console.log('='.repeat(60));

// 1. Historique casiers
console.log('\n📦 LOCKER_HISTORY (10 dernières actions):');
db.all(`
    SELECT 
        lockerNumber,
        action,
        userName,
        userRole,
        datetime(timestamp, 'localtime') as time
    FROM locker_history 
    ORDER BY timestamp DESC 
    LIMIT 10
`, (err, rows) => {
    if (err) {
        console.error('Erreur:', err);
    } else {
        console.table(rows);
    }
});

// 2. Imports clients
setTimeout(() => {
    console.log('\n📥 CLIENT_IMPORTS (5 derniers):');
    db.all(`
        SELECT 
            recordCount,
            userName,
            datetime(importDate, 'localtime') as time
        FROM client_imports 
        ORDER BY importDate DESC 
        LIMIT 5
    `, (err, rows) => {
        if (err) {
            console.error('Erreur:', err);
        } else {
            console.table(rows);
        }
        
        db.close();
    });
}, 500);