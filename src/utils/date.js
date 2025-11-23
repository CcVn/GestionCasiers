// /server/utils/date.js

/**
 * Normalise différents formats de date vers YYYY-MM-DD (format ISO)
 * 
 * Formats supportés :
 * - DD/MM/YYYY ou D/M/YYYY
 * - DD-MM-YYYY ou D-M-YYYY
 * - DD.MM.YYYY ou D.M.YYYY
 * - YYYY-MM-DD (format ISO)
 * - YYYYMMDD (compact)
 * - DDMMYYYY (compact français)
 */
function normalizeDateFormat(dateStr) {
    if (!dateStr) return '';
    
    // Nettoyer la chaîne
    dateStr = dateStr.trim();
    
    // Format DD/MM/YYYY → YYYY-MM-DD (FORMAT FRANÇAIS)
    const match1 = dateStr.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
    if (match1) {
        const day = match1[1].padStart(2, '0');
        const month = match1[2].padStart(2, '0');
        const year = match1[3];
        return `${year}-${month}-${day}`;
    }
    
    // Format DD-MM-YYYY → YYYY-MM-DD (FORMAT FRANÇAIS)
    const match2 = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match2) {
        const day = match2[1].padStart(2, '0');
        const month = match2[2].padStart(2, '0');
        const year = match2[3];
        return `${year}-${month}-${day}`;
    }
    
    // Format YYYY-MM-DD (déjà bon - format ISO)
    const match3 = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match3) {
        return dateStr;
    }
    
    // Format YYYYMMDD → YYYY-MM-DD
    const match4 = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match4) {
        return `${match4[1]}-${match4[2]}-${match4[3]}`;
    }
    
    // Format DDMMYYYY → YYYY-MM-DD (sans séparateur, format français)
    const match5 = dateStr.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (match5) {
        return `${match5[3]}-${match5[2]}-${match5[1]}`;
    }
    
    // Si aucun format reconnu, retourner tel quel avec warning
    console.warn('⚠️ Format de date non reconnu:', dateStr);
    return dateStr;
}

/**
 * Valide si une date est au format ISO (YYYY-MM-DD)
 */
function isISODate(dateStr) {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * Convertit une date ISO vers le format français DD/MM/YYYY
 */
function isoToFrenchDate(isoDate) {
    if (!isoDate || !isISODate(isoDate)) return isoDate;
    
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
}

/**
 * Parse une date et retourne un objet Date ou null
 */
function parseDate(dateStr) {
    const normalized = normalizeDateFormat(dateStr);
    if (!normalized) return null;
    
    const date = new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Calcule l'âge à partir d'une date de naissance
 */
function calculateAge(birthDate) {
    const birth = parseDate(birthDate);
    if (!birth) return null;
    
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    
    return age;
}

/**
 * Semi-anonymise une date en ne conservant que le mois et l'année
 * Utile pour respecter la confidentialité tout en gardant des données exploitables
 * 
 * @param {string} dateStr - Date au format ISO (YYYY-MM-DD) ou français (DD/MM/YYYY)
 * @param {string} mode - Mode d'anonymisation:
 *   - 'month-year': Retourne "MM/YYYY" (par défaut)
 *   - 'year': Retourne "YYYY"
 *   - 'quarter': Retourne "T1 YYYY", "T2 YYYY", etc.
 *   - 'age': Retourne l'âge approximatif "~XX ans"
 * @returns {string} Date semi-anonymisée
 * 
 * @example
 * semiAnonymizeDate('1985-03-15') → '03/1985'
 * semiAnonymizeDate('15/03/1985', 'year') → '1985'
 * semiAnonymizeDate('1985-03-15', 'quarter') → 'T1 1985'
 * semiAnonymizeDate('1985-03-15', 'age') → '~39 ans'
 */
function semiAnonymizeDate(dateStr, mode = 'month-year') {
    if (!dateStr) return '';
    
    // Nettoyer et normaliser la date
    dateStr = dateStr.trim();
    
    let year, month, day;
    
    // Parser format ISO (YYYY-MM-DD)
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        [, year, month, day] = isoMatch;
    }
    
    // Parser format français (DD/MM/YYYY ou D/M/YYYY)
    const frMatch = dateStr.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
    if (frMatch) {
        [, day, month, year] = frMatch;
        month = month.padStart(2, '0');
    }
    
    if (!year || !month) {
        console.warn('Format de date non reconnu pour anonymisation:', dateStr);
        return '****';
    }
    
    // Appliquer le mode d'anonymisation
    switch (mode) {
        case 'month-year':
            return `${month}/${year}`;
        
        case 'year':
            return year;
        
        case 'quarter':
            const quarterNum = Math.ceil(parseInt(month) / 3);
            return `T${quarterNum} ${year}`;
        
        case 'age':
            const birthYear = parseInt(year);
            const currentYear = new Date().getFullYear();
            const age = currentYear - birthYear;
            return `~${age} ans`;
        
        default:
            return `${month}/${year}`;
    }
}

/**
 * Anonymise fortement une date en masquant les données personnelles
 * Conforme RGPD niveau maximal - perte de précision importante mais sécurité renforcée
 * 
 * @param {string} dateStr - Date au format ISO (YYYY-MM-DD) ou français (DD/MM/YYYY)
 * @param {string} mode - Mode d'anonymisation:
 *   - 'decade': Retourne la décennie "années 1980" (par défaut)
 *   - 'age-range': Retourne une tranche d'âge "60-70 ans"
 *   - 'generation': Retourne une génération "Baby-boomer", "Génération X", etc.
 *   - 'year-range': Retourne une plage de 5 ans "1980-1985"
 *   - 'masked': Retourne "****" (anonymisation totale)
 * @returns {string} Date fortement anonymisée
 * 
 * @example
 * strongAnonymizeDate('1985-03-15') → 'années 1980'
 * strongAnonymizeDate('1985-03-15', 'age-range') → '35-40 ans'
 * strongAnonymizeDate('1985-03-15', 'generation') → 'Génération Y'
 * strongAnonymizeDate('1985-03-15', 'year-range') → '1985-1990'
 * strongAnonymizeDate('1985-03-15', 'masked') → '****'
 */
function strongAnonymizeDate(dateStr, mode = 'decade') {
    if (!dateStr) return '****';
    
    // Nettoyer et normaliser la date
    dateStr = dateStr.trim();
    
    let year;
    
    // Parser format ISO (YYYY-MM-DD)
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        year = parseInt(isoMatch[1]);
    }
    
    // Parser format français (DD/MM/YYYY ou D/M/YYYY)
    const frMatch = dateStr.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
    if (frMatch) {
        year = parseInt(frMatch[3]);
    }
    
    if (!year) {
        console.warn('Format de date non reconnu pour anonymisation forte:', dateStr);
        return '****';
    }
    
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    
    // Appliquer le mode d'anonymisation
    switch (mode) {
        case 'decade':
            const decade = Math.floor(year / 10) * 10;
            return `années ${decade}`;
        
        case 'age-range':
            const ageRange = Math.floor(age / 5) * 5;
            return `${ageRange}-${ageRange + 5} ans`;
        
        case 'generation':
            return getGeneration(year);
        
        case 'year-range':
            const rangeStart = Math.floor(year / 5) * 5;
            return `${rangeStart}-${rangeStart + 5}`;
        
        case 'masked':
            return '****';
        
        default:
            const defaultDecade = Math.floor(year / 10) * 10;
            return `années ${defaultDecade}`;
    }
}

/**
 * Détermine la génération à partir de l'année de naissance
 * @private
 */
function getGeneration(birthYear) {
    if (birthYear >= 1997) return 'Génération Z';
    if (birthYear >= 1981) return 'Génération Y (Millennials)';
    if (birthYear >= 1965) return 'Génération X';
    if (birthYear >= 1946) return 'Baby-boomer';
    if (birthYear >= 1928) return 'Silent Generation';
    return 'Greatest Generation';
}

/**
 * Fonction de comparaison : anonymisation semi vs forte
 * Utile pour choisir le niveau selon le contexte (stats, export, affichage)
 * 
 * @param {string} dateStr - Date à anonymiser
 * @param {string} level - Niveau: 'low', 'medium', 'high'
 * @returns {string} Date anonymisée selon le niveau
 * 
 * @example
 * anonymizeDate('1985-03-15', 'low')    → '03/1985'
 * anonymizeDate('1985-03-15', 'medium') → '~39 ans'
 * anonymizeDate('1985-03-15', 'high')   → 'années 1980'
 */
function anonymizeDate(dateStr, level = 'medium') {
    switch (level) {
        case 'low':
            return semiAnonymizeDate(dateStr, 'month-year');
        
        case 'medium':
            return semiAnonymizeDate(dateStr, 'age');
        
        case 'high':
            return strongAnonymizeDate(dateStr, 'decade');
        
        case 'maximum':
            return strongAnonymizeDate(dateStr, 'masked');
        
        default:
            return semiAnonymizeDate(dateStr, 'age');
    }
}

module.exports = {
    normalizeDateFormat,
    semiAnonymizeDate,
    strongAnonymizeDate,
    anonymizeDate,
    isISODate,
    isoToFrenchDate,
    parseDate,
    calculateAge
};
