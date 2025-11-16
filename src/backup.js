// Service de backup automatique

const fs = require('fs');
const path = require('path');
const { dbPath } = require('./database');
const { BACKUP_TIME, BACKUP_FREQUENCY_HOURS, BACKUP_RETENTION_COUNT, isProduction, VERBOSE } = require('./config');

function setupAutoBackup() {
    const backupDir = path.join(__dirname, '../backups');
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
    
    // MODE 1 : Backup à heure fixe (prioritaire)
    if (BACKUP_TIME) {
        const [hours, minutes] = BACKUP_TIME.split(':').map(n => parseInt(n));
        
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            console.error('❌ BACKUP_TIME invalide:', BACKUP_TIME);
            console.error('   Format attendu: HH:MM (ex: 00:00, 02:30, 23:45)');
            return;
        }
        
        // Calculer le délai jusqu'au prochain backup
        const scheduleNextBackup = () => {
            const now = new Date();
            const target = new Date();
            target.setHours(hours, minutes, 0, 0);
            
            // Si l'heure est déjà passée aujourd'hui, programmer pour demain
            if (target <= now) {
                target.setDate(target.getDate() + 1);
            }
            
            const delay = target - now;
            const delayHours = Math.floor(delay / (1000 * 60 * 60));
            const delayMinutes = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));
            
            if (!isProduction && VERBOSE) {
                console.log(`⏰ Prochain backup programmé pour ${target.toLocaleString('fr-FR')} (dans ${delayHours}h ${delayMinutes}min)`);
            }
            
            return setTimeout(() => {
                createBackup();
                scheduleNextBackup();
            }, delay);
        };
        
        // Backup initial au démarrage
        createBackup();
        
        // Programmer le premier backup
        scheduleNextBackup();
        
        if (!isProduction && VERBOSE) {
            console.log(`✓ Backup automatique quotidien activé à ${BACKUP_TIME}`);
        }
        
    } 
    // MODE 2 : Backup périodique (fallback)
    else if (BACKUP_FREQUENCY_HOURS > 0) {
        // Backup initial
        createBackup();
        
        // Backup périodique
        const intervalMs = BACKUP_FREQUENCY_HOURS * 60 * 60 * 1000;
        setInterval(createBackup, intervalMs);
        
        if (!isProduction && VERBOSE) {
            console.log(`✓ Backup automatique périodique activé (toutes les ${BACKUP_FREQUENCY_HOURS}h, ${BACKUP_RETENTION_COUNT} fichiers conservés)`);
        }
    } 
    // MODE 3 : Désactivé
    else {
        if (!isProduction && VERBOSE) console.log('⏭️ Backups automatiques désactivés');
    }
}

module.exports = {
    setupAutoBackup
};
