/**
 * Parse le champ Nom du format Winpharm
 * Format: "NOM Prénom  née NOM_NAISSANCE"
 * 
 * @param {string} winpharmName - Champ nom brut Winpharm
 * @returns {Object} { name, firstName, birthName }
 */
function parseWinpharmName(winpharmName) {
    if (!winpharmName || typeof winpharmName !== 'string') {
        return { name: null, firstName: null, birthName: null };
    }
    
    const trimmed = winpharmName.trim();
    
    // Pattern : "NOM Prénom  née NOM_NAISSANCE"
    const withBirthName = trimmed.match(/^([A-ZÀ-ÖØ-Ý\s-]+)\s+([A-ZÀ-Ý][a-zà-ÿ\s-]+)\s+née\s+([A-ZÀ-ÖØ-Ý\s-]+)$/i);
    
    if (withBirthName) {
        return {
            name: withBirthName[1].trim(),
            firstName: withBirthName[2].trim(),
            birthName: withBirthName[3].trim()
        };
    }
    
    // Pattern sans nom de naissance : "NOM Prénom"
    const withoutBirthName = trimmed.match(/^([A-ZÀ-ÖØ-Ý\s-]+)\s+([A-ZÀ-Ý][a-zà-ÿ\s-]+)$/);
    
    if (withoutBirthName) {
        return {
            name: withoutBirthName[1].trim(),
            firstName: withoutBirthName[2].trim(),
            birthName: null
        };
    }
    
    // Pattern nom seul (tout en majuscules)
    const nameOnly = trimmed.match(/^[A-ZÀ-ÖØ-Ý\s-]+$/);
    
    if (nameOnly) {
        return {
            name: trimmed,
            firstName: null,
            birthName: null
        };
    }
    
    // Cas par défaut
    console.warn('Format nom Winpharm non reconnu:', winpharmName);
    return {
        name: trimmed,
        firstName: null,
        birthName: null
    };
}

/**
 * Parse le champ image Winpharm pour extraire le sexe
 * 
 * @param {string} imagePath - Chemin vers l'image (colonne vide avec chemin)
 * @returns {string|null} 'M', 'F' ou null
 * 
 * @example
 * parseWinpharmSex("C:\_GIT\...\Homme Symbole 16.png") → "M"
 * parseWinpharmSex("C:\_GIT\...\Femme Symbole 16.png") → "F"
 * parseWinpharmSex("") → null
 */
function parseWinpharmSex(imagePath) {
    if (!imagePath || typeof imagePath !== 'string') {
        return null;
    }
    
    const normalized = imagePath.toLowerCase().trim();
    console.log(normalized);
    
    // Détecter "Homme" dans le chemin, avec variantes
    if (normalized.includes('homme') || normalized.includes('male') || normalized.includes('man')) {
        return 'M';
    }
    
    // Détecter "Femme" dans le chemin, avec variantes
    if (normalized.includes('femme') || normalized.includes('female') || normalized.includes('woman')) {
        return 'F';
    }
    
    // Si non reconnu, logger et retourner null
    if (normalized.length > 0) {
        console.warn('Format image sexe Winpharm non reconnu:', imagePath);
    }
    
    return null;
}

/**
 * Prétraite les données clients Winpharm
 * - Sépare le champ Nom en name, firstName, birthName
 * - Parse le champ image pour extraire le sexe
 * 
 * @param {Array} clients - Liste des clients parsés
 * @returns {Array} Clients avec champs séparés
 */
function preprocessWinpharmClients(clients) {
    return clients.map(client => {
        const processed = { ...client };
        
        // ============================================================
        // 1. Parser le champ Nom (colonne "Nom" ou similaire)
        // ============================================================
        if (processed.name && typeof processed.name === 'string') {
            const parsedName = parseWinpharmName(processed.name);
            
            processed.name = parsedName.name || processed.name;
            processed.firstName = parsedName.firstName || processed.firstName;
            processed.birthName = parsedName.birthName || processed.birthName;
        }
        
        // ============================================================
        // 2. Parser le champ sex (6e colonne vide devenue "sex")
        // ============================================================
        if (processed.sex && typeof processed.sex === 'string') {
            const parsedSex = parseWinpharmSex(processed.sex);
            if (parsedSex) {
                processed.sex = parsedSex;
            }
        } else if (processed.Sex && typeof processed.Sex === 'string') {
            // Cas où la colonne s'appelle "Sex" avec majuscule
            const parsedSex = parseWinpharmSex(processed.Sex);
            if (parsedSex) {
                processed.sex = parsedSex;
                delete processed.Sex; // Supprimer la variante avec majuscule
            }
        }     
        return processed;
    });
}

module.exports = {
    parseWinpharmName,
    parseWinpharmSex,
    preprocessWinpharmClients
};