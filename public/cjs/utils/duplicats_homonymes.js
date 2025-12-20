//======== FONCTIONS UTILITAIRES DOUBLONS & HOMONYMES ===============

// Cache global avec métadonnées
const detectionCache = {
  duplicates: null,
  homonyms: null,
  dataVersion: 0,
  lastUpdate: 0,
  lockerCount: 0
};

// Hash léger basé sur la taille et version
function needsRefresh() {
  const lockers = getState('data.lockers');
  const currentCount = lockers.length;
  
  return (
    detectionCache.lockerCount !== currentCount ||
    Date.now() - detectionCache.lastUpdate > 60000 // TTL 1 minute
  );
}

// Fonction de détection des doublons
function detectDuplicates(forceRefresh = false) {
    // Vérifier le cache
    if (!forceRefresh && detectionCache.duplicates && !needsRefresh()) {
        if (VERBCONSOLE > 1) {
            console.log('🎯 Cache duplicates utilisé');
        }
        return detectionCache.duplicates;
    }
    
    if (VERBCONSOLE > 1) {
        console.log('🔄 Recalcul des duplicates...');
    }

    const duplicates = new Set();
    const seen = {
        byIPP: {},
        byIdentity: {}
    };
    
    // Parcours optimisé
    getState('data.lockers').filter(l => l.occupied).forEach(locker => {
        const ipp = locker.code?.trim();
        const identity = `${locker.name}|${locker.firstName}|${locker.birthDate}`.toUpperCase();
        
        // Détection par IPP
        if (ipp) {
            if (!seen.byIPP[ipp]) {
                seen.byIPP[ipp] = [];
            }
            seen.byIPP[ipp].push(locker.number);
            
            if (seen.byIPP[ipp].length > 1) {
                seen.byIPP[ipp].forEach(num => duplicates.add(num));
            }
        }
        
        // Détection par identité
        if (locker.name && locker.firstName && locker.birthDate) {
            if (!seen.byIdentity[identity]) {
                seen.byIdentity[identity] = [];
            }
            seen.byIdentity[identity].push(locker.number);
            
            if (seen.byIdentity[identity].length > 1) {
                seen.byIdentity[identity].forEach(num => duplicates.add(num));
            }
        }
    });
    
    // STRUCTURE IDENTIQUE À L'ORIGINAL
    const result = {
        duplicates: duplicates,
        byIPP: seen.byIPP,
        byIdentity: seen.byIdentity
    };
    
    // MISE EN CACHE
    detectionCache.duplicates = result;
    detectionCache.lockerCount = getState('data.lockers').length;
    detectionCache.lastUpdate = Date.now();
    
    if (VERBCONSOLE > 1) {
        console.log(`🔍 ${duplicates.size} doublon(s) détecté(s)`);
    }
    
    return result;
}

// Invalider le cache
function invalidateDetectionCache() {
    detectionCache.duplicates = null;
    detectionCache.homonyms = null;
    detectionCache.lastUpdate = 0;
    
    if (VERBCONSOLE > 1) {
        console.log('🗑️ Cache duplicates/homonymes invalidé');
    }
}

// Fonction de détection des homonymes
function detectHomonyms(forceRefresh = false) {
    // Vérifier le cache
    if (!forceRefresh && detectionCache.homonyms && !needsRefresh()) {
        if (VERBCONSOLE > 1) {
            console.log('🎯 Cache homonymes utilisé');
        }
        return detectionCache.homonyms;
    }
    
    if (VERBCONSOLE > 1) {
        console.log('🔄 Recalcul des homonymes...');
    }
    
    const homonyms = new Set();
    const seen = {
        byFullName: {},
        byLastName: {}
    };
    
    // Parcourir tous les casiers occupés
    getState('data.lockers').filter(l => l.occupied).forEach(locker => {
        const fullName = `${locker.name}|${locker.firstName}`.toUpperCase();
        const lastName = locker.name.toUpperCase();
        
         // Détection par nom + prénom
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
            const uniquePersons = new Set();
            lockers.forEach(l => {
                uniquePersons.add(`${l.ipp}|${l.birthDate}`);
            });
            
            if (uniquePersons.size > 1) {
                lockers.forEach(l => homonyms.add(l.number));
            }
        }
    });
    
    // Identifier les homonymes par nom seul
    Object.entries(seen.byLastName).forEach(([lastName, lockers]) => {
        if (lockers.length > 1) {
            const uniqueFirstNames = new Set();
            lockers.forEach(l => {
                if (l.firstName) uniqueFirstNames.add(l.firstName.toUpperCase());
            });
            
            if (uniqueFirstNames.size > 1) {
                lockers.forEach(l => homonyms.add(l.number));
            }
        }
    });
    
    const result = {
        homonyms: homonyms,           // Set de numéros
        byFullName: seen.byFullName,  // Map de arrays d'objects
        byLastName: seen.byLastName   // Map de arrays d'objects
    };
    
    // MISE EN CACHE
    detectionCache.homonyms = result;
    detectionCache.lockerCount = getState('data.lockers').length;
    detectionCache.lastUpdate = Date.now();
    
    if (VERBCONSOLE > 1) {
        console.log(`👥 ${homonyms.size} homonyme(s) détecté(s)`);
    }
    
    return result;
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


// Invalider automatiquement le cache lors des modifications
watch('data.lockers', () => {
    invalidateDetectionCache();
});

// Rendre les fonctions globales
window.detectDuplicates = detectDuplicates;
window.detectHomonyms = detectHomonyms;
window.showDuplicatesPanel = showDuplicatesPanel;
window.showHomonymsPanel = showHomonymsPanel;
window.invalidateDetectionCache = invalidateDetectionCache;