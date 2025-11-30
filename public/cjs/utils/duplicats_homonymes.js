//======== FONCTIONS UTILITAIRES DOUBLONS & HOMONYMES ===============

// Optimisation avec cache 
let cachedDuplicates = null;
let cachedHomonyms = null;
let lastDataHash = null;

function getDataHash() {
  return DATA.map(l => l.number + l.code + l.name).join(',');
}

// Fonction de détection des doublons
function detectDuplicates(useCache = true) {
    const currentHash = getDataHash();

    if (useCache && cachedDuplicates && lastDataHash === currentHash) {
        return cachedDuplicates;
    }

    const duplicates = new Set();
    const seen = {
        byIPP: {},           // { IPP: [numbers...] }
        byIdentity: {}       // { "NOM|PRENOM|DDN": [numbers...] }
    };
    
    // Parcourir tous les casiers occupés
    DATA.filter(l => l.occupied).forEach(locker => {
        const ipp = locker.code?.trim();
        const identity = `${locker.name}|${locker.firstName}|${locker.birthDate}`.toUpperCase();
        
        // Détection par IPP
        if (ipp) {
            if (!seen.byIPP[ipp]) {
                seen.byIPP[ipp] = [];
            }
            seen.byIPP[ipp].push(locker.number);
            
            if (seen.byIPP[ipp].length > 1) {
                // Marquer tous les casiers avec cet IPP comme doublons
                seen.byIPP[ipp].forEach(num => duplicates.add(num));
            }
        }
        
        // Détection par identité (nom + prénom + DDN)
        if (locker.name && locker.firstName && locker.birthDate) {
            if (!seen.byIdentity[identity]) {
                seen.byIdentity[identity] = [];
            }
            seen.byIdentity[identity].push(locker.number);
            
            if (seen.byIdentity[identity].length > 1) {
                // Marquer tous les casiers avec cette identité comme doublons
                seen.byIdentity[identity].forEach(num => duplicates.add(num));
            }
        }
    });
    
    if (VERBCONSOLE>1) { 
        console.log('🔍 Doublons détectés:', duplicates.size);
        console.log('  Par IPP:', Object.entries(seen.byIPP).filter(([k,v]) => v.length > 1));
        console.log('  Par identité:', Object.entries(seen.byIdentity).filter(([k,v]) => v.length > 1));
    }
    
    // Mise en cache
    //cachedDuplicates = result;
    //lastDataHash = currentHash;
    //return result;

    return {
        duplicates: duplicates,
        byIPP: seen.byIPP,
        byIdentity: seen.byIdentity
    };
}

// Invalider le cache lors des modifications
function invalidateDetectionCache() {
  cachedDuplicates = null;
  cachedHomonyms = null;
  lastDataHash = null;
}

// Fonction de détection des homonymes
function detectHomonyms() {
    const homonyms = new Set();
    const seen = {
        byFullName: {},      // { "NOM|PRENOM": [numbers...] }
        byLastName: {}       // { "NOM": [numbers...] }
    };
    
    // Parcourir tous les casiers occupés
    DATA.filter(l => l.occupied).forEach(locker => {
        const fullName = `${locker.name}|${locker.firstName}`.toUpperCase();
        const lastName = locker.name.toUpperCase();
        
        // Détection par nom + prénom (mais avec IPP et DDN différents)
        if (locker.name && locker.firstName) {
            if (!seen.byFullName[fullName]) {
                seen.byFullName[fullName] = [];
            }
            seen.byFullName[fullName].push({
                number: locker.number,
                ipp: locker.code,
                birthDate: locker.birthDate
            });
        }
        
        // Détection par nom seul
        if (locker.name) {
            if (!seen.byLastName[lastName]) {
                seen.byLastName[lastName] = [];
            }
            seen.byLastName[lastName].push({
                number: locker.number,
                firstName: locker.firstName,
                ipp: locker.code,
                birthDate: locker.birthDate
            });
        }
    });
    
    // Identifier les homonymes par nom+prénom (avec IPP/DDN différents)
    Object.entries(seen.byFullName).forEach(([fullName, lockers]) => {
        if (lockers.length > 1) {
            // Vérifier que ce sont bien des personnes différentes
            const uniquePersons = new Set();
            lockers.forEach(l => {
                uniquePersons.add(`${l.ipp}|${l.birthDate}`);
            });
            
            // Si au moins 2 personnes différentes avec même nom+prénom
            if (uniquePersons.size > 1) {
                lockers.forEach(l => homonyms.add(l.number));
            }
        }
    });
    
    // Identifier les homonymes par nom seul (au moins 2 prénoms différents)
    Object.entries(seen.byLastName).forEach(([lastName, lockers]) => {
        if (lockers.length > 1) {
            const uniqueFirstNames = new Set();
            lockers.forEach(l => {
                if (l.firstName) uniqueFirstNames.add(l.firstName.toUpperCase());
            });
            
            // Si au moins 2 prénoms différents avec même nom
            if (uniqueFirstNames.size > 1) {
                lockers.forEach(l => homonyms.add(l.number));
            }
        }
    });
    
    if (VERBCONSOLE>1) { 
        console.log('👥 Homonymes détectés:', homonyms.size);
        console.log('  Par nom+prénom:', Object.entries(seen.byFullName).filter(([k,v]) => {
                if (v.length <= 1) return false;
                const uniquePersons = new Set(v.map(l => `${l.ipp}|${l.birthDate}`));
                return uniquePersons.size > 1;
            }).length);
            console.log('  Par nom seul:', Object.entries(seen.byLastName).filter(([k,v]) => {
                if (v.length <= 1) return false;
                const uniqueFirstNames = new Set(v.map(l => l.firstName?.toUpperCase()));
                return uniqueFirstNames.size > 1;
            }).length);
    }
    
    return {
        homonyms: homonyms,
        byFullName: seen.byFullName,
        byLastName: seen.byLastName
    };
}

// --- Affichage basique duplicates
function showDuplicatesPanel() {
    const duplicateInfo = detectDuplicates();
    
    if (duplicateInfo.duplicates.size === 0) {
        alert('✓ Aucun doublon détecté');
        return;
    }
    
    let message = `⚠️ ${duplicateInfo.duplicates.size} doublons détectés\n\n`;
    
    // Doublons par IPP
    const ippDupes = Object.entries(duplicateInfo.byIPP).filter(([k,v]) => v.length > 1);
    if (ippDupes.length > 0) {
        message += `Par IPP identique (${ippDupes.length}):\n`;
        ippDupes.forEach(([ipp, numbers]) => {
            message += `  • IPP ${ipp}: casiers ${numbers.join(', ')}\n`;
        });
    }
    
    // Doublons par identité
    const identityDupes = Object.entries(duplicateInfo.byIdentity).filter(([k,v]) => v.length > 1);
    if (identityDupes.length > 0) {
        message += `\nPar identité (${identityDupes.length}):\n`;
        identityDupes.forEach(([identity, numbers]) => {
            const [name, firstName, birthDate] = identity.split('|');
            message += `  • ${name} ${firstName} (${birthDate}): casiers ${numbers.join(', ')}\n`;
        });
    }
    
    alert(message);
}

// --- Affichage basique Homonymes
function showHomonymsPanel() {
    const homonymInfo = detectHomonyms();
    
    if (homonymInfo.homonyms.size === 0) {
        alert('✓ Aucun homonyme détecté');
        return;
    }
    
    let message = `👥 ${homonymInfo.homonyms.size} homonymes détectés\n\n`;
    
    // Homonymes par nom+prénom
    const fullNameHomonyms = Object.entries(homonymInfo.byFullName).filter(([k,v]) => {
        if (v.length <= 1) return false;
        const uniquePersons = new Set(v.map(l => `${l.ipp}|${l.birthDate}`));
        return uniquePersons.size > 1;
    });
    
    if (fullNameHomonyms.length > 0) {
        message += `Même nom + prénom (${fullNameHomonyms.length}):\n`;
        fullNameHomonyms.forEach(([fullName, lockers]) => {
            const [name, firstName] = fullName.split('|');
            message += `  • ${name} ${firstName}:\n`;
            lockers.forEach(l => {
                message += `    - Casier ${l.number} (IPP: ${l.ipp}, DDN: ${l.birthDate || 'N/A'})\n`;
            });
        });
    }
    
    // Homonymes par nom seul
    const lastNameHomonyms = Object.entries(homonymInfo.byLastName).filter(([k,v]) => {
        if (v.length <= 1) return false;
        const uniqueFirstNames = new Set(v.map(l => l.firstName?.toUpperCase()));
        return uniqueFirstNames.size > 1;
    });
    
    if (lastNameHomonyms.length > 0) {
        message += `\nMême nom (${lastNameHomonyms.length}):\n`;
        lastNameHomonyms.slice(0, 5).forEach(([lastName, lockers]) => {
            message += `  • ${lastName}: ${lockers.length} casiers\n`;
            lockers.forEach(l => {
                message += `    - ${l.firstName || 'N/A'} (${l.number})\n`;
            });
        });
        if (lastNameHomonyms.length > 5) {
            message += `  ... et ${lastNameHomonyms.length - 5} autres noms\n`;
        }
    }
    
    alert(message);
}


// Rendre les fonctions globales
window.detectDuplicates = detectDuplicates;
window.detectHomonyms = detectHomonyms;
window.showDuplicatesPanel = showDuplicatesPanel;
window.showHomonymsPanel = showHomonymsPanel;
