// ROUTINE CSV INTERNE - Fichier Maître

// Charger les variables d'environnement
require('dotenv').config({path: './config.env'});
process.env.TZ = 'UTC';

const express = require('express');
const path = require('path');

// Import des modules
const { setupMiddleware } = require('./src/middleware');
const { initializeDatabase } = require('./src/database/init');
const { setupAutoBackup } = require('./src/backup');
const { getLocalIP, getClientIP } = require('./src/utils');

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
