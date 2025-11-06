// test/monitor-logs.js

/* Utilisation

# Terminal 1 : Lancer le serveur
npm run dev

# Terminal 2 : Lancer le monitoring
node test/monitor-logs.js

# Terminal 3 : Utiliser l'application (ou lancer les tests)
npm run test:audit
*/

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'app.db');

let lastHistoryId = 0;
let lastImportId = 0;

function checkNewLogs() {
    const db = new sqlite3.Database(dbPath);
    
    // Vérifier nouveaux logs casiers
    db.all(`
        SELECT * FROM locker_history 
        WHERE id > ? 
        ORDER BY id ASC
    `, [lastHistoryId], (err, rows) => {
        if (err) {
            console.error('Erreur:', err);
        } else if (rows.length > 0) {
            rows.forEach(row => {
                console.log(`\n📦 [${new Date(row.timestamp).toLocaleTimeString()}] ${row.action}`);
                console.log(`   Casier: ${row.lockerNumber}`);
                console.log(`   Par: ${row.userName || '⚠️  MANQUANT'} (${row.userRole})`);
                if (row.details) console.log(`   Détails: ${row.details}`);
                
                if (!row.userName || row.userName === 'Inconnu') {
                    console.log('   🚨 ATTENTION: userName manquant !');
                }
                
                lastHistoryId = row.id;
            });
        }
    });
    
    // Vérifier nouveaux imports
    db.all(`
        SELECT * FROM client_imports 
        WHERE id > ? 
        ORDER BY id ASC
    `, [lastImportId], (err, rows) => {
        if (err) {
            console.error('Erreur:', err);
        } else if (rows.length > 0) {
            rows.forEach(row => {
                console.log(`\n📥 [${new Date(row.importDate).toLocaleTimeString()}] IMPORT CLIENTS`);
                console.log(`   Records: ${row.recordCount}`);
                console.log(`   Par: ${row.userName || '⚠️  MANQUANT'}`);
                
                if (!row.userName || row.userName === 'Inconnu') {
                    console.log('   🚨 ATTENTION: userName manquant !');
                }
                
                lastImportId = row.id;
            });
        }
    });
    
    db.close();
}

console.log('👀 Surveillance des logs en temps réel...');
console.log('   (Appuyez sur Ctrl+C pour arrêter)\n');

// Vérifier toutes les 2 secondes
setInterval(checkNewLogs, 2000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Arrêt de la surveillance');
    process.exit(0);
});