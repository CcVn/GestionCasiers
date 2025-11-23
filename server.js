// ROUTINE CSV INTERNE - Fichier Maître

// Charger les variables d'environnement
require('dotenv').config({path: './config.env'});
process.env.TZ = 'UTC';

const express = require('express');
const path = require('path');

// Import des modules
const { setupMiddleware } = require('./src/middleware');
const { initializeDatabase } = require('./src/database/init');
const { setupAutoBackup } = require('./src/utils/auto-backup');
const { getLocalIP, getClientIP } = require('./src/utils/misc-utils');

// Import des routes
const authRoutes = require('./src/routes/auth');
const lockerRoutes = require('./src/routes/lockers');
const clientRoutes = require('./src/routes/clients');
const statsRoutes = require('./src/routes/stats');
const exportRoutes = require('./src/routes/export');
const importRoutes = require('./src/routes/import');
const backupRoutes = require('./src/routes/backup');
const configRoutes = require('./src/routes/config');

const isProduction = process.env.NODE_ENV === 'production';
const VERBOSE = true;

// Créer l'application Express
const app = express();

// Configuration des middlewares
setupMiddleware(app);

// Initialiser les services
const { startSessionCleanup } = require('./src/services/session');
startSessionCleanup();

// Initialiser la base de données
initializeDatabase().then(() => {
    if (!isProduction && VERBOSE) {
        console.log('✓ Base de données initialisée');
    }
}).catch(err => {
    console.error('❌ Erreur initialisation base de données:', err);
    process.exit(1);
});

// Monter les routes
app.use('/api', authRoutes);
app.use('/api/lockers', lockerRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api', exportRoutes);
app.use('/api', importRoutes);
app.use('/api', backupRoutes);
app.use('/api', configRoutes);

// Route spéciale pour vider tous les casiers (hors de /lockers pour éviter les conflits)
app.delete('/api/admin/clear-all-lockers', (req, res, next) => {
    const { requireAuth } = require('./src/middleware/auth');
    requireAuth(req, res, () => {
        const csrfProtection = app.get('csrfProtection');
        csrfProtection(req, res, async () => {
            try {
                const { getSession } = require('./src/services/session');
                const { dbRun } = require('./src/database');
                const { recordHistory } = require('./src/services/history');
                //const { getClientIP } = require('./src/utils/misc-utils');
                
                const token = req.cookies.auth_token;
                const session = getSession(token);
                const isAdmin = session?.isAdmin;
                
                if (!isAdmin) {
                    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
                }
                
                const userName = session?.userName || 'Inconnu';
                
                console.log('🗑️ Libération de tous les casiers...');
                
                const result = await dbRun(
                    `UPDATE lockers 
                     SET occupied = 0, recoverable = 0, name = '', firstName = '', code = '', 
                         birthDate = '', comment = '', marque = 0, hosp = 0, hospDate = '', 
                         idel = 0, stup = 0, frigo = 0, pca = 0, meopa = 0,
                         updatedAt = CURRENT_TIMESTAMP, updatedBy = ?, version = version + 1
                     WHERE occupied = 1`,
                    [userName]
                );
                
                const count = result.changes || 0;
                
                await recordHistory('ALL', 'CLEAR_ALL', userName, 'admin', `${count} casiers libérés`);
                
                console.log(`✓ ${count} casiers libérés`);
             
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
    });
});

// Route pour obtenir l'IP du client
app.get('/api/client-ip', (req, res) => {
  const clientIP = getClientIP(req);
  res.json({ ip: clientIP });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), database: 'SQLite' });
});

// Rapports helmet CSP
app.post('/csp-report', express.json(), (req, res) => {
  const report = req.body;
  console.log('Violation CSP rapportée :', report);
  res.status(204).end();
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
    console.log(`✓ Prêt pour accès réseau`);
  }

  // Configurer les backups automatiques
  setupAutoBackup();
});
