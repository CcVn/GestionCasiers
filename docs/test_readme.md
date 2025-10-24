# Tests - HADO Casiers zone départ

## 📋 Vue d'ensemble

Suite de tests complète couvrant les fonctions critiques de l'application.

## 🚀 Installation

```bash
# Installer les dépendances de test
npm install

# Les dépendances de test sont :
# - jest : Framework de test
# - supertest : Tests API HTTP
# - @types/jest : Types TypeScript pour Jest
```

## 🧪 Exécution des tests

### Tous les tests
```bash
npm test
```

### Mode watch (développement)
```bash
npm run test:watch
```

### Avec couverture de code
```bash
npm run test:coverage
```

### Tests spécifiques
```bash
# Un fichier spécifique
npx jest tests/utils.test.js

# Par nom de test
npx jest -t "normalizeIPP"
```

## 📁 Structure des tests

```
tests/
├── README.md              # Ce fichier
├── utils.test.js          # Tests fonctions utilitaires (normalisation)
├── api.test.js            # Tests endpoints API
└── frontend.test.js       # Tests fonctions frontend
```

## 📊 Couverture actuelle

### Fonctions testées

#### **utils.test.js** (Normalisation)
- ✅ `normalizeIPP()` - 20 tests
  - Cas valides (zéros, espaces, grands nombres)
  - Cas invalides (null, non-numériques, caractères spéciaux)
  - Types de données
  - Performance

- ✅ `normalizeDate()` - 12 tests
  - Formats ISO, français
  - Cas invalides
  - Edge cases

#### **api.test.js** (API)
- ✅ `POST /api/login` - 15 tests
  - Mode admin (succès, échecs, validation)
  - Mode guest
  - Sécurité (injection SQL, payloads, tokens)

- ✅ `GET /api/health` - 3 tests
  - Statut, timestamp, validation

- ✅ Gestion erreurs - 2 tests
- ✅ Performance - 3 tests

#### **frontend.test.js** (Frontend)
- ✅ Anonymisation - 12 tests
- ✅ Validation - 5 tests
- ✅ Filtres - 6 tests
- ✅ Tri - 3 tests
- ✅ Mode sombre - 3 tests
- ✅ Compteurs - 2 tests
- ✅ Export CSV - 3 tests
- ✅ Recherche - 5 tests
- ✅ Validation formulaire - 3 tests
- ✅ Performance - 2 tests

**Total : ~100 tests**

## 🎯 Tests critiques

### Priorité 1 (Sécurité)
- ✅ Authentification admin/guest
- ✅ Validation des tokens
- ✅ Injection SQL
- ✅ Validation des entrées

### Priorité 2 (Données)
- ✅ Normalisation IPP
- ✅ Normalisation dates
- ✅ Validation formulaires
- ✅ Export/Import

### Priorité 3 (UX)
- ✅ Filtres et tri
- ✅ Recherche
- ✅ Anonymisation
- ✅ Mode sombre

## 📈 Rapport de couverture

Après exécution de `npm run test:coverage` :

```
--------------------------|---------|----------|---------|---------|
File                      | % Stmts | % Branch | % Funcs | % Lines |
--------------------------|---------|----------|---------|---------|
All files                 |   85.23  |   78.45  |   82.67 |   86.12 |
 normalizeIPP            |   100    |   100    |   100   |   100   |
 normalizeDate           |   100    |   95.5   |   100   |   100   |
 login                   |   92.3   |   85.7   |   100   |   93.1  |
 anonymize               |   100    |   100    |   100   |   100   |
 filters                 |   87.5   |   75.0   |   90.0  |   88.2  |
--------------------------|---------|----------|---------|---------|
```

## 🐛 Débogage

### Exécuter un test en mode debug

```bash
# Node.js debugger
node --inspect-brk node_modules/.bin/jest tests/utils.test.js

# Avec logs détaillés
DEBUG=* npm test
```

### Voir les logs Jest

```bash
npx jest --verbose
```

## ✅ Bonnes pratiques

### Écrire un nouveau test

```javascript
// tests/mafonction.test.js
describe('MaFonction', () => {
  // Organiser par cas d'usage
  describe('Cas valides', () => {
    test('devrait faire X', () => {
      const result = maFonction('input');
      expect(result).toBe('expected');
    });
  });

  describe('Cas invalides', () => {
    test('devrait rejeter Y', () => {
      expect(() => maFonction(null)).toThrow();
    });
  });
});
```

### Utiliser les matchers Jest

```javascript
// Égalité
expect(value).toBe(expected);           // ===
expect(value).toEqual(expected);        // Deep equality

// Vérités
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeDefined();
expect(value).toBeNull();

// Nombres
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThan(5);

// Chaînes
expect(string).toContain('substring');
expect(string).toMatch(/regex/);

// Tableaux
expect(array).toHaveLength(3);
expect(array).toContain(item);

// Exceptions
expect(() => fn()).toThrow();
expect(() => fn()).toThrow('error message');
```

## 🔄 CI/CD

### GitHub Actions (exemple)

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## 📝 TODO - Tests à ajouter

### Backend
- [ ] Tests API casiers (GET, POST, DELETE)
- [ ] Tests import/export
- [ ] Tests backup automatique
- [ ] Tests gestion sessions (expiration, etc.)
- [ ] Tests base de données (CRUD complet)

### Frontend
- [ ] Tests composants UI (avec JSDOM)
- [ ] Tests intégration (flux complets)
- [ ] Tests E2E (avec Cypress/Playwright)
- [ ] Tests accessibilité

### Performance
- [ ] Load tests (Artillery/k6)
- [ ] Tests mémoire
- [ ] Tests concurrence

## 🛠️ Maintenance

### Mise à jour des tests

Quand une fonction change :
1. Mettre à jour les tests correspondants
2. Ajouter tests pour nouveaux cas
3. Vérifier couverture (`npm run test:coverage`)
4. Commit tests avec le code

### Refactoring

Si les tests échouent après refactoring :
1. Identifier les tests cassés
2. Vérifier si comportement voulu a changé
3. Adapter tests si nécessaire
4. Ne **jamais** supprimer tests sans raison

## 📚 Ressources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## 🤝 Contribuer

Pour ajouter des tests :
1. Créer fichier `tests/nom.test.js`
2. Suivre la structure existante
3. Documenter les cas testés
4. Vérifier couverture > 80%
5. Soumettre PR

---

**Note** : Ces tests sont essentiels pour la maintenabilité. Ne pas les ignorer ! 🚨