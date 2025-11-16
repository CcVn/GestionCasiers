// Services pour historique et statistiques de connexion

const { dbRun, dbGet } = require('../database');

// Enregistrer une connexion dans les stats
async function recordConnection(role, userName = null, ipAddress = null) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // Log individuel
        await dbRun(
            'INSERT INTO connection_logs (role, userName, ipAddress) VALUES (?, ?, ?)',
            [role, userName || null, ipAddress || null]
        );

        // Stats de connexion agrégées
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

// Enregistrer une modification dans l'historique
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

module.exports = {
    recordConnection,
    recordHistory
};
