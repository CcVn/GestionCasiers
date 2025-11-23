// Routes pour la gestion des backups

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { dbPath } = require('../database');
const { restoreSchema } = require('../models/schemas');
const { backupLimiter } = require('../middleware/rate-limit');
const { BACKUP_RETENTION_COUNT, isProduction, VERBOSE } = require('../config');

const getCsrfProtection = (req) => req.app.get('csrfProtection');

// GET liste des backups disponibles
router.get('/backups', requireAuth, backupLimiter, async (req, res) => {
    try {
        const backupDir = path.join(__dirname, '../../backups');
        
        if (!fs.existsSync(backupDir)) {
            return res.json({ backups: [] });
        }
        
        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.db'))
            .map(f => {
                const filePath = path.join(backupDir, f);
                const stats = fs.statSync(filePath);
                return {
                    filename: f,
                    size: stats.size,
                    date: stats.mtime,
                    path: filePath
                };
            })
            .sort((a, b) => b.date - a.date);
        
        res.json({ backups: files });
    } catch (err) {
        console.error('Erreur liste backups:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST restaurer un backup
router.post('/restore', requireAuth, backupLimiter, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            if (!isProduction && VERBOSE) console.log('📥 Requête restore reçue:', req.body);
            
            // Validation Zod
            const validationResult = restoreSchema.safeParse(req.body);
            if (!validationResult.success) {
                console.error('❌ Validation Zod échouée:', validationResult.error);
                return res.status(400).json({ 
                    error: 'Données invalides',
                    details: validationResult.error.errors?.map(e => e.message).join(', ') || 'Validation failed'
                });
            }
            
            const { filename, fileData } = validationResult.data;
            
            if (!isProduction && VERBOSE) {
                console.log('Filename:', filename);
                console.log('FileData présent:', !!fileData);
            }
            
            // Créer un backup de sécurité avant restauration
            const backupDir = path.join(__dirname, '../../backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir);
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const safetyBackupPath = path.join(backupDir, `backup_before_restore_${timestamp}.db`);
            
            if (!isProduction && VERBOSE) console.log('🔒 Création backup de sécurité...');
            fs.copyFileSync(dbPath, safetyBackupPath);
            if (!isProduction && VERBOSE) console.log('✓ Backup de sécurité créé:', path.basename(safetyBackupPath));
            
            let restorePath;
            
            // Fichier uploadé (base64)
            if (fileData) {
                if (!isProduction && VERBOSE) console.log('📤 Restauration depuis fichier uploadé...');
                
                const buffer = Buffer.from(fileData, 'base64');
                const tempPath = path.join(backupDir, `temp_restore_${timestamp}.db`);
                fs.writeFileSync(tempPath, buffer);
                restorePath = tempPath;
                
            } else if (filename) {
                // Restauration depuis un backup existant
                if (!isProduction && VERBOSE) console.log('📁 Restauration depuis backup existant:', filename);
                restorePath = path.join(backupDir, filename);
                
                if (!fs.existsSync(restorePath)) {
                    throw new Error('Fichier backup non trouvé');
                }
            } else {
                throw new Error('Aucun fichier spécifié');
            }
            
            // Vérifier que c'est bien une base SQLite
            if (!isProduction && VERBOSE) console.log('🔍 Vérification du fichier...');
            const fileBuffer = fs.readFileSync(restorePath);
            const header = fileBuffer.toString('utf8', 0, 16);
            
            if (!header.startsWith('SQLite format 3')) {
                if (fileData) fs.unlinkSync(restorePath);
                throw new Error('Fichier invalide : ce n\'est pas une base SQLite');
            }
            
            // Fermer la connexion actuelle
            if (!isProduction && VERBOSE) console.log('🔌 Fermeture connexion base actuelle...');
            const { getDb } = require('../database');
            const db = getDb();
            await new Promise((resolve, reject) => {
                db.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            // Remplacer la base de données
            if (!isProduction && VERBOSE) console.log('🔄 Remplacement de la base...');
            fs.copyFileSync(restorePath, dbPath);
            
            // Nettoyer le fichier temporaire
            if (fileData) {
                fs.unlinkSync(restorePath);
            }
            
            if (!isProduction && VERBOSE) {
                console.log('✅ Base restaurée avec succès');
                console.log('⚠️ REDÉMARRAGE DU SERVEUR NÉCESSAIRE');
            }

            res.json({
                success: true,
                message: 'Base restaurée avec succès. Redémarrage du serveur nécessaire.',
                safetyBackup: path.basename(safetyBackupPath)
            });
            
            // Redémarrer le serveur
            setTimeout(() => {
                if (!isProduction && VERBOSE) console.log('🔄 Redémarrage du serveur...');
                const now = new Date();
                fs.utimesSync(__filename, now, now);
            }, 1000);

        } catch (err) {
            if (!isProduction && VERBOSE) console.error('❌ Erreur restauration:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// POST créer un backup manuel
router.post('/backup', requireAuth, backupLimiter, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            const backupDir = path.join(__dirname, '../../backups');
            
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir);
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const backupPath = path.join(backupDir, `backup_${timestamp}.db`);
            
            fs.copyFileSync(dbPath, backupPath);
            
            const stats = fs.statSync(backupPath);
            
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
            
            res.json({
                success: true,
                filename: path.basename(backupPath),
                size: stats.size,
                path: backupPath
            });
        } catch (err) {
            console.error('Erreur backup:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

module.exports = router;
