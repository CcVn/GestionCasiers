/*======== Routes d'authentification ===============

- GET Récupérer le token CSRF : /csrf-token
- POST login : /logout
- POST logout : /login
- GET vérifier le rôle de l'utilisateur : /auth/check
- GET temps restant avant expiration de la session: /session/time-remaining
*/

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { loginSchema } = require('../models/schemas');
const { ADMIN_PASSWORD_HASH, getAnonymizeAdmin, getAnonymizeGuest, DARK_MODE, isProduction, VERBOSE } = require('../config');
const { generateToken, getClientIP } = require('../utils');
const { createSession, getSession, deleteSession } = require('../services/session');
const { recordConnection } = require('../services/history');
const { loginLimiter } = require('../middleware/rate-limit');

// Récupérer csrfProtection depuis l'app
const getCsrfProtection = (req) => req.app.get('csrfProtection');

// GET Récupérer le token CSRF
router.get('/csrf-token', (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, () => {
        res.json({ csrfToken: req.csrfToken() });
    });
});

// POST Login
router.post('/login', loginLimiter, (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, async () => {
        try {
            // Validation Zod
            const validationResult = loginSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({ 
                    error: validationResult.error.errors[0].message
                });
            }
            
            const { password, userName } = validationResult.data;
            
            // Vérifier le mot de passe
            let isPasswordValid = false;
            if (ADMIN_PASSWORD_HASH) {
                isPasswordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
            }

            if (isPasswordValid) {
                // Login admin
                const clientIP = getClientIP(req);
                const finalUserName = (userName && userName.trim() !== '') 
                    ? userName.trim() 
                    : clientIP;

                const token = generateToken();
                createSession(token, {
                    isAdmin: true,
                    userName: finalUserName
                });

                if (!isProduction && VERBOSE) console.log("Username: ", finalUserName);

                res.cookie('auth_token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 24 * 60 * 60 * 1000
                });
                
                await recordConnection('admin', finalUserName, clientIP);
                
                res.json({
                    success: true,
                    role: 'admin',
                    userName: finalUserName,
                    anonymize: getAnonymizeAdmin(),
                    darkMode: DARK_MODE
                });

            } else if (!password || password === '') {
                // Login guest
                const token = generateToken();
                createSession(token, {
                    isAdmin: false,
                    userName: 'guest'
                });
                
                res.cookie('auth_token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 24 * 60 * 60 * 1000
                });
                
                const clientIP = getClientIP(req);
                await recordConnection('guest', null, clientIP);
                
                res.json({
                    success: true,
                    role: 'guest',
                    anonymize: getAnonymizeGuest(),
                    darkMode: DARK_MODE
                });
            } else {
                res.status(401).json({ error: 'Mot de passe incorrect' });
            }
        } catch (err) {
            console.error('Erreur login:', err);
            res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
        }
    });
});

// POST Logout
router.post('/logout', (req, res, next) => {
    const csrfProtection = getCsrfProtection(req);
    csrfProtection(req, res, () => {
        const token = req.cookies.auth_token;
        if (token) {
            deleteSession(token);
        }
        
        res.clearCookie('auth_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        
        res.json({ success: true });
    });
});

// GET vérifier le rôle de l'utilisateur
router.get('/auth/check', (req, res) => {
    const token = req.cookies.auth_token;
    
    if (!token || !getSession(token)) {
        return res.status(401).json({ authenticated: false });
    }
    
    const session = getSession(token);
    const isAdmin = session.isAdmin;
    
    res.json({
        authenticated: true,
        role: isAdmin ? 'admin' : 'guest',
        userName: session.userName || '',
        anonymize: isAdmin ? getAnonymizeAdmin() : getAnonymizeGuest(),
        darkMode: DARK_MODE
    });
});

// GET temps restant avant expiration
router.get('/session/time-remaining', (req, res, next) => {
    const { requireAuth } = require('../middleware/auth');
    requireAuth(req, res, () => {
        const token = req.cookies.auth_token;
        const session = getSession(token);
        
        if (!session) {
            return res.status(401).json({ error: 'Session non trouvée' });
        }
        
        const { SESSION_DURATION_MS } = require('../config');
        const now = Date.now();
        const elapsed = now - session.createdAt;
        const remaining = SESSION_DURATION_MS - elapsed;
        const remainingMinutes = Math.floor(remaining / 60000);
        
        res.json({
            expiresIn: remaining,
            expiresInMinutes: remainingMinutes,
            expiresAt: new Date(session.createdAt + SESSION_DURATION_MS).toISOString()
        });
    });
});

module.exports = router;
