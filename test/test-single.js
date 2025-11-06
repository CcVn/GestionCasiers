// test/test-single.js

// Run : node test/test-single.js

const fetch = require('node-fetch');

async function testSingleFeature() {
    const API_URL = 'http://localhost:5000/api';
    let cookies = {};
    let csrfToken = null;

    // Helper pour gérer les cookies
    async function fetchWithCookies(url, options = {}) {
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');

        const headers = {
            'Content-Type': 'application/json',
            'Cookie': cookieString,
            ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });

        const setCookie = response.headers.raw()['set-cookie'];
        if (setCookie) {
            setCookie.forEach(cookie => {
                const [nameValue] = cookie.split(';');
                const [name, value] = nameValue.split('=');
                cookies[name.trim()] = value.trim();
            });
        }

        return response;
    }

    try {
        console.log('🔐 Obtention token CSRF...');
        let res = await fetchWithCookies(`${API_URL}/csrf-token`);
        const csrf = await res.json();
        csrfToken = csrf.csrfToken;
        console.log('✅ Token CSRF:', csrfToken.substring(0, 20) + '...');

        console.log('\n🔑 Connexion admin...');
        res = await fetchWithCookies(`${API_URL}/login`, {
            method: 'POST',
            body: JSON.stringify({
                password: 'votre-mot-de-passe', // ⬅️ METTRE VOTRE MOT DE PASSE
                userName: 'TEST_USER'
            })
        });
        const loginData = await res.json();
        console.log('✅ Connecté:', loginData);

        console.log('\n📦 Test libération casier N01...');
        
        // Créer un casier
        res = await fetchWithCookies(`${API_URL}/lockers`, {
            method: 'POST',
            body: JSON.stringify({
                number: 'N01',
                zone: 'NORD',
                name: 'DUPONT',
                firstName: 'Jean',
                code: '123456',
                birthDate: '1980-01-15',
                recoverable: false
            })
        });
        console.log('✅ Casier N01 créé');

        // Libérer le casier
        res = await fetchWithCookies(`${API_URL}/lockers/N01`, {
            method: 'DELETE'
        });
        const releaseResult = await res.json();
        console.log('✅ Casier N01 libéré:', releaseResult);

        // Vérifier l'historique
        res = await fetchWithCookies(`${API_URL}/lockers/N01/history`);
        const history = await res.json();
        
        console.log('\n📋 Historique du casier N01:');
        history.forEach(log => {
            console.log(`  ${log.action} par ${log.userName} le ${log.timestamp}`);
        });

        const liberationLog = history.find(h => h.action === 'LIBÉRATION');
        
        if (liberationLog && liberationLog.userName === 'TEST_USER') {
            console.log('\n✅ ✅ ✅ TEST RÉUSSI ! userName correctement enregistré');
        } else {
            console.log('\n❌ ❌ ❌ TEST ÉCHOUÉ ! userName non trouvé ou incorrect');
            console.log('Log trouvé:', liberationLog);
        }

    } catch (err) {
        console.error('❌ Erreur:', err.message);
        console.error(err);
    }
}

testSingleFeature();