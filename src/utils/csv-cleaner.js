/**
 * Nettoie les headers d'un fichier CSV en supprimant les retours chariot
 * 
 * PROBLÈME RÉSOLU : Gère les retours chariot DANS les cellules entre guillemets
 * 
 * @param {string} csvContent - Contenu brut du CSV
 * @returns {string} CSV avec headers nettoyés
 * 
 * @example
 * Input:  "N°\nDossier";"N°\nIPP";"Entré(e)\nle"
 *         "12345";"67890";"01/01/2024"
 * 
 * Output: "N° Dossier";"N° IPP";"Entré(e) le"
 *         "12345";"67890";"01/01/2024"
 */
function cleanCSVHeaders(csvContent) {
    if (!csvContent) return '';
    
    // ============================================================
    // ÉTAPE 1 : Extraire la ligne d'en-têtes complète
    // en respectant les guillemets
    // ============================================================
    let headerEnd = 0;
    let inQuotes = false;
    let cellCount = 0;
    
    for (let i = 0; i < csvContent.length; i++) {
        const char = csvContent[i];
        const prevChar = csvContent[i - 1];
        
        if (char === '"') {
            // Gérer les guillemets échappés ""
            if (inQuotes && csvContent[i + 1] === '"') {
                i++; // Skip le guillemet échappé
                continue;
            }
            inQuotes = !inQuotes;
        }
        
        // Détecter les séparateurs hors guillemets
        if (!inQuotes && (char === ';' || char === ',' || char === '\t' || char === '|')) {
            cellCount++;
        }
        
        // Trouver la vraie fin de ligne (hors guillemets)
        if (!inQuotes && char === '\n') {
            headerEnd = i;
            break;
        }
    }
    
    if (headerEnd === 0) {
        // Cas où il n'y a qu'une ligne
        headerEnd = csvContent.length;
    }
    
    // Extraire la ligne d'en-têtes brute
    const rawHeaderLine = csvContent.substring(0, headerEnd);
    const restOfCSV = csvContent.substring(headerEnd + 1); // +1 pour sauter le \n
    
    // ============================================================
    // ÉTAPE 2 : Détecter le séparateur
    // ============================================================
    const separator = detectSeparatorInLine(rawHeaderLine);
    
    // ============================================================
    // ÉTAPE 3 : Parser les cellules en respectant les guillemets
    // ============================================================
    const headers = parseCSVLine(rawHeaderLine, separator);
    
    // ============================================================
    // ÉTAPE 4 : Nettoyer chaque header individuellement
    // ============================================================
    const cleanedHeaders = headers.map(header => {
        return header
            // Supprimer les retours chariot et sauts de ligne
            .replace(/\r\n/g, ' ')
            .replace(/\n/g, ' ')
            .replace(/\r/g, ' ')
            // Supprimer les espaces multiples
            .replace(/\s+/g, ' ')
            // Trim
            .trim()
            // Supprimer les caractères de contrôle invisibles
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    });

    // ============================================================
    // ÉTAPE 5 : Remplacer le 6e header vide par "sex"
    // ============================================================
    if (cleanedHeaders.length > 5 && (!cleanedHeaders[5] || cleanedHeaders[5].trim() === '')) {
        cleanedHeaders[5] = 'sex';
    }

    // ============================================================
    // ÉTAPE 6 : Reconstruire la ligne d'en-têtes
    // ============================================================
    const cleanedHeaderLine = cleanedHeaders
        .map(h => {
            // Re-quoter si nécessaire
            if (h.includes(separator) || h.includes('"') || h.includes('\n')) {
                return `"${h.replace(/"/g, '""')}"`;
            }
            return h;
        })
        .join(separator);

    // ============================================================
    // ÉTAPE 7 : Reconstruire le CSV complet
    // ============================================================
    return cleanedHeaderLine + '\n' + restOfCSV;
}

/**
 * Détecte le séparateur dans une ligne CSV
 * en comptant les occurrences hors guillemets
 * @private
 */
function detectSeparatorInLine(line) {
    const separators = [';', ',', '\t', '|'];
    const counts = {};
    
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                i++; // Skip escaped quote
                continue;
            }
            inQuotes = !inQuotes;
        }
        
        if (!inQuotes && separators.includes(char)) {
            counts[char] = (counts[char] || 0) + 1;
        }
    }
    
    // Retourner le séparateur le plus fréquent
    let maxCount = 0;
    let bestSep = ';';
    
    for (const [sep, count] of Object.entries(counts)) {
        if (count > maxCount) {
            maxCount = count;
            bestSep = sep;
        }
    }
    
    return bestSep;
}

/**
 * Parse une ligne CSV en respectant les guillemets et échappements
 * @private
 */
function parseCSVLine(line, separator = ';') {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Guillemet échappé ""
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quotes
                inQuotes = !inQuotes;
            }
        } else if (char === separator && !inQuotes) {
            // Fin de cellule
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    // Ajouter la dernière cellule
    result.push(current);
    
    return result;
}

/**
 * Détecte et nettoie automatiquement les headers problématiques
 * 
 * @param {string} csvContent - Contenu CSV brut
 * @returns {Object} { cleaned: string, hadIssues: boolean, issues: string[] }
 */
function autoCleanCSV(csvContent) {
    if (!csvContent) {
        return { cleaned: '', hadIssues: false, issues: [] };
    }
    
    const issues = [];
    
    // Détecter les retours chariot dans la première ligne
    const firstLineEnd = csvContent.indexOf('\n');
    const potentialHeader = csvContent.substring(0, firstLineEnd > 0 ? firstLineEnd : 500);
    
    // Détection des problèmes
    if (/[\r\n]/.test(potentialHeader.replace(/"[^"]*"/g, ''))) {
        issues.push('Retours chariot détectés dans les headers');
    }
    
    if (/\s{2,}/.test(potentialHeader)) {
        issues.push('Espaces multiples détectés');
    }
    
    if (/[\x00-\x1F]/.test(potentialHeader)) {
        issues.push('Caractères de contrôle invisibles détectés');
    }
    
    // Nettoyer si des problèmes sont détectés
    let cleaned = csvContent;
    if (issues.length > 0) {
        cleaned = cleanCSVHeaders(csvContent);
    }
    
    return {
        cleaned,
        hadIssues: issues.length > 0,
        issues
    };
}


module.exports = {
    cleanCSVHeaders,
    parseCSVLine,
    detectSeparatorInLine,
    autoCleanCSV
};