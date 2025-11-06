/**
 * Tests des fonctions utilitaires critiques
 * Fichier : tests/utils.test.js
 */

// Note: Ces fonctions doivent être exportées depuis server.js
// pour être testables (voir refactoring recommandé ci-dessous)

// Mock des fonctions pour tests (à extraire de server.js)
function normalizeIPP(ipp) {
  if (!ipp) return null;
  
  const cleaned = String(ipp).trim().replace(/^0+/, '');
  if (cleaned === '') return null;
  
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return null;
  
  return num;
}

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  
  // Si déjà au format ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Format français DD/MM/YYYY
  const frenchMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frenchMatch) {
    return `${frenchMatch[3]}-${frenchMatch[2]}-${frenchMatch[1]}`;
  }
  
  return dateStr;
}

// ==================== TESTS ====================

describe('normalizeIPP', () => {
  describe('Cas valides', () => {
    test('devrait supprimer les zéros à gauche', () => {
      expect(normalizeIPP('00123')).toBe(123);
      expect(normalizeIPP('0456')).toBe(456);
      expect(normalizeIPP('000789')).toBe(789);
    });

    test('devrait accepter un IPP sans zéros', () => {
      expect(normalizeIPP('123')).toBe(123);
      expect(normalizeIPP('999')).toBe(999);
    });

    test('devrait gérer les grands nombres', () => {
      expect(normalizeIPP('0012345678')).toBe(12345678);
      expect(normalizeIPP('999999999')).toBe(999999999);
    });

    test('devrait gérer les espaces', () => {
      expect(normalizeIPP('  00123  ')).toBe(123);
      expect(normalizeIPP(' 456 ')).toBe(456);
    });
  });

  describe('Cas invalides', () => {
    test('devrait rejeter les IPP nuls ou vides', () => {
      expect(normalizeIPP(null)).toBe(null);
      expect(normalizeIPP(undefined)).toBe(null);
      expect(normalizeIPP('')).toBe(null);
      expect(normalizeIPP('   ')).toBe(null);
    });

    test('devrait rejeter les IPP non numériques', () => {
      expect(normalizeIPP('ABC')).toBe(null);
      expect(normalizeIPP('12A34')).toBe(null);
      expect(normalizeIPP('A123')).toBe(null);
    });

    test('devrait rejeter les IPP avec que des zéros', () => {
      expect(normalizeIPP('000')).toBe(null);
      expect(normalizeIPP('0000000')).toBe(null);
      expect(normalizeIPP('0')).toBe(0); // Edge case : 0 seul est valide
    });

    test('devrait rejeter les caractères spéciaux', () => {
      expect(normalizeIPP('12-34')).toBe(null);
      expect(normalizeIPP('12.34')).toBe(null);
      expect(normalizeIPP('12/34')).toBe(null);
    });
  });

  describe('Types de données', () => {
    test('devrait accepter les nombres', () => {
      expect(normalizeIPP(123)).toBe(123);
      expect(normalizeIPP(456)).toBe(456);
    });

    test('devrait gérer les booléens', () => {
      expect(normalizeIPP(true)).toBe(null);
      expect(normalizeIPP(false)).toBe(null);
    });

    test('devrait gérer les objets', () => {
      expect(normalizeIPP({})).toBe(null);
      expect(normalizeIPP([])).toBe(null);
    });
  });
});

describe('normalizeDate', () => {
  describe('Formats valides', () => {
    test('devrait conserver le format ISO', () => {
      expect(normalizeDate('1990-01-15')).toBe('1990-01-15');
      expect(normalizeDate('2025-12-31')).toBe('2025-12-31');
      expect(normalizeDate('2000-06-30')).toBe('2000-06-30');
    });

    test('devrait convertir le format français', () => {
      expect(normalizeDate('15/01/1990')).toBe('1990-01-15');
      expect(normalizeDate('31/12/2025')).toBe('2025-12-31');
      expect(normalizeDate('01/01/2000')).toBe('2000-01-01');
    });

    test('devrait gérer les dates avec zéros', () => {
      expect(normalizeDate('01/01/2000')).toBe('2000-01-01');
      expect(normalizeDate('09/09/2009')).toBe('2009-09-09');
    });
  });

  describe('Cas invalides', () => {
    test('devrait retourner vide pour null/undefined', () => {
      expect(normalizeDate(null)).toBe('');
      expect(normalizeDate(undefined)).toBe('');
      expect(normalizeDate('')).toBe('');
    });

    test('devrait retourner tel quel si format non reconnu', () => {
      expect(normalizeDate('invalid')).toBe('invalid');
      expect(normalizeDate('32/13/2025')).toBe('32/13/2025');
      expect(normalizeDate('2025-13-45')).toBe('2025-13-45');
    });

    test('devrait gérer les formats partiels', () => {
      expect(normalizeDate('2025')).toBe('2025');
      expect(normalizeDate('01/2025')).toBe('01/2025');
    });
  });

  describe('Edge cases', () => {
    test('devrait gérer les espaces', () => {
      expect(normalizeDate('  1990-01-15  ')).toBe('  1990-01-15  ');
    });

    test('devrait gérer les formats avec séparateurs différents', () => {
      expect(normalizeDate('15-01-1990')).toBe('15-01-1990'); // Non reconnu
      expect(normalizeDate('15.01.1990')).toBe('15.01.1990'); // Non reconnu
    });
  });
});

describe('Intégration IPP + Date', () => {
  test('devrait normaliser les deux ensemble', () => {
    const ipp = normalizeIPP('00123');
    const date = normalizeDate('15/01/1990');
    
    expect(ipp).toBe(123);
    expect(date).toBe('1990-01-15');
  });

  test('devrait gérer les cas invalides ensemble', () => {
    const ipp = normalizeIPP('ABC');
    const date = normalizeDate('invalid');
    
    expect(ipp).toBe(null);
    expect(date).toBe('invalid');
  });
});

// ==================== TESTS DE PERFORMANCE ====================

describe('Performance', () => {
  test('normalizeIPP devrait être rapide sur 1000 appels', () => {
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      normalizeIPP('00123');
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms pour 1000 appels
  });

  test('normalizeDate devrait être rapide sur 1000 appels', () => {
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      normalizeDate('15/01/1990');
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms pour 1000 appels
  });
});
