// Configuration des zones

const { isProduction, VERBOSE } = require('./index');

function parseZonesConfig() {
    const names = (process.env.ZONE_NAMES).split(',').map(s => s.trim());
    const counts = (process.env.ZONE_COUNTS).split(',').map(s => parseInt(s.trim()));
    const prefixes = (process.env.ZONE_PREFIXES).split(',').map(s => s.trim());
    
    if (names.length !== counts.length || names.length !== prefixes.length) {
        console.error('❌ ERREUR: Configuration des zones invalide');
        console.error('   ZONE_NAMES, ZONE_COUNTS et ZONE_PREFIXES doivent avoir le même nombre d\'éléments');
        process.exit(1);
    }
    
    const zones = names.map((name, index) => ({
        name: name,
        count: counts[index],
        prefix: prefixes[index]
    }));
    
    if (!isProduction && VERBOSE) {
        console.log('📋 Configuration des zones:');
        zones.forEach(z => {
            console.log(`   - ${z.name}: ${z.count} casiers (${z.prefix}01-${z.prefix}${String(z.count).padStart(2, '0')})`);
        });
    }
    
    return zones;
}

const ZONES_CONFIG = parseZonesConfig();

module.exports = {
    ZONES_CONFIG,
    parseZonesConfig
};
