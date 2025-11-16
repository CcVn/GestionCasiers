// Routes pour les statistiques

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { dbAll, dbGet } = require('../database');

// GET statistiques générales
router.get('/', async (req, res) => {
    try {
        const total = await dbGet('SELECT COUNT(*) as count FROM lockers');
        const occupied = await dbGet('SELECT COUNT(*) as count FROM lockers WHERE occupied = 1');
        
        const byZone = await dbAll(
            `SELECT zone, COUNT(*) as total, SUM(CASE WHEN occupied = 1 THEN 1 ELSE 0 END) as occupied
             FROM lockers
             GROUP BY zone`
        );

        res.json({
            total: total.count,
            occupied: occupied.count,
            empty: total.count - occupied.count,
            byZone: byZone
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET statistiques de connexion
router.get('/connections', async (req, res) => {
    try {
        const { days } = req.query;
        const daysLimit = parseInt(days) || 30;
        
        const stats = await dbAll(
            `SELECT date, role, count 
             FROM connection_stats 
             WHERE date >= date('now', '-${daysLimit} days')
             ORDER BY date DESC, role`,
            []
        );
        
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET statistiques de connexion agrégées
router.get('/connections/summary', async (req, res) => {
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const weekStart = startOfWeek.toISOString().split('T')[0];
        
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthStart = startOfMonth.toISOString().split('T')[0];
        
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const yearStart = startOfYear.toISOString().split('T')[0];
        
        const todayStats = await dbAll(
            `SELECT role, SUM(count) as total 
             FROM connection_stats 
             WHERE date = ?
             GROUP BY role`,
            [today]
        );
        
        const weekStats = await dbAll(
            `SELECT role, SUM(count) as total 
             FROM connection_stats 
             WHERE date >= ?
             GROUP BY role`,
            [weekStart]
        );
        
        const monthStats = await dbAll(
            `SELECT role, SUM(count) as total 
             FROM connection_stats 
             WHERE date >= ?
             GROUP BY role`,
            [monthStart]
        );
        
        const yearStats = await dbAll(
            `SELECT role, SUM(count) as total 
             FROM connection_stats 
             WHERE date >= ?
             GROUP BY role`,
            [yearStart]
        );
        
        const last7Days = await dbAll(
            `SELECT date, role, SUM(count) as count 
             FROM connection_stats 
             WHERE date >= date('now', '-7 days')
             GROUP BY date, role
             ORDER BY date DESC`,
            []
        );
        
        const totalStats = await dbAll(
            `SELECT role, SUM(count) as total 
             FROM connection_stats 
             GROUP BY role`,
            []
        );

        const recentConnections = await dbAll(
            `SELECT 
              id,
              timestamp,
              role,
              userName,
              ipAddress
             FROM connection_logs 
             ORDER BY timestamp DESC 
             LIMIT 15`,
            []
        );
        
        const formatStats = (stats) => {
            const admin = stats.find(s => s.role === 'admin')?.total || 0;
            const guest = stats.find(s => s.role === 'guest')?.total || 0;
            return { admin, guest, total: admin + guest };
        };
        
        res.json({
            today: formatStats(todayStats),
            week: formatStats(weekStats),
            month: formatStats(monthStats),
            year: formatStats(yearStats),
            total: formatStats(totalStats),
            last7Days: last7Days,
            recentConnections: recentConnections
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET statistiques des modifications de casiers
router.get('/modifications', requireAuth, async (req, res) => {
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const weekStart = startOfWeek.toISOString().split('T')[0];
        
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthStart = startOfMonth.toISOString().split('T')[0];
        
        const todayStats = await dbGet(
            `SELECT COUNT(*) as count 
             FROM locker_history 
             WHERE DATE(timestamp) = ?`,
            [today]
        );
        
        const weekStats = await dbGet(
            `SELECT COUNT(*) as count 
             FROM locker_history 
             WHERE DATE(timestamp) >= ?`,
            [weekStart]
        );
        
        const monthStats = await dbGet(
            `SELECT COUNT(*) as count 
             FROM locker_history 
             WHERE DATE(timestamp) >= ?`,
            [monthStart]
        );
        
        const totalStats = await dbGet(
            `SELECT COUNT(*) as count FROM locker_history`
        );
        
        const byAction = await dbAll(
            `SELECT action, COUNT(*) as count 
             FROM locker_history 
             GROUP BY action 
             ORDER BY count DESC`
        );
        
        const recentModifications = await dbAll(
            `SELECT 
              h.id,
              h.lockerNumber,
              h.action,
              h.userName,
              h.userRole,
              h.details,
              h.timestamp,
              l.name,
              l.firstName,
              l.code,
              l.zone
             FROM locker_history h
             LEFT JOIN lockers l ON h.lockerNumber = l.number
             ORDER BY h.timestamp DESC 
             LIMIT 10`
        );
        
        const topUsers = await dbAll(
            `SELECT userName, COUNT(*) as count 
             FROM locker_history 
             WHERE userName IS NOT NULL AND userName != ''
             GROUP BY userName 
             ORDER BY count DESC 
             LIMIT 5`
        );
        
        const dailyActivity = await dbAll(
            `SELECT 
              DATE(timestamp) as date,
              COUNT(*) as count
             FROM locker_history 
             WHERE DATE(timestamp) >= date('now', '-7 days')
             GROUP BY DATE(timestamp)
             ORDER BY date DESC`
        );
        
        res.json({
            today: todayStats.count,
            week: weekStats.count,
            month: monthStats.count,
            total: totalStats.count,
            byAction: byAction,
            recentModifications: recentModifications,
            topUsers: topUsers,
            dailyActivity: dailyActivity
        });
    } catch (err) {
        console.error('Erreur stats modifications:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
