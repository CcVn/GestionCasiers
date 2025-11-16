// Configuration des middlewares

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { isProduction, VERBOSE } = require('../config');
const { generalLimiter } = require('./rate-limit');

function setupMiddleware(app) {
    // CORS
    app.use(cors({
        origin: true,
        credentials: true
    }));
    
    // Body parser
    app.use(express.json({limit: '50mb'}));
    app.use(cookieParser());
    
    // Protection CSRF
    const csrfProtection = csrf({ 
        cookie: {
            httpOnly: false,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        }
    });
    
    // Rate limiting
    app.use('/api/', generalLimiter);
    
    // Helmet
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrcAttr: ["'unsafe-inline'"],
                    imgSrc: ["'self'", "data:"],
                    connectSrc: ["'self'"],
                    frameSrc: ["'none'"],
                    objectSrc: ["'none'"],
                    fontSrc: ["'self'"],
                    baseUri: ["'self'"],
                    formAction: ["'self'"]
                },
                reportOnly: true,
                reportUri: '/csp-report',
                browserSniff: false
            },
            frameguard: { action: 'deny' },
            hidePoweredBy: true,
            xssFilter: true
        })
    );
    
    // Vérifier le dossier public
    const publicPath = path.join(__dirname, '../../public');
    if (!fs.existsSync(publicPath)) {
        console.warn('⚠️ ATTENTION: Dossier "public" introuvable à :', publicPath);
        console.warn('   Créez le dossier "public" et y mettre le fichier index.html');
    } else {
        if (!isProduction && VERBOSE) console.log('✓ Dossier public trouvé:', publicPath);
    }
    
    app.use(express.static('public'));
    
    // Route par défaut pour servir index.html
    app.get('/', (req, res) => {
        const filePath = path.join(__dirname, '../../public', 'index.html');
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('<h1>404 - index.html non trouvé</h1><p>Créez un fichier public/index.html</p>');
        }
    });
    
    // Rendre csrfProtection disponible pour les routes
    app.set('csrfProtection', csrfProtection);
}

module.exports = {
    setupMiddleware
};
