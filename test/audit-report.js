// test/audit-report.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

async function generateAuditReport() {
    console.log('📊 GÉNÉRATION DU RAPPORT D\'AUDIT\n');
    console.log('='.repeat(80));
    
    const report = [];

    // 1. Statistiques générales
    report.push('\n## 1. STATISTIQUES GÉNÉRALES\n');
    
    await new Promise((resolve) => {
        db.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN userName IS NULL OR userName = 'Inconnu' THEN 1 ELSE 0 END) as missing_user,
                COUNT(DISTINCT userName) as unique_users
            FROM locker_history
        `, (err, row) => {
            if (!err) {
                report.push(`Total actions casiers: ${row.total}`);
                report.push(`Actions sans userName: ${row.missing_user} (${(row.missing_user/row.total*100).toFixed(1)}%)`);
                report.push(`Utilisateurs uniques: ${row.unique_users}`);
            }
            resolve();
        });
    });

    await new Promise((resolve) => {
        db.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN userName IS NULL OR userName = 'Inconnu' THEN 1 ELSE 0 END) as missing_user
            FROM client_imports
        `, (err, row) => {
            if (!err) {
                report.push(`\nTotal imports clients: ${row.total}`);
                report.push(`Imports sans userName: ${row.missing_user}`);
            }
            resolve();
        });
    });

    // 2. Actions par type
    report.push('\n\n## 2. RÉPARTITION PAR TYPE D\'ACTION\n');
    
    await new Promise((resolve) => {
        db.all(`
            SELECT 
                action,
                COUNT(*) as count,
                SUM(CASE WHEN userName IS NULL OR userName = 'Inconnu' THEN 1 ELSE 0 END) as missing
            FROM locker_history
            GROUP BY action
            ORDER BY count DESC
        `, (err, rows) => {
            if (!err) {
                rows.forEach(row => {
                    const pct = (row.missing / row.count * 100).toFixed(1);
                    report.push(`${row.action.padEnd(20)} : ${row.count.toString().padStart(5)} (${row.missing} sans user = ${pct}%)`);
                });
            }
            resolve();
        });
    });

    // 3. Utilisateurs les plus actifs
    report.push('\n\n## 3. TOP 10 UTILISATEURS\n');
    
    await new Promise((resolve) => {
        db.all(`
            SELECT 
                userName,
                COUNT(*) as count
            FROM locker_history
            WHERE userName IS NOT NULL AND userName != 'Inconnu'
            GROUP BY userName
            ORDER BY count DESC
            LIMIT 10
        `, (err, rows) => {
            if (!err) {
                rows.forEach((row, i) => {
                    report.push(`${(i+1).toString().padStart(2)}. ${row.userName.padEnd(30)} : ${row.count} actions`);
                });
            }
            resolve();
        });
    });

    // 4. Actions suspectes (sans userName)
    report.push('\n\n## 4. ACTIONS SUSPECTES (sans userName)\n');
    
    await new Promise((resolve) => {
        db.all(`
            SELECT 
                lockerNumber,
                action,
                datetime(timestamp, 'localtime') as time,
                details
            FROM locker_history
            WHERE userName IS NULL OR userName = 'Inconnu'
            ORDER BY timestamp DESC
            LIMIT 20
        `, (err, rows) => {
            if (!err) {
                if (rows.length === 0) {
                    report.push('✅ Aucune action suspecte trouvée');
                } else {
                    report.push(`⚠️  ${rows.length} action(s) sans userName trouvée(s):\n`);
                    rows.forEach(row => {
                        report.push(`  - [${row.time}] ${row.action} sur ${row.lockerNumber}`);
                        if (row.details) report.push(`    ${row.details}`);
                    });
                }
            }
            resolve();
        });
    });

    // 5. Timeline des dernières 24h
    report.push('\n\n## 5. ACTIVITÉ DES DERNIÈRES 24H\n');
    
    await new Promise((resolve) => {
        db.all(`
            SELECT 
                strftime('%Y-%m-%d %H:00', timestamp, 'localtime') as hour,
                COUNT(*) as count
            FROM locker_history
            WHERE timestamp > datetime('now', '-1 day')
            GROUP BY hour
            ORDER BY hour DESC
        `, (err, rows) => {
            if (!err) {
                rows.forEach(row => {
                    const bar = '█'.repeat(Math.ceil(row.count / 2));
                    report.push(`${row.hour}  ${bar} (${row.count})`);
                });
            }
            resolve();
        });
    });

    // 6. Imports clients
    report.push('\n\n## 6. HISTORIQUE IMPORTS CLIENTS\n');
    
    await new Promise((resolve) => {
        db.all(`
            SELECT 
                datetime(importDate, 'localtime') as time,
                recordCount,
                userName
            FROM client_imports
            ORDER BY importDate DESC
            LIMIT 10
        `, (err, rows) => {
            if (!err) {
                rows.forEach(row => {
                    const user = row.userName || '⚠️  NON RENSEIGNÉ';
                    report.push(`[${row.time}] ${row.recordCount.toString().padStart(5)} records par ${user}`);
                });
            }
            resolve();
        });
    });

    db.close();

    // Générer le fichier
    const reportText = report.join('\n');
    const reportPath = path.join(__dirname, 'audit-report.txt');
    fs.writeFileSync(reportPath, reportText, 'utf8');

    console.log(reportText);
    console.log('\n' + '='.repeat(80));
    console.log(`\n📄 Rapport sauvegardé: ${reportPath}\n`);
}

generateAuditReport();