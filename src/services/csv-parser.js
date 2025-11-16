// Service de parsing CSV

const { IMPORT_FORMATS } = require('../config/import-formats');
const { isProduction, VERBOSE } = require('../config');
const { normalizeDateFormat, capitalizeFirstLetter } = require('../utils');

// Parser une ligne CSV avec séparateur personnalisé
function parseCsvLine(line, separator = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === separator && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result.map(v => v.replace(/^"|"$/g, ''));
}

// Détecter automatiquement le séparateur CSV
function detectCSVSeparator(fileContent) {
    const lines = fileContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return ',';

    const firstLine = lines[0];
    const secondLine = lines[1];

    const separators = [';', ',', '\t', '|'];
    const scores = {};

    for (const sep of separators) {
        try {
            const cols1 = parseCsvLine(firstLine, sep).length;
            const cols2 = parseCsvLine(secondLine, sep).length;
            scores[sep] = (cols1 + cols2);
        } catch (e) {
            scores[sep] = 0;
        }
    }

    let bestSep = ',';
    let bestScore = -1;
    for (const [sep, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestSep = sep;
        }
    }

    if (!isProduction && VERBOSE) console.log('detectCSVSeparator → choisi:', bestSep, 'scores:', scores);
    return bestSep || ',';
}

// Mapper une ligne aux champs de la base de données
function mapRowToClient(row, mapping) {
    const client = {
        ipp: '',
        name: '',
        firstName: '',
        birthName: '',
        birthDate: '',
        sex: '',
        zone: '',
        entryDate: ''
    };
    
    for (const [sourceField, targetField] of Object.entries(mapping)) {
        if (row[sourceField] !== undefined) {
            client[targetField] = row[sourceField].trim();
        }
    }
    
    // Normaliser les données
    client.ipp = client.ipp.trim();
    client.name = client.name.toUpperCase();
    client.firstName = capitalizeFirstLetter(client.firstName);
    
    if (client.birthDate) {
        client.birthDate = normalizeDateFormat(client.birthDate);
    }
    
    if (client.entryDate) {
        client.entryDate = normalizeDateFormat(client.entryDate);
    }
    
    return client;
}

// Fonction principale d'import avec format
function parseClientsWithFormat(fileContent, formatName, separator = ',') {
    const format = IMPORT_FORMATS[formatName];
    
    if (!format) {
        throw new Error(`Format d'import "${formatName}" non reconnu`);
    }
    
    // Si separator pas fourni ou 'auto', détecter automatiquement
    let usedSeparator;
    if (!separator || separator === 'auto') {
        usedSeparator = detectCSVSeparator(fileContent);
    } else {
        usedSeparator = separator || format.separator;
    }

    if (!isProduction && VERBOSE) {
        console.log(`📥 Import avec format: ${formatName}`);
        console.log(`   Séparateur: "${format.separator}"`);
    }
    
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
        throw new Error('Fichier vide ou invalide');
    }
    
    const headers = parseCsvLine(lines[0], usedSeparator);
    if (!isProduction && VERBOSE) console.log(`   Headers trouvés: ${headers.join(', ')}`);
    
    const dataLines = lines.slice(1 + format.skipRows);
    let imported = 0;
    let filtered = 0;
    let errors = 0;
    
    const clients = [];
    
    for (const line of dataLines) {
        try {
            const values = parseCsvLine(line, usedSeparator);
            
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            // Appliquer les filtres
            if (format.filters && format.filters.length > 0) {
                let passFilters = true;
                
                for (const filter of format.filters) {
                    const fieldValue = row[filter.field];
                    
                    if (filter.operator === 'in') {
                        if (!filter.values.includes(fieldValue)) {
                            passFilters = false;
                            break;
                        }
                    } else if (filter.operator === 'equals') {
                        if (fieldValue !== filter.value) {
                            passFilters = false;
                            break;
                        }
                    }
                }
                
                if (!passFilters) {
                    filtered++;
                    continue;
                }
            }
            
            const client = mapRowToClient(row, format.mapping);
            
            if (!client.ipp || client.ipp.trim() === '') {
                errors++;
                console.warn(`⚠️ Ligne ignorée (IPP manquant)`);
                continue;
            }
            
            clients.push(client);
            imported++;
            
        } catch (err) {
            errors++;
            console.error('Erreur parsing ligne:', err);
            continue;
        }
    }
    
    if (!isProduction && VERBOSE) {
        console.log(`✓ Parsing terminé:`);
        console.log(`  - Importés: ${imported}`);
        console.log(`  - Filtrés: ${filtered}`);
        console.log(`  - Erreurs: ${errors}`);
    }

    return {
        clients: clients,
        stats: {
            imported: imported,
            filtered: filtered,
            errors: errors,
            total: dataLines.length
        }
    };
}

module.exports = {
    parseCsvLine,
    detectCSVSeparator,
    mapRowToClient,
    parseClientsWithFormat
};
