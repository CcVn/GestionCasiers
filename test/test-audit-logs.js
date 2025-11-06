/* Script de test principal pour l'audit des logs
 test/test-audit-logs.js

 Installation et exécution
# 1. Installer node-fetch pour les tests
npm install --save-dev node-fetch@2.7.0

# 2. Configurer le fichier test-config.js
# Éditer test/test-config.js et mettre votre mot de passe admin

# 3. Lancer le serveur (dans un terminal)
npm run dev

# 4. Lancer les tests (dans un autre terminal)
npm run test:audit */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const config = require('./test-config');

// Couleurs pour la console
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

class AuditLogTester {
    constructor() {
        this.results = [];
        this.cookies = {};
        this.csrfToken = null;
    }

    log(message, color = 'reset') {
        if (config.VERBOSE) {
            console.log(`${colors[color]}${message}${colors.reset}`);
        }
    }

    addResult(test, passed, details = '', error = null) {
        this.results.push({
            test,
            passed,
            details,
            error: error ? error.message : null,
            timestamp: new Date().toISOString()
        });
        
        const icon = passed ? '✅' : '❌';
        const color = passed ? 'green' : 'red';
        this.log(`${icon} ${test}`, color);
        if (details) this.log(`   ${details}`, 'cyan');
        if (error) this.log(`   Erreur: ${error.message}`, 'red');
    }

    async fetchWithCookies(url, options = {}) {
        const cookieString = Object.entries(this.cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');

        const headers = {
            'Content-Type': 'application/json',
            'Cookie': cookieString,
            ...(this.csrfToken && { 'X-CSRF-Token': this.csrfToken }),
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        // Capturer les cookies de la réponse
        const setCookie = response.headers.raw()['set-cookie'];
        if (setCookie) {
            setCookie.forEach(cookie => {
                const [nameValue] = cookie.split(';');
                const [name, value] = nameValue.split('=');
                this.cookies[name.trim()] = value.trim();
            });
        }

        return response;
    }

    async getCsrfToken() {
        try {
            const response = await this.fetchWithCookies(`${config.API_URL}/csrf-token`);
            const data = await response.json();
            this.csrfToken = data.csrfToken;
            this.log('🔐 Token CSRF obtenu', 'cyan');
            return true;
        } catch (err) {
            this.addResult('Obtention token CSRF', false, '', err);
            return false;
        }
    }

    async login() {
        try {
            const response = await this.fetchWithCookies(`${config.API_URL}/login`, {
                method: 'POST',
                body: JSON.stringify({
                    password: config.ADMIN_PASSWORD,
                    userName: config.ADMIN_USERNAME
                })
            });

            if (!response.ok) {
                throw new Error(`Login échoué: ${response.status}`);
            }

            const data = await response.json();
            this.addResult('Connexion admin', true, `Utilisateur: ${config.ADMIN_USERNAME}`);
            return true;
        } catch (err) {
            this.addResult('Connexion admin', false, '', err);
            return false;
        }
    }

    async testLockerRelease() {
        this.log('\n📦 TEST 1: Libération d\'un casier', 'blue');
        
        try {
            // 1. Créer un casier occupé
            await this.fetchWithCookies(`${config.API_URL}/lockers`, {
                method: 'POST',
                body: JSON.stringify(config.TEST_DATA.locker)
            });

            // 2. Libérer le casier
            const releaseResponse = await this.fetchWithCookies(
                `${config.API_URL}/lockers/${config.TEST_DATA.locker.number}`,
                { method: 'DELETE' }
            );

            if (!releaseResponse.ok) {
                throw new Error(`Libération échouée: ${releaseResponse.status}`);
            }

            // 3. Vérifier le log
            const historyResponse = await this.fetchWithCookies(
                `${config.API_URL}/lockers/${config.TEST_DATA.locker.number}/history`
            );
            const history = await historyResponse.json();

            const liberationLog = history.find(h => h.action === 'LIBÉRATION');
            
            if (!liberationLog) {
                throw new Error('Log de libération non trouvé');
            }

            if (!liberationLog.userName || liberationLog.userName === 'Inconnu') {
                throw new Error(`userName manquant ou invalide: ${liberationLog.userName}`);
            }

            if (liberationLog.userName !== config.ADMIN_USERNAME) {
                this.addResult(
                    'Libération casier - userName',
                    false,
                    `Attendu: ${config.ADMIN_USERNAME}, Obtenu: ${liberationLog.userName}`
                );
            } else {
                this.addResult(
                    'Libération casier - userName',
                    true,
                    `userName correctement enregistré: ${liberationLog.userName}`
                );
            }

        } catch (err) {
            this.addResult('Libération casier', false, '', err);
        }
    }

    async testLockerTransfer() {
        this.log('\n🔄 TEST 2: Transfert de casier', 'blue');
        
        try {
            // 1. Créer un casier occupé (N01)
            await this.fetchWithCookies(`${config.API_URL}/lockers`, {
                method: 'POST',
                body: JSON.stringify(config.TEST_DATA.locker)
            });

            // 2. Transférer vers N02
            const transferData = {
                ...config.TEST_DATA.locker,
                number: 'N02'
            };

            await this.fetchWithCookies(`${config.API_URL}/lockers`, {
                method: 'POST',
                body: JSON.stringify(transferData)
            });

            // 3. Vérifier les logs de N01 (ancien casier)
            const historyN01 = await this.fetchWithCookies(
                `${config.API_URL}/lockers/N01/history`
            );
            const logsN01 = await historyN01.json();

            // Trouver le log de libération
            const releaseLog = logsN01.find(h => 
                h.action === 'LIBÉRATION' || h.action === 'TRANSFERT'
            );

            if (!releaseLog) {
                throw new Error('Log de libération/transfert non trouvé pour N01');
            }

            if (!releaseLog.userName || releaseLog.userName === 'Inconnu') {
                throw new Error(`userName manquant dans log N01: ${releaseLog.userName}`);
            }

            this.addResult(
                'Transfert casier - libération ancien',
                releaseLog.userName === config.ADMIN_USERNAME,
                `Log N01 (ancien): ${releaseLog.action} par ${releaseLog.userName}`
            );

            // 4. Vérifier les logs de N02 (nouveau casier)
            const historyN02 = await this.fetchWithCookies(
                `${config.API_URL}/lockers/N02/history`
            );
            const logsN02 = await historyN02.json();

            const createLog = logsN02.find(h => h.action === 'ATTRIBUTION');

            if (!createLog || createLog.userName !== config.ADMIN_USERNAME) {
                throw new Error('Log attribution N02 invalide');
            }

            this.addResult(
                'Transfert casier - attribution nouveau',
                true,
                `Log N02 (nouveau): ATTRIBUTION par ${createLog.userName}`
            );

            // Cleanup
            await this.fetchWithCookies(`${config.API_URL}/lockers/N02`, {
                method: 'DELETE'
            });

        } catch (err) {
            this.addResult('Transfert casier', false, '', err);
        }
    }

    async testClientImport() {
        this.log('\n📥 TEST 3: Import clients', 'blue');
        
        try {
            // 1. Créer un fichier CSV de test
            const csvContent = `IPP,Nom,Prénom,Nom Naissance,Date Naissance,Sexe,Zone,Date Entrée
${config.TEST_DATA.client.ipp},${config.TEST_DATA.client.name},${config.TEST_DATA.client.firstName},,${config.TEST_DATA.client.birthDate},${config.TEST_DATA.client.sex},${config.TEST_DATA.client.zone},${config.TEST_DATA.client.entryDate}`;

            // 2. Import
            const importResponse = await this.fetchWithCookies(`${config.API_URL}/clients/import`, {
                method: 'POST',
                body: JSON.stringify({
                    rawContent: csvContent,
                    format: 'BASIQUE',
                    mode: 'merge'
                })
            });

            if (!importResponse.ok) {
                throw new Error(`Import échoué: ${importResponse.status}`);
            }

            const importResult = await importResponse.json();

            // 3. Vérifier les logs d'import
            const statsResponse = await this.fetchWithCookies(`${config.API_URL}/clients/stats`);
            const stats = await statsResponse.json();

            if (!stats.lastImport) {
                throw new Error('Aucun log d\'import trouvé');
            }

            if (!stats.lastImport.userName || stats.lastImport.userName === 'Inconnu') {
                throw new Error(`userName manquant dans log import: ${stats.lastImport.userName}`);
            }

            this.addResult(
                'Import clients - userName',
                stats.lastImport.userName === config.ADMIN_USERNAME,
                `userName: ${stats.lastImport.userName}, records: ${stats.lastImport.recordCount}`
            );

        } catch (err) {
            this.addResult('Import clients', false, '', err);
        }
    }

    async testClientClear() {
        this.log('\n🗑️  TEST 4: Effacement base clients', 'blue');
        
        try {
            // 1. Vider la base clients
            const clearResponse = await this.fetchWithCookies(`${config.API_URL}/clients/clear`, {
                method: 'DELETE'
            });

            if (!clearResponse.ok) {
                throw new Error(`Effacement échoué: ${clearResponse.status}`);
            }

            const clearResult = await clearResponse.json();

            // 2. Vérifier que deletedBy est présent
            if (!clearResult.deletedBy) {
                throw new Error('deletedBy manquant dans la réponse');
            }

            this.addResult(
                'Effacement clients - response',
                clearResult.deletedBy === config.ADMIN_USERNAME,
                `deletedBy: ${clearResult.deletedBy}, deleted: ${clearResult.deleted}`
            );

            // 3. Vérifier le log dans client_imports
            const statsResponse = await this.fetchWithCookies(`${config.API_URL}/clients/stats`);
            const stats = await statsResponse.json();

            if (!stats.lastImport) {
                throw new Error('Log d\'effacement non trouvé dans client_imports');
            }

            const isEffacementLog = stats.lastImport.userName.includes('EFFACEMENT');
            const hasUserName = stats.lastImport.userName.includes(config.ADMIN_USERNAME);

            this.addResult(
                'Effacement clients - log',
                isEffacementLog && hasUserName,
                `Log: ${stats.lastImport.userName}`
            );

        } catch (err) {
            this.addResult('Effacement base clients', false, '', err);
        }
    }

    async testLockerClearAll() {
        this.log('\n🗑️  TEST 5: Effacement tous casiers', 'blue');
        
        try {
            // 1. Créer quelques casiers occupés
            for (let i = 1; i <= 3; i++) {
                const locker = {
                    ...config.TEST_DATA.locker,
                    number: `N0${i}`,
                    code: `12345${i}`
                };
                await this.fetchWithCookies(`${config.API_URL}/lockers`, {
                    method: 'POST',
                    body: JSON.stringify(locker)
                });
            }

            // 2. Tout effacer
            const clearResponse = await this.fetchWithCookies(`${config.API_URL}/lockers/clear`, {
                method: 'DELETE'
            });

            if (!clearResponse.ok) {
                throw new Error(`Effacement casiers échoué: ${clearResponse.status}`);
            }

            const clearResult = await clearResponse.json();

            // 3. Vérifier l'historique pour l'action CLEAR_ALL
            const statsResponse = await this.fetchWithCookies(`${config.API_URL}/stats/modifications`);
            const stats = await statsResponse.json();

            const clearAllLog = stats.recentModifications.find(m => m.action === 'CLEAR_ALL');

            if (!clearAllLog) {
                throw new Error('Log CLEAR_ALL non trouvé');
            }

            if (!clearAllLog.userName || clearAllLog.userName === 'Inconnu') {
                throw new Error(`userName manquant: ${clearAllLog.userName}`);
            }

            this.addResult(
                'Effacement tous casiers - log',
                clearAllLog.userName === config.ADMIN_USERNAME,
                `userName: ${clearAllLog.userName}, casiers libérés: ${clearResult.cleared}`
            );

        } catch (err) {
            this.addResult('Effacement tous casiers', false, '', err);
        }
    }

    generateHTMLReport() {
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        const total = this.results.length;
        const successRate = ((passed / total) * 100).toFixed(1);

        const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rapport de test - Audit Logs</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
        }
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header p {
            opacity: 0.9;
            font-size: 14px;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f9fafb;
            border-bottom: 1px solid #e5e7eb;
        }
        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            text-align: center;
        }
        .summary-card .value {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .summary-card .label {
            color: #6b7280;
            font-size: 14px;
        }
        .summary-card.success .value { color: #10b981; }
        .summary-card.error .value { color: #ef4444; }
        .summary-card.rate .value { color: #667eea; }
        .results {
            padding: 30px;
        }
        .test-result {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
        }
        .test-result.passed {
            border-left: 4px solid #10b981;
        }
        .test-result.failed {
            border-left: 4px solid #ef4444;
        }
        .test-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }
        .test-icon {
            font-size: 24px;
        }
        .test-name {
            font-size: 16px;
            font-weight: 600;
            flex: 1;
        }
        .test-timestamp {
            color: #6b7280;
            font-size: 12px;
        }
        .test-details {
            color: #4b5563;
            font-size: 14px;
            margin-top: 10px;
            padding: 10px;
            background: #f9fafb;
            border-radius: 4px;
        }
        .test-error {
            color: #dc2626;
            font-size: 13px;
            margin-top: 10px;
            padding: 10px;
            background: #fef2f2;
            border-radius: 4px;
            border-left: 3px solid #ef4444;
        }
        .footer {
            padding: 20px 30px;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Rapport de test - Audit Logs</h1>
            <p>Test automatisé de l'enregistrement des userName dans les logs</p>
        </div>

        <div class="summary">
            <div class="summary-card success">
                <div class="value">${passed}</div>
                <div class="label">Tests réussis</div>
            </div>
            <div class="summary-card error">
                <div class="value">${failed}</div>
                <div class="label">Tests échoués</div>
            </div>
            <div class="summary-card">
                <div class="value">${total}</div>
                <div class="label">Total</div>
            </div>
            <div class="summary-card rate">
                <div class="value">${successRate}%</div>
                <div class="label">Taux de réussite</div>
            </div>
        </div>

        <div class="results">
            <h2 style="margin-bottom: 20px; color: #1f2937;">Résultats détaillés</h2>
            ${this.results.map(result => `
                <div class="test-result ${result.passed ? 'passed' : 'failed'}">
                    <div class="test-header">
                        <span class="test-icon">${result.passed ? '✅' : '❌'}</span>
                        <span class="test-name">${result.test}</span>
                        <span class="test-timestamp">${new Date(result.timestamp).toLocaleString('fr-FR')}</span>
                    </div>
                    ${result.details ? `<div class="test-details">${result.details}</div>` : ''}
                    ${result.error ? `<div class="test-error"><strong>Erreur:</strong> ${result.error}</div>` : ''}
                </div>
            `).join('')}
        </div>

        <div class="footer">
            Généré le ${new Date().toLocaleString('fr-FR')} | Utilisateur de test: ${config.ADMIN_USERNAME}
        </div>
    </div>
</body>
</html>
        `;

        return html;
    }

    async run() {
        console.log('\n' + '='.repeat(60));
        console.log('🧪 TESTS D\'AUDIT DES LOGS UTILISATEUR');
        console.log('='.repeat(60) + '\n');

        // 1. Obtenir le token CSRF
        if (!await this.getCsrfToken()) {
            this.log('❌ Impossible d\'obtenir le token CSRF. Arrêt des tests.', 'red');
            return;
        }

        // 2. Se connecter
        if (!await this.login()) {
            this.log('❌ Connexion échouée. Arrêt des tests.', 'red');
            return;
        }

        // 3. Exécuter les tests
        await this.testLockerRelease();
        await this.testLockerTransfer();
        await this.testClientImport();
        await this.testClientClear();
        await this.testLockerClearAll();

        // 4. Générer le rapport
        console.log('\n' + '='.repeat(60));
        console.log('📊 RÉSUMÉ DES TESTS');
        console.log('='.repeat(60));

        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        const total = this.results.length;

        console.log(`\n✅ Réussis: ${passed}/${total}`);
        console.log(`❌ Échoués: ${failed}/${total}`);
        console.log(`📈 Taux de réussite: ${((passed/total)*100).toFixed(1)}%\n`);

        // 5. Sauvegarder le rapport HTML
        const html = this.generateHTMLReport();
        const reportPath = path.join(__dirname, 'test-results.html');
        fs.writeFileSync(reportPath, html, 'utf8');

        console.log(`📄 Rapport HTML généré: ${reportPath}`);
        console.log('   Ouvrez ce fichier dans un navigateur pour voir les détails.\n');

        // 6. Exit code
        process.exit(failed > 0 ? 1 : 0);
    }
}

// Exécuter les tests
const tester = new AuditLogTester();
tester.run().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});