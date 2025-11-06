// test/fix-missing-usernames.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const readline = require('readline');

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function fixMissingUserNames() {
    console.log('🔧 CORRECTION DES LOGS SANS USERNAME\n');

    // 1. Compter les logs problématiques
    await new Promise((resolve) => {
        db.get(`
            SELECT COUNT(*) as count 
            FROM locker_history 
            WHERE userName IS NULL OR userName = 'Inconnu'
        `, async (err, row) => {
            if (err) {
                console.error('Erreur:', err);
                resolve();
                return;
            }

            if (row.count === 0) {
                console.log('✅ Aucun log sans userName trouvé !');
                resolve();
                return;
            }

            console.log(`⚠️  ${row.count} log(s) sans userName trouvé(s)`);
            
            const answer = await question('\nVoulez-vous les corriger avec un userName par défaut ? (oui/non): ');
            
            if (answer.toLowerCase() === 'oui') {
                const defaultUser = await question('Entrez le userName par défaut (ex: SYSTEM): ');
                
                db.run(`
                    UPDATE locker_history 
                    SET userName = ? 
                    WHERE userName IS NULL OR userName = 'Inconnu'
                `, [defaultUser], function(err) {
                    if (err) {
                        console.error('Erreur:', err);
                    } else {
                        console.log(`\n✅ ${this.changes} log(s) corrigé(s) avec userName = "${defaultUser}"`);
                    }
                    resolve();
                });
            } else {
                console.log('\n❌ Correction annulée');
                resolve();
            }
        });
    });

    db.close();
    rl.close();
}

fixMissingUserNames();