// Configuration centralisée

const isProduction = process.env.NODE_ENV === 'production';
const VERBOSE = true;

// Validation du mot de passe admin
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!ADMIN_PASSWORD_HASH) {
    console.error('❌ ERREUR: Aucun mot de passe admin configuré !');
    console.error('   Définissez ADMIN_PASSWORD_HASH dans le fichier .env');
    console.error('   Utilisez: node generate-password.js pour générer un hash');
    process.exit(1);
}

if (!isProduction && VERBOSE) console.log('🔐 Authentification configurée');

// Configuration anonymisation
const ANONYMIZE_GUEST = process.env.ANONYMIZE_GUEST === 'true';
const ANONYMIZE_ADMIN = process.env.ANONYMIZE_ADMIN === 'true';

// Variables runtime (modifiables à chaud)
let ANONYMIZE_GUEST_RUNTIME = ANONYMIZE_GUEST;
let ANONYMIZE_ADMIN_RUNTIME = ANONYMIZE_ADMIN;

if (!isProduction && VERBOSE) {
    console.log('👁️ Anonymisation guest:', ANONYMIZE_GUEST);
    console.log('🔒 Anonymisation admin:', ANONYMIZE_ADMIN);
}

// Mode sombre
const DARK_MODE = process.env.DARK_MODE || 'system';
if (!isProduction && VERBOSE) console.log('🌓 Mode sombre:', DARK_MODE);

// Avertissement import clients
const CLIENT_IMPORT_WARNING_DAYS = parseInt(process.env.CLIENT_IMPORT_WARNING_DAYS) || 4;

// Configuration backup
const BACKUP_TIME = process.env.BACKUP_TIME || null;
const BACKUP_FREQUENCY_HOURS = parseInt(process.env.BACKUP_FREQUENCY_HOURS) || 24;
const BACKUP_RETENTION_COUNT = parseInt(process.env.BACKUP_RETENTION_COUNT) || 7;

if (!isProduction && VERBOSE) {
    if (BACKUP_TIME) {
        console.log(`⏰ Backup automatique quotidien à ${BACKUP_TIME}`);
    } else {
        console.log(`⏰ Backup automatique toutes les ${BACKUP_FREQUENCY_HOURS}h`);
    }
}

// Sessions
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 heures
const SESSION_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

module.exports = {
    isProduction,
    VERBOSE,
    ADMIN_PASSWORD_HASH,
    ANONYMIZE_GUEST,
    ANONYMIZE_ADMIN,
    ANONYMIZE_GUEST_RUNTIME,
    ANONYMIZE_ADMIN_RUNTIME,
    DARK_MODE,
    CLIENT_IMPORT_WARNING_DAYS,
    BACKUP_TIME,
    BACKUP_FREQUENCY_HOURS,
    BACKUP_RETENTION_COUNT,
    SESSION_DURATION_MS,
    SESSION_CLEANUP_INTERVAL_MS,
    
    // Setters pour runtime
    setAnonymizeGuest: (value) => { ANONYMIZE_GUEST_RUNTIME = value; },
    setAnonymizeAdmin: (value) => { ANONYMIZE_ADMIN_RUNTIME = value; },
    getAnonymizeGuest: () => ANONYMIZE_GUEST_RUNTIME,
    getAnonymizeAdmin: () => ANONYMIZE_ADMIN_RUNTIME
};
