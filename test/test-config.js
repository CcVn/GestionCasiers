// Configuration du test
// test/test-config.js
module.exports = {
    // URL de l'API (adapter selon votre config)
    API_URL: 'http://localhost:5000/api',
    
    // Credentials admin pour les tests
    ADMIN_PASSWORD_HASH: '$2b$10$/3L1O/QUtgvrRP3JRcf.Xeka9xhKJnqOHk4bmCF.8l13GkgpVxLli',
    ADMIN_USERNAME: 'TEST_AUDIT_USER',
    
    // Données de test
    TEST_DATA: {
        locker: {
            number: 'N01',
            zone: 'NORD',
            name: 'DUPONT',
            firstName: 'Jean',
            code: '123456',
            birthDate: '1980-01-15',
            comment: 'Test audit logs',
            recoverable: false
        },
        client: {
            ipp: '999999',
            name: 'TEST',
            firstName: 'Patient',
            birthDate: '1990-05-20',
            sex: 'M',
            zone: 'NORD',
            entryDate: '2025-01-01'
        }
    },
    
    // Options de test
    CLEANUP_AFTER_TEST: true,  // Nettoyer les données de test après
    VERBOSE: true               // Afficher les détails dans la console
};