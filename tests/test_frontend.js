/**
 * Tests des fonctions frontend critiques
 * Fichier : tests/frontend.test.js
 */

// Mock des fonctions frontend (extraites de app.js)

function anonymizeName(name, enabled) {
    if (!enabled || !name) return name;
    return name.substring(0, 3).toUpperCase();
}

function anonymizeFirstName(firstName, enabled) {
    if (!enabled || !firstName) return firstName;
    return firstName.substring(0, 2).toUpperCase();
}

function getAuthToken() {
    // Mock de sessionStorage pour tests Node
    if (typeof sessionStorage !== 'undefined') {
        return sessionStorage.getItem('auth_token');
    }
    return null;
}

function validateLockerNumber(number) {
    const patterns = {
        NORD: /^N\d{2}$/,
        SUD: /^S\d{2}$/,
        PCA: /^PCA\d{2}$/
    };
    
    return Object.values(patterns).some(pattern => pattern.test(number));
}

// ==================== TESTS ====================

describe('Frontend - Anonymisation', () => {
    describe('anonymizeName', () => {
        test('devrait tronquer et mettre en majuscule', () => {
            expect(anonymizeName('DUPONT', true)).toBe('DUP');
            expect(anonymizeName('Martin', true)).toBe('MAR');
            expect(anonymizeName('abc', true)).toBe('ABC');
        });

        test('devrait gérer les noms courts', () => {
            expect(anonymizeName('AB', true)).toBe('AB');
            expect(anonymizeName('A', true)).toBe('A');
        });

        test('ne devrait pas anonymiser si désactivé', () => {
            expect(anonymizeName('DUPONT', false)).toBe('DUPONT');
            expect(anonymizeName('Martin', false)).toBe('Martin');
        });

        test('devrait gérer les valeurs nulles/vides', () => {
            expect(anonymizeName('', true)).toBe('');
            expect(anonymizeName(null, true)).toBe(null);
            expect(anonymizeName(undefined, true)).toBe(undefined);
        });

        test('devrait gérer les accents', () => {
            expect(anonymizeName('Müller', true)).toBe('MÜL');
            expect(anonymizeName('Éléonore', true)).toBe('ÉLÉ');
        });

        test('devrait gérer les caractères spéciaux', () => {
            expect(anonymizeName('O\'Brien', true)).toBe('O\'B');
            expect(anonymizeName('Jean-Paul', true)).toBe('JEA');
        });
    });

    describe('anonymizeFirstName', () => {
        test('devrait tronquer à 2 caractères', () => {
            expect(anonymizeFirstName('Jean', true)).toBe('JE');
            expect(anonymizeFirstName('Marie', true)).toBe('MA');
            expect(anonymizeFirstName('X', true)).toBe('X');
        });

        test('ne devrait pas anonymiser si désactivé', () => {
            expect(anonymizeFirstName('Jean', false)).toBe('Jean');
        });

        test('devrait gérer les valeurs nulles', () => {
            expect(anonymizeFirstName('', true)).toBe('');
            expect(anonymizeFirstName(null, true)).toBe(null);
        });
    });

    describe('Anonymisation complète', () => {
        test('devrait anonymiser nom + prénom ensemble', () => {
            const name = anonymizeName('DUPONT', true);
            const firstName = anonymizeFirstName('Jean', true);
            
            expect(name).toBe('DUP');
            expect(firstName).toBe('JE');
            expect(`${name} ${firstName}`).toBe('DUP JE');
        });
    });
});

describe('Frontend - Validation', () => {
    describe('validateLockerNumber', () => {
        test('devrait valider les numéros NORD', () => {
            expect(validateLockerNumber('N01')).toBe(true);
            expect(validateLockerNumber('N75')).toBe(true);
            expect(validateLockerNumber('N99')).toBe(true);
        });

        test('devrait valider les numéros SUD', () => {
            expect(validateLockerNumber('S01')).toBe(true);
            expect(validateLockerNumber('S75')).toBe(true);
        });

        test('devrait valider les numéros PCA', () => {
            expect(validateLockerNumber('PCA01')).toBe(true);
            expect(validateLockerNumber('PCA40')).toBe(true);
        });

        test('devrait rejeter les formats invalides', () => {
            expect(validateLockerNumber('N1')).toBe(false);
            expect(validateLockerNumber('N001')).toBe(false);
            expect(validateLockerNumber('X01')).toBe(false);
            expect(validateLockerNumber('n01')).toBe(false); // minuscule
            expect(validateLockerNumber('PC01')).toBe(false);
            expect(validateLockerNumber('')).toBe(false);
            expect(validateLockerNumber(null)).toBe(false);
        });
    });
});

describe('Frontend - Gestion des filtres', () => {
    let mockData;

    beforeEach(() => {
        mockData = [
            { number: 'N01', zone: 'NORD', occupied: true, recoverable: false },
            { number: 'N02', zone: 'NORD', occupied: true, recoverable: true },
            { number: 'N03', zone: 'NORD', occupied: false, recoverable: false },
            { number: 'S01', zone: 'SUD', occupied: true, recoverable: false },
        ];
    });

    function filterLockers(data, zone, filter) {
        let filtered = data.filter(l => l.zone === zone);
        
        if (filter === 'occupied') {
            filtered = filtered.filter(l => l.occupied);
        } else if (filter === 'empty') {
            filtered = filtered.filter(l => !l.occupied);
        } else if (filter === 'recoverable') {
            filtered = filtered.filter(l => l.occupied && l.recoverable);
        }
        
        return filtered;
    }

    test('devrait filtrer les occupés', () => {
        const result = filterLockers(mockData, 'NORD', 'occupied');
        expect(result).toHaveLength(2);
        expect(result.every(l => l.occupied)).toBe(true);
    });

    test('devrait filtrer les vides', () => {
        const result = filterLockers(mockData, 'NORD', 'empty');
        expect(result).toHaveLength(1);
        expect(result[0].number).toBe('N03');
    });

    test('devrait filtrer les récupérables', () => {
        const result = filterLockers(mockData, 'NORD', 'recoverable');
        expect(result).toHaveLength(1);
        expect(result[0].number).toBe('N02');
    });

    test('devrait retourner tous si filtre "all"', () => {
        const result = filterLockers(mockData, 'NORD', 'all');
        expect(result).toHaveLength(3);
    });

    test('devrait filtrer par zone', () => {
        const result = filterLockers(mockData, 'SUD', 'all');
        expect(result).toHaveLength(1);
        expect(result[0].zone).toBe('SUD');
    });
});

describe('Frontend - Tri des données', () => {
    let mockLockers;

    beforeEach(() => {
        mockLockers = [
            { number: 'N03', name: 'MARTIN', firstName: 'Jean' },
            { number: 'N01', name: 'DUPONT', firstName: 'Marie' },
            { number: 'N02', name: 'BERNARD', firstName: 'Paul' },
        ];
    });

    function sortLockers(data, sortBy) {
        const sorted = [...data];
        
        if (sortBy === 'name') {
            sorted.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        } else if (sortBy === 'number') {
            sorted.sort((a, b) => a.number.localeCompare(b.number));
        }
        
        return sorted;
    }

    test('devrait trier par numéro', () => {
        const result = sortLockers(mockLockers, 'number');
        expect(result[0].number).toBe('N01');
        expect(result[1].number).toBe('N02');
        expect(result[2].number).toBe('N03');
    });

    test('devrait trier par nom alphabétique', () => {
        const result = sortLockers(mockLockers, 'name');
        expect(result[0].name).toBe('BERNARD');
        expect(result[1].name).toBe('DUPONT');
        expect(result[2].name).toBe('MARTIN');
    });

    test('ne devrait pas modifier le tableau original', () => {
        const original = [...mockLockers];
        sortLockers(mockLockers, 'name');
        expect(mockLockers).toEqual(original);
    });
});

describe('Frontend - Mode sombre', () => {
    function applyDarkMode(setting) {
        const body = { classList: { add: jest.fn(), remove: jest.fn() } };
        
        if (setting === 'active') {
            body.classList.add('dark-mode');
        } else if (setting === 'inactive') {
            body.classList.remove('dark-mode');
        } else if (setting === 'system') {
            // Simuler préférence système
            const prefersDark = false; // Mock
            if (prefersDark) {
                body.classList.add('dark-mode');
            } else {
                body.classList.remove('dark-mode');
            }
        }
        
        return body;
    }

    test('devrait activer le mode sombre si "active"', () => {
        const body = applyDarkMode('active');
        expect(body.classList.add).toHaveBeenCalledWith('dark-mode');
    });

    test('devrait désactiver le mode sombre si "inactive"', () => {
        const body = applyDarkMode('inactive');
        expect(body.classList.remove).toHaveBeenCalledWith('dark-mode');
    });

    test('devrait gérer le mode système', () => {
        const body = applyDarkMode('system');
        expect(body.classList.remove).toHaveBeenCalled();
    });
});

describe('Frontend - Compteurs', () => {
    function calculateCounter(data, zone) {
        const zoneData = data.filter(l => l.zone === zone);
        const occupied = zoneData.filter(l => l.occupied).length;
        const total = zoneData.length;
        
        return { occupied, total };
    }

    test('devrait calculer les compteurs correctement', () => {
        const data = [
            { zone: 'NORD', occupied: true },
            { zone: 'NORD', occupied: true },
            { zone: 'NORD', occupied: false },
            { zone: 'SUD', occupied: true },
        ];
        
        const nordCounter = calculateCounter(data, 'NORD');
        expect(nordCounter.occupied).toBe(2);
        expect(nordCounter.total).toBe(3);
        
        const sudCounter = calculateCounter(data, 'SUD');
        expect(sudCounter.occupied).toBe(1);
        expect(sudCounter.total).toBe(1);
    });

    test('devrait retourner 0/0 pour zone vide', () => {
        const result = calculateCounter([], 'NORD');
        expect(result.occupied).toBe(0);
        expect(result.total).toBe(0);
    });
});

describe('Frontend - Export de données', () => {
    function convertToCSV(data) {
        const headers = ['N° Casier', 'Zone', 'Nom', 'Prénom', 'N°IPP', 'DDN', 'Récupérable'];
        const rows = data.map(locker => [
            locker.number, 
            locker.zone, 
            locker.name, 
            locker.firstName, 
            locker.code, 
            locker.birthDate,
            locker.recoverable ? '1' : '0'
        ]);
        
        return [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
    }

    test('devrait générer un CSV valide', () => {
        const data = [
            {
                number: 'N01',
                zone: 'NORD',
                name: 'DUPONT',
                firstName: 'Jean',
                code: '123',
                birthDate: '1990-01-15',
                recoverable: false
            }
        ];
        
        const csv = convertToCSV(data);
        
        expect(csv).toContain('N° Casier,Zone,Nom');
        expect(csv).toContain('"N01","NORD","DUPONT","Jean","123","1990-01-15","0"');
    });

    test('devrait gérer les caractères spéciaux', () => {
        const data = [
            {
                number: 'N01',
                zone: 'NORD',
                name: 'O\'Brien',
                firstName: 'Jean-Paul',
                code: '123',
                birthDate: '1990-01-15',
                recoverable: false
            }
        ];
        
        const csv = convertToCSV(data);
        expect(csv).toContain('"O\'Brien"');
        expect(csv).toContain('"Jean-Paul"');
    });

    test('devrait gérer les données vides', () => {
        const csv = convertToCSV([]);
        expect(csv).toBe('N° Casier,Zone,Nom,Prénom,N°IPP,DDN,Récupérable');
    });
});

describe('Frontend - Recherche', () => {
    function searchLockers(data, query) {
        const q = query.toLowerCase();
        return data.filter(l => 
            (l.name + ' ' + l.firstName).toLowerCase().includes(q)
        );
    }

    test('devrait trouver par nom', () => {
        const data = [
            { name: 'DUPONT', firstName: 'Jean' },
            { name: 'MARTIN', firstName: 'Marie' },
        ];
        
        const result = searchLockers(data, 'dupont');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('DUPONT');
    });

    test('devrait trouver par prénom', () => {
        const data = [
            { name: 'DUPONT', firstName: 'Jean' },
            { name: 'MARTIN', firstName: 'Marie' },
        ];
        
        const result = searchLockers(data, 'marie');
        expect(result).toHaveLength(1);
        expect(result[0].firstName).toBe('Marie');
    });

    test('devrait trouver par recherche partielle', () => {
        const data = [
            { name: 'DUPONT', firstName: 'Jean' },
            { name: 'DURAND', firstName: 'Paul' },
        ];
        
        const result = searchLockers(data, 'du');
        expect(result).toHaveLength(2);
    });

    test('devrait être insensible à la casse', () => {
        const data = [{ name: 'DUPONT', firstName: 'Jean' }];
        
        expect(searchLockers(data, 'dupont')).toHaveLength(1);
        expect(searchLockers(data, 'DUPONT')).toHaveLength(1);
        expect(searchLockers(data, 'DuPoNt')).toHaveLength(1);
    });

    test('devrait retourner vide si rien trouvé', () => {
        const data = [{ name: 'DUPONT', firstName: 'Jean' }];
        
        const result = searchLockers(data, 'xyz');
        expect(result).toHaveLength(0);
    });
});

describe('Frontend - Validation formulaire', () => {
    function validateForm(formData) {
        const errors = [];
        
        if (!formData.number || formData.number.trim() === '') {
            errors.push('Numéro de casier requis');
        }
        
        if (!formData.name || formData.name.trim() === '') {
            errors.push('Nom requis');
        }
        
        if (!formData.firstName || formData.firstName.trim() === '') {
            errors.push('Prénom requis');
        }
        
        if (!formData.code || formData.code.trim() === '') {
            errors.push('N°IPP requis');
        }
        
        if (!formData.birthDate || formData.birthDate.trim() === '') {
            errors.push('Date de naissance requise');
        }
        
        return { valid: errors.length === 0, errors };
    }

    test('devrait valider un formulaire complet', () => {
        const form = {
            number: 'N01',
            name: 'DUPONT',
            firstName: 'Jean',
            code: '123',
            birthDate: '1990-01-15'
        };
        
        const result = validateForm(form);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('devrait détecter les champs manquants', () => {
        const form = {
            number: '',
            name: '',
            firstName: '',
            code: '',
            birthDate: ''
        };
        
        const result = validateForm(form);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(5);
    });

    test('devrait gérer les espaces', () => {
        const form = {
            number: '  ',
            name: '  ',
            firstName: '  ',
            code: '  ',
            birthDate: '  '
        };
        
        const result = validateForm(form);
        expect(result.valid).toBe(false);
    });
});

// ==================== TESTS DE PERFORMANCE ====================

describe('Performance Frontend', () => {
    test('recherche devrait être rapide sur 1000 enregistrements', () => {
        const data = Array(1000).fill(null).map((_, i) => ({
            name: `NAME${i}`,
            firstName: `FIRST${i}`
        }));
        
        const start = Date.now();
        searchLockers(data, 'NAME500');
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(50);
    });

    test('tri devrait être rapide sur 1000 enregistrements', () => {
        const data = Array(1000).fill(null).map((_, i) => ({
            number: `N${String(i).padStart(2, '0')}`,
            name: `NAME${Math.random().toString(36).substring(7)}`
        }));
        
        const start = Date.now();
        sortLockers(data, 'name');
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(100);
    });
});

// Mock de la fonction searchLockers (définie plus haut)
function searchLockers(data, query) {
    const q = query.toLowerCase();
    return data.filter(l => 
        (l.name + ' ' + l.firstName).toLowerCase().includes(q)
    );
}
